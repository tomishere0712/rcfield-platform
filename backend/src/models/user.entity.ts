import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { UserRole, AuthProvider } from '../types';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatar_url: string | null;

  @Column({ type: 'text', nullable: true })
  password_hash: string | null;

  @Column({ type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  auth_provider: AuthProvider;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  google_id: string | null;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 100 })
  trust_score: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
  last_active_at: Date | null;

  @Column({ name: 'favorite_cafe_ids', type: 'uuid', array: true, default: [] })
  favorite_cafe_ids: string[];

  @Column({ name: 'racing_profile', type: 'jsonb', default: {} })
  racing_profile: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deleted_at: Date | null;
}
