import dotenv from 'dotenv';

dotenv.config();

export const settings = {
  GETGATHER_URL: process.env.GETGATHER_URL || 'http://127.0.0.1:23456',
  GETGATHER_APP_KEY: process.env.GETGATHER_APP_KEY || '',
  MAXMIND_ACCOUNT_ID: process.env.MAXMIND_ACCOUNT_ID || '',
  MAXMIND_LICENSE_KEY: process.env.MAXMIND_LICENSE_KEY || '',
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  LOGFIRE_TOKEN: process.env.LOGFIRE_TOKEN || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

export const newsSources = [
  {
    id: 'npr',
    label: 'NPR',
    toolName: 'npr_get_headlines',
    dataKey: 'headlines',
  },
  {
    id: 'groundnews',
    label: 'Ground News',
    toolName: 'groundnews_get_stories',
    dataKey: 'stories',
  },
  {
    id: 'cnn',
    label: 'CNN',
    toolName: 'cnn_get_latest_stories',
    dataKey: 'stories',
  },
];
