# NCN 测试指南

## 测试框架

### 后端 (ncn-web)
- **框架**: Jest + ts-jest
- **HTTP 测试**: supertest
- **覆盖率**: 内置 Jest coverage

### 前端 (ncn-frontend)
- **框架**: Vitest
- **组件测试**: React Testing Library
- **UI**: @vitest/ui
- **覆盖率**: v8

## 运行测试

### 后端测试

```bash
cd ncn-web

# 运行所有测试
npm test

# 监听模式 (文件变更自动重跑)
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 前端测试

```bash
cd ncn-frontend

# 运行所有测试
npm test

# 监听模式
npm run test:watch

# UI 模式 (可视化界面)
npm run test:ui

# 生成覆盖率报告
npm run test:coverage
```

## 测试文件位置

### 后端
```
ncn-web/
└── src/
    └── __tests__/
        ├── setup.ts              # 测试配置文件
        ├── config.test.ts        # 配置模块测试
        └── middleware/
            └── auth.test.ts      # 认证中间件测试
```

### 前端
```
ncn-frontend/
└── src/
    ├── __tests__/
    │   └── setup.ts              # 测试配置文件
    ├── components/
    │   └── __tests__/
    │       └── ProtectedRoute.test.tsx
    └── state/
        └── __tests__/
            └── auth.test.ts
```

## 编写测试

### 后端测试示例

```typescript
// src/__tests__/utils/logger.test.ts
import { logger } from '../../utils/logger';

describe('Logger Module', () => {
  it('should create logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
  });
});
```

### 前端测试示例

```typescript
// src/components/__tests__/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

## 测试 API 接口

```typescript
// src/__tests__/routes/health.test.ts
import request from 'supertest';
import app from '../../server';

describe('Health Check API', () => {
  it('should return healthy status', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
  });
});
```

## 持续集成

在 CI/CD 管道中添加测试步骤：

```yaml
# GitHub Actions 示例
- name: Run Backend Tests
  run: |
    cd ncn-web
    npm test

- name: Run Frontend Tests
  run: |
    cd ncn-frontend
    npm test
```

## 注意事项

1. **环境变量**: 测试时会加载 `.env.test` 文件（如果存在）
2. **数据库**: 测试时请确保不会连接到生产数据库
3. **Mock**: 外部服务（如 LDAP、邮件）应该使用 mock
4. **覆盖率**: 目标覆盖率建议 80% 以上

## 已通过的测试

当前测试状态：
- 后端：17 个测试全部通过
- 前端：3 个测试全部通过
