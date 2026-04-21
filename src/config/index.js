import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') dotenv.config();

export const PORT = process.env.PORT || 3000;
export const JWT_SECRET = process.env.JWT_SECRET;
export const DB_PATH = process.env.DB_PATH || './db/ma.db';
export const NODE_ENV = process.env.NODE_ENV || 'development';
