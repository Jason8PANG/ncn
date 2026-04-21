import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_DATABASE = process.env.DB_DATABASE || 'NCN_DB';
process.env.SESSION_SECRET = 'test-secret-key';
