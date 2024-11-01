import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('inventory')
export class InventoryEntity {
  @PrimaryColumn()
  ingredient: string;

  @Column({ unique: true })
  name: string;

  @Column('int')
  quantity: number;
}
