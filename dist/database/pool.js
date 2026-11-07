"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.checkDatabase = checkDatabase;
const pg_1 = require("pg");
const databaseUrl = process.env.DATABASE_URL;
exports.pool = new pg_1.Pool({
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
exports.pool.on('error', (error) => {
    console.error('[DATABASE] Unexpected pool error:', error);
});
async function checkDatabase() {
    try {
        const result = await exports.pool.query('SELECT NOW()');
        console.log('[DATABASE] Connected:', result.rows[0].now);
        return true;
    }
    catch (error) {
        console.error('[DATABASE] Connection failed:', error);
        return false;
    }
}
