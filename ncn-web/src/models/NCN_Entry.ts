import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '.';

export interface NCN_Entry_Attributes {
  ROWID: number;
  NCN_Type: string;
  SerialNo: string;
  SBU: string;
  SBU_Des: string;
  Finder_Dept: string;
  Finder: string;
  Finder_Date: Date | string;
  Week: string;
  Month: string;
  WO: string;
  Part_ID: string;
  Customer: string;
  Defect_Description: string;
  Defect_Qty: number;
  Defect_Rate: string;
  Issue_Type: string;
  Deep_Annlysis: string;
  Tooling_Code: string;
  RawMaterialLot: string;
  RMpart: string;
  OwnerDept: string;
  Owner: string;
  OwnerMail: string;
  ME_Engineer: string;
  QualityEngineer: string;
  Status: string;
  ActionCloseMailAlert: Date | string;
  CloseMailAlert: Date | string;
  FilePath: string;
  Comments: string;
  RejectDate: Date | string;
  CloseBy: string;
  CloseDate: Date | string;
  UpdateBy: string;
  UpdateDate: Date | string;
  MEmailRemind: Date | string;
  OwnerMailRemind: Date | string;
  OwnerActionRemind: Date | string;
  QCCloseMailDate: Date | string;
  LineLeader: string;
}

export interface NCN_Entry_Creation_Attributes extends Optional<NCN_Entry_Attributes, 'ROWID'> {}

export class NCN_Entry extends Model<NCN_Entry_Attributes, NCN_Entry_Creation_Attributes> implements NCN_Entry_Attributes {
  public ROWID!: number;
  public NCN_Type!: string;
  public SerialNo!: string;
  public SBU!: string;
  public SBU_Des!: string;
  public Finder_Dept!: string;
  public Finder!: string;
  public Finder_Date!: Date | string;
  public Week!: string;
  public Month!: string;
  public WO!: string;
  public Part_ID!: string;
  public Customer!: string;
  public Defect_Description!: string;
  public Defect_Qty!: number;
  public Defect_Rate!: string;
  public Issue_Type!: string;
  public Deep_Annlysis!: string;
  public Tooling_Code!: string;
  public RawMaterialLot!: string;
  public RMpart!: string;
  public OwnerDept!: string;
  public Owner!: string;
  public OwnerMail!: string;
  public ME_Engineer!: string;
  public QualityEngineer!: string;
  public Status!: string;
  public ActionCloseMailAlert!: Date | string;
  public CloseMailAlert!: Date | string;
  public FilePath!: string;
  public Comments!: string;
  public RejectDate!: Date | string;
  public CloseBy!: string;
  public CloseDate!: Date | string;
  public UpdateBy!: string;
  public UpdateDate!: Date | string;
  public MEmailRemind!: Date | string;
  public OwnerMailRemind!: Date | string;
  public OwnerActionRemind!: Date | string;
  public QCCloseMailDate!: Date | string;
  public LineLeader!: string;
}

NCN_Entry.init(
  {
    ROWID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    NCN_Type: { type: DataTypes.STRING(10), allowNull: true },
    SerialNo: { type: DataTypes.STRING(50), allowNull: true },
    SBU: { type: DataTypes.STRING(100), allowNull: true },
    SBU_Des: { type: DataTypes.STRING(200), allowNull: true },
    Finder_Dept: { type: DataTypes.STRING(50), allowNull: true },
    Finder: { type: DataTypes.STRING(100), allowNull: true },
    Finder_Date: { type: DataTypes.DATE, allowNull: true },
    Week: { type: DataTypes.STRING(10), allowNull: true },
    Month: { type: DataTypes.STRING(10), allowNull: true },
    WO: { type: DataTypes.STRING(50), allowNull: true },
    Part_ID: { type: DataTypes.STRING(100), allowNull: true },
    Customer: { type: DataTypes.STRING(200), allowNull: true },
    Defect_Description: { type: DataTypes.TEXT, allowNull: true },
    Defect_Qty: { type: DataTypes.INTEGER, allowNull: true },
    Defect_Rate: { type: DataTypes.STRING(50), allowNull: true },
    Issue_Type: { type: DataTypes.STRING(100), allowNull: true },
    Deep_Annlysis: { type: DataTypes.STRING(200), allowNull: true },
    Tooling_Code: { type: DataTypes.STRING(100), allowNull: true },
    RawMaterialLot: { type: DataTypes.STRING(200), allowNull: true },
    RMpart: { type: DataTypes.STRING(100), allowNull: true },
    OwnerDept: { type: DataTypes.STRING(100), allowNull: true },
    Owner: { type: DataTypes.STRING(100), allowNull: true },
    OwnerMail: { type: DataTypes.STRING(200), allowNull: true },
    ME_Engineer: { type: DataTypes.STRING(100), allowNull: true },
    QualityEngineer: { type: DataTypes.STRING(100), allowNull: true },
    Status: { type: DataTypes.STRING(50), allowNull: true },
    ActionCloseMailAlert: { type: DataTypes.DATE, allowNull: true },
    CloseMailAlert: { type: DataTypes.DATE, allowNull: true },
    FilePath: { type: DataTypes.TEXT, allowNull: true },
    Comments: { type: DataTypes.TEXT, allowNull: true },
    RejectDate: { type: DataTypes.STRING(10), allowNull: true },
    CloseBy: { type: DataTypes.STRING(100), allowNull: true },
    CloseDate: { type: DataTypes.STRING(10), allowNull: true },
    UpdateBy: { type: DataTypes.STRING(100), allowNull: true },
    UpdateDate: { type: DataTypes.STRING(10), allowNull: true },
    MEmailRemind: { type: DataTypes.DATE, allowNull: true },
    OwnerMailRemind: { type: DataTypes.DATE, allowNull: true },
    OwnerActionRemind: { type: DataTypes.DATE, allowNull: true },
    QCCloseMailDate: { type: DataTypes.DATE, allowNull: true },
    LineLeader: { type: DataTypes.STRING(100), allowNull: true }
  },
  {
    sequelize,
    tableName: 'NCN_Entry',
    timestamps: false,
    schema: 'dbo'
  }
);
