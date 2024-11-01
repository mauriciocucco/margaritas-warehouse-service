import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InventoryEntity } from './entities/inventory.entity';
import { Repository } from 'typeorm';
import {
  Ctx,
  EventPattern,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(InventoryEntity)
    private readonly inventoryRepository: Repository<InventoryEntity>,
    private readonly httpService: HttpService,
  ) {}

  @MessagePattern('reduce_ingredients')
  async reduceIngredients(
    @Payload() ingredients: { ingredient: string; quantity: number }[],
  ) {
    try {
      for (const item of ingredients) {
        await this.updateInventory(item.ingredient, -item.quantity);
      }

      console.log('Ingredients reduced successfully.');
    } catch (error) {
      console.error('Failed to reduce ingredients:', error.message);

      throw error;
    }
  }

  @EventPattern('request_ingredients')
  async handleRequestIngredients(
    @Payload() ingredientsRequested: { [key: string]: number },
    @Ctx() context: RmqContext,
  ) {
    console.log(
      'Warehouse received request for ingredients:',
      ingredientsRequested,
    );

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

            if (quantityPurchased > 0) {
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
  }

  async buyIngredient(ingredient: string): Promise<number> {
    console.log(`Buying ${ingredient} in Market Square...`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://recruitment.alegra.com/api/farmers-market/buy',
          null,
          { params: { ingredient } },
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
    await this.inventoryRepository
      .createQueryBuilder()
      .update()
      .set({ quantity: () => `quantity + ${quantityChange}` });

    console.log(`Updated inventory: ${ingredient} - ${quantityChange} units.`);
  }

  delay(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
