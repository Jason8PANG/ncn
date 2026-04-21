const { Sequelize, QueryTypes } = require('sequelize');
const s = new Sequelize('ework', 'rptuser', 'R3p0rts', { host: '10.0.6.39', port: 1433, dialect: 'mssql', logging: false });
s.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NCN_Entry' ORDER BY ORDINAL_POSITION", { type: QueryTypes.SELECT })
  .then(r => console.log(r.map(x => x.COLUMN_NAME).join('\n')))
  .catch(e => console.error(e.message))
  .finally(() => s.close());
