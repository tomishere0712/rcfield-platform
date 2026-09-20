/* eslint-disable no-console */
import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';

async function main() {
  await AppDataSource.initialize();
  console.log('--- CHECK USERS ---');

  const providers = await AppDataSource.query(
    `SELECT id, email, full_name, role FROM users WHERE email = $1`,
    ['thanhtung07092004@gmail.com'],
  );
  console.log('Provider:', providers);

  const staffs = await AppDataSource.query(
    `SELECT id, email, full_name, role FROM users WHERE email = $1`,
    ['soichien778@gmail.com'],
  );
  console.log('Staff:', staffs);

  if (providers.length > 0) {
    const cafes = await AppDataSource.query(
      `SELECT id, name, slug FROM cafes WHERE provider_id = $1`,
      [providers[0].id],
    );
    console.log('Cafes of Provider:', cafes);
  }

  await AppDataSource.destroy();
}

main().catch(console.error);
