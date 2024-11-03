import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InventoryEntity } from './entities/inventory.entity';
import { Repository } from 'typeorm';
import { RmqContext } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PurchaseHistory } from './entities/purchase-history.entity';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(InventoryEntity)
    private readonly inventoryRepository: Repository<InventoryEntity>,
    @InjectRepository(PurchaseHistory)
    private readonly purchaseHistoryRepository: Repository<PurchaseHistory>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getInventory(): Promise<InventoryEntity[]> {
    return await this.inventoryRepository
      .createQueryBuilder('inventory')
      .orderBy('inventory.name', 'ASC')
      .getMany();
  }

  async getPurchaseHistory(): Promise<PurchaseHistory[]> {
    return this.purchaseHistoryRepository.find({ order: { date: 'DESC' } });
  }

  async reduceIngredients(
    ingredients: { [ingredientName: string]: number },
    context: RmqContext,
  ) {
    try {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();

      console.log('Reducing ingredients:', ingredients);

      for (const [ingredient, quantity] of Object.entries(ingredients)) {
        await this.updateInventory(ingredient, -quantity);
      }

      console.log('Ingredients reduced successfully.');

      channel.ack(originalMsg);

      return { success: true };
    } catch (error) {
      console.error('Failed to reduce ingredients:', error.message);

      return { success: false };
    }
  }

  async handleRequestIngredients(
    ingredientsRequested: { [key: string]: number },
    context: RmqContext,
  ) {
    console.log(
      'Warehouse received request for ingredients:',
      ingredientsRequested,
    );

    try {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      const missingIngredients = [];

      for (const [ingredient, quantityNeeded] of Object.entries(
        ingredientsRequested,
      )) {
        const item = await this.inventoryRepository.findOne({
          where: { name: ingredient },
        });

        if (!item || item.quantity < quantityNeeded) {
          missingIngredients.push({
            ingredient,
            quantityNeeded: quantityNeeded - (item?.quantity || 0),
          });
        }
      }

      if (missingIngredients.length > 0) {
        console.log('Missing ingredients:', missingIngredients);

        for (const missing of missingIngredients) {
          const { ingredient, quantityNeeded } = missing;
          let totalPurchased = 0;

          while (totalPurchased < quantityNeeded) {
            try {
              const quantityPurchased = await this.buyIngredient(ingredient);

              if (quantityPurchased >= quantityNeeded) {
                await this.updateInventory(ingredient, quantityPurchased);

                totalPurchased += quantityPurchased;
              } else {
                console.log(
                  `Ingredient ${ingredient} not available at the Market Square. Waiting for...`,
                );

                await this.delay(5000);
              }
            } catch (error) {
              console.error(
                `Error when purchasing ${ingredient}:`,
                error.message,
              );

              await this.delay(5000);
            }
          }
        }
      }

      channel.ack(originalMsg);

      return { success: true };
    } catch (error) {
      console.error('Error processing ingredient request:', error.message);

      throw error;
    }
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
