import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { InspectionType, InspectionSubjectType } from '../types';
import { DamageLineItem } from './damage-line-item.entity';

@Entity('inspections')
@Index(['sessionId'])
export class Inspection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'session_vehicle_id', type: 'uuid', nullable: true })
  sessionVehicleId: string | null;

  @Column({ type: 'enum', enum: InspectionType })
  type: InspectionType;

  @Column({ name: 'subject_type', type: 'enum', enum: InspectionSubjectType })
  subjectType: InspectionSubjectType;

  @Column({ name: 'performed_by', type: 'uuid' })
  performedBy: string;

  @Column({ name: 'pre_existing_flag', type: 'boolean', default: false })
  preExistingFlag: boolean;

  @Column({ name: 'damage_noted', type: 'boolean', default: false })
  damageNoted: boolean;

  @Column({ name: 'damage_description', type: 'text', nullable: true })
  damageDescription: string | null;

  @Column({
    name: 'damage_cost_estimate',
    type: 'numeric',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  damageCostEstimate: number | null;

  @Column({ name: 'ai_analysis_json', type: 'jsonb', nullable: true })
  aiAnalysisJson: Record<string, unknown> | null;

  @Column({ name: 'customer_confirmed', type: 'boolean', default: false })
  customerConfirmed: boolean;

  @Column({ name: 'customer_confirmed_at', type: 'timestamptz', nullable: true })
  customerConfirmedAt: Date | null;

  /**
   * Ai thực sự bấm xác nhận. Bằng khách thì là khách tự ký; bằng nhân viên thì
   * `confirmedOnBehalf` phải bằng `true`.
   */
  @Column({ name: 'confirmed_by', type: 'uuid', nullable: true })
  confirmedBy: string | null;

  /**
   * Nhân viên ký hộ khách không đăng nhập được.
   *
   * Không được để `false` khi thực tế là nhân viên bấm — bản ghi khi đó đọc lên
   * như thể khách tự ký, và làm hỏng chính giá trị chống tranh chấp của biên bản.
   */
  @Column({ name: 'confirmed_on_behalf', type: 'boolean', default: false })
  confirmedOnBehalf: boolean;

  /** Lý do ký hộ — bằng chứng thay cho thao tác của khách. */
  @Column({ name: 'on_behalf_reason', type: 'text', nullable: true })
  onBehalfReason: string | null;

  @OneToMany(() => DamageLineItem, (item) => item.inspection)
  damageLineItems: DamageLineItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
