import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('push_tokens')
@Index(['userId', 'revokedAt'])
@Index(['token'], { unique: true })
export class PushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  token: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  platform: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 255, nullable: true })
  deviceId: string | null;

  @Column({ name: 'device_name', type: 'varchar', length: 255, nullable: true })
  deviceName: string | null;

  @Column({ name: 'app_version', type: 'varchar', length: 50, nullable: true })
  appVersion: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
