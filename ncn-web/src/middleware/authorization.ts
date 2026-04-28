import { Request } from 'express';
import path from 'path';
import { NCN_Entry, NCN_Action_Detail } from '../models';

const normalizeLanId = (value?: string | null): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const slashIndex = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  const core = slashIndex >= 0 ? trimmed.substring(slashIndex + 1) : trimmed;
  return core.toLowerCase();
};

export const getNormalizedCurrentLanId = (req: Request): string => {
  const lanId = (req.user as any)?.lanId || '';
  return normalizeLanId(lanId);
};

export const isAdminLanId = (lanId: string): boolean => {
  const configured = process.env.NCN_ADMIN_LAN_IDS || '';
  if (!configured.trim()) {
    return false;
  }
  const adminLanIds = configured
    .split(',')
    .map(item => normalizeLanId(item))
    .filter(Boolean);
  return adminLanIds.includes(normalizeLanId(lanId));
};

export const isAdminRequest = (req: Request): boolean => {
  return isAdminLanId(getNormalizedCurrentLanId(req));
};

const isQEOwner = (req: Request, entry: NCN_Entry): boolean => {
  return normalizeLanId(entry.QualityEngineer) === getNormalizedCurrentLanId(req);
};

const isEntryOwner = (req: Request, entry: NCN_Entry): boolean => {
  const current = getNormalizedCurrentLanId(req);
  return normalizeLanId(entry.Finder) === current || normalizeLanId(entry.Owner) === current;
};

const isActionOwner = (req: Request, action: NCN_Action_Detail): boolean => {
  return normalizeLanId(action.ActionOwner) === getNormalizedCurrentLanId(req);
};

const isMEEngineerOwner = (req: Request, entry: NCN_Entry): boolean => {
  return normalizeLanId(entry.ME_Engineer) === getNormalizedCurrentLanId(req);
};

export const canEditNCNEntry = (req: Request, entry: NCN_Entry): boolean => {
  if (entry.Status === 'Closed') return false;
  return isAdminRequest(req) || isQEOwner(req, entry) || isEntryOwner(req, entry);
};

export const canManageActionOnEntry = (req: Request, entry: NCN_Entry): boolean => {
  // Issue Log 新增/删除: 只有 ME Engineer 或 Admin
  return isAdminRequest(req) || isMEEngineerOwner(req, entry);
};

export const canEditAction = (req: Request, action: NCN_Action_Detail, entry: NCN_Entry): boolean => {
  return isAdminRequest(req) || isQEOwner(req, entry) || isEntryOwner(req, entry) || isActionOwner(req, action);
};

export const canCloseAction = (req: Request, action: NCN_Action_Detail, entry: NCN_Entry): boolean => {
  return isAdminRequest(req) || isQEOwner(req, entry) || isActionOwner(req, action);
};

export const canDeleteAction = (req: Request, entry: NCN_Entry): boolean => {
  // Issue Log 删除: 只有 ME Engineer 或 Admin
  return isAdminRequest(req) || isMEEngineerOwner(req, entry);
};

// 只有 Quality Engineer 或 Admin 可以关闭 NCN Entry
export const canCloseNCNEntry = (req: Request, entry: NCN_Entry): boolean => {
  return isAdminRequest(req) || isQEOwner(req, entry);
};

export const canHandleIssueLog = (req: Request, entry: NCN_Entry): boolean => {
  return isAdminRequest(req) || isMEEngineerOwner(req, entry);
};

export const canQECloseNCN = (req: Request, entry: NCN_Entry): boolean => {
  return isAdminRequest(req) || isQEOwner(req, entry);
};

export const canManageAttachment = (req: Request, entry: NCN_Entry): boolean => {
  return isAdminRequest(req) || isQEOwner(req, entry) || isEntryOwner(req, entry);
};

// 只有 Admin 可以删除 NCN Entry 及其关联的 Action
export const canDeleteNCNEntry = (req: Request): boolean => {
  return isAdminRequest(req);
};

// 只有 Quality Engineer 或 Admin 可以恢复已关闭的 NCN Entry
export const canReopenNCNEntry = (req: Request, entry: NCN_Entry): boolean => {
  return isAdminRequest(req) || isQEOwner(req, entry);
};

export const resolveSafeDownloadPath = (baseUploadPath: string, requestedPath: string): string | null => {
  const uploadRoot = path.resolve(baseUploadPath);
  const requested = path.resolve(requestedPath);
  const normalizedUploadRoot = uploadRoot.endsWith(path.sep) ? uploadRoot : `${uploadRoot}${path.sep}`;

  if (!requested.startsWith(normalizedUploadRoot) && requested !== uploadRoot) {
    return null;
  }

  return requested;
};

export const extractSerialNoFromUploadFileName = (filePath: string): string | null => {
  const name = path.basename(filePath);
  const matched = /^NCN_(.+)\.[^.]+$/i.exec(name);
  if (!matched || !matched[1]) {
    return null;
  }
  return matched[1];
};
