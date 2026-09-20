import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  FeaturedPopupAudienceScope,
  FeaturedPopupPlacement,
  FeaturedPopupReviewStatus,
} from '../types';

@Entity('featured_popups')
@Index(['placement', 'isActive', 'startsAt', 'endsAt'])
export class FeaturedPopup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  subtitle: string | null;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ name: 'cta_label', type: 'varchar', length: 80 })
  ctaLabel: string;

  @Column({ name: 'cta_url', type: 'text', nullable: true })
  ctaUrl: string | null;

  @Column({ name: 'contest_id', type: 'uuid', nullable: true })
  contestId: string | null;

  @Column({ type: 'varchar', length: 40, default: FeaturedPopupPlacement.EXPLORE })
  placement: FeaturedPopupPlacement;

  @Column({
    name: 'audience_scope',
    type: 'varchar',
    length: 40,
    default: FeaturedPopupAudienceScope.ALL,
  })
  audienceScope: FeaturedPopupAudienceScope;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Suất do admin tự tạo mặc định APPROVED; suất provider trả phí bắt đầu ở PENDING. */
  @Column({
    name: 'review_status',
    type: 'varchar',
    length: 20,
    default: FeaturedPopupReviewStatus.APPROVED,
  })
  reviewStatus: FeaturedPopupReviewStatus;

  @Column({ name: 'contest_fee_order_id', type: 'uuid', nullable: true })
  contestFeeOrderId: string | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ type: 'integer', default: 100 })
  priority: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
