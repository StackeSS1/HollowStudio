"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const schema_1 = require("./schema");
const pool_1 = require("./pool");
async function main() {
    try {
        console.log('[HOLLOW] Initializing database...');
        await (0, schema_1.initializeDatabase)();
        console.log('[HOLLOW] Database setup completed.');
    }
    catch (error) {
        console.error('[HOLLOW] Database initialization failed:', error);
        process.exitCode = 1;
    }
    finally {
        await pool_1.pool.end();
    }
}
main();
