import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('cafe_images')
@Index(['cafeId', 'sortOrder'])
export class CafeImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'public_id', type: 'text', nullable: true })
  publicId: string | null;

  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
