import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { SessionVehicleStatus, VehicleSource } from '../types';

@Entity('session_vehicles')
@Index(['sessionId'])
export class SessionVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'booking_vehicle_id', type: 'uuid', nullable: true })
  bookingVehicleId: string | null;

  @Column({
    name: 'vehicle_source',
    type: 'enum',
    enum: VehicleSource,
  })
  vehicleSource: VehicleSource;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId: string | null;

  @Column({ name: 'assigned_to_participant_id', type: 'uuid', nullable: true })
  assignedToParticipantId: string | null;

  @Column({
    type: 'enum',
    enum: SessionVehicleStatus,
    default: SessionVehicleStatus.ASSIGNED,
  })
  status: SessionVehicleStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'returned_at', type: 'timestamptz', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
