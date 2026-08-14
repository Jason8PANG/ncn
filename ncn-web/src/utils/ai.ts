import { QueryTypes, Op } from 'sequelize';
import { sequelize, Code_Table, NAI_Staff_Info } from '../models';
import { config } from '../config';
import { logger } from '../utils/logger';

// 数据库预设选项（Code_Table / 员工库），LLM 必须从中选择
export interface IPresetOptions {
  qes: string[];
  meEngineers: string[];
  issueTypes: string[];
  deepAnalysis: string[];
  ownerDepts: string[];
  owners: string[];
}

/** 加载系统预设选项（供 LLM 强制选择） */
export const getPresetOptions = async (issueType?: string): Promise<IPresetOptions> => {
  const qes = (await Code_Table.findAll({
    where: { Code_Category: 'NCN_QE', Status: 'Active' },
    attributes: ['Code_Description']
  })).map((r: any) => String(r.Code_Description || '').trim()).filter(Boolean);

  const meEngineers = (await Code_Table.findAll({
    where: { Code_Category: 'NCN_ME', Status: 'Active' },
    attributes: ['Code_Description']
  })).map((r: any) => String(r.Code_Description || '').trim()).filter(Boolean);

  // Issue_Type 表单存 Code（如 '工艺问题'），Deep_Analysis 存其 Code_Description
  const issueTypes = Array.from(new Set(
    (await Code_Table.findAll({
      where: { Code_Category: 'NCN_Issue_Type', Status: 'Active' },
      attributes: ['Code']
    })).map((r: any) => String(r.Code || '').trim()).filter(Boolean)
  ));

  // Deep_Analysis 预设：NCN_Issue_Type 类别下按 Issue_Type(Code) 过滤
  let deepAnalysis: string[] = [];
  if (issueType) {
    deepAnalysis = (await Code_Table.findAll({
      where: { Code_Category: 'NCN_Issue_Type', Status: 'Active', Code: issueType },
      attributes: ['Code_Description']
    })).map((r: any) => String(r.Code_Description || '').trim()).filter(Boolean);
  }

  const ownerDepts = (await NAI_Staff_Info.findAll({
    where: { Email_Addr: { [Op.ne]: '' }, Leave_Date: null },
    attributes: ['Department'],
    group: ['Department']
  })).map((r: any) => String(r.Department || '').trim()).filter(Boolean);

  const owners = (await NAI_Staff_Info.findAll({
    where: { Email_Addr: { [Op.ne]: '' }, Leave_Date: null, Lan_ID: { [Op.ne]: '' } },
    attributes: ['Lan_ID', 'Staff_Name'],
    order: [['Lan_ID', 'ASC']]
  })).map((r: any) => `${String(r.Staff_Name || '').trim()} (${String(r.Lan_ID || '').trim()})`);

  return { qes, meEngineers, issueTypes, deepAnalysis, ownerDepts, owners };
};

/** 把预设拼成 LLM prompt 块（只列前若干条防止超长） */
const formatPresetBlock = (preset: IPresetOptions): string => {
  const trim = (arr: string[], max = 80) => {
    const list = arr.slice(0, max);
    return list.length > 0 ? list.join(', ') : '(空)';
  };
  return [
    '系统预设值（以下字段必须从对应预设中选，只能选列表里存在的值，无法确定就留空）：',
    `- QualityEngineer 可选值: ${trim(preset.qes)}`,
    `- ME_Engineer 可选值: ${trim(preset.meEngineers)}`,
    `- Issue_Type 可选值: ${trim(preset.issueTypes)}`,
    `- Deep_Annlysis 可选值: ${trim(preset.deepAnalysis)}`,
    `- OwnerDept 可选值: ${trim(preset.ownerDepts)}`,
    `- Owner 可选值（返回 Lan_ID，格式 name (lanId)）: ${trim(preset.owners)}`
  ].join('\n');
};

