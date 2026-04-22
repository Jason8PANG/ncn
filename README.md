# NCN 管理系统 (Node.js 重构版)

Non-Conformance Notice (不合格品通知) 质量管理系统

## 项目概述

本项目是对原有 .NET NCN 管理系统的 Node.js 重构版本，采用现代化的技术栈实现相同的功能，并保持界面风格的一致性。

## 技术栈

### 后端 (ncn-web)
- **框架**: Express + TypeScript
- **数据库 ORM**: Sequelize (MS SQL Server)
- **认证**: Passport-LDAP (Windows AD 认证)
- **邮件**: Nodemailer
- **文件上传**: Multer

### 前端 (ncn-frontend)
- **框架**: React 18 + TypeScript
- **UI 组件**: Ant Design 5.x
- **构建工具**: Vite 5.x
- **路由**: React Router 6.x
- **HTTP 客户端**: Axios

## 项目结构

```
D:/nai_ncn/
├── ncn-web/                    # 后端项目
│   ├── src/
│   │   ├── config/            # 配置文件 (LDAP, 数据库等)
│   │   ├── controllers/       # 控制器 (未使用，采用路由直连)
│   │   ├── middleware/        # 中间件 (认证、权限等)
│   │   ├── models/            # 数据模型
│   │   │   ├── index.ts       # 数据库连接
│   │   │   ├── NCN_Entry.ts   # NCN 主表
│   │   │   ├── NCN_Action_Detail.ts  # 行动明细表
│   │   │   ├── NCN_Kanban.ts  # 周报看板表
│   │   │   ├── NAI_Staff_Info.ts  # 员工信息表
│   │   │   └── Code_Table.ts  # 代码配置表
│   │   ├── routes/            # API 路由
│   │   │   ├── auth.routes.ts     # 认证路由
│   │   │   ├── ncn.routes.ts      # NCN 查询路由
│   │   │   ├── entry.routes.ts    # NCN 条目路由
│   │   │   ├── action.routes.ts   # 行动路由
│   │   │   ├── issuelog.routes.ts # 问题日志路由
│   │   │   ├── kanban.routes.ts   # 看板路由
│   │   │   ├── staff.routes.ts    # 员工路由
│   │   │   └── upload.routes.ts   # 文件上传路由
│   │   ├── services/          # 业务服务
│   │   ├── utils/             # 工具函数
│   │   │   ├── logger.ts      # 日志工具
│   │   │   └── email.ts       # 邮件服务
│   │   ├── types/             # TypeScript 类型定义
│   │   └── server.ts          # 入口文件
│   ├── logs/                  # 日志目录
│   ├── uploads/               # 上传文件目录
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example           # 环境变量模板
│
├── ncn-frontend/              # 前端项目
│   ├── src/
│   │   ├── components/        # 公共组件
│   │   │   └── MainLayout.tsx # 主布局组件
│   │   ├── pages/             # 页面组件
│   │   │   ├── Login.tsx      # 登录页
│   │   │   ├── NCNList.tsx    # NCN 列表页
│   │   │   ├── NCNEntry.tsx   # NCN 新增/编辑页
│   │   │   ├── IssueLog.tsx   # 问题日志页
│   │   │   └── Kanban.tsx     # 周报看板页
│   │   ├── services/          # API 服务
│   │   │   ├── authService.ts
│   │   │   ├── ncnService.ts
│   │   │   ├── entryService.ts
│   │   │   ├── actionService.ts
│   │   │   └── kanbanService.ts
│   │   ├── styles/            # 样式文件
│   │   ├── utils/             # 工具函数
│   │   │   └── request.ts     # Axios 实例
│   │   ├── App.tsx            # 根组件
│   │   └── main.tsx           # 入口文件
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
└── ncn_source/                # 原始.NET 代码 (参考)
```

## 功能模块

### 1. 认证模块
- Windows AD LDAP 认证
- 会话管理
- 用户信息获取

### 2. NCN 主页面 (NCN Action)
- NCN 列表查询 (支持多条件筛选)
- 新增 NCN
- 编辑 NCN
- 查看 NCN 详情
- 导出 Excel
- Kanban 周报查看/编辑

