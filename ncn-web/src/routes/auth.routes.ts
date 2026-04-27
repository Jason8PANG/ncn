import { Router, Request, Response } from 'express';
import passport from 'passport';
import ldap from 'ldapjs';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isAdminRequest } from '../middleware/authorization';
import { NAI_Staff_Info } from '../models';
import { setJwtCookie, clearJwtCookie, JwtPayload } from '../middleware/auth';

const router = Router();

// ─── 辅助函数：判断用户是否为管理员 ───────────────────────────────────────────
function getIsAdmin(lanId: string): boolean {
  const adminLanIds = (process.env.NCN_ADMIN_LAN_IDS || '')
    .split(',')
    .map((id: string) => id.trim().toLowerCase())
    .filter(Boolean);
  return adminLanIds.includes(lanId.toLowerCase());
}

// ─── Windows 自动登录（通过 SSO 代理头）────────────────────────────────────────
router.post('/windows-login', (req: Request, res: Response) => {
  try {
    const windowsUser = (
      req.headers['x-remote-user'] ||
      req.headers['x-windows-user'] ||
      req.headers['remote-user'] ||
      (req.headers['x-forwarded-user'] as string)?.split(',')[0] ||
      ''
    ).toString().toLowerCase().trim();

    if (!windowsUser) {
      logger.info('No Windows user header, skipping auto-login');
      return res.status(401).json({
        success: false,
        error: 'Windows auto-login not available',
        autoLogin: false,
        message: 'Please use manual login'
      });
    }

    logger.info(`Windows auto-login attempt for: ${windowsUser}`);

    NAI_Staff_Info.findOne({ where: { Lan_ID: windowsUser } }).then((staff: any) => {
      if (!staff) {
        logger.warn(`Windows user not found in staff table: ${windowsUser}`);
        return res.status(404).json({ success: false, error: `User "${windowsUser}" not found in staff directory` });
      }

      const isAdmin = getIsAdmin(windowsUser);
      const payload: JwtPayload = {
        lanId: staff.Lan_ID || windowsUser,
        displayName: staff.Staff_Name || windowsUser,
        email: staff.Email_Addr || '',
        department: staff.Department || '',
        isAdmin
      };

      setJwtCookie(res, payload);
      logger.info(`Windows auto-login successful: ${windowsUser}, isAdmin: ${isAdmin}`);
      return res.json({ success: true, user: payload, autoLogin: true });

    }).catch((dbErr: any) => {
      logger.error('Windows auto-login DB error:', dbErr.message || dbErr);
      return res.status(500).json({ success: false, error: 'Database error during auto-login' });
    });

  } catch (err: any) {
    logger.warn(`Windows auto-login failed: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Failed to detect Windows user' });
  }
});

// ─── 手动登录（LDAP 认证 → 写 JWT Cookie）──────────────────────────────────────
router.post('/login', (req, res, next) => {
  passport.authenticate('ldapauth', (err: any, ldapUser: any, info: any) => {
    if (err) {
      logger.error('Login error:', err);
      return res.status(500).json({ error: 'Authentication failed', detail: err.message });
    }

    if (!ldapUser) {
      const reason = info?.message || 'Invalid credentials';
      logger.warn(`Login failed: ${reason}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isAdmin = getIsAdmin(ldapUser.lanId || '');
    const payload: JwtPayload = {
      lanId: ldapUser.lanId || '',
      displayName: ldapUser.displayName || '',
      email: ldapUser.email || '',
      department: ldapUser.department || '',
      isAdmin
    };

    // 写 JWT Cookie
    setJwtCookie(res, payload);

    logger.info(`User logged in: ${payload.lanId}, isAdmin: ${isAdmin}`);
    return res.json({ success: true, user: payload });

  })(req, res, next);
});

// ─── 登出：清除 JWT Cookie ──────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const user = (req as any).user;
  const lanId = user?.lanId || 'unknown';
  clearJwtCookie(res);
  logger.info(`User logged out: ${lanId}`);
  return res.json({ success: true });
});

// ─── 获取当前用户（从 JWT Cookie 解析）─────────────────────────────────────────
router.get('/me', (req, res) => {
  const user = (req as any).user as JwtPayload | undefined;
  if (user?.lanId) {
    return res.json({
      authenticated: true,
      user: {
        lanId: user.lanId,
        displayName: user.displayName,
        email: user.email,
        department: user.department,
        isAdmin: user.isAdmin
      }
    });
  }
  return res.json({ authenticated: false });
});

