/* eslint-disable no-console */
import { AppDataSource } from '../config/database';

async function main() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  console.log('Database connected. Truncating disputes, incidents, and trust_score_logs...');

  const tables = ['disputes', 'incidents', 'trust_score_logs'];

  for (const table of tables) {
    try {
      await AppDataSource.query(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`Successfully truncated table: ${table}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to truncate table: ${table}. Error: ${message}`);
    }
  }

  await AppDataSource.destroy();
  console.log('Disconnected from database.');
}

main().catch((err) => {
  console.error('Fatal error executing truncate script:', err);
  process.exit(1);
});
