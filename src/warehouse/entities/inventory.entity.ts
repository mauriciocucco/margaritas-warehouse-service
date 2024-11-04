import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('inventory')
export class InventoryEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ default: 5 })
  quantity: number;
}
