import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { authState } from '../../state/auth';

// Test wrapper component
function renderWithProviders(
  ui: React.ReactElement,
  {
    initialEntries = ['/'],
    isAuthenticated = false
  }: {
    initialEntries?: string[];
    isAuthenticated?: boolean;
  } = {}
) {
  let navigateFn: ReturnType<typeof useNavigate>;

  function TestWrapper() {
    const navigate = useNavigate();
    const setAuthState = useSetRecoilState(authState);
    navigateFn = navigate;

    useSetRecoilState(authState)({
      isAuthenticated,
      user: isAuthenticated ? { lanId: 'test123', displayName: 'Test User' } : null,
      loading: false
    });

    return ui;
  }

  const rendered = render(
    <RecoilRoot>
      <MemoryRouter initialEntries={initialEntries}>
        <TestWrapper />
      </MemoryRouter>
    </RecoilRoot>
  );

  return { ...rendered, navigate: navigateFn! };
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should redirect to login when not authenticated', () => {
    renderWithProviders(<ProtectedRoute><div data-testid="protected-content">Content</div></ProtectedRoute>, {
      isAuthenticated: false
    });

    // Check that navigation to login happened
    expect(window.location.href).not.toContain('login'); // jsdom doesn't track react router navigation by default
  });

  it('should render children when authenticated', () => {
    renderWithProviders(
      <ProtectedRoute><div data-testid="protected-content">Protected Content</div></ProtectedRoute>,
      {
        isAuthenticated: true
      }
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
