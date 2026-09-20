import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contest_staff_assignments')
@Index(['contestId', 'staffId'], { unique: true })
@Index(['staffId', 'contestId'])
export class ContestStaffAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contest_id', type: 'uuid' })
  contestId: string;

  @Column({ name: 'staff_id', type: 'uuid' })
  staffId: string;

  @Column({ name: 'assigned_by', type: 'uuid' })
  assignedBy: string;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'NOW()' })
  assignedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
