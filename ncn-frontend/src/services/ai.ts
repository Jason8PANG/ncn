import api from '../utils/request';

export interface IAiFillNewResponse {
  success: boolean;
  data?: {
    suggestions: {
      meEngineer: string;
      qualityEngineer: string;
      issueType: string;
      deepAnalysis: string;
      counts: { me: number; qe: number; issue: number };
    };
    distributions: {
      issueTypes: string[];
      deepAnalysis: string[];
      qes: string[];
    };
    parsedFields?: Record<string, string>;
    llmEnabled: boolean;
  };
  error?: string;
}

export interface IAiSuggestEditResponse {
  success: boolean;
  data?: {
    stats: { qualityEngineer: string; issueType: string; deepAnalysis: string };
    llm: Record<string, string> | null;
    llmEnabled: boolean;
    distributions: {
      issueTypes: string[];
      deepAnalysis: string[];
      qes: string[];
    };
  };
  error?: string;
}

// 新建 NCN：历史统计推荐 + 可选 LLM 解析文字
export const aiFillNew = async (params: {
  text?: string;
  sbuDes?: string;
}): Promise<IAiFillNewResponse> => {
  const response = await api.post('/ai/fill-new', params);
  return response.data;
};

// 编辑 NCN：一键填写推荐（QE / Issue_Type / Deep_Analysis）
export const aiSuggestEdit = async (params: {
  sbuDes?: string;
  partId?: string;
  defectDescription?: string;
  issueType?: string;
}): Promise<IAiSuggestEditResponse> => {
  const response = await api.post('/ai/suggest-edit', params);
  return response.data;
};

// AI 能力状态（LLM 是否启用）
export const getAiStatus = async (): Promise<{ success: boolean; data?: { llmEnabled: boolean; model: string } }> => {
  const response = await api.get('/ai/status');
  return response.data;
};
