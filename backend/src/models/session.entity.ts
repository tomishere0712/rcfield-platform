import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { SessionStatus } from '../types';

@Entity('sessions')
@Index(['bookingId'])
@Index(['cafeId'])
@Index(['status'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.CHECKED_IN,
  })
  status: SessionStatus;

  @Column({ name: 'checked_in_by', type: 'uuid' })
  checkedInBy: string;

  @Column({ name: 'checked_out_by', type: 'uuid', nullable: true })
  checkedOutBy: string | null;

  @Column({ name: 'actual_start_at', type: 'timestamptz' })
  actualStartAt: Date;

  @Column({ name: 'actual_end_at', type: 'timestamptz', nullable: true })
  actualEndAt: Date | null;

  @Column({ name: 'planned_end_at', type: 'timestamptz' })
  plannedEndAt: Date;

  @Column({
    name: 'actual_total_amount',
    type: 'numeric',
    precision: 15,
    scale: 2,
    default: 0,
  })
  actualTotalAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
