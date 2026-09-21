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

import { fetchJobInfo, getSbuMongooseConfig } from '../src/utils/csi';

const JOBS_BY_SBU: { sbu: string; job: string }[] = (() => {
  const job = process.argv[2] || 'J000035479';
  return [
    { sbu: 'P2-Industrial', job },
    { sbu: 'Penang-Industrial', job },
    { sbu: '(其他)', job }
  ];
})();

(async () => {
  console.log('== CSI 诊断开始 ==');
  for (const { sbu, job } of JOBS_BY_SBU) {
    const site = getSbuMongooseConfig(sbu);
    try {
      const info = await fetchJobInfo(job, sbu);
      console.log(`[${sbu}] site=${site} job=${job} -> ${info ? JSON.stringify(info) : '未找到记录'}`);
    } catch (error: any) {
      console.log(`[${sbu}] site=${site} job=${job} -> ERROR: ${error?.message}`);
    }
  }
  console.log('== 诊断结束 ==');
})();
