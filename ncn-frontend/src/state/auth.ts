import { atom } from 'recoil';

export interface IUser {
  lanId: string;
  displayName: string;
  email: string;
  department: string;
  title?: string;
  isAdmin?: boolean;
}

export const authState = atom<{
  isAuthenticated: boolean;
  user: IUser | null;
  loading: boolean;
}>({
  key: 'authState',
  default: {
    isAuthenticated: false,
    user: null,
    loading: true
  }
});

// 标记认证初始化是否已完成（防止 StrictMode 重复调用）
export const authInitializedState = atom<boolean>({
  key: 'authInitializedState',
  default: false
});
