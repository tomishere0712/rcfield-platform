import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MenuCategory } from './menu-category.entity';

@Entity('menu_items')
@Index(['cafeId'])
@Index(['cafeId', 'isAvailable'])
@Index(['categoryId'])
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  price: string;

  /** FK tới menu_categories. NULL = "Chưa phân loại". */
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  /**
   * Quan hệ tới danh mục. Khai báo tường minh để TypeORM sắp xếp được theo
   * `category.displayOrder` khi có phân trang — order-by trên alias join thô
   * sẽ vỡ ở bước dựng subquery distinct của skip/take.
   * Trường này bị loại bỏ khi serialize, thay bằng `categoryName` phẳng.
   */
  @ManyToOne(() => MenuCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: MenuCategory | null;

  @Column({ name: 'is_combo', type: 'boolean', default: false })
  isCombo: boolean;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ name: 'is_available', type: 'boolean', default: true })
  isAvailable: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
