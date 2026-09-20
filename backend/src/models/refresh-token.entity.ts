import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'text' })
  token: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
