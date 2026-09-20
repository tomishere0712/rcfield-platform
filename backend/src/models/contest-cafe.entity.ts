import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contest_cafes')
@Index(['contestId', 'cafeId'], { unique: true })
export class ContestCafe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contest_id', type: 'uuid' })
  contestId: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ type: 'varchar', length: 30, default: 'HOST' })
  role: string;

  @Column({ name: 'capacity_override', type: 'int', nullable: true })
  capacityOverride: number | null;

  @Column({ name: 'check_in_enabled', type: 'boolean', default: true })
  checkInEnabled: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
