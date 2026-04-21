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
