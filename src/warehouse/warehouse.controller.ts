import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { ApiGatewayGuard } from '../common/guards/api-gateway.guard';
import { GetPurchaseHistoryDto } from './dtos/get-purchase-history.dto';

@UseGuards(ApiGatewayGuard)
@Controller()
export class WarehouseController {
  constructor(private warehouseService: WarehouseService) {}

  @Get('inventory')
  async getInventory() {
    return await this.warehouseService.getInventory();
  }

  @Get('purchase-history')
  async getPurchaseHistory(
    @Query() getPurchaseHistoryDto?: GetPurchaseHistoryDto,
  ) {
    return await this.warehouseService.getPurchaseHistory(
      getPurchaseHistoryDto,
    );
  }

  @MessagePattern('request_ingredients')
  async handleRequestIngredients(
    @Payload()
    ingredientsRequest: {
      ingredients: {
        [key: string]: number;
      };
      orders: {
        id: number;
      }[];
    },
    @Ctx() context: RmqContext,
  ) {
    return this.warehouseService.handleRequestIngredients(
      ingredientsRequest,
      context,
    );
  }
}