### 3. NCN 条目管理 (NCN Entry)
- 自动生成 NCN 编号
- 根据 WO 自动查询 Part/Customer/SBU
- 根据员工号查询姓名
- 文件上传/下载
- 邮件通知

### 4. 问题日志 (Issue Log)
- 临时措施 (Currently Action) 管理
- 长期措施 (Future Action) 管理
- 行动状态跟踪
- 发送给 QE 关闭

### 5. 周报 Kanban
- 按周查看/编辑质量数据
- Process/Final 不良数量
- Process/Final PPM

## 数据库表结构

### NCN_Entry (NCN 主表)
| 字段 | 类型 | 说明 |
|------|------|------|
| ROWID | INT | 主键 |
| NCN_Type | VARCHAR | 类型 (A/B/P/F/L) |
| SerialNo | VARCHAR | NCN 编号 |
| SBU | VARCHAR | SBU |
| SBU_Des | VARCHAR | SBU 描述 |
| Finder_Dept | VARCHAR | 发现部门 |
| Finder | VARCHAR | 发现人 |
| Finder_Date | DATETIME | 发现日期 |
| WO | VARCHAR | 工单 |
| Part_ID | VARCHAR | 料号 |
| Customer | VARCHAR | 客户 |
| Defect_Description | TEXT | 不良描述 |
| Defect_Qty | INT | 不良数量 |
| Status | VARCHAR | 状态 |
| ... | ... | ... |

### NCN_Action_Detail (行动明细表)
| 字段 | 类型 | 说明 |
|------|------|------|
| RowID | INT | 主键 |
| NCN_ID | INT | 外键 (NCN_Entry.ROWID) |
| Type | VARCHAR | 类型 (C=临时，F=长期) |
| ActionDept | VARCHAR | 责任部门 |
| ActionOwner | VARCHAR | 责任人 |
| OwnerAnalysis | TEXT | 原因分析 |
| OwnerAction | TEXT | 改善措施 |
| ActionDuedate | DATETIME | 完成日期 |
| ActionStatus | VARCHAR | 状态 |

### NCN_Kanban (周报看板表)
| 字段 | 类型 | 说明 |
|------|------|------|
| RowID | INT | 主键 |
| Section | VARCHAR | Section 名称 |
| CorMonday~CorSunday | VARCHAR | Cor 数据 (周一到周日) |
| FiberMonday~FiberSunday | VARCHAR | Fiber 数据 (周一到周日) |
| Year | INT | 年份 |
| Week | INT | 周数 |

### NAI_Staff_Info (员工信息表)
| 字段 | 类型 | 说明 |
|------|------|------|
| Emp_ID | VARCHAR | 员工号 (主键) |
| Lan_ID | VARCHAR | 登录账号 |
| Staff_Name | VARCHAR | 姓名 |
| Email_Addr | VARCHAR | 邮箱 |
| Department | VARCHAR | 部门 |
| Leave_Date | DATETIME | 离职日期 |

### Code_Table (代码配置表)
| 字段 | 类型 | 说明 |
|------|------|------|
| Code | VARCHAR | 代码 (主键) |
| Code_Category | VARCHAR | 代码类别 |
| Code_Description | VARCHAR | 描述 |
| remark | VARCHAR | 备注 |
| Status | VARCHAR | 状态 |

## 安装步骤

### 1. 环境要求
- Node.js >= 18.x (仅开发模式需要)
- Docker & Docker Compose
- MS SQL Server
- Windows AD (LDAP)

### 2. Docker 部署 (推荐方式)

#### 2.1 克隆项目
```bash
git clone https://github.com/Jason8PANG/ncn.git
cd ncn
```

#### 2.2 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库和 LDAP 信息
```

#### 2.3 启动服务
```bash
# 构建并启动所有服务 (前端 + 后端)
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

#### 2.4 访问应用
- 前端: http://localhost:7000
- 后端 API: http://localhost:7001

### 3. 本地开发模式

#### 3.1 后端安装

