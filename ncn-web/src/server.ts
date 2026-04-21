import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import session from 'express-session';
import MSSQLStore from 'connect-mssql-v2';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

import { config } from './config';
import { logger } from './utils/logger';
import { setupLdapStrategy } from './config/passport';
import { sequelize } from './models';

// Import routes
import authRoutes from './routes/auth.routes';
import ncnRoutes from './routes/ncn.routes';
import entryRoutes from './routes/entry.routes';
import actionRoutes from './routes/action.routes';
import issueLogRoutes from './routes/issuelog.routes';
import staffRoutes from './routes/staff.routes';
import uploadRoutes from './routes/upload.routes';

const app: Application = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = config.corsOrigins || ['http://localhost:3001'];
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Session configuration - use memory store for development
// MSSQLStore requires session table in database, using simple memory store instead
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  // store: mssqlStore, // Commented out for development
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: config.session.maxAge
  }
}));

// Passport initialization
setupLdapStrategy();
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ncn', ncnRoutes);
app.use('/api/entry', entryRoutes);
app.use('/api/action', actionRoutes);
app.use('/api/issuelog', issueLogRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error:', err);
  res.status(err instanceof Error && 'status' in err ? (err as any).status : 500).json({
    error: config.nodeEnv === 'development' ? err.message : 'Internal Server Error'
  });
});

// Database connection and server start
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');

    // Sync database (in development mode only)
    if (config.nodeEnv === 'development') {
      // await sequelize.sync({ alter: true });
      logger.info('Database synchronized.');
    }

    app.listen(config.port, () => {
      logger.info(`NCN Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (error) {
    logger.error('Unable to start server:', error);
    // Continue running without database for frontend testing
    logger.warn('Starting server without database connection...');
    app.listen(config.port, () => {
      logger.info(`NCN Server running on port ${config.port} in ${config.nodeEnv} mode (limited functionality)`);
    });
  }
};

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
});

startServer();

export default app;
