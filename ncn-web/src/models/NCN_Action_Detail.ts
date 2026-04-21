import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '.';

export interface NCN_Action_Detail_Attributes {
  RowID: number;
  NCN_ID: number;
  Type: string;
  ActionDept: string;
  ActionOwner: string;
  OwnerAnalysis: string;
  OwnerAction: string;
  ActionDuedate: string | null;
  ActionStatus: string;
  CreateBy: string;
  CreateDate: string | null;
  CloseBy: string | null;
  CloseDate: string | null;
  RemindMail: Date | string | null;
}

export interface NCN_Action_Detail_Creation_Attributes extends Optional<NCN_Action_Detail_Attributes, 'RowID'> {}

export class NCN_Action_Detail extends Model<NCN_Action_Detail_Attributes, NCN_Action_Detail_Creation_Attributes> implements NCN_Action_Detail_Attributes {
  public RowID!: number;
  public NCN_ID!: number;
  public Type!: string;
  public ActionDept!: string;
  public ActionOwner!: string;
  public OwnerAnalysis!: string;
  public OwnerAction!: string;
  public ActionDuedate!: string | null;
  public ActionStatus!: string;
  public CreateBy!: string;
  public CreateDate!: string | null;
  public CloseBy!: string | null;
  public CloseDate!: string | null;
  public RemindMail!: Date | string | null;
}

NCN_Action_Detail.init(
  {
    RowID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    NCN_ID: { type: DataTypes.INTEGER, allowNull: true },
    Type: { type: DataTypes.STRING(10), allowNull: true },
    ActionDept: { type: DataTypes.STRING(100), allowNull: true },
    ActionOwner: { type: DataTypes.STRING(100), allowNull: true },
    OwnerAnalysis: { type: DataTypes.TEXT, allowNull: true },
    OwnerAction: { type: DataTypes.TEXT, allowNull: true },
    // 使用 STRING(10) 存储 YYYY-MM-DD 格式，避免 DATE 类型导致的时区转换问题
    ActionDuedate: { type: DataTypes.STRING(10), allowNull: true },
    ActionStatus: { type: DataTypes.STRING(50), allowNull: true },
    CreateBy: { type: DataTypes.STRING(100), allowNull: true },
    // 使用 STRING(10) 存储 YYYY-MM-DD 格式，避免 DATE 类型导致的时区转换问题
    CreateDate: { type: DataTypes.STRING(10), allowNull: true },
    CloseBy: { type: DataTypes.STRING(100), allowNull: true },
    // 使用 STRING(10) 存储 YYYY-MM-DD 格式，避免 DATE 类型导致的时区转换问题
    CloseDate: { type: DataTypes.STRING(10), allowNull: true },
    RemindMail: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: 'NCN_Action_Detail',
    timestamps: false,
    schema: 'dbo'
  }
);
