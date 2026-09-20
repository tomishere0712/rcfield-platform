/* eslint-disable */
import 'dotenv/config';
import { AppDataSource } from '../config/database';
import { Cafe } from '../models/cafe.entity';

async function main() {
  console.log('Initializing Database...');
  await AppDataSource.initialize();
  console.log('Database initialized.');

  try {
    const ds = AppDataSource;
    console.log('Running query for rcfield-system...');
    const result = await ds.query(
      `SELECT id, slug, widget_config FROM cafes WHERE slug = 'rcfield-system' AND status = 'ACTIVE' LIMIT 1`,
    );
    console.log('Query result:', result);

    if (result.length === 0) {
      console.log('No cafe with slug rcfield-system and status ACTIVE found.');
      // Print all cafes to check status
      const allCafes = await ds.getRepository(Cafe).find();
      console.log('All cafes in DB:');
      for (const c of allCafes) {
        console.log(`Cafe: "${c.name}", slug="${c.slug}", status="${c.status}"`);
      }
    }
  } catch (error: any) {
    console.error('Error occurred:', error);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main();
