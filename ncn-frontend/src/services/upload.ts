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
  formData.append('file', file);
  formData.append('serialNo', serialNo);

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
