import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

// Chạy 1 lần duy nhất trước tất cả test suite
// globalSetup chạy trong process riêng nên phải tự load env + tạo DataSource
export default async function globalSetup() {
  const host = process.env.DB_HOST ?? 'localhost';
  const port = parseInt(process.env.DB_PORT ?? '5432', 10);
  const username = process.env.DB_USERNAME ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? 'postgres';

  // Bước 1: Kết nối vào DB mặc định để tạo rcfeild_test nếu chưa có
  const adminDS = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database: 'postgres',
  });

  await adminDS.initialize();
  await adminDS.query(`CREATE DATABASE rcfeild_test`).catch(() => {
    /* DB đã tồn tại — bỏ qua */
  });
  await adminDS.destroy();

  // Bước 2: Kết nối vào rcfeild_test và chạy migration
  const testDS = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database: 'rcfeild_test',
    entities: [path.join(__dirname, '../models/**/*.entity.{ts,js}')],
    migrations: [path.join(__dirname, '../migrations/**/*.{ts,js}')],
  });

  await testDS.initialize();
  await testDS.runMigrations({ transaction: 'none' });
  await testDS.destroy();

  console.log('[Test DB] rcfeild_test ready');
}
