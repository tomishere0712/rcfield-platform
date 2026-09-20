import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** A sellable choice for a menu item, such as size M/L or a drink flavour. */
@Entity('menu_item_variants')
@Index(['menuItemId', 'displayOrder'])
@Index(['menuItemId', 'isAvailable'])
export class MenuItemVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'menu_item_id', type: 'uuid' })
  menuItemId: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** Final sell price, never a client-provided delta. */
  @Column({ type: 'numeric', precision: 15, scale: 2 })
  price: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_available', type: 'boolean', default: true })
  isAvailable: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