// ─── LDAP 连接测试（排查专用）──────────────────────────────────────────────────
router.post('/test-ldap', (req: Request, res: Response) => {
  const { testType, username, password } = req.body;

  if (testType !== 'connection' && testType !== 'auth') {
    if (config.nodeEnv !== 'development') {
      const user = (req as any).user;
      if (!user?.lanId) return res.status(401).json({ error: 'Unauthorized - Please login' });
      if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden - Admin only' });
    }
  }

  if (!testType || testType === 'config') {
    return res.json({
      success: true,
      message: 'LDAP 配置信息',
      config: {
        url: config.ldap.url,
        baseDN: config.ldap.baseDN,
        bindDN: config.ldap.bindDN,
        searchFilter: config.ldap.searchFilter
      }
    });
  }

  if (testType === 'connection') {
    logger.info('Testing LDAP server connection...');
    const client = ldap.createClient({ url: config.ldap.url, connectTimeout: 5000 });
    let responded = false;
    const send = (data: any) => { if (!responded) { responded = true; res.json(data); } };

    client.on('error', (err) => send({ success: false, message: 'LDAP 服务器连接失败', error: err.message }));
    client.on('connect', () => {
      client.bind(config.ldap.bindDN, config.ldap.bindCredentials, (err) => {
        if (err) { send({ success: false, message: 'LDAP 绑定失败', error: err.message }); client.unbind(); return; }
        send({ success: true, message: 'LDAP 服务器连接成功', config: { url: config.ldap.url, bindDN: config.ldap.bindDN } });
        client.unbind();
      });
    });
    return;
  }

  if (testType === 'auth' && username && password) {
    logger.info(`Testing LDAP authentication for user: ${username}`);
    const searchFilter = config.ldap.searchFilter.replace('{{username}}', username);
    const client = ldap.createClient({ url: config.ldap.url, connectTimeout: 5000 });
    let responded = false;
    const send = (data: any) => { if (!responded) { responded = true; res.json(data); } };

    client.on('error', (err) => send({ success: false, message: 'LDAP 认证失败', error: err.message }));
    client.on('connect', () => {
      client.bind(config.ldap.bindDN, config.ldap.bindCredentials, (bindErr) => {
        if (bindErr) { send({ success: false, message: 'LDAP 服务账号绑定失败', error: bindErr.message }); client.unbind(); return; }

        client.search(config.ldap.baseDN, { scope: 'sub' as const, filter: searchFilter, attributes: ['sAMAccountName', 'displayName', 'mail', 'department', 'dn'] }, (searchErr, search) => {
          if (searchErr) { send({ success: false, message: 'LDAP 用户搜索失败', error: searchErr.message }); client.unbind(); return; }

          let userEntry: any = null;
          search.on('searchEntry', (entry) => { userEntry = entry.object; });
          search.on('end', () => {
            if (!userEntry) { send({ success: false, message: '用户不存在' }); client.unbind(); return; }

            const bindClient = ldap.createClient({ url: config.ldap.url, connectTimeout: 5000 });
            bindClient.on('connect', () => {
              bindClient.bind(userEntry.dn, password, (err) => {
                if (err) { send({ success: false, message: 'LDAP 认证失败 - 密码错误', error: err.message, user: { sAMAccountName: userEntry.sAMAccountName, displayName: userEntry.displayName } }); }
                else { send({ success: true, message: 'LDAP 认证成功', user: { sAMAccountName: userEntry.sAMAccountName, displayName: userEntry.displayName, mail: userEntry.mail, department: userEntry.department } }); }
                bindClient.unbind(); client.unbind();
              });
            });
            bindClient.on('error', (err) => { send({ success: false, message: 'LDAP 认证连接失败', error: err.message }); client.unbind(); });
          });
          search.on('error', (err) => { send({ success: false, message: 'LDAP 搜索错误', error: err.message }); client.unbind(); });
        });
      });
    });
    return;
  }

  return res.json({ success: true, message: '请指定测试类型：connection 或 auth' });
});

export default router;
