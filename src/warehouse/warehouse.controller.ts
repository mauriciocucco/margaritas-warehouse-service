import { Controller } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';

@Controller()
export class WarehouseController {
  constructor(private warehouseService: WarehouseService) {}

  @MessagePattern('reduce_ingredients')
  async handleOrderDispatched(
    @Payload() ingredients: { [ingredientName: string]: number },
  ) {
    return await this.warehouseService.reduceIngredients(ingredients);
  }

  @MessagePattern('request_ingredients')
  async handleRequestIngredients(
    @Payload() ingredientsRequested: { [key: string]: number },
    @Ctx() context: RmqContext,
  ) {
    return this.warehouseService.handleRequestIngredients(
      ingredientsRequested,
      context,
    );
  }
}
