import 'dotenv/config';
import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

const USERS = [
  {
    email: 'admin@gmail.com',
    full_name: 'Admin RCField',
    role: 'ADMIN',
    password: '123456',
    avatar_url:
      'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=300',
  },
  {
    email: 'provider@gmail.com',
    full_name: 'Provider Owner',
    role: 'PROVIDER',
    password: '123456',
    avatar_url:
      'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=300',
  },
  {
    email: 'provider_other@gmail.com',
    full_name: 'Other Provider Owner',
    role: 'PROVIDER',
    password: '123456',
    avatar_url:
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=300',
  },
  {
    email: 'staff@gmail.com',
    full_name: 'Staff Member',
    role: 'STAFF',
    password: '123456',
    avatar_url:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=300',
  },
  {
    email: 'staff_other@gmail.com',
    full_name: 'Other Staff Member',
    role: 'STAFF',
    password: '123456',
    avatar_url:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300',
  },
  {
    email: 'customer@gmail.com',
    full_name: 'Khách Hàng',
    role: 'CUSTOMER',
    password: '123456',
    avatar_url:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=300',
  },
  {
    // Khách thứ hai là BẮT BUỘC, không phải cho đẹp: seed-commercial-data.ts
    // đòi đúng hai khách (`customers.length !== 2`) rồi mới chịu tạo gói chơi
    // và khuyến mãi. Thiếu người này thì cả chuỗi seed:all chết giữa chừng.
    email: 'customer_other@gmail.com',
    full_name: 'Khách Hàng Thứ Hai',
    role: 'CUSTOMER',
    password: '123456',
    avatar_url:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=300',
  },
];

async function seed() {
  await AppDataSource.initialize();
  logger.database('Connected');

  for (const u of USERS) {
    const [existing] = await AppDataSource.query(`SELECT id FROM users WHERE email = $1`, [
      u.email,
    ]);

    let userId: string;

    if (existing) {
      logger.warn('Seed', `Skip — already exists: ${u.email}`);
      userId = existing.id;
    } else {
      const password_hash = await bcrypt.hash(u.password, 10);
      const result = await AppDataSource.query(
        `INSERT INTO users (email, full_name, password_hash, role, avatar_url, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id`,
        [u.email, u.full_name, password_hash, u.role, u.avatar_url],
      );
      userId = result[0]?.id;
      logger.info('Seed', `Created ${u.role.padEnd(8)} — ${u.email}`);
    }

    await AppDataSource.query(
      `UPDATE users SET avatar_url = $1 WHERE id = $2 AND avatar_url IS NULL`,
      [u.avatar_url, userId],
    );

    if (u.role === 'PROVIDER' && userId) {
      const [existingProfile] = await AppDataSource.query(
        `SELECT id FROM provider_profiles WHERE user_id = $1`,
        [userId],
      );
      if (!existingProfile) {
        await AppDataSource.query(
          `INSERT INTO provider_profiles (user_id, business_name, registration_status)
           VALUES ($1, $2, 'ACTIVE')`,
          [userId, u.full_name + ' Business'],
        );
        logger.info('Seed', `Created Provider Profile for ${u.email}`);
      } else {
        logger.warn('Seed', `Skip profile — already exists for ${u.email}`);
      }
    }
  }

  await AppDataSource.destroy();
  logger.info('Seed', 'Done');
}

seed().catch((err) => {
  logger.error('Seed', 'Failed', err);
  process.exit(1);
});
