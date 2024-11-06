import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InventoryEntity } from './entities/inventory.entity';
import { Repository } from 'typeorm';
import { ClientProxy, RmqContext } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PurchaseHistory } from './entities/purchase-history.entity';
import { OrderStatus } from './enums/order-status.enum';
import { GetPurchaseHistoryDto } from './dtos/get-purchase-history.dto';
import { Events } from './enums/events.enum';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(InventoryEntity)
    private readonly inventoryRepository: Repository<InventoryEntity>,
    @InjectRepository(PurchaseHistory)
    private readonly purchaseHistoryRepository: Repository<PurchaseHistory>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('MANAGER_SERVICE') private readonly managerClient: ClientProxy,
  ) {
    this.managerClient.connect();
  }

  async getInventory(): Promise<InventoryEntity[]> {
    return await this.inventoryRepository
      .createQueryBuilder('inventory')
      .orderBy('inventory.name', 'ASC')
      .getMany();
  }

  async getPurchaseHistory(getPurchaseHistoryDto?: GetPurchaseHistoryDto) {
    const { page, limit } = getPurchaseHistoryDto;
    const skip = (page - 1) * limit;
    const query =
      this.purchaseHistoryRepository.createQueryBuilder('purchase_history');

    if (getPurchaseHistoryDto.ingredient) {
      query.where('purchase_history.ingredient = :ingredient', {
        ingredient: getPurchaseHistoryDto.ingredient,
      });
    }

    const [data, total] = await query
      .orderBy('purchase_history.date', 'DESC')
      .take(limit)
      .skip(skip)
      .getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      page,
      limit,
      totalPages,
      totalItems: total,
    };
  }

  async reduceIngredients(ingredients: { [ingredientName: string]: number }) {
    try {
      console.log('Reducing ingredients:', ingredients);

      for (const [ingredient, quantity] of Object.entries(ingredients)) {
        await this.updateInventory(ingredient, -quantity);
      }

      console.log('Ingredients reduced successfully.');

      return { success: true };
    } catch (error) {
      console.error('Failed to reduce ingredients:', error.message);

      return { success: false };
    }
  }

  async handleRequestIngredients(
    ingredientsRequest: {
      ingredients: {
        [key: string]: number;
      };
      orders: {
        id: number;
      }[];
    },
    context: RmqContext,
  ) {
    const { ingredients, orders } = ingredientsRequest;
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      console.log(
        'Warehouse received request for ingredients:',
        ingredientsRequest,
      );

      const missingIngredients = await this.getMissingIngredients(ingredients);

      if (!missingIngredients.length) {
        await this.reduceIngredients(ingredients);
      }

      if (missingIngredients.length > 0) {
        console.log('Missing ingredients:', missingIngredients);

        this.updateOrderStatus(orders, OrderStatus.PAUSED);

        await this.purchaseMissingIngredients(missingIngredients);
      }

      this.updateOrderStatus(orders, OrderStatus.IN_PROGRESS);

      channel.ack(originalMsg);

      return { success: true };
    } catch (error) {
      console.error('Error processing ingredient request:', error.message);

      channel.nack(originalMsg);
      throw error;
    }
  }

  private async getMissingIngredients(ingredients: {
    [key: string]: number;
  }): Promise<{ ingredient: string; quantityNeeded: number }[]> {
    const missingIngredients = [];

    for (const [ingredient, quantityNeeded] of Object.entries(ingredients)) {
      const item = await this.inventoryRepository.findOne({
        where: { name: ingredient },
      });
      const availableQuantity = item?.quantity || 0;

      if (availableQuantity < quantityNeeded) {
        missingIngredients.push({
          ingredient,
          quantityNeeded: quantityNeeded - availableQuantity,
        });
      }
    }

    return missingIngredients;
  }

  private async purchaseMissingIngredients(
    missingIngredients: { ingredient: string; quantityNeeded: number }[],
  ): Promise<void> {
    for (const { ingredient, quantityNeeded } of missingIngredients) {
      let totalPurchased = 0;

      while (totalPurchased < quantityNeeded) {
        try {
          const quantityPurchased = await this.buyIngredient(ingredient);

          if (quantityPurchased > 0) {
            totalPurchased += quantityPurchased;
          } else {
            console.log(
              `Ingredient ${ingredient} not available at the market. Waiting...`,
            );

            await this.delay(500);
          }
        } catch (error) {
          console.error(`Error purchasing ${ingredient}:`, error.message);

          throw error;
        }
      }

      const extraQuantity = totalPurchased - quantityNeeded;

      if (extraQuantity > 0) {
        await this.updateInventory(ingredient, extraQuantity);
      }
    }
  }

  private updateOrderStatus(
    orders: {
      id: number;
    }[],
    statusId: OrderStatus,
  ) {
    const updatedOrders = orders.map((order) => ({
      ...order,
      statusId,
    }));

    this.managerClient.emit(Events.ORDER_STATUS_CHANGED, updatedOrders);
  }

  async buyIngredient(ingredient: string): Promise<number> {
    console.log(`Buying ${ingredient} in Market Square...`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          this.configService.get('FARMERS_MARKET_URL') + '/buy',
          {
            params: { ingredient },
          },
        ),
      );
      const { quantitySold } = response.data;

      if (quantitySold > 0) {
        console.log(`Purchased ${quantitySold} units of ${ingredient}.`);

        return quantitySold;
      } else {
        console.log(
          `The ingredient ${ingredient} is not available at the Market Place.`,
        );

        return 0;
      }
    } catch (error) {
      console.error(
        `Error when buying ${ingredient} at the Marketplace:`,
        error.message,
      );

      throw error;
    }
  }

  async updateInventory(ingredient: string, quantityChange: number) {
    try {
      await this.inventoryRepository
        .createQueryBuilder()
        .update()
        .set({ quantity: () => `quantity + ${quantityChange}` })
        .where('name = :name', { name: ingredient })
        .execute();

      if (quantityChange > 0) {
        await this.purchaseHistoryRepository
          .createQueryBuilder()
          .insert()
          .into('purchase_history')
          .values({
            ingredient,
            quantity: quantityChange,
            date: new Date(),
          })
          .execute();

        console.log(
          `Registered purchase: ${ingredient} - ${quantityChange} units.`,
        );
      }

      console.log(
        `Updated inventory: ${ingredient} - ${quantityChange} units.`,
      );
    } catch (error) {
      console.error(
        `Failed to update inventory or register purchase: ${error.message}`,
      );

      throw error;
    }
  }

  private delay(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
