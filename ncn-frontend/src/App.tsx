import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { Spin } from 'antd';
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

const logger = {
  info: (msg: string) => console.log('[Auth]', msg),
  warn: (msg: string) => console.warn('[Auth]', msg),
  error: (msg: string) => console.error('[Auth]', msg)
};

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const setAuthState = useSetRecoilState(authState);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      try {
        // 1. 检查 JWT Cookie 是否有效
        const user = await getCurrentUser();
        if (cancelled) return;

        if (user) {
          setAuthState({ isAuthenticated: true, user, loading: false });
          return;
        }

        // 2. 没有 Cookie，尝试 Windows 自动登录
        try {
          const winResult = await windowsLogin();
          if (cancelled) return;

          if (winResult.success && winResult.user) {
            setAuthState({ isAuthenticated: true, user: winResult.user, loading: false });
            return;
          }
          logger.info('Windows auto-login not available, using manual login');
        } catch (err: any) {
          logger.info('Windows auto-login failed, using manual login');
        }

        // 3. 降级到手动登录页
        setAuthState({ isAuthenticated: false, user: null, loading: false });
      } catch {
        if (!cancelled) {
          setAuthState({ isAuthenticated: false, user: null, loading: false });
        }
      }
    };

    initAuth();
    return () => { cancelled = true; };
  }, [setAuthState]);

  return <>{children}</>;
}

function AppContent() {
  const { isAuthenticated, loading } = useRecoilValue(authState);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="Loading..." />
      </div>
    );
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
