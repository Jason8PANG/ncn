import { Sequelize } from 'sequelize';
import { config } from '../config';
import { logger } from '../utils/logger';

// Initialize Sequelize with MS SQL Server
export const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'mssql',
    logging: config.database.options.logging,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      trustServerCertificate: true,
      options: {
        encrypt: false,
        enableArithAbort: true
      }
    }
  }
);

// Import models
import { NCN_Entry } from './NCN_Entry';
import { NCN_Action_Detail } from './NCN_Action_Detail';
import { NAI_Staff_Info } from './NAI_Staff_Info';
import { Code_Table } from './Code_Table';

// Define associations
NCN_Entry.hasMany(NCN_Action_Detail, { foreignKey: 'NCN_ID', as: 'actions' });
NCN_Action_Detail.belongsTo(NCN_Entry, { foreignKey: 'NCN_ID', as: 'ncn' });

// Export all models
export {
  NCN_Entry,
  NCN_Action_Detail,
  NAI_Staff_Info,
  Code_Table
};

// Test connection
export const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');
    return true;
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    return false;
  }
};

export default sequelize;
