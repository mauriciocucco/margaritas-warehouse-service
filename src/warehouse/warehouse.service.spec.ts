import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseService } from './warehouse.service';
import { createMock } from '@golevelup/ts-jest';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { InventoryEntity } from './entities/inventory.entity';
import { PurchaseHistory } from './entities/purchase-history.entity';

describe('WarehouseService', () => {
  let warehouseService: WarehouseService;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;
  let clientProxy: jest.Mocked<ClientProxy>;
  let inventoryRepository: jest.Mocked<Repository<InventoryEntity>>;
  let purchaseHistoryRepository: jest.Mocked<Repository<PurchaseHistory>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        {
          provide: 'InventoryEntityRepository',
          useValue: createMock<Repository<InventoryEntity>>(),
        },
        {
          provide: 'PurchaseHistoryRepository',
          useValue: createMock<Repository<PurchaseHistory>>(),
        },
        { provide: HttpService, useValue: createMock<HttpService>() },
        { provide: ConfigService, useValue: createMock<ConfigService>() },
        { provide: 'MANAGER_SERVICE', useValue: createMock<ClientProxy>() },
      ],
    }).compile();

    warehouseService = module.get<WarehouseService>(WarehouseService);
    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
    clientProxy = module.get('MANAGER_SERVICE');
    inventoryRepository = module.get('InventoryEntityRepository');
    purchaseHistoryRepository = module.get('PurchaseHistoryRepository');

    warehouseService['buyIngredient'] = jest.fn();
    warehouseService['updateInventory'] = jest.fn();
    warehouseService['delay'] = jest.fn();
  });

  describe('purchaseMissingIngredients', () => {
    it('should purchase ingredients until the required quantity is met', async () => {
      const missingIngredients = [{ ingredient: 'Flour', quantityNeeded: 10 }];

      (warehouseService['buyIngredient'] as jest.Mock)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5);

      await warehouseService['purchaseMissingIngredients'](missingIngredients);

      expect(warehouseService['buyIngredient']).toHaveBeenCalledTimes(2);
      expect(warehouseService['buyIngredient']).toHaveBeenCalledWith('Flour');
      expect(warehouseService['updateInventory']).not.toHaveBeenCalled();
      expect(warehouseService['delay']).not.toHaveBeenCalled();
    });

    it('should wait and retry if ingredient is not available immediately', async () => {
      const missingIngredients = [{ ingredient: 'Sugar', quantityNeeded: 5 }];

      (warehouseService['buyIngredient'] as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5);
      (warehouseService['delay'] as jest.Mock).mockResolvedValue(undefined);

      await warehouseService['purchaseMissingIngredients'](missingIngredients);

      expect(warehouseService['buyIngredient']).toHaveBeenCalledTimes(2);
      expect(warehouseService['delay']).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during purchase and rethrow', async () => {
      const missingIngredients = [{ ingredient: 'Butter', quantityNeeded: 3 }];

      (warehouseService['buyIngredient'] as jest.Mock).mockRejectedValue(
        new Error('Purchase failed'),
      );

      await expect(
        warehouseService['purchaseMissingIngredients'](missingIngredients),
      ).rejects.toThrow('Purchase failed');

      expect(warehouseService['buyIngredient']).toHaveBeenCalledTimes(1);
      expect(warehouseService['updateInventory']).not.toHaveBeenCalled();
      expect(warehouseService['delay']).not.toHaveBeenCalled();
    });

    it('should update inventory if extra quantity is purchased', async () => {
      const missingIngredients = [{ ingredient: 'Salt', quantityNeeded: 7 }];

      (warehouseService['buyIngredient'] as jest.Mock).mockResolvedValue(10);

      await warehouseService['purchaseMissingIngredients'](missingIngredients);

      expect(warehouseService['buyIngredient']).toHaveBeenCalledTimes(1);
      expect(warehouseService['updateInventory']).toHaveBeenCalledWith(
        'Salt',
        3,
      );
    });
  });
});
