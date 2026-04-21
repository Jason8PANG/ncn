# NCN-Web 权限矩阵与接口落点清单

## 1. 目标与范围

本文用于把 legacy .NET 的权限意图，落到 `ncn-web` 当前 API。

- 目标：从“仅登录校验”升级为“登录 + 角色 + 资源关系校验”。
- 范围：`src/routes/*.routes.ts` 暴露的 NCN 业务接口。
- 不含：LDAP 账号认证流程本身（`/api/auth/login`）的改造细节。

## 2. 角色定义（建议）

### 2.1 系统角色

- `AUTHENTICATED`: 已登录用户（当前已具备）。
- `NCN_ADMIN`: NCN 管理员（建议新增角色来源，见第 5 节）。

### 2.2 资源关系角色（运行时按 NCN/Action 动态判定）

- `QE_OWNER`: 当前 NCN 的 `QualityEngineer`。
- `ENTRY_OWNER`: 当前 NCN 的 `Finder` 或 `Owner`（按业务最终口径可二选一或并存）。
- `ACTION_OWNER`: 当前 Action 的 `ActionOwner`。

## 3. 权限矩阵（建议基线）

说明：
- Y = 允许，N = 不允许，C = 有条件允许。
- `NCN_ADMIN` 为兜底角色；若冲突，按“更严格优先”。

| 业务操作 | AUTHENTICATED | ENTRY_OWNER | ACTION_OWNER | QE_OWNER | NCN_ADMIN |
|---|---:|---:|---:|---:|---:|
| 查看 NCN 列表/详情 | Y | Y | Y | Y | Y |
| 创建 NCN | Y | Y | N | N | Y |
| 编辑 NCN 主档（非 Closed） | N | C | N | C | Y |
| 修改 NCN 状态为 Tracking | N | N | N | C | Y |
| NCN Reject | N | N | N | C | Y |
| NCN Close（主单关闭） | N | N | N | C | Y |
| 新增 Action 行 | N | C | N | C | Y |
| 编辑 Action 内容 | N | C | C | C | Y |
| 关闭 Action 行 | N | N | C | C | Y |
| 删除 Action 行 | N | N | N | C | Y |
| 上传/下载附件（NCN 相关） | N | C | C | C | Y |
| 查看组织人员/部门主数据 | Y | Y | Y | Y | Y |

条件说明：
- `ENTRY_OWNER` 编辑 NCN 主档：仅 `Status != Closed` 且关键字段不越权（如 QE/关闭字段不可改）。
- `QE_OWNER` 修改状态：仅允许进入 `Tracking/Reject/Closed` 等 QE 管辖状态。
- `ACTION_OWNER` 关闭 Action：仅允许关闭自己名下的 Action。

## 4. 接口落点清单（按文件）

说明：
- “现状”基于当前代码扫描。
- “落点”是建议新增鉴权调用位置。
- 优先级：`P0` 必做（存在越权风险），`P1` 应做，`P2` 优化。

---

### 4.1 `src/routes/ncn.routes.ts`

1. `GET /api/ncn`
- 现状：未挂 `isAuthenticated`。
- 风险：列表可匿名访问（数据暴露）。
- 落点：路由级增加 `isAuthenticated`。
- 优先级：P0。

2. `GET /api/ncn/:serialNo`
- 现状：仅 `isAuthenticated`。
- 落点：如需按 BU/部门隔离，增加 `canViewNCN(serialNo)`。
- 优先级：P1。

3. `GET /api/ncn/params/dropdowns`
- 现状：仅 `isAuthenticated`。
- 落点：保持即可；如需敏感字段裁剪在 service 层处理。
- 优先级：P2。

---

### 4.2 `src/routes/entry.routes.ts`

1. `POST /api/entry`
- 现状：仅 `isAuthenticated`。
- 落点：增加 `canCreateNCN()`（默认登录可建，便于对接 legacy）。
- 优先级：P1。

2. `PUT /api/entry/:rowid`
- 现状：仅校验 Closed，不校验操作者关系。
- 风险：任意登录用户可改他人 NCN（未关闭时）。
- 落点：在读取 `entry` 后增加 `canEditNCN(entry, user)`。
- 优先级：P0。

3. `GET /api/entry/:serialNo`
- 现状：仅 `isAuthenticated`。
- 落点：可选 `canViewNCNBySerial(serialNo)`。
- 优先级：P1。

4. `GET /api/entry/*`（序号、WO、staff、options）
- 现状：仅登录校验。
- 落点：维持；若担心信息面过大，可加最小化字段返回。
- 优先级：P2。

---

### 4.3 `src/routes/action.routes.ts`

1. `POST /api/action`
- 现状：仅 `isAuthenticated`。
- 风险：任意用户可给任意 NCN 新增 Action。
- 落点：新增 `canManageActionOnNCN(NCN_ID, user)`，建议 `QE_OWNER || NCN_ADMIN || ENTRY_OWNER`。
- 优先级：P0。

2. `PUT /api/action/:rowid`
- 现状：仅 `isAuthenticated`。
- 风险：任意用户可编辑/篡改 Action。
- 落点：读取 action 后 `canEditAction(action, user)`。
- 优先级：P0。

