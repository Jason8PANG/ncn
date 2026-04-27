import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authState } from '../state/auth';
import { useRecoilValue } from 'recoil';

const COOKIE_NAME = 'ncn_token';

function parseJwtPayload(token: string): any | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hasValidCookie(): boolean {
  const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
  if (!match) return false;
  const payload = parseJwtPayload(decodeURIComponent(match[2]));
  return !!(payload && payload.lanId);
}

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useRecoilValue(authState);

  // 直接读 Cookie 判断是否已登录
  if (!hasValidCookie()) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}
