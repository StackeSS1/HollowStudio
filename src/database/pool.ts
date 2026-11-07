import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

export const pool = new Pool({
  ...(databaseUrl
    ? {
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false }
      }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'hollowstudio',
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD
      }),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (error) => {
  console.error('[DATABASE] Unexpected pool error:', error);
});

export async function checkDatabase(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('[DATABASE] Connected:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('[DATABASE] Connection failed:', error);
    return false;
  }
}
