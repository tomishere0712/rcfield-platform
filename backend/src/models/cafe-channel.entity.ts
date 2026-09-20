import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { ChannelStatus, ChannelType } from '../types';

@Entity('cafe_channels')
export class CafeChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'channel_type', type: 'varchar', length: 50 })
  channelType: ChannelType;

  @Column({ type: 'varchar', length: 20, default: ChannelStatus.CONNECTED })
  status: ChannelStatus;

  @Column({ name: 'page_id', length: 100 })
  pageId: string;

  @Column({ name: 'page_name', length: 255 })
  pageName: string;

  @Column({ name: 'encrypted_page_token', type: 'text' })
  encryptedPageToken: string;

  @Column({ name: 'connected_at' })
  connectedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
