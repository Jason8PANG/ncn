import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { Spin } from 'antd';
import { authState, authInitializedState } from './state/auth';
import Login from './pages/Login';
import MainLayout from './components/MainLayout';
import NCNList from './pages/NCNList';
import NCNKanban from './pages/NCNKanban';
import NCNEntry from './pages/NCNEntry';
import IssueLog from './pages/IssueLog';
import LdapTest from './pages/LdapTest';
import ProtectedRoute from './components/ProtectedRoute';
import { useEffect } from 'react';
import { windowsLogin } from './services/auth';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const setAuthState = useSetRecoilState(authState);
  const initialized = useRecoilValue(authInitializedState);
  const setInitialized = useSetRecoilState(authInitializedState);

  useEffect(() => {
    if (initialized) return;

    // httpOnly Cookie 无法通过 document.cookie 读取，必须调用后端接口验证
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          // Cookie 有效，直接恢复登录状态，无需再次输入密码
          setAuthState({ isAuthenticated: true, user: data.user, loading: false });
          setInitialized(true);
        } else {
          // Cookie 不存在或已过期，尝试 Windows SSO 自动登录
          return windowsLogin().then((result) => {
            if (result.success && result.user) {
              setAuthState({ isAuthenticated: true, user: result.user, loading: false });
            } else {
              setAuthState({ isAuthenticated: false, user: null, loading: false });
            }
            setInitialized(true);
          });
        }
      })
      .catch(() => {
        setAuthState({ isAuthenticated: false, user: null, loading: false });
        setInitialized(true);
      });
  }, [initialized, setAuthState, setInitialized]);

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