/** 校验 LLM 返回的枚举字段是否在预设内，不在则清空（让前端用统计建议兜底） */
const validatePresetFields = (result: Record<string, string>, preset: IPresetOptions): void => {
  const check = (field: string, allowed: string[]) => {
    const val = result[field];
    if (val && !allowed.includes(val)) {
      result[field] = '';
    }
  };
  check('QualityEngineer', preset.qes);
  check('ME_Engineer', preset.meEngineers);
  check('Issue_Type', preset.issueTypes);
  // Deep_Annlysis：预设可能为空（未选 Issue_Type），为空时不校验
  if (preset.deepAnalysis.length > 0) {
    check('Deep_Annlysis', preset.deepAnalysis);
  }
  if (preset.ownerDepts.length > 0) {
    check('OwnerDept', preset.ownerDepts);
  }
  // Owner 校验宽松：允许 lanId 匹配（LLM 返回的可能是 "name (lanId)" 或纯 lanId）
  const ownerVal = result.Owner || '';
  if (ownerVal) {
    const matched = preset.owners.some(o => o.toLowerCase() === ownerVal.toLowerCase() || o.toLowerCase().includes(ownerVal.toLowerCase()));
    if (!matched) result.Owner = '';
  }
};

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
    const meRows = await sequelize.query(
      `SELECT TOP 1 ME_Engineer, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE ME_Engineer IS NOT NULL AND LTRIM(RTRIM(ME_Engineer)) <> '' ${sbuWhere}
       GROUP BY ME_Engineer ORDER BY c DESC, MAX(ROWID) DESC`,
      { type: QueryTypes.SELECT }
    );
    const meRow = (meRows as any[])[0];

    // QE 分布
    const qeRows = await sequelize.query(
      `SELECT TOP 1 QualityEngineer, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE QualityEngineer IS NOT NULL AND LTRIM(RTRIM(QualityEngineer)) <> '' ${sbuWhere}
       GROUP BY QualityEngineer ORDER BY c DESC, MAX(ROWID) DESC`,
      { type: QueryTypes.SELECT }
    );
    const qeRow = (qeRows as any[])[0];

    // Issue Type 分布
    const issueRows = await sequelize.query(
      `SELECT TOP 1 Issue_Type, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE Issue_Type IS NOT NULL AND LTRIM(RTRIM(Issue_Type)) <> '' ${sbuWhere}
       GROUP BY Issue_Type ORDER BY c DESC, MAX(ROWID) DESC`,
      { type: QueryTypes.SELECT }
    );
    const issueRow = (issueRows as any[])[0];

    // Deep Analysis 分布（优先匹配 Issue_Type；否则按 SBU_Des）
    const deepWhere = issueType
      ? `AND [Issue_Type] = N'${String(issueType).replace(/'/g, "''")}'`
      : '';
    const deepRows = await sequelize.query(
      `SELECT TOP 1 Deep_Annlysis, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE Deep_Annlysis IS NOT NULL AND LTRIM(RTRIM(Deep_Annlysis)) <> ''
         AND Issue_Type IS NOT NULL AND LTRIM(RTRIM(Issue_Type)) <> ''
         ${sbuWhere} ${deepWhere}
       GROUP BY Deep_Annlysis ORDER BY c DESC, MAX(ROWID) DESC`,
      { type: QueryTypes.SELECT }
    );
    const deepRow = (deepRows as any[])[0];

    return {
      meEngineer: meRow?.ME_Engineer || '',
      qualityEngineer: qeRow?.QualityEngineer || '',
      issueType: issueRow?.Issue_Type || '',
      deepAnalysis: deepRow?.Deep_Annlysis || '',
      meCount: Number(meRow?.c || 0),
      qeCount: Number(qeRow?.c || 0),
      issueCount: Number(issueRow?.c || 0)
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
  sbuDes?: string,
  preset?: IPresetOptions
): Promise<Record<string, string> | null> => {
  if (!text.trim() || !hasLLM()) return null;

  const systemPrompt = [
    `你是 NCN（Non-Conformance Notice）质量管理系统助手。根据用户的自然语言描述，提取以下字段（全部可选，无法确定就留空字符串）：`,
    `- NCN_Type: 只能取 A / F / P / L / B 之一，不确定留空`,
    `- SBU: 事业部代码`,
    `- SBU_Des: 事业部描述`,
    `- Part_ID: 零件号`,
    `- WO: 工单号`,
    `- Customer: 客户`,
    `- Defect_Description: 整理后的缺陷描述（中文，简明）`,
    `- Defect_Qty: 不良数量（数字字符串）`,
    `- QualityEngineer: 从预设 QE 中选`,
    `- ME_Engineer: 从预设 ME 中选`,
    `- OwnerDept: 从预设部门中选`,
    `- Owner: 从预设 Owner 中选（返回 Lan_ID）`,
    `- Issue_Type: 从预设中选`,
    `- Deep_Annlysis: 从预设中选`,
    preset ? formatPresetBlock(preset) : '',
    '只输出 JSON 对象，不要其他文字。'
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `SBU_Des 上下文（供参考，可覆盖）: ${sbuDes || '未知'}`,
    `用户输入: ${text}`,
    '请输出 JSON: {"NCN_Type":"","SBU":"","SBU_Des":"","Part_ID":"","WO":"","Customer":"","Defect_Description":"","Defect_Qty":"","QualityEngineer":"","ME_Engineer":"","OwnerDept":"","Owner":"","Issue_Type":"","Deep_Annlysis":""}'
  ].join('\n');

  const content = await callLLM(systemPrompt, userPrompt);
  const parsed = parseLLMJson(content || '');
  if (!parsed) return null;

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    result[k] = String(v ?? '').trim();
  }
  if (preset) {
    validatePresetFields(result, preset);
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
  },
  preset?: IPresetOptions
): Promise<Record<string, string> | null> => {
  if (!hasLLM()) return null;

  const systemPrompt = [
    '你是 NCN 质量系统专家。基于历史 NCN 数据分布和当前 NCN 的缺陷描述，推荐最合适的 QualityEngineer、Issue_Type、Deep_Annlysis。',
    preset ? formatPresetBlock(preset) : '',
    '只输出 JSON 对象：{"QualityEngineer":"","Issue_Type":"","Deep_Annlysis":""}，不要其他文字。'
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `SBU_Des: ${context.sbuDes || '未知'}`,
    `Part_ID: ${context.partId || '未知'}`,
    `缺陷描述: ${context.defectDescription || '未知'}`,
    `历史 QE 分布: ${context.history.qes.join(', ') || '无'}`,
    `历史 Issue_Type 分布: ${context.history.issueTypes.join(', ') || '无'}`,
    `历史 Deep_Analysis 分布: ${context.history.deepAnalysis.join(', ') || '无'}`,
    '请结合描述语义与预设值、历史分布，输出最合理的推荐（必须从预设值中选择）。'
  ].join('\n');

  const content = await callLLM(systemPrompt, userPrompt);
  const parsed = parseLLMJson(content || '');
  if (!parsed) return null;

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    result[k] = String(v ?? '').trim();
  }
  if (preset) {
    validatePresetFields(result, preset);
  }
  return result;
};
