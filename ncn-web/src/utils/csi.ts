import fs from 'fs';
import https from 'https';
import path from 'path';
import { config } from '../config';
import { logger } from './logger';

/**
 * Infor CSI IDO Request Service 客户端（OAuth2 password grant）
 *
 * 用途：New NCN Entry 输入工单号后，调用 SLJobs IDO 自动带出 Item / ue_GDL_Customer。
 * 站点（X-Infor-MongooseConfig）由 SBU 决定：
 *   P2-Industrial     → NAIGROUP_PRD_330
 *   Penang-Industrial → NAIGROUP_PRD_410
 *   其他              → NAIGROUP_PRD_310
 *
 * Token 内存缓存，提前 60s 刷新；401 时强制刷新重试一次。
 */

const agent = new https.Agent({ rejectUnauthorized: false }); // 与 csi_datawarehouse Python 客户端 verify=False 一致

/**
 * dotenv 会把「未加引号的值」中 '#' 之后的内容当成行内注释丢掉。
 * CSI_USERNAME 形如 `NAIGROUP_PRD#xxxx...`，本地开发时会被截断成 `NAIGROUP_PRD`，
 * 导致 Infor 返回 400 invalid_grant / Service Account not authorized。
 * （docker compose 不做这种截断，所以容器内不受影响。）
 * 这里回读 .env 原文兜底：仅当解析值确实是原文的前缀且原文含 '#' 时才用原文。
 */
const resolveEnvValue = (key: string, parsed?: string): string => {
  const value = parsed || '';
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return value;
    const raw = fs.readFileSync(envPath, 'utf8');
    const matched = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm').exec(raw);
    if (!matched) return value;
    let rawVal = matched[1].trim();
    if (
      (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'"))
    ) {
      rawVal = rawVal.slice(1, -1);
    }
    if (rawVal.includes('#') && rawVal.startsWith(value) && rawVal.length > value.length) {
      logger.warn(`[CSI] .env 中的 ${key} 未加引号，'#' 之后被 dotenv 截断，已按原文取值（建议改成 ${key}="..."）`);
      return rawVal;
    }
    return value;
  } catch {
    return value;
  }
};

const credentials = () => ({
  authBasic: resolveEnvValue('CSI_AUTH_BASIC', config.csi.authBasic),
  username: resolveEnvValue('CSI_USERNAME', config.csi.username),
  password: resolveEnvValue('CSI_PASSWORD', config.csi.password)
});

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let tokenPromise: Promise<string> | null = null;

const isCsiConfigured = (): boolean => {
  const { authBasic, username, password } = credentials();
  return Boolean(authBasic && username && password);
};

const fetchToken = (): Promise<string> => {
  const { authBasic, username, password } = credentials();
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'password',
      username,
      password
    }).toString();

    const req = https.request(
      config.csi.tokenUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authBasic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        },
        agent,
        timeout: config.csi.timeoutMs
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`CSI token request failed: HTTP ${res.statusCode} ${body.slice(0, 200)}`));
          }
          try {
            const json = JSON.parse(body);
            resolve({ token: json.access_token, expiresIn: json.expires_in || 3600 } as any);
          } catch (e) {
            reject(new Error(`CSI token response parse error: ${(e as Error).message}`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('CSI token request timeout')));
    req.on('error', reject);
    req.write(postData);
    req.end();
  }).then((v: any) => {
    cachedToken = v.token;
    tokenExpiresAt = Date.now() + v.expiresIn * 1000;
    return v.token;
  });
};

const getToken = async (forceRefresh = false): Promise<string> => {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }
  // 并发请求共享同一次 token 获取
  if (!tokenPromise || forceRefresh) {
    tokenPromise = fetchToken().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
};

// SBU → X-Infor-MongooseConfig 站点映射
export const getSbuMongooseConfig = (sbu?: string | null): string => {
  const value = String(sbu || '').trim();
  if (value === 'P2-Industrial') return 'NAIGROUP_PRD_330';
  if (value === 'Penang-Industrial') return 'NAIGROUP_PRD_410';
  return 'NAIGROUP_PRD_310';
};

export interface IJobInfo {
  job: string;
  suffix: number;
  item: string;
  customer: string;
}

const httpsRequestJson = (url: string, options: https.RequestOptions): Promise<{ status: number; body: any }> => {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, agent }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let parsed: any = null;
        try {
          parsed = body ? JSON.parse(body) : null;
        } catch {
          parsed = body;
        }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error('CSI request timeout')));
    req.on('error', reject);
    req.end();
  });
};

/**
 * 按工单号查询 SLJobs，返回 Item 和 Customer（ue_GDL_Customer）。
 * @param job 工单号，如 J000035479
 * @param sbu 当前选中的 SBU（决定站点）
 */
export const fetchJobInfo = async (job: string, sbu?: string | null): Promise<IJobInfo | null> => {
  if (!isCsiConfigured()) {
    throw new Error('CSI credentials not configured (CSI_AUTH_BASIC / CSI_USERNAME / CSI_PASSWORD)');
  }

  const safeJob = String(job).trim().replace(/'/g, "''");
  if (!safeJob) return null;

  const site = getSbuMongooseConfig(sbu);
  const properties = 'Job,Suffix,Item,ue_GDL_Customer';
  const filter = `Job = '${safeJob}' And Suffix = 0`;
  const url =
    `${config.csi.idoBase}/ido/load/SLJobs` +
    `?properties=${encodeURIComponent(properties)}` +
    `&filter=${encodeURIComponent(filter)}`;

  const doGet = (token: string) =>
    httpsRequestJson(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Infor-MongooseConfig': site,
        Accept: 'application/json'
      },
      timeout: config.csi.timeoutMs
    });

  logger.info(`[CSI] Fetching SLJobs: Job=${safeJob}, site=${site}`);

  let resp = await doGet(await getToken());
  if (resp.status === 401) {
    logger.warn('[CSI] Token expired, force refresh and retry');
    resp = await doGet(await getToken(true));
  }

  if (resp.status !== 200) {
    throw new Error(`SLJobs request failed: HTTP ${resp.status} ${JSON.stringify(resp.body).slice(0, 200)}`);
  }

  // 响应兼容 Items / value / records 三种格式
  const payload = resp.body || {};
  const rows: any[] = payload.Items || payload.value || payload.records || [];
  if (!rows.length) {
    return null;
  }
  const row = rows[0];
  return {
    job: String(row.Job ?? safeJob),
    suffix: Number(row.Suffix ?? 0),
    item: String(row.Item ?? '').trim(),
    customer: String(row.ue_GDL_Customer ?? '').trim()
  };
};
