import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type AiAnalysisStatus = 'SUCCESS' | 'FAILED' | 'QUOTA_EXCEEDED' | 'INSUFFICIENT_DATA';

@Entity('ai_analysis_logs')
@Index(['providerId', 'requestedAt'])
export class AiAnalysisLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'cafe_id', type: 'uuid', nullable: true })
  cafeId: string | null;

  @Column({ name: 'period_from', type: 'date' })
  periodFrom: string;

  @Column({ name: 'period_to', type: 'date' })
  periodTo: string;

  @Column({
    type: 'enum',
    enum: ['SUCCESS', 'FAILED', 'QUOTA_EXCEEDED', 'INSUFFICIENT_DATA'],
    enumName: 'ai_analysis_status_enum',
  })
  status: AiAnalysisStatus;

  @Column({ name: 'tokens_used', type: 'int', nullable: true })
  tokensUsed: number | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'requested_at', type: 'timestamptz', default: () => 'now()' })
  requestedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
