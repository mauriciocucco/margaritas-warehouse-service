import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max } from 'class-validator';

export class GetPurchaseHistoryDto {
  @IsOptional()
  @IsString()
  ingredient: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;
}
