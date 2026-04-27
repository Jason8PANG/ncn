import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

import { config } from './config';
import { logger } from './utils/logger';
import { setupLdapStrategy } from './config/passport';
import { sequelize } from './models';
import { jwtCookieMiddleware } from './middleware/auth';

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
    if (!origin) return callback(null, true);
    const allowedOrigins = config.corsOrigins || ['http://localhost:3001'];
    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://suzvweb02')
    ) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
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

// Cookie parser（JWT Cookie 读取依赖）
app.use(cookieParser());

// JWT Cookie 验证中间件（将 Cookie 中的 JWT 解析到 req.user）
app.use(jwtCookieMiddleware);

// Passport（仅用于 LDAP 认证策略，不再使用 session）
setupLdapStrategy();
app.use(passport.initialize());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

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
  logger.error('Unhandled error:', err.message);
  res.status((err as any).status || 500).json({
    error: config.nodeEnv === 'development' ? err.message : 'Internal Server Error'
  });
});

// Database connection and server start
const startServer = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');

    app.listen(config.port, () => {
      logger.info(`NCN Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (error) {
    logger.error('Unable to connect to database:', error);
    logger.warn('Starting server without database connection...');
    app.listen(config.port, () => {
      logger.info(`NCN Server running on port ${config.port} in ${config.nodeEnv} mode (limited functionality)`);
    });
  }
};

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
});

startServer();

export default app;
