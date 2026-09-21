/**
 * 验证 ME/QE/Issue/Deep 历史推荐是否都在「启用中」的预设名单内
 * 用法：npx ts-node scripts/check-ai-suggest.ts [SBU_Des]
 */
import dotenv from 'dotenv';

dotenv.config();

import { getHistoricalSuggestions, getPresetOptions } from '../src/utils/ai';

(async () => {
  const sbuDes = process.argv[2] || 'Penang Plant';
  const preset = await getPresetOptions();
  const sugg = await getHistoricalSuggestions(sbuDes);

  const inList = (v: string, list: string[]) => (v ? list.map((x) => x.trim().toLowerCase()).includes(v.trim().toLowerCase()) : '（未推荐）');

  console.log(`SBU_Des = ${sbuDes}`);
  console.log(`  启用中 ME 数量 = ${preset.meEngineers.length}`);
  console.log(`  启用中 QE 数量 = ${preset.qes.length}`);
  console.log(`  推荐 ME        = ${sugg.meEngineer || '(空)'} | 是否在启用名单: ${inList(sugg.meEngineer, preset.meEngineers)}`);
  console.log(`  推荐 QE        = ${sugg.qualityEngineer || '(空)'} | 是否在启用名单: ${inList(sugg.qualityEngineer, preset.qes)}`);
  console.log(`  推荐 Issue     = ${sugg.issueType || '(空)'} | 是否在启用名单: ${inList(sugg.issueType, preset.issueTypes)}`);
  console.log(`  推荐 Deep      = ${sugg.deepAnalysis || '(空)'}`);
  console.log(`  历史计数 me=${sugg.meCount} qe=${sugg.qeCount} issue=${sugg.issueCount}`);
})();
