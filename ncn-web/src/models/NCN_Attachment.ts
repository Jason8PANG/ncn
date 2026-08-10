import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '.';

export interface NCN_Attachment_Attributes {
  ROWID: number;
  NCN_ID: number;
  FileName: string;
  FileType: string;
  FileSize: number;
  FileData: Buffer;
  UploadBy: string;
  UploadDate: Date | string;
}

export interface NCN_Attachment_Creation_Attributes extends Optional<NCN_Attachment_Attributes, 'ROWID'> {}

export class NCN_Attachment extends Model<NCN_Attachment_Attributes, NCN_Attachment_Creation_Attributes>
  implements NCN_Attachment_Attributes {
  public ROWID!: number;
  public NCN_ID!: number;
  public FileName!: string;
  public FileType!: string;
  public FileSize!: number;
  public FileData!: Buffer;
  public UploadBy!: string;
  public UploadDate!: Date | string;
}

NCN_Attachment.init(
  {
    ROWID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    NCN_ID: { type: DataTypes.INTEGER, allowNull: false },
    FileName: { type: DataTypes.STRING(255), allowNull: false },
    FileType: { type: DataTypes.STRING(100), allowNull: true },
    FileSize: { type: DataTypes.INTEGER, allowNull: true },
    FileData: { type: DataTypes.BLOB('long'), allowNull: false },
    UploadBy: { type: DataTypes.STRING(100), allowNull: true },
    UploadDate: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: 'NCN_Attachment',
    timestamps: false,
    schema: 'dbo'
  }
);
