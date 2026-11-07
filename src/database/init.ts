import 'dotenv/config';
import { initializeDatabase } from './schema';
import { pool } from './pool';

async function main() {
  try {
    console.log('[HOLLOW] Initializing database...');
    await initializeDatabase();
    console.log('[HOLLOW] Database setup completed.');
  } catch (error) {
    console.error('[HOLLOW] Database initialization failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
