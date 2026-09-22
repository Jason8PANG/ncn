import { message } from 'antd';
import { downloadFile } from '../services/upload';

/**
 * 从共享路径中提取文件名
 * 例：\\suzvfile02\TaskManager\NCN_NCN2608011.jpg → NCN_NCN2608011.jpg
 * 兼容 UNC（反斜杠）与 POSIX（正斜杠）两种形式
 */
export const extractFileNameFromPath = (filePath: string): string => {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
};

/**
 * 下载 NCN 附件（统一入口，NCNList 与 NCNEntry 共用）
 *
 * 后端接口：GET /api/upload/download?filePath=...
 * - filePath 传 NCN_Entry.FilePath 原值即可，后端只取 basename 拼 UPLOAD_PATH 读取
 * - 返回值是 blob，用 objectURL + 临时 <a download> 触发浏览器保存
 *
 * @returns 成功 true / 失败 false
 */
export const downloadAttachment = async (filePath: string): Promise<boolean> => {
  if (!filePath) {
    message.warning('No attachment for this NCN');
    return false;
  }

  try {
    const blob = await downloadFile(filePath);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = extractFileNameFromPath(filePath);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return true;
  } catch (error: any) {
    // 后端失败时 responseType=blob，错误体也是 blob，需读出来才能看到真实原因
    let detail = '';
    const data = error?.response?.data;
    if (data instanceof Blob) {
      try {
        detail = JSON.parse(await data.text())?.error || '';
      } catch {
        detail = '';
      }
    } else if (data?.error) {
      detail = data.error;
    }
    message.error(detail || 'Failed to download attachment');
    return false;
  }
};
