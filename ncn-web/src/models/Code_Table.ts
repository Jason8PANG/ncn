import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '.';

export interface Code_Table_Attributes {
  ID: number;
  Code_Category: string;
  Code: string;
  Code_Description: string;
  Status: string;
  Note: string | null;
  remark: string | null;
}

export interface Code_Table_Creation_Attributes extends Optional<Code_Table_Attributes, 'ID'> {}

export class Code_Table extends Model<Code_Table_Attributes, Code_Table_Creation_Attributes>
  implements Code_Table_Attributes {
  public ID!: number;
  public Code_Category!: string;
  public Code!: string;
  public Code_Description!: string;
  public Status!: string;
  public Note!: string | null;
  public remark!: string | null;
}

Code_Table.init(
  {
    ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Code_Category: { type: DataTypes.STRING(50), allowNull: true },
    Code: { type: DataTypes.STRING(50), allowNull: true },
    Code_Description: { type: DataTypes.STRING(500), allowNull: true },
    Status: { type: DataTypes.STRING(10), allowNull: false },
    Note: { type: DataTypes.STRING(200), allowNull: true },
    remark: { type: DataTypes.STRING(200), allowNull: true }
  },
  {
    sequelize,
    tableName: 'Code_Table',
    timestamps: false,
    schema: 'dbo'
  }
);
