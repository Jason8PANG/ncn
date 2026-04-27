export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_NAME || 'NCN_DB',
    username: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
      dialect: 'mssql' as const,
      trustServerCertificate: true,
      logging: process.env.NODE_ENV === 'development' ? console.log : false
    }
  },

  ldap: {
    url: process.env.LDAP_URL || 'ldap://localhost:389',
    baseDN: process.env.LDAP_BASE_DN || 'DC=local,DC=com',
    bindDN: process.env.LDAP_BIND_DN || '',
    bindCredentials: process.env.LDAP_BIND_CREDENTIALS || '',
    searchFilter: process.env.LDAP_SEARCH_FILTER || '(sAMAccountName={{username}})'
  },

  session: {
    secret: process.env.SESSION_SECRET || 'ncn-secret-key-change-in-production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },

  email: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '25', 10),
    from: process.env.SMTP_FROM || 'NCN@nai-group.com',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || ''
  },

  upload: {
    path: process.env.UPLOAD_PATH || './uploads',
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10) // 10MB
  },

  appUrl: process.env.NCN_APP_URL || 'http://localhost:3000',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],

  jwt: {
    secret: process.env.JWT_SECRET || 'ncn-jwt-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',  // Cookie 有效期 7 天
    cookieName: 'ncn_token'
  }
};
