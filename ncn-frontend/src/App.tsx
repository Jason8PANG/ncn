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

    let cancelled = false;

    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (res) => {
        // 非 200-299 状态码也视为未认证，不再重试
        if (!res.ok) {
          return { authenticated: false };
        }
        try {
          return await res.json();
        } catch {
          // 响应体解析失败，视为未认证
          return { authenticated: false };
        }
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.authenticated && data?.user) {
          setAuthState({ isAuthenticated: true, user: data.user, loading: false });
          setInitialized(true);
        } else {
          // Cookie 不存在或无效，等待页面跳转到登录页
          setAuthState({ isAuthenticated: false, user: null, loading: false });
          setInitialized(true);
        }
      })
      .catch(() => {
        // 网络错误也视为未认证，不再重试
        if (!cancelled) {
          setAuthState({ isAuthenticated: false, user: null, loading: false });
          setInitialized(true);
        }
      });

    return () => {
      cancelled = true;
    };
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
