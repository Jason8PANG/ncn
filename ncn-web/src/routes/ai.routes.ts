import { Router, Request, Response } from 'express';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../models';
import { isAuthenticated } from '../middleware/auth';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  getHistoricalSuggestions,
  parseNewNCNText,
  suggestEditWithLLM,
  hasLLM,
  getPresetOptions
} from '../utils/ai';

const router = Router();

/** 返回 LLM 是否可用（前端可据此提示能力） */
router.get('/status', isAuthenticated, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      llmEnabled: hasLLM(),
      model: config.llm.model
    }
  });
});

/** 新建 NCN 的 AI 助手：历史统计推荐 + 可选 LLM 解析文字 */
router.post('/fill-new', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { text, sbuDes } = req.body || {};

    // 1) 历史统计推荐（主力）
    const hist = await getHistoricalSuggestions(String(sbuDes || ''));

    // 2) 历史分布明细（供 LLM/前端参考）
    const distWhere = sbuDes
      ? `AND [SBU_Des] = N'${String(sbuDes).replace(/'/g, "''")}'`
      : '';
    const issueDist = await sequelize.query(
      `SELECT TOP 10 Issue_Type, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE Issue_Type IS NOT NULL AND LTRIM(RTRIM(Issue_Type)) <> '' ${distWhere}
       GROUP BY Issue_Type ORDER BY c DESC`,
      { type: QueryTypes.SELECT }
    );
    const deepDist = await sequelize.query(
      `SELECT TOP 10 Deep_Annlysis, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE Deep_Annlysis IS NOT NULL AND LTRIM(RTRIM(Deep_Annlysis)) <> '' ${distWhere}
         AND Issue_Type IS NOT NULL AND LTRIM(RTRIM(Issue_Type)) <> ''
       GROUP BY Deep_Annlysis ORDER BY c DESC`,
      { type: QueryTypes.SELECT }
    );
    const qeDist = await sequelize.query(
      `SELECT TOP 10 QualityEngineer, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE QualityEngineer IS NOT NULL AND LTRIM(RTRIM(QualityEngineer)) <> '' ${distWhere}
       GROUP BY QualityEngineer ORDER BY c DESC`,
      { type: QueryTypes.SELECT }
    );

    // 3) LLM 解析用户输入（可选）——基于数据库预设值选择
    let parsedFields: Record<string, string> | null = null;
    if (text && String(text).trim() && hasLLM()) {
      const preset = await getPresetOptions();
      parsedFields = await parseNewNCNText(String(text).trim(), String(sbuDes || ''), preset);
    }

    res.json({
      success: true,
      data: {
        suggestions: {
          meEngineer: hist.meEngineer,
          qualityEngineer: hist.qualityEngineer,
          issueType: hist.issueType,
          deepAnalysis: hist.deepAnalysis,
          counts: { me: hist.meCount, qe: hist.qeCount, issue: hist.issueCount }
        },
        distributions: {
          issueTypes: (issueDist as any[]).map((r: any) => `${r.Issue_Type} (${r.c})`),
          deepAnalysis: (deepDist as any[]).map((r: any) => `${r.Deep_Annlysis} (${r.c})`),
          qes: (qeDist as any[]).map((r: any) => `${r.QualityEngineer} (${r.c})`)
        },
        parsedFields,
        llmEnabled: hasLLM()
      }
    });
  } catch (error) {
    logger.error('[AI] fill-new error:', error);
    res.status(500).json({ error: 'AI assistant failed' });
  }
});

/** 编辑 NCN 的一键填写：基于历史分析推荐 QE / Issue_Type / Deep_Analysis */
router.post('/suggest-edit', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { sbuDes, partId, defectDescription, issueType } = req.body || {};

    const hist = await getHistoricalSuggestions(String(sbuDes || ''), String(issueType || ''));

    const distWhere = sbuDes
      ? `AND [SBU_Des] = N'${String(sbuDes).replace(/'/g, "''")}'`
      : '';
    const issueDist = await sequelize.query(
      `SELECT TOP 8 Issue_Type, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE Issue_Type IS NOT NULL AND LTRIM(RTRIM(Issue_Type)) <> '' ${distWhere}
       GROUP BY Issue_Type ORDER BY c DESC`,
      { type: QueryTypes.SELECT }
    );
    const deepDist = await sequelize.query(
      `SELECT TOP 8 Deep_Annlysis, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE Deep_Annlysis IS NOT NULL AND LTRIM(RTRIM(Deep_Annlysis)) <> '' ${distWhere}
       GROUP BY Deep_Annlysis ORDER BY c DESC`,
      { type: QueryTypes.SELECT }
    );
    const qeDist = await sequelize.query(
      `SELECT TOP 8 QualityEngineer, COUNT(*) AS c FROM dbo.NCN_Entry
       WHERE QualityEngineer IS NOT NULL AND LTRIM(RTRIM(QualityEngineer)) <> '' ${distWhere}
       GROUP BY QualityEngineer ORDER BY c DESC`,
      { type: QueryTypes.SELECT }
    );

    // LLM 结合语义、预设值、历史分布做最终推荐（可选）
    let llmSuggestion: Record<string, string> | null = null;
    if (hasLLM()) {
      // Deep_Analysis 预设依赖 Issue_Type
      const preset = await getPresetOptions(String(issueType || ''));
      llmSuggestion = await suggestEditWithLLM({
        sbuDes: String(sbuDes || ''),
        partId: String(partId || ''),
        defectDescription: String(defectDescription || ''),
        history: {
          issueTypes: (issueDist as any[]).map((r: any) => String(r.Issue_Type)),
          deepAnalysis: (deepDist as any[]).map((r: any) => String(r.Deep_Annlysis)),
          qes: (qeDist as any[]).map((r: any) => String(r.QualityEngineer))
        }
      }, preset);
    }

    res.json({
      success: true,
      data: {
        // 统计推荐（主力）
        stats: {
          qualityEngineer: hist.qualityEngineer,
          issueType: hist.issueType,
          deepAnalysis: hist.deepAnalysis
        },
        // LLM 推荐（可选，优先级最高）
        llm: llmSuggestion,
        llmEnabled: hasLLM(),
        distributions: {
          issueTypes: (issueDist as any[]).map((r: any) => `${r.Issue_Type} (${r.c})`),
          deepAnalysis: (deepDist as any[]).map((r: any) => `${r.Deep_Annlysis} (${r.c})`),
          qes: (qeDist as any[]).map((r: any) => `${r.QualityEngineer} (${r.c})`)
        }
      }
    });
  } catch (error) {
    logger.error('[AI] suggest-edit error:', error);
    res.status(500).json({ error: 'AI assistant failed' });
  }
});

export default router;
