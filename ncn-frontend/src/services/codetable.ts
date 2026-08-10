import api from '../utils/request';

export interface ICodeTableRecord {
  ID: number;
  Code_Category: string;
  Code: string;
  Code_Description: string;
  Status: string;
  Note: string;
  remark: string;
}

export interface ICodeTableResponse {
  success: boolean;
  data?: ICodeTableRecord[] | ICodeTableRecord | string[];
  error?: string;
}

// ncn 相关类别列表
export const getCodeTableCategories = async (): Promise<ICodeTableResponse> => {
  const response = await api.get('/codetable/categories');
  return response.data;
};

// 列表（category 可选；keyword 搜索描述/代码）
export const queryCodeTable = async (params: {
  category?: string;
  keyword?: string;
  status?: string;
}): Promise<ICodeTableResponse> => {
  const response = await api.get('/codetable', { params });
  return response.data;
};

// 新增
export const createCodeTableRecord = async (data: Partial<ICodeTableRecord>): Promise<ICodeTableResponse> => {
  const response = await api.post('/codetable', data);
  return response.data;
};

// 更新
export const updateCodeTableRecord = async (id: number, data: Partial<ICodeTableRecord>): Promise<ICodeTableResponse> => {
  const response = await api.put(`/codetable/${id}`, data);
  return response.data;
};

// 删除
export const deleteCodeTableRecord = async (id: number): Promise<ICodeTableResponse> => {
  const response = await api.delete(`/codetable/${id}`);
  return response.data;
};
