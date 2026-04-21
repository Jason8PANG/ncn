import { isAuthenticated, getCurrentUser, getCurrentUserLanId } from '../../middleware/auth';

describe('Auth Middleware', () => {
  let mockRequest: any;
  let mockResponse: any;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    nextFunction = jest.fn();
  });

  describe('isAuthenticated', () => {
    it('should call next() when user is authenticated', () => {
      mockRequest.isAuthenticated = jest.fn().mockReturnValue(true);

      isAuthenticated(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', () => {
      mockRequest.isAuthenticated = jest.fn().mockReturnValue(false);

      isAuthenticated(mockRequest, mockResponse, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Unauthorized - Please login' });
    });

    it('should return 401 when isAuthenticated method does not exist', () => {
      mockRequest.isAuthenticated = undefined;

      isAuthenticated(mockRequest, mockResponse, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Unauthorized - Please login' });
    });
  });

  describe('getCurrentUser', () => {
    it('should return user when authenticated', () => {
      const mockUser = { lanId: 'test123', name: 'Test User' };
      mockRequest.user = mockUser;

      const result = getCurrentUser(mockRequest);

      expect(result).toEqual(mockUser);
    });

    it('should return null when no user', () => {
      mockRequest.user = undefined;

      const result = getCurrentUser(mockRequest);

      expect(result).toBeNull();
    });
  });

  describe('getCurrentUserLanId', () => {
    it('should return lanId when user exists', () => {
      mockRequest.user = { lanId: 'test123' };

      const result = getCurrentUserLanId(mockRequest);

      expect(result).toBe('test123');
    });

    it('should return empty string when user has no lanId', () => {
      mockRequest.user = { name: 'Test User' };

      const result = getCurrentUserLanId(mockRequest);

      expect(result).toBe('');
    });

    it('should return empty string when no user', () => {
      mockRequest.user = undefined;

      const result = getCurrentUserLanId(mockRequest);

      expect(result).toBe('');
    });
  });
});