3. `PUT /api/action/:rowid/close`
- 现状：仅 `isAuthenticated`。
- 风险：任意用户可关闭他人 Action。
- 落点：`canCloseAction(action, user)`，建议 `ACTION_OWNER || QE_OWNER || NCN_ADMIN`。
- 优先级：P0。

4. `DELETE /api/action/:rowid`
- 现状：仅 `isAuthenticated`。
- 风险：任意用户可删 Action（高危）。
- 落点：`canDeleteAction(action, user)`，建议 `QE_OWNER || NCN_ADMIN`。
- 优先级：P0。

5. `GET /api/action/:ncnId` / `GET /api/action/ncn/:ncnId`
- 现状：仅 `isAuthenticated`。
- 落点：按是否需要数据域隔离决定是否加 `canViewNCN(ncnId)`。
- 优先级：P1。

6. `GET /api/action/staff/*`
- 现状：仅 `isAuthenticated`。
- 落点：维持。
- 优先级：P2。

---

### 4.4 `src/routes/issuelog.routes.ts`

1. `POST /api/issuelog/:ncnId/qe-close`
- 现状：仅校验“Action 全部关闭”，未校验调用者是否 QE/Admin。
- 风险：任意登录用户可触发 QE close 流程。
- 落点：在读取 `ncnEntry` 后 `canQEClose(ncnEntry, user)`。
- 优先级：P0。

2. `GET /api/issuelog/:ncnId`
- 现状：仅 `isAuthenticated`。
- 落点：可选 `canViewNCN`。
- 优先级：P1。

---

### 4.5 `src/routes/upload.routes.ts`

1. `POST /api/upload`
- 现状：仅 `isAuthenticated`，未校验用户是否有权操作该 `serialNo`。
- 风险：越权上传覆盖他人附件。
- 落点：根据 `serialNo` 查 NCN 后执行 `canManageAttachment(ncn, user)`。
- 优先级：P0。

2. `GET /api/upload/download?filePath=...`
- 现状：仅登录 + 直接按 `filePath` 下载。
- 风险：路径探测/越权下载风险。
- 落点：
  - 限定下载根目录为 `config.upload.path`。
  - 禁止任意绝对路径。
  - 补 `canManageAttachment` 或至少 `canViewNCN`。
- 优先级：P0。

---

### 4.6 `src/routes/staff.routes.ts`

1. `GET /api/staff*`
- 现状：仅 `isAuthenticated`。
- 落点：维持；如需最小化暴露，可将搜索能力收紧到业务页面实际字段。
- 优先级：P2。

---

### 4.7 `src/routes/auth.routes.ts`

1. `POST /api/auth/test-ldap`
- 现状：未鉴权，可暴露 LDAP 配置与连通性信息。
- 风险：信息泄漏。
- 落点：
  - 仅开发环境开放，或
  - 增加 `isAuthenticated + NCN_ADMIN`。
- 优先级：P0。

2. `POST /api/auth/login|logout`, `GET /api/auth/me`
- 现状：符合认证接口预期。
- 落点：维持。
- 优先级：P2。

## 5. 实现建议（ncn-web 落地顺序）

### 5.1 新增统一授权层

建议新增：`src/middleware/authorization.ts`

核心函数建议：
- `requireRoles(...roles)`
- `loadNCNByRowId/SerialNo`（挂载到 `req`）
- `canEditNCN(entry, user)`
- `canEditAction(action, user)`
- `canCloseAction(action, user)`
- `canDeleteAction(action, user)`
- `canQEClose(entry, user)`

### 5.2 角色来源建议

- 先实现：运行时关系角色（`QE_OWNER/ACTION_OWNER/ENTRY_OWNER`）即可覆盖大部分场景。
- 再补：系统角色 `NCN_ADMIN`。
  - 可选 A：`Code_Table` 新增角色类目并缓存。
  - 可选 B：新增 `NCN_Role_Member` 表（推荐，结构清晰）。

### 5.3 最小可发布（MVP）

第一批 P0 必做：
- `GET /api/ncn` 加 `isAuthenticated`。
- `PUT /api/entry/:rowid` 加 `canEditNCN`。
- `PUT /api/action/:rowid`、`/close`、`DELETE` 加 action 级授权。
- `POST /api/issuelog/:ncnId/qe-close` 加 QE/Admin 校验。
- `POST /api/upload` 与 `GET /api/upload/download` 加资源归属 + 路径约束。
- `POST /api/auth/test-ldap` 限制到开发环境或管理员。

## 6. 验收用例（建议）

最少覆盖以下负向测试（应返回 `403`）：

1. 普通登录用户关闭他人 Action。
2. 普通登录用户删除任意 Action。
3. 非 QE 用户调用 `qe-close`。
4. 普通登录用户修改他人 NCN 主档。
5. 登录用户下载 upload 根目录外文件。
6. 未登录用户访问 `GET /api/ncn`。

---

如果你确认这版矩阵口径，我下一步可以直接按 P0 清单在 `ncn-web` 里补齐中间件和路由接入，并配 1 组最小鉴权测试。