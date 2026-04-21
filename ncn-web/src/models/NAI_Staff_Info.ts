import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '.';

export interface NAI_Staff_Info_Attributes {
  Emp_ID: string;
  Lan_ID: string;
  Staff_Name: string;
  Email_Addr: string;
  Department: string;
  Leave_Date: Date | string | null;
}

export interface NAI_Staff_Info_Creation_Attributes extends Optional<NAI_Staff_Info_Attributes, 'Emp_ID'> {}

export class NAI_Staff_Info extends Model<NAI_Staff_Info_Attributes, NAI_Staff_Info_Creation_Attributes> implements NAI_Staff_Info_Attributes {
  public Emp_ID!: string;
  public Lan_ID!: string;
  public Staff_Name!: string;
  public Email_Addr!: string;
  public Department!: string;
  public Leave_Date!: Date | string | null;
}

NAI_Staff_Info.init(
  {
    Emp_ID: { type: DataTypes.STRING(50), primaryKey: true },
    Lan_ID: { type: DataTypes.STRING(100), allowNull: true },
    Staff_Name: { type: DataTypes.STRING(100), allowNull: true },
    Email_Addr: { type: DataTypes.STRING(200), allowNull: true },
    Department: { type: DataTypes.STRING(100), allowNull: true },
    Leave_Date: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: 'NAI_Staff_Info',
    timestamps: false,
    schema: 'dbo'
  }
);
