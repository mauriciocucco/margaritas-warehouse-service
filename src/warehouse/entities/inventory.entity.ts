import { Entity, Column, PrimaryGeneratedColumn, Check } from 'typeorm';

@Entity('inventory')
@Check(`"quantity" >= 0`)
export class InventoryEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ default: 5 })
  quantity: number;
}
