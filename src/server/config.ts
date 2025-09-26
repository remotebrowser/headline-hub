import dotenv from 'dotenv';

dotenv.config();

export const settings = {
  MCP_GETGATHER_URL: process.env.MCP_GETGATHER_URL || 'http://127.0.0.1:23456',
  MAXMIND_ACCOUNT_ID: process.env.MAXMIND_ACCOUNT_ID || '',
  MAXMIND_LICENSE_KEY: process.env.MAXMIND_LICENSE_KEY || '',
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
