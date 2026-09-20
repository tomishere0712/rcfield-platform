import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ParticipantRole } from '../types';

@Entity('session_participants')
@Index(['sessionId'])
export class SessionParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'booking_participant_id', type: 'uuid', nullable: true })
  bookingParticipantId: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: ParticipantRole })
  role: ParticipantRole;

  @Column({ name: 'is_primary_responsible', type: 'boolean', default: false })
  isPrimaryResponsible: boolean;

  @Column({ name: 'checked_in_at', type: 'timestamptz' })
  checkedInAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
