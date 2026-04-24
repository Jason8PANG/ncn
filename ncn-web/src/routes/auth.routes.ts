import { Router, Request, Response } from 'express';
import passport from 'passport';
import ldap from 'ldapjs';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isAdminRequest } from '../middleware/authorization';
import { NAI_Staff_Info } from '../models';

const router = Router();

// Windows 自动登录接口：使用 Kerberos/NTLM ticket 进行自动认证
// 注意：需要前端应用（如 SSO 代理）先获取 Windows 身份后传递用户信息
router.post('/windows-login', (req: Request, res: Response) => {
  try {
    // 从请求头获取 Windows 用户名（由 SSO 代理或前端设置）
    // 常见头：X-Remote-User, X-Windows-User, Remote-User
    const windowsUser = (
      req.headers['x-remote-user'] ||
      req.headers['x-windows-user'] ||
      req.headers['remote-user'] ||
      (req.headers['x-forwarded-user'] as string)?.split(',')[0] ||
      ''
    ).toString().toLowerCase().trim();

    if (!windowsUser) {
      // 没有 Windows 用户信息，尝试 LDAP 无密码绑定（使用已建立的连接）
      logger.info('No Windows user header, skipping auto-login');
      return res.status(401).json({
        success: false,
        error: 'Windows auto-login not available',
        autoLogin: false,
        message: 'Please use manual login'
      });
    }

    logger.info(`Windows auto-login attempt for: ${windowsUser}`);

    // 在 NAI_Staff_Info 中查找该用户
    NAI_Staff_Info.findOne({
      where: { Lan_ID: windowsUser }
    }).then((staff: any) => {
      if (!staff) {
        logger.warn(`Windows user not found in staff table: ${windowsUser}`);
        return res.status(404).json({ success: false, error: `User "${windowsUser}" not found in staff directory` });
      }

      // 判断是否为管理员
      const adminLanIds = (process.env.NCN_ADMIN_LAN_IDS || '')
        .split(',')
        .map((id: string) => id.trim().toLowerCase())
        .filter(Boolean);
      const isAdmin = adminLanIds.includes(windowsUser.toLowerCase());

      const applicationUser = {
        lanId: (staff as any).Lan_ID || windowsUser,
        displayName: (staff as any).Staff_Name || windowsUser,
        email: (staff as any).Email_Addr || '',
        department: (staff as any).Department || '',
        empId: (staff as any).Emp_ID || '',
        isAdmin
      };

      // 建立 session
      req.login(applicationUser, (loginErr: any) => {
        if (loginErr) {
          logger.error('Windows auto-login session error:', loginErr);
          return res.status(500).json({ success: false, error: 'Failed to create session' });
        }

        logger.info(`Windows auto-login successful: ${windowsUser}, isAdmin: ${isAdmin}`);
        return res.json({
          success: true,
          user: applicationUser,
          autoLogin: true
        });
      });
    }).catch((dbErr: any) => {
      logger.error('Windows auto-login DB error:', dbErr.message || dbErr);
      return res.status(500).json({ success: false, error: 'Database error during auto-login' });
    });

  } catch (err: any) {
    logger.warn(`Windows auto-login failed: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Failed to detect Windows user' });
  }
});

// Login route
router.post('/login', (req, res, next) => {
  passport.authenticate('ldapauth', (err: any, user: any, info: any) => {
    if (err) {
      logger.error('Login error:', err);
      return res.status(500).json({ error: 'Authentication failed' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.login(user, (loginErr) => {
      if (loginErr) {
        logger.error('Login session error:', loginErr);
        return res.status(500).json({ error: 'Failed to create session' });
      }

      // 判断是否为管理员
      const adminLanIds = (process.env.NCN_ADMIN_LAN_IDS || '')
        .split(',')
        .map((id: string) => id.trim().toLowerCase())
        .filter(Boolean);
      const isAdmin = adminLanIds.includes((user.lanId || '').toLowerCase());

      logger.info(`User logged in: ${user.lanId}, isAdmin: ${isAdmin}`);
      return res.json({
        success: true,
        user: {
          lanId: user.lanId,
          displayName: user.displayName,
          email: user.email,
          department: user.department,
          isAdmin
        }
      });
    });
  })(req, res, next);
});

// Logout route
router.post('/logout', (req, res, next) => {
  const lanId = (req.user as any)?.lanId || 'unknown';

  req.logout((err) => {
    if (err) {
      logger.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }

    logger.info(`User logged out: ${lanId}`);
    return res.json({ success: true });
  });
});

// Get current user route
router.get('/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const user = req.user as any;
    // 判断是否为管理员
    const adminLanIds = (process.env.NCN_ADMIN_LAN_IDS || '')
      .split(',')
      .map((id: string) => id.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = adminLanIds.includes((user.lanId || '').toLowerCase());

    return res.json({
      authenticated: true,
      user: {
        lanId: user.lanId,
        displayName: user.displayName,
        email: user.email,
        department: user.department,
        isAdmin
      }
    });
  }

  return res.json({ authenticated: false });
});

// LDAP 连接测试接口
router.post('/test-ldap', (req: Request, res: Response) => {
  if (config.nodeEnv !== 'development') {
    if (!(req.isAuthenticated && req.isAuthenticated())) {
      return res.status(401).json({ error: 'Unauthorized - Please login' });
    }
    if (!isAdminRequest(req)) {
      return res.status(403).json({ error: 'Forbidden - Admin only' });
    }
  }

  const { username, password, testType } = req.body;

  // 默认：只返回配置信息
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

  // 测试 LDAP 服务器连接
  if (testType === 'connection') {
    logger.info('Testing LDAP server connection...');

    const client = ldap.createClient({
      url: config.ldap.url,
      connectTimeout: 5000
    });

    let responded = false;
    const sendResponse = (data: any) => {
      if (!responded) {
        responded = true;
        res.json(data);
      }
    };

    client.on('error', (err) => {
      logger.error('LDAP connection error:', err);
      sendResponse({
        success: false,
        message: 'LDAP 服务器连接失败',
        error: err.message,
        config: {
          url: config.ldap.url,
          baseDN: config.ldap.baseDN
        }
      });
    });

    client.on('connect', () => {
      logger.info('LDAP connected successfully');

      // 使用 bind 测试连接
      client.bind(config.ldap.bindDN, config.ldap.bindCredentials, (err) => {
        if (err) {
          logger.error('LDAP bind error:', err);
          sendResponse({
            success: false,
            message: 'LDAP 绑定失败',
            error: err.message,
            config: {
              url: config.ldap.url,
              bindDN: config.ldap.bindDN
            }
          });
          client.unbind();
          return;
        }

        logger.info('LDAP bind successful');
        sendResponse({
          success: true,
          message: 'LDAP 服务器连接成功',
          entriesFound: 1,
          config: {
            url: config.ldap.url,
            baseDN: config.ldap.baseDN,
            bindDN: config.ldap.bindDN
          }
        });
        client.unbind();
      });
    });

    return;
  }

  // 测试用户认证
  if (testType === 'auth' && username && password) {
    logger.info(`Testing LDAP authentication for user: ${username}`);

    const searchFilter = config.ldap.searchFilter.replace('{{username}}', username);
    const client = ldap.createClient({
      url: config.ldap.url,
      connectTimeout: 5000
    });

    let responded = false;
    const sendResponse = (data: any) => {
      if (!responded) {
        responded = true;
        res.json(data);
      }
    };

    client.on('error', (err) => {
      logger.error('LDAP auth error:', err);
      sendResponse({
        success: false,
        message: 'LDAP 认证失败',
        error: err.message,
        config: {
          url: config.ldap.url,
          searchFilter
        }
      });
    });

    client.on('connect', () => {
      // 先使用服务账号绑定
      client.bind(config.ldap.bindDN, config.ldap.bindCredentials, (bindErr) => {
        if (bindErr) {
          logger.error('LDAP service bind error:', bindErr);
          sendResponse({
            success: false,
            message: 'LDAP 服务账号绑定失败',
            error: bindErr.message
          });
          client.unbind();
          return;
        }

        // 搜索用户
        const searchOpts = {
          scope: 'sub' as const,
          filter: searchFilter,
          attributes: ['sAMAccountName', 'displayName', 'mail', 'department', 'dn']
        };

        client.search(config.ldap.baseDN, searchOpts, (searchErr, search) => {
          if (searchErr) {
            logger.error('LDAP search error:', searchErr);
            sendResponse({
              success: false,
              message: 'LDAP 用户搜索失败',
              error: searchErr.message
            });
            client.unbind();
            return;
          }

          let userEntry: any = null;
          search.on('searchEntry', (entry) => {
            userEntry = entry.object;
            logger.info('LDAP user found:', entry.object);
          });

          search.on('end', () => {
            if (!userEntry) {
              logger.error('User not found');
              sendResponse({
                success: false,
                message: '用户不存在',
                config: {
                  url: config.ldap.url,
                  searchFilter
                }
              });
              client.unbind();
              return;
            }

            // 尝试使用用户凭证绑定
            const userDN = userEntry.dn;
            logger.info(`Attempting to bind with DN: ${userDN}`);

            const bindClient = ldap.createClient({ url: config.ldap.url, connectTimeout: 5000 });

            bindClient.on('connect', () => {
              bindClient.bind(userDN, password, (bindErr) => {
                if (bindErr) {
                  logger.error('LDAP bind failed:', bindErr);
                  sendResponse({
                    success: false,
                    message: 'LDAP 认证失败 - 密码错误',
                    error: bindErr.message,
                    user: {
                      sAMAccountName: userEntry.sAMAccountName,
                      displayName: userEntry.displayName,
                      mail: userEntry.mail,
                      department: userEntry.department
                    }
                  });
                  bindClient.unbind();
                  client.unbind();
                  return;
                }

                logger.info('LDAP auth successful');
                sendResponse({
                  success: true,
                  message: 'LDAP 认证成功',
                  user: {
                    sAMAccountName: userEntry.sAMAccountName,
                    displayName: userEntry.displayName,
                    mail: userEntry.mail,
                    department: userEntry.department
                  }
                });
                bindClient.unbind();
                client.unbind();
              });
            });

            bindClient.on('error', (bindErr) => {
              logger.error('LDAP bind connection error:', bindErr);
              sendResponse({
                success: false,
                message: 'LDAP 认证连接失败',
                error: bindErr.message
              });
              client.unbind();
            });
          });

          search.on('error', (err) => {
            logger.error('LDAP search error:', err);
            sendResponse({
              success: false,
              message: 'LDAP 搜索错误',
              error: err.message
            });
            client.unbind();
          });
        });
      });
    });

    return;
  }

  return res.json({
    success: true,
    message: '请指定测试类型：connection 或 auth'
  });
});

export default router;
