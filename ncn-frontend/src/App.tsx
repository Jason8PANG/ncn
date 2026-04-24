import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { authState } from './state/auth';
import Login from './pages/Login';
import MainLayout from './components/MainLayout';
import NCNList from './pages/NCNList';
import NCNKanban from './pages/NCNKanban';
import NCNEntry from './pages/NCNEntry';
import IssueLog from './pages/IssueLog';
import LdapTest from './pages/LdapTest';
import ProtectedRoute from './components/ProtectedRoute';
import { useEffect } from 'react';
import { getCurrentUser, windowsLogin } from './services/auth';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const setAuthState = useSetRecoilState(authState);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // 1. 先检查是否已有有效 session
        const user = await getCurrentUser();
        if (user) {
          setAuthState({ isAuthenticated: true, user, loading: false });
          return;
        }

        // 2. 没有 session，尝试 Windows 自动登录
        try {
          const winResult = await windowsLogin();
          if (winResult.success && winResult.user) {
            setAuthState({ isAuthenticated: true, user: winResult.user, loading: false });
            return;
          }
          // Windows 登录返回失败但不抛异常，说明服务端不支持，自动降级
          logger.info('Windows auto-login not available, using manual login');
        } catch (err: any) {
          // Windows 自动登录失败（网络错误等），降级到手动登录
          logger.info('Windows auto-login failed, using manual login');
        }

        // 3. 降级：显示手动登录页
        setAuthState({ isAuthenticated: false, user: null, loading: false });
      } catch {
        // 任何异常都降级到手动登录页
        setAuthState({ isAuthenticated: false, user: null, loading: false });
      }
    };
    initAuth();
  }, [setAuthState]);

  return <>{children}</>;
}

// 添加 logger
const logger = {
  info: (msg: string) => console.log('[Auth]', msg),
  warn: (msg: string) => console.warn('[Auth]', msg),
  error: (msg: string) => console.error('[Auth]', msg)
};

function AppContent() {
  const { isAuthenticated, loading } = useRecoilValue(authState);

  if (loading) {
    return null;
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
      <Route path="/ldap-test" element={<LdapTest />} />
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/ncn-list" />} />
        <Route path="ncn-list" element={<NCNList />} />
        <Route path="ncn-kanban" element={<NCNKanban />} />
        <Route path="ncn-entry" element={<NCNEntry />} />
        <Route path="ncn-entry/:id" element={<NCNEntry />} />
        <Route path="issue-log/:id" element={<IssueLog />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RecoilRoot>
        <AuthInitializer>
          <AppContent />
        </AuthInitializer>
      </RecoilRoot>
    </BrowserRouter>
  );
}