```bash
cd ncn-web
npm install

# 复制环境变量文件并修改配置
cp .env.example .env
# 编辑 .env 文件，配置数据库和 LDAP 信息

# 开发模式运行
npm run dev

# 生产构建
npm run build
npm run start
```

#### 3.2 前端安装

```bash
cd ncn-frontend
npm install

# 开发模式运行
npm run dev

# 生产构建
npm run build
```

### 4. Docker 开发

如果你只想运行后端或前端：
```bash
# 只运行后端
docker compose up -d ncn-web

# 只运行前端
docker compose up -d ncn-frontend

# 重新构建镜像
docker compose build --no-cache
```

## 配置说明

### 数据库配置 (.env)
```
DB_HOST=localhost          # SQL Server 地址
DB_PORT=1433              # SQL Server 端口
DB_DATABASE=NCN_DB        # 数据库名
DB_USERNAME=sa            # 用户名
DB_PASSWORD=your_password # 密码
```

### LDAP 配置 (.env)
```
LDAP_URL=ldap://your-ad-server:389
LDAP_BASE_DN=DC=yourdomain,DC=com
LDAP_BIND_DN=CN=ldap_service,CN=Users,DC=yourdomain,DC=com
LDAP_BIND_PASSWORD=your_ldap_password
LDAP_SEARCH_FILTER=(sAMAccountName={{username}})
```

### 邮件配置 (.env)
```
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=25
SMTP_FROM=NCN@nai-group.com
```

## API 接口

### 认证接口
- `POST /api/auth/login` - 登录
- `POST /api/auth/logout` - 登出
- `GET /api/auth/me` - 获取当前用户

### NCN 接口
- `GET /api/ncn` - 获取 NCN 列表
- `GET /api/ncn/:serialNo` - 获取 NCN 详情
- `GET /api/ncn/params/dropdowns` - 获取下拉选项

### Entry 接口
- `GET /api/entry/serialno/new` - 生成新编号
- `GET /api/entry/wo/:woCode` - 根据 WO 查询
- `GET /api/entry/staff/:empId` - 根据员工号查询
- `POST /api/entry` - 保存 NCN
- `PUT /api/entry/:rowid` - 更新 NCN

### Action 接口
- `GET /api/action/ncn/:ncnId` - 获取行动列表
- `POST /api/action` - 创建行动
- `PUT /api/action/:rowid` - 更新行动
- `PUT /api/action/:rowid/close` - 关闭行动
- `DELETE /api/action/:rowid` - 删除行动

### Kanban 接口
- `GET /api/kanban` - 获取看板数据
- `POST /api/kanban/save` - 保存看板数据
- `GET /api/kanban/years` - 获取年份列表
- `GET /api/kanban/weeks` - 获取周列表

## 状态流转

```
On-going → Tracking (跟踪中)
On-going → Closed (已关闭)
On-going → Reject (已拒绝)
```

## 邮件通知

系统在以下情况会发送邮件通知：
1. 新建 NCN 时 - 通知 ME 和 Owner
2. NCN 被拒绝时 - 通知 Owner
3. Action 分配时 - 通知责任人
4. 所有 Action 完成时 - 通知 QE 关闭

## 与原.NET 版本的差异

1. **技术栈**: 从 ASP.NET WebForms 迁移到 Express + React
2. **UI 风格**: 采用 Ant Design 现代化设计，保持功能一致
3. **架构**: 前后端分离，更易于维护和扩展
4. **认证**: 保留 LDAP/AD 认证机制
5. **数据库**: 保持 MS SQL Server，表结构不变

## 开发注意事项

1. 确保 LDAP 服务器可访问
2. SQL Server 需要启用 TCP/IP 协议
3. 文件上传目录需要有写权限
4. 邮件服务器需要正确配置 SMTP

## 待办事项

- [x] 添加 Docker 部署支持
- [x] 添加权限控制
- [x] 完善邮件通知功能
- [ ] 实现 Excel 导出功能
- [ ] 添加单元测试
- [ ] 完善日志记录

## 许可证

Internal Use Only - NAI Group
