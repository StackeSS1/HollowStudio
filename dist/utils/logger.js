"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function log(level, message, details) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [HOLLOW] [${level}]`;
    if (details !== undefined) {
        console.log(prefix, message, details);
    }
    else {
        console.log(prefix, message);
    }
}
exports.logger = {
    info: (message, details) => log('INFO', message, details),
    warn: (message, details) => log('WARN', message, details),
    error: (message, details) => log('ERROR', message, details),
    debug: (message, details) => log('DEBUG', message, details)
};
