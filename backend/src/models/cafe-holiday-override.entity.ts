import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('cafe_holiday_overrides')
@Unique(['cafeId', 'holidayDateId'])
@Index(['cafeId'])
export class CafeHolidayOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'holiday_date_id', type: 'uuid' })
  holidayDateId: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  multiplier: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
