import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contest_formats')
export class ContestFormat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'supports_bracket', type: 'boolean', default: false })
  supportsBracket: boolean;

  @Column({ name: 'supports_time_attack', type: 'boolean', default: false })
  supportsTimeAttack: boolean;

  @Column({ name: 'supports_multi_round', type: 'boolean', default: false })
  supportsMultiRound: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Đã dùng được để tạo giải hay chưa. Khác `isActive`: thể thức chưa phát hành
   * vẫn hiện trong catalog kèm nhãn "Sắp có" để provider thấy lộ trình, nhưng
   * không chọn được — tránh cảnh trả phí tổ chức xong mới biết chế độ còn dở.
   */
  @Column({ name: 'is_released', type: 'boolean', default: true })
  isReleased: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
