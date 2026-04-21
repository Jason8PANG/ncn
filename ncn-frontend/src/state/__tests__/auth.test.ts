import { describe, it, expect } from 'vitest';
import { authState } from '../auth';

describe('Auth State', () => {
  it('should have correct atom key', () => {
    expect(authState.key).toBe('authState');
  });
});
