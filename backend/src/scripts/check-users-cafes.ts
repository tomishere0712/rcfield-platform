/* eslint-disable no-console */
import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';

async function main() {
  await AppDataSource.initialize();
  console.log('Connected to Database!');

  // 1. Check Provider
  const [provider] = await AppDataSource.query<{ id: string; email: string }[]>(
    `SELECT id, email FROM users WHERE email = 'thanhtung07092004@gmail.com'`,
  );
  console.log('Provider found:', provider);

  // 2. Check Staff
  const [staff] = await AppDataSource.query<{ id: string; email: string }[]>(
    `SELECT id, email FROM users WHERE email = 'soichien778@gmail.com'`,
  );
  console.log('Staff found:', staff);

  if (provider) {
    // 3. Check Cafes of Provider
    const cafes = await AppDataSource.query<
      { id: string; name: string; slug: string; district: string; city: string }[]
    >(`SELECT id, name, slug, district, city FROM cafes WHERE provider_id = $1`, [provider.id]);
    console.log(`Cafes found for provider ${provider.email}:`);
    console.log(cafes);
  }

  await AppDataSource.destroy();
}

main().catch(console.error);
