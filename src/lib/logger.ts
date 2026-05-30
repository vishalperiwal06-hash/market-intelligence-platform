/**
 * Structured Logging Utility
 */
export const logger = {
  info: (context: string, message: string, meta?: Record<string, any>) => {
    console.log(JSON.stringify({ level: 'INFO', timestamp: new Date().toISOString(), context, message, ...meta }));
  },
  warn: (context: string, message: string, meta?: Record<string, any>) => {
    console.warn(JSON.stringify({ level: 'WARN', timestamp: new Date().toISOString(), context, message, ...meta }));
  },
  error: (context: string, message: string, error?: any, meta?: Record<string, any>) => {
    console.error(JSON.stringify({ level: 'ERROR', timestamp: new Date().toISOString(), context, message, error: error?.message || error, ...meta }));
  },
  debug: (context: string, message: string, meta?: Record<string, any>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({ level: 'DEBUG', timestamp: new Date().toISOString(), context, message, ...meta }));
    }
  }
};
