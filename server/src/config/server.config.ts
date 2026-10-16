import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

export const SERVER_CONFIG = {
  PORT: Number(process.env.PORT) || 4000,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  PLATFORM_API_URL: process.env.PLATFORM_API_URL || 'https://api.start.ng/v1',
  USE_MOCK_PLATFORM: process.env.USE_MOCK_PLATFORM !== 'false'
};
