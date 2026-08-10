import { QueryTypes } from 'sequelize';
import { sequelize } from '../models';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── 历史统计（不依赖 LLM，SQL 直接算）─────────────────────────────────────────

export interface IHistSuggestion {
  meEngineer: string;
  qualityEngineer: string;
  issueType: string;
  deepAnalysis: string;
  meCount: number;
  qeCount: number;
  issueCount: number;
}

/** 按 SBU_Des 统计最常用的 ME Engineer / QE / Issue_Type / Deep_Analysis */
export const getHistoricalSuggestions = async (
  sbuDes?: string,
  issueType?: string
): Promise<IHistSuggestion> => {
  const empty: IHistSuggestion = {
    meEngineer: '', qualityEngineer: '', issueType: '', deepAnalysis: '',
    meCount: 0, qeCount: 0, issueCount: 0
  };

  const sbuWhere = sbuDes
    ? `AND [SBU_Des] = N'${String(sbuDes).replace(/'/g, "''")}'`
    : '';

  try {
    // ME Engineer 分布
    const [meRows] = await sequelize.query(
      `SELECT TOP 1 ME_Engineer, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE ME_Engineer IS NOT NULL AND LTRIM(RTRIM(ME_Engineer)) <> '' ${sbuWhere}
       GROUP BY ME_Engineer ORDER BY c DESC, MAX(ROWID) DESC`,
      { type: QueryTypes.SELECT }
    );

    // QE 分布
    const [qeRows] = await sequelize.query(
      `SELECT TOP 1 QualityEngineer, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE QualityEngineer IS NOT NULL AND LTRIM(RTRIM(QualityEngineer)) <> '' ${sbuWhere}
       GROUP BY QualityEngineer ORDER BY c DESC, MAX(ROWID) DESC`,
      { type: QueryTypes.SELECT }
    );

    // Issue Type 分布
    const [issueRows] = await sequelize.query(
      `SELECT TOP 1 Issue_Type, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE Issue_Type IS NOT NULL AND LTRIM(RTRIM(Issue_Type)) <> '' ${sbuWhere}
       GROUP BY Issue_Type ORDER BY c DESC, MAX(ROWID) DESC`,
      { type: QueryTypes.SELECT }
    );

    // Deep Analysis 分布（优先匹配 Issue_Type；否则按 SBU_Des）
    const deepWhere = issueType
      ? `AND [Issue_Type] = N'${String(issueType).replace(/'/g, "''")}'`
      : '';
    const [deepRows] = await sequelize.query(
      `SELECT TOP 1 Deep_Annlysis, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE Deep_Annlysis IS NOT NULL AND LTRIM(RTRIM(Deep_Annlysis)) <> ''
         AND Issue_Type IS NOT NULL AND LTRIM(RTRIM(Issue_Type)) <> ''
         ${sbuWhere} ${deepWhere}
       GROUP BY Deep_Annlysis ORDER BY c DESC, MAX(ROWID) DESC`,
      { type: QueryTypes.SELECT }
    );

    return {
      meEngineer: (meRows as any)?.ME_Engineer || '',
      qualityEngineer: (qeRows as any)?.QualityEngineer || '',
      issueType: (issueRows as any)?.Issue_Type || '',
      deepAnalysis: (deepRows as any)?.Deep_Annlysis || '',
      meCount: Number((meRows as any)?.c || 0),
      qeCount: Number((qeRows as any)?.c || 0),
      issueCount: Number((issueRows as any)?.c || 0)
    };
  } catch (err) {
    logger.error('[AI] historical stats error:', err);
    return empty;
  }
};

// ─── LLM（可选）：OpenAI 兼容接口，无 Key 时返回 null ─────────────────────────

export const hasLLM = (): boolean => Boolean(config.llm.apiKey);

interface ILLMMessage {
  role: 'system' | 'user';
  content: string;
}

