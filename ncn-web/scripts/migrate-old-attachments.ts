import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { sequelize } from '../src/models';

/**
 * 迁移旧附件到数据库：NCN_Entry.FilePath(UNC路径) → NCN_Attachment(二进制)
 *
 * 用法:
 *   npx ts-node scripts/migrate-old-attachments.ts            # dry-run，只统计
 *   npx ts-node scripts/migrate-old-attachments.ts --commit   # 真正写入数据库
 *
 * 注意:
 *   - 需要能访问旧共享目录（如 \\suzvfile02\TaskManager）
 *   - 数据库需要写权限账号（rptuser 可能只读，可用 sa 或 DBA 提供账号，
 *     通过环境变量覆盖: DB_USER=sa DB_PASSWORD=xxx npx ts-node ...）
 *   - 幂等: 已存在附件的 NCN_ID 自动跳过，可重复执行
 */
const COMMIT = process.argv.includes('--commit');

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

async function main() {
  console.log(`>>> 迁移模式: ${COMMIT ? 'COMMIT（写入数据库）' : 'DRY-RUN（仅统计）'}`);

  // 1. 取所有有 FilePath 的记录
  const [rows] = await sequelize.query(
    `SELECT ROWID, SerialNo, FilePath FROM dbo.NCN_Entry
     WHERE FilePath IS NOT NULL AND LTRIM(RTRIM(FilePath)) <> ''
     ORDER BY ROWID ASC`
  );
  const entries = rows as any[];
  console.log(`>>> 待处理记录: ${entries.length}`);

  // 2. 查已存在的附件（幂等）
  const [existRows] = await sequelize.query(
    `SELECT DISTINCT NCN_ID FROM dbo.NCN_Attachment`
  );
  const existingNcnIds = new Set((existRows as any[]).map((r: any) => Number(r.NCN_ID)));

  // 3. 逐个处理
  let migrated = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;
  const missingList: string[] = [];
  const failedList: string[] = [];

  for (const entry of entries) {
    const ncnId = Number(entry.ROWID);
    const filePath = String(entry.FilePath || '').replace(/\\/g, '/');

    if (existingNcnIds.has(ncnId)) {
      skipped += 1;
      continue;
    }

    if (!fs.existsSync(filePath)) {
      missing += 1;
      missingList.push(`ROWID=${ncnId} SerialNo=${entry.SerialNo} (${filePath})`);
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const fileType = MIME_MAP[ext] || 'application/octet-stream';

    if (!COMMIT) {
      migrated += 1;
      continue;
    }

    try {
      const fileData = fs.readFileSync(filePath);
      await sequelize.query(
        `INSERT INTO dbo.NCN_Attachment (NCN_ID, FileName, FileType, FileSize, FileData, UploadBy, UploadDate)
         VALUES (:ncnId, :fileName, :fileType, :fileSize, :fileData, 'migration', GETDATE())`,
        {
          replacements: {
            ncnId,
            fileName,
            fileType,
            fileSize: fileData.length,
            fileData
          }
        }
      );
      migrated += 1;
      if (migrated % 200 === 0) {
        console.log(`  ... 已迁移 ${migrated}/${entries.length}`);
      }
    } catch (err: any) {
      failed += 1;
      failedList.push(`ROWID=${ncnId} SerialNo=${entry.SerialNo} (${fileName}): ${err?.message || err}`);
    }
  }

  // 4. 报告
  console.log('\n========== 迁移报告 ==========');
  console.log(`待处理总数: ${entries.length}`);
  console.log(`成功迁移: ${migrated}`);
  console.log(`跳过(已有附件): ${skipped}`);
  console.log(`文件缺失: ${missing}`);
  console.log(`失败: ${failed}`);

  if (missingList.length > 0) {
    console.log(`\n--- 文件缺失清单 (前 20) ---`);
    missingList.slice(0, 20).forEach((m) => console.log(`  ${m}`));
  }
  if (failedList.length > 0) {
    console.log(`\n--- 失败清单 (前 20) ---`);
    failedList.slice(0, 20).forEach((m) => console.log(`  ${m}`));
  }

  if (!COMMIT) {
    console.log('\n>>> 这是 DRY-RUN，未写入任何数据。确认无误后加 --commit 执行。');
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await sequelize.close();
  });
