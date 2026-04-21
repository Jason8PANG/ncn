import { config } from '../config';

describe('Config Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('port configuration', () => {
    it('should use default port 3000 when PORT is not set', () => {
      delete process.env.PORT;
      jest.isolateModules(() => {
        const { config: testConfig } = require('../config');
        expect(testConfig.port).toBe(3000);
      });
    });

    it('should use PORT from environment variable', () => {
      process.env.PORT = '8080';
      jest.isolateModules(() => {
        const { config: testConfig } = require('../config');
        expect(testConfig.port).toBe(8080);
      });
    });
  });

  describe('database configuration', () => {
    it('should have default database settings', () => {
      expect(config.database.host).toBeDefined();
      expect(config.database.database).toBeDefined();
      expect(config.database.port).toBeDefined();
    });

    it('should use mssql dialect', () => {
      expect(config.database.options.dialect).toBe('mssql');
    });

    it('should trust server certificate by default', () => {
      expect(config.database.options.trustServerCertificate).toBe(true);
    });
  });

  describe('session configuration', () => {
    it('should have default secret', () => {
      expect(config.session.secret).toBeDefined();
    });

    it('should have 24 hours max age', () => {
      expect(config.session.maxAge).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('upload configuration', () => {
    it('should have default upload path', () => {
      expect(config.upload.path).toBeDefined();
    });

    it('should have 10MB max file size', () => {
      expect(config.upload.maxSize).toBe(10485760);
    });
  });
});
