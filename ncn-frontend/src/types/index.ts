export interface IUser {
  lanId: string;
  displayName: string;
  email: string;
  department: string;
  title?: string;
}

export interface INCN_Entry {
  ROWID?: number;
  NCN_Type: string;
  SerialNo: string;
  SBU: string;
  SBU_Des: string;
  Finder_Dept: string;
  Finder: string;
  Finder_Date: string | Date;
  Week?: string;
  Month?: string;
  WO: string;
  Part_ID: string;
  Customer: string;
  Defect_Description: string;
  Defect_Qty: number;
  Defect_Rate: string;
  Issue_Type?: string;
  Deep_Annlysis?: string;
  Tooling_Code?: string;
  RawMaterialLot?: string;
  RMpart?: string;
  OwnerDept?: string;
  Owner?: string;
  OwnerMail?: string;
  ME_Engineer: string;
  QualityEngineer: string;
  Status?: string;
  FilePath?: string;
  Comments?: string;
  RejectDate?: Date;
  CloseBy?: string;
  CloseDate?: Date;
  UpdateBy?: string;
  UpdateDate?: Date;
  LineLeader?: string;
}

export interface INCN_Action_Detail {
  RowID?: number;
  NCN_ID: number;
  Type: 'C' | 'F';
  ActionDept?: string;
  ActionOwner?: string;
  OwnerAnalysis?: string;
  OwnerAction?: string;
  ActionDuedate?: Date | string;
  ActionStatus: string;
  CreateBy?: string;
  CreateDate?: Date;
  CloseBy?: string;
  CloseDate?: Date;
  RemindMail?: Date;
}

export interface INCN_Kanban {
  RowID?: number;
  Section: string;
  CorMonday: string;
  FiberMonday: string;
  CorTuesday: string;
  FiberTuesday: string;
  CorWednesday: string;
  FiberWednesday: string;
  CorThursday: string;
  FiberThursday: string;
  CorFriday: string;
  FiberFriday: string;
  CorSaturday: string;
  FiberSaturday: string;
  CorSunday: string;
  FiberSunday: string;
  Year: number;
  Week: number;
  UpdateBy?: string;
  UpdateDate?: Date;
}

export interface IApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface INCNQueryParams {
  customer?: string;
  partId?: string;
  issueType?: string;
  qualityEngineer?: string;
  meEngineer?: string;
  finderDept?: string;
  owner?: string;
  sbu?: string;
  sbuDes?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  serialNo?: string;
}
