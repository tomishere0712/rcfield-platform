import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('fnb_order_items')
@Index(['fnbOrderId'])
export class FnbOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'fnb_order_id', type: 'uuid', nullable: true })
  fnbOrderId: string | null;

  @Column({ name: 'menu_item_id', type: 'uuid', nullable: true })
  menuItemId: string | null;

  @Column({ name: 'menu_item_variant_id', type: 'uuid', nullable: true })
  menuItemVariantId: string | null;

  @Column({ name: 'quantity', type: 'int' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 15, scale: 2 })
  unitPrice: number;

  @Column({ name: 'subtotal', type: 'numeric', precision: 15, scale: 2, nullable: true })
  subtotal: number | null;

  @Column({ name: 'item_name_snapshot', type: 'varchar', length: 255, nullable: true })
  itemNameSnapshot: string | null;

  @Column({ name: 'variant_name_snapshot', type: 'varchar', length: 80, nullable: true })
  variantNameSnapshot: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
