import api from '../utils/request';

export interface IAttachment {
  ROWID: number;
  NCN_ID: number;
  FileName: string;
  FileType: string;
  FileSize: number;
  UploadBy: string;
  UploadDate: string;
}

export interface IAttachmentResponse {
  success: boolean;
  data?: IAttachment | IAttachment[];
  error?: string;
}

// 获取某 NCN 的附件列表（元数据）
export const getAttachments = async (ncnId: number): Promise<IAttachmentResponse> => {
  const response = await api.get(`/attachment/ncn/${ncnId}`);
  return response.data;
};

// 上传附件（二进制由后端直接写入数据库）
export const uploadAttachment = async (file: File, ncnId: number): Promise<IAttachmentResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ncnId', String(ncnId));

  const response = await api.post('/attachment', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

// 下载附件（从数据库读取）
export const downloadAttachment = async (rowid: number): Promise<Blob> => {
  const response = await api.get(`/attachment/${rowid}/download`, { responseType: 'blob' });
  return response.data;
};

// 删除附件
export const deleteAttachment = async (rowid: number): Promise<IAttachmentResponse> => {
  const response = await api.delete(`/attachment/${rowid}`);
  return response.data;
};
