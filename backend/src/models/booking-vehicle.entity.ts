import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('booking_vehicles')
@Index(['bookingId'])
@Index(['vehicleId', 'bookingId'])
export class BookingVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string;

  @Column({ name: 'hourly_rate_snapshot', type: 'numeric', precision: 15, scale: 2 })
  hourlyRateSnapshot: number;

  @Column({ name: 'rental_fee_snapshot', type: 'numeric', precision: 15, scale: 2 })
  rentalFeeSnapshot: number;

  // Historical display data. A booking must stay intelligible even if its
  // vehicle/catalog is renamed, retired, or removed from the current fleet.
  @Column({ name: 'catalog_name_snapshot', type: 'varchar', length: 255, nullable: true })
  catalogNameSnapshot: string | null;

  @Column({ name: 'tier_snapshot', type: 'varchar', length: 50, nullable: true })
  tierSnapshot: string | null;

  @Column({ name: 'identifier_snapshot', type: 'varchar', length: 255, nullable: true })
  identifierSnapshot: string | null;

  @Column({ name: 'color_snapshot', type: 'varchar', length: 100, nullable: true })
  colorSnapshot: string | null;

  @Column({ name: 'cover_image_url_snapshot', type: 'text', nullable: true })
  coverImageUrlSnapshot: string | null;

  @Column({ name: 'security_deposit_snapshot', type: 'numeric', precision: 15, scale: 2 })
  securityDepositSnapshot: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
