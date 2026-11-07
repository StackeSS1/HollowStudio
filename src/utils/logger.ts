type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function log(level: LogLevel, message: string, details?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [HOLLOW] [${level}]`;

  if (details !== undefined) {
    console.log(prefix, message, details);
  } else {
    console.log(prefix, message);
  }
}

export const logger = {
  info: (message: string, details?: unknown) =>
    log('INFO', message, details),

  warn: (message: string, details?: unknown) =>
    log('WARN', message, details),

  error: (message: string, details?: unknown) =>
    log('ERROR', message, details),

  debug: (message: string, details?: unknown) =>
    log('DEBUG', message, details)
};
