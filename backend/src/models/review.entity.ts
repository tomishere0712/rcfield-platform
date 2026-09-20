import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { ReviewStatus } from '../types';

@Entity('reviews')
@Index(['cafeId', 'status'])
@Index(['customerId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid', unique: true })
  bookingId: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'rating', type: 'int' })
  overallScore: number;

  @Column({ name: 'vehicle_score', type: 'smallint', nullable: true })
  vehicleScore: number | null;

  @Column({ name: 'staff_score', type: 'smallint', nullable: true })
  staffScore: number | null;

  @Column({ name: 'facility_score', type: 'smallint', nullable: true })
  facilityScore: number | null;

  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: ReviewStatus.VISIBLE })
  status: ReviewStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
