import api from '../utils/request';

export interface IUploadResponse {
  success: boolean;
  data?: {
    filePath: string;
    fileName: string;
    originalName: string;
    size: number;
    mimeType: string;
  };
  error?: string;
}

export const uploadFile = async (file: File, serialNo: string): Promise<IUploadResponse> => {
  const formData = new FormData();
  // 注意：serialNo 必须放在 file 之前！multer 的 filename 回调在解析到 file 时执行，
  // 此时只有已解析的字段可见。serialNo 在后会导致文件名变成 NCN_undefined.{ext}
  formData.append('serialNo', serialNo);
  formData.append('file', file);

  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const downloadFile = async (filePath: string): Promise<Blob> => {
  const response = await api.get('/upload/download', {
    params: { filePath },
    responseType: 'blob'
  });
  return response.data;
};

// 删除附件：删除共享目录文件并清空 NCN_Entry.FilePath
export const deleteAttachmentFile = async (serialNo: string): Promise<IUploadResponse> => {
  const response = await api.delete(`/upload/${serialNo}`);
  return response.data;
};
