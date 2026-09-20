import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { HolidayType } from '../types';

@Entity('holiday_dates')
@Index(['cafeId', 'holidayDate'])
export class HolidayDate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid', nullable: true })
  cafeId: string | null;

  @Column({ name: 'holiday_date', type: 'date' })
  holidayDate: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  multiplier: number;

  @Column({ name: 'holiday_type', type: 'enum', enum: HolidayType, enumName: 'holiday_type_enum' })
  holidayType: HolidayType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
