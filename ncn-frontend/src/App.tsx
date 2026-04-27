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
import { useEffect, useRef } from 'react';
import { windowsLogin } from './services/auth';

const COOKIE_NAME = 'ncn_token';

/** 解析 JWT payload（不解签名，只读 header+payload） */
function parseJwtPayload(token: string): any | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** 从 Cookie 读取 JWT 并解析用户信息 */
function getUserFromCookie(): { lanId: string; displayName: string; email: string; department: string; isAdmin: boolean } | null {
  const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
  if (!match) return null;
  const payload = parseJwtPayload(decodeURIComponent(match[2]));
  if (!payload || !payload.lanId) return null;
  return {
    lanId: payload.lanId,
    displayName: payload.displayName || payload.lanId,
    email: payload.email || '',
    department: payload.department || '',
    isAdmin: payload.isAdmin || false
  };
}

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const setAuthState = useSetRecoilState(authState);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const user = getUserFromCookie();
    if (user) {
      setAuthState({ isAuthenticated: true, user, loading: false });
      return;
    }

    // 无 Cookie，尝试 Windows 自动登录
    windowsLogin().then((result) => {
      if (result.success && result.user) {
        setAuthState({ isAuthenticated: true, user: result.user, loading: false });
      } else {
        setAuthState({ isAuthenticated: false, user: null, loading: false });
      }
    }).catch(() => {
      setAuthState({ isAuthenticated: false, user: null, loading: false });
    });
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
