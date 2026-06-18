import dotenv from 'dotenv';

dotenv.config();

export const settings = {
  REMOTEBROWSER_URL: process.env.REMOTEBROWSER_URL || 'http://127.0.0.1:23456',
  GETGATHER_APP_KEY: process.env.GETGATHER_APP_KEY || '',
  MAXMIND_ACCOUNT_ID: process.env.MAXMIND_ACCOUNT_ID || '',
  MAXMIND_LICENSE_KEY: process.env.MAXMIND_LICENSE_KEY || '',
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  LOGFIRE_TOKEN: process.env.LOGFIRE_TOKEN || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  ENVIRONMENT: process.env.ENVIRONMENT || 'local',
};

export const newsSources = [
  {
    id: 'npr',
    label: 'NPR',
    url: 'https://text.npr.org/',
    dataKey: 'headlines',
  },
  {
    id: 'groundnews',
    label: 'Ground News',
    url: 'https://ground.news/',
    dataKey: 'stories',
  },
  {
    id: 'cnn',
    label: 'CNN',
    url: 'https://lite.cnn.com/',
    dataKey: 'stories',
  },
];
