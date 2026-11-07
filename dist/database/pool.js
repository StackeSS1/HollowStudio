"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.checkDatabase = checkDatabase;
const pg_1 = require("pg");
exports.pool = new pg_1.Pool({
    host: '127.0.0.1',
    port: 5432,
    database: 'hollowstudio',
    user: process.env.PGUSER,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});
exports.pool.on('error', (error) => {
    console.error('[DATABASE] Unexpected pool error:', error);
});
async function checkDatabase() {
    try {
        await exports.pool.query('SELECT NOW()');
        return true;
    }
    catch (error) {
        console.error('[DATABASE] Connection failed:', error);
        return false;
    }
}
