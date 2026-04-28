import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authState } from '../state/auth';
import { useRecoilValue } from 'recoil';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useRecoilValue(authState);

  // 认证检查中，不做任何跳转
  if (loading) {
    return null;
  }

  // 未登录，跳转到登录页
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
