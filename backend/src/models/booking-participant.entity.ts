import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BookingParticipantType } from '../types';

@Entity('booking_participants')
@Index(['bookingId'])
export class BookingParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'participant_type', type: 'varchar', length: 30 })
  participantType: BookingParticipantType;

  @Column({ name: 'is_primary_responsible', type: 'boolean', default: false })
  isPrimaryResponsible: boolean;

  @Column({ name: 'guest_name', type: 'varchar', length: 255, nullable: true })
  guestName: string | null;

  @Column({ name: 'guest_phone', type: 'varchar', length: 20, nullable: true })
  guestPhone: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
