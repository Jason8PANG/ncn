import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '.';

export interface Code_Table_Attributes {
  Code: string;
  Code_Category: string;
  Code_Description: string;
  remark: string;
  Status: string;
  UpdateBy: string;
  UpdateDate: Date | string;
}

export interface Code_Table_Creation_Attributes extends Optional<Code_Table_Attributes, 'Code'> {}

export class Code_Table extends Model<Code_Table_Attributes, Code_Table_Creation_Attributes> implements Code_Table_Attributes {
  public Code!: string;
  public Code_Category!: string;
  public Code_Description!: string;
  public remark!: string;
  public Status!: string;
  public UpdateBy!: string;
  public UpdateDate!: Date | string;
}

Code_Table.init(
  {
    Code: { type: DataTypes.STRING(100), primaryKey: true },
    Code_Category: { type: DataTypes.STRING(100), allowNull: true },
    Code_Description: { type: DataTypes.STRING(200), allowNull: true },
    remark: { type: DataTypes.STRING(500), allowNull: true },
    Status: { type: DataTypes.STRING(50), allowNull: true },
    UpdateBy: { type: DataTypes.STRING(100), allowNull: true },
    UpdateDate: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: 'Code_Table',
    timestamps: false,
    schema: 'dbo'
  }
);
