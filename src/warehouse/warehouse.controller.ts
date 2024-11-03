import { Controller, Get, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { ApiGatewayGuard } from '../common/guards/api-gateway.guard';

@UseGuards(ApiGatewayGuard)
@Controller()
export class WarehouseController {
  constructor(private warehouseService: WarehouseService) {}

  @Get('inventory')
  async getInventory() {
    return await this.warehouseService.getInventory();
  }

  @Get('purchase-history')
  async getPurchaseHistory() {
    return await this.warehouseService.getPurchaseHistory();
  }

  @MessagePattern('reduce_ingredients')
  async handleOrderDispatched(
    @Payload() ingredients: { [ingredientName: string]: number },
    @Ctx() context: RmqContext,
  ) {
    return await this.warehouseService.reduceIngredients(ingredients, context);
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