/** 调用大模型，返回 JSON 字符串（OpenAI 兼容格式） */
export const callLLM = async (
  systemPrompt: string,
  userPrompt: string,
  timeoutMs?: number
): Promise<string | null> => {
  if (!hasLLM()) {
    return null;
  }

  const messages: ILLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || config.llm.timeoutMs);

    const resp = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      logger.error(`[AI] LLM HTTP ${resp.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content: string = data?.choices?.[0]?.message?.content || '';
    return content || null;
  } catch (err: any) {
    logger.error('[AI] LLM call error:', err?.message || err);
    return null;
  }
};

/** 从 LLM 返回的 JSON 文本中安全解析对象 */
export const parseLLMJson = (content: string): Record<string, unknown> | null => {
  if (!content) return null;
  try {
    // 兼容代码块包裹
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

/** 用 LLM 解析用户输入文字 → 提取 NCN 字段（无 Key 返回 null） */
export const parseNewNCNText = async (
  text: string,
  sbuDes?: string
): Promise<Record<string, string> | null> => {
  if (!text.trim() || !hasLLM()) return null;

  const systemPrompt = `你是 NCN（Non-Conformance Notice）质量管理系统助手。根据用户的自然语言描述，提取以下字段（全部可选，无法确定就留空字符串）：
- NCN_Type: 只能取 A / F / P / L / B 之一，不确定留空
- SBU: 事业部代码
- SBU_Des: 事业部描述
- Part_ID: 零件号
- WO: 工单号
- Customer: 客户
- Defect_Description: 整理后的缺陷描述（中文，简明）
- Defect_Qty: 不良数量（数字字符串）
- Issue_Type: 问题类别
- Deep_Annlysis: 深度分析/根本原因
只输出 JSON 对象，不要其他文字。`;

  const userPrompt = [
    `SBU_Des 上下文（供参考，可覆盖）: ${sbuDes || '未知'}`,
    `用户输入: ${text}`,
    '请输出 JSON: {"NCN_Type":"","SBU":"","SBU_Des":"","Part_ID":"","WO":"","Customer":"","Defect_Description":"","Defect_Qty":"","Issue_Type":"","Deep_Annlysis":""}'
  ].join('\n');

  const content = await callLLM(systemPrompt, userPrompt);
  const parsed = parseLLMJson(content || '');
  if (!parsed) return null;

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    result[k] = String(v ?? '').trim();
  }
  return result;
};

/** 用 LLM 基于历史分布 + 当前数据推断编辑建议（QE/Issue_Type/Deep_Analysis） */
export const suggestEditWithLLM = async (
  context: {
    sbuDes?: string;
    partId?: string;
    defectDescription?: string;
    history: { issueTypes: string[]; deepAnalysis: string[]; qes: string[] };
  }
): Promise<Record<string, string> | null> => {
  if (!hasLLM()) return null;

  const systemPrompt = `你是 NCN 质量系统专家。基于历史 NCN 数据分布和当前 NCN 的缺陷描述，推荐最合适的 QualityEngineer、Issue_Type、Deep_Annlysis。
只输出 JSON 对象：{"QualityEngineer":"","Issue_Type":"","Deep_Annlysis":""}，不要其他文字。`;

  const userPrompt = [
    `SBU_Des: ${context.sbuDes || '未知'}`,
    `Part_ID: ${context.partId || '未知'}`,
    `缺陷描述: ${context.defectDescription || '未知'}`,
    `历史 QE 分布: ${context.history.qes.join(', ') || '无'}`,
    `历史 Issue_Type 分布: ${context.history.issueTypes.join(', ') || '无'}`,
    `历史 Deep_Analysis 分布: ${context.history.deepAnalysis.join(', ') || '无'}`,
    '请结合描述语义与历史分布，输出最合理的推荐。'
  ].join('\n');

  const content = await callLLM(systemPrompt, userPrompt);
  const parsed = parseLLMJson(content || '');
  if (!parsed) return null;

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    result[k] = String(v ?? '').trim();
  }
  return result;
};
