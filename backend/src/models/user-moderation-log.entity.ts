import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { UserModerationAction } from '../types';

/**
 * Một lần admin khoá hoặc mở khoá tài khoản.
 *
 * Chỉ ghi thêm, không sửa không xoá — nhật ký mà sửa được thì không còn là nhật
 * ký. Cột `reason` để NOT NULL có chủ đích: khoá tài khoản mà không nêu lý do
 * thì tháng sau chính người khoá cũng không nhớ vì sao.
 */
@Entity('user_moderation_logs')
export class UserModerationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Người bị khoá / mở khoá. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Admin thực hiện. */
  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @Column({ type: 'varchar', length: 32 })
  action: UserModerationAction;

  @Column({ type: 'text' })
  reason: string;

  /** Số liệu hành vi tại thời điểm quyết định, để sau còn đối chiếu căn cứ. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
