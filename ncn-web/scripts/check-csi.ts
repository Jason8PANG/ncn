/**
 * CSI / Infor IDO 连通性诊断
 *
 * 用法（在 ncn-web 目录下执行）：
 *   npx ts-node scripts/check-csi.ts [工单号]
 *
 * 会依次用 3 个 SBU 对应的站点查询 SLJobs，输出 Item / Customer。
 * 说明：SBU → 站点映射 P2-Industrial=330 / Penang-Industrial=410 / 其他=310
 */
import dotenv from 'dotenv';

dotenv.config();

import { fetchJobInfo, getSbuMongooseConfig, parseJobInput } from '../src/utils/csi';

const jobArg = process.argv[2] || 'J000035479';
const JOBS_BY_SBU: { sbu: string; job: string }[] = [
  { sbu: 'P2-Industrial', job: jobArg },
  { sbu: 'Penang-Industrial', job: jobArg },
  { sbu: '(其他)', job: jobArg }
];

(async () => {
  const parsed = parseJobInput(jobArg);
  console.log(`== CSI 诊断开始：输入 ${jobArg} → Job=${parsed.job}, Suffix=${parsed.suffix} ==`);
  for (const { sbu, job } of JOBS_BY_SBU) {
    const site = getSbuMongooseConfig(sbu);
    try {
      const info = await fetchJobInfo(job, sbu);
      if (info) {
        console.log(`[${sbu}] site=${site} → 命中 Job=${info.job} Suffix=${info.suffix} Item=${info.item} Customer=${info.customer}`);
      } else {
        console.log(`[${sbu}] site=${site} → 未找到记录`);
      }
    } catch (error: any) {
      console.log(`[${sbu}] site=${site} → ERROR: ${error?.message}`);
    }
  }
  console.log('== 诊断结束 ==');
})();
