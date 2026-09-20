import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ExtensionProposalStatus } from '../types';

@Entity('extension_proposals')
@Index(['sessionId'])
export class ExtensionProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'proposed_by', type: 'uuid' })
  proposedBy: string;

  @Column({ name: 'duration_minutes', type: 'integer' })
  durationMinutes: number;

  @Column({ name: 'fee_amount', type: 'numeric', precision: 15, scale: 2 })
  feeAmount: number;

  @Column({
    type: 'enum',
    enum: ExtensionProposalStatus,
    default: ExtensionProposalStatus.PENDING,
  })
  status: ExtensionProposalStatus;

  @Column({ name: 'responded_by', type: 'uuid', nullable: true })
  respondedBy: string | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  /** Nhân viên duyệt hộ khách không đăng nhập được. `respondedBy` khi đó là nhân viên. */
  @Column({ name: 'responded_on_behalf', type: 'boolean', default: false })
  respondedOnBehalf: boolean;

  /** Lý do duyệt hộ. */
  @Column({ name: 'on_behalf_reason', type: 'text', nullable: true })
  onBehalfReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
