import { Pool } from 'pg';

export const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'hollowstudio',
  user: process.env.PGUSER,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (error) => {
  console.error('[DATABASE] Unexpected pool error:', error);
});

export async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('[DATABASE] Connection failed:', error);
    return false;
  }
}
