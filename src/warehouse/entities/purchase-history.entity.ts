import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('purchase_history')
export class PurchaseHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ingredient: string;

  @Column('int')
  quantity: number;

  @Column({ type: 'timestamp' })
  date: Date;
}
