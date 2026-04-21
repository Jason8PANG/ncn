# ncn-web 字段级接口契约清单

## 1. 目的与适用范围

本清单把 legacy `NCN_Action/NCN_Entrys/NCN_Issue_log` 的字段逻辑，直接映射到 `ncn-web` 接口层，作为实现和联调基线。

适用字段：

- `NCN_Type`
- `SerialNo`
- `SBU` / `SBU_Des`
- `Finder` / `Finder_Dept` / `Finder_Date`

相关路由文件：

- `src/routes/entry.routes.ts`
- `src/routes/ncn.routes.ts`
- `src/routes/action.routes.ts`
- `src/routes/issuelog.routes.ts`

---

## 2. 字段定义契约

## 2.1 `NCN_Type`

字段语义：NCN 类型，决定闭单策略。

数据约束：

- 类型：`string`
- 允许值：`A` / `F` / `P` / `L` / `B`（建议后端枚举校验）
- 必填：创建必填，更新可改但需权限

业务规则：

- 当某 NCN 的全部 Action 均为 `Closed`：
  - `NCN_Type == A` 时可自动闭单。
  - 其他类型走 QE close 流程。

---

## 2.2 `SerialNo`

字段语义：NCN 业务编号。

数据约束：

- 类型：`string`
- 格式：`^NCN\d{7}$`（如 `NCN2604001`）
- 必填：创建必填（当前后端允许前端传入）

业务规则：

- 建议服务端统一生成，避免并发冲突。
- 组合唯一建议：`(NCN_Type, SerialNo)` 或直接 `SerialNo` 唯一（按业务决定）。

---

## 2.3 `SBU` / `SBU_Des`

字段语义：SBU 组织维度及描述。

数据约束：

- `SBU`: `string`，创建必填
- `SBU_Des`: `string`，创建必填

业务规则：

- 选项来源：`Code_Table` (`Code_Category = ProjectCode_SBU`)。
- 推荐由后端提供“标准选项 + 描述映射”，前端仅做展示。

---

## 2.4 `Finder` / `Finder_Dept` / `Finder_Date`

字段语义：提报人、提报部门、提报日期。

数据约束：

- `Finder`: `string`，创建必填
- `Finder_Dept`: `string`，创建必填
- `Finder_Date`: `date string`（推荐 `YYYY-MM-DD`）创建必填

业务规则：

- 写入 `Finder_Date` 后同步计算：
  - `Week`
  - `Month`
- 查询筛选支持：`Finder_Dept` + `dateFrom/dateTo`。

---

## 3. 字段级接口契约（按端点）

## 3.1 创建 NCN

接口：`POST /api/entry`

请求字段（本清单范围内）：

- `NCN_Type`：必填，枚举校验
- `SerialNo`：必填，格式校验
- `SBU`：必填
- `SBU_Des`：必填
- `Finder`：必填
- `Finder_Dept`：必填
- `Finder_Date`：必填，合法日期

服务端行为：

- 校验必填字段。
- 校验 `SerialNo` 唯一冲突（当前已有）。
- 从 `Finder_Date` 衍生 `Week`、`Month`。
- 初始化 `Status = On-going`。

响应契约：

- `success: true`
- `data` 返回落库后的 `NCN_Entry`，包含上述字段。

权限契约：

- `isAuthenticated`
- `canCreateNCN`（当前默认已登录可创建）

---

## 3.2 更新 NCN 主档

接口：`PUT /api/entry/:rowid`

请求字段（允许更新范围）：

- 允许：`NCN_Type`, `SBU`, `SBU_Des`, `Finder`, `Finder_Dept`, `Finder_Date`
- 禁止：闭单字段（`CloseBy`, `CloseDate`）及越权状态字段（建议后端白名单过滤）

服务端行为：

- 若 `Status == Closed`，拒绝修改。
- 若包含 `Finder_Date`，重算 `Week`、`Month`。
- 更新 `UpdateBy/UpdateDate`。

响应契约：

- `success: true`
- `data` 返回更新后的 `NCN_Entry`。

权限契约：

- `isAuthenticated`
- `canEditNCNEntry(req, entry)`

---

## 3.3 查询 NCN 列表（字段筛选）

接口：`GET /api/ncn`

查询参数（本清单范围内）：

- `ncnType` -> `NCN_Type` 枚举匹配（A/F/P/L/B）
- `serialNo` -> `SerialNo` 精确匹配，格式必须为 `NCN` + 7 位数字
- `sbu` -> `SBU` 单值精确匹配
- `sbuList` -> `SBU` 多值精确匹配（支持 `a,b,c` 或重复参数）
- `finderDept` -> `Finder_Dept` 精确匹配
- `dateFrom/dateTo` -> `Finder_Date` 区间，格式必须为 `YYYY-MM-DD`

响应契约：

- `success: true`
- `data.entries[]` 每项至少包含：
  - `NCN_Type`
  - `SerialNo`
  - `SBU`
  - `SBU_Des`
  - `Finder`
  - `Finder_Dept`
  - `Finder_Date`

权限契约：

- `isAuthenticated`（已接入）

---

## 3.4 查询 NCN 详情

接口：`GET /api/ncn/:serialNo`

响应契约（本清单范围内）：

- 返回字段应完整包含：
  - `NCN_Type`
  - `SerialNo`
  - `SBU`
  - `SBU_Des`
  - `Finder`
  - `Finder_Dept`
  - `Finder_Date`

权限契约：

- `isAuthenticated`
- 如后续需要数据域隔离，可增加 `canViewNCN`

---

## 3.5 QE 闭单流程

接口：`POST /api/issuelog/:ncnId/qe-close`

字段关联规则：

- 依赖 `NCN_Type` 决定闭单行为：
  - 非 `A`：该接口执行 QE close
  - `A`：通常由 action 全闭自动关闭（见 `action.routes.ts`）

服务端行为：

- 必须先确保 Action 全部关闭。
- 更新 `Status/CloseBy/CloseDate`（按现有逻辑）。

权限契约：

- `isAuthenticated`
- `canQECloseNCN(req, entry)`（QE_OWNER 或 ADMIN）

---

## 4. 字段状态机与一致性约束

状态机（简化）：

- `On-going` -> `Tracking` / `Reject` / `Closed`

与字段联动：

1. `NCN_Type` 与闭单路径联动：
- `A` 型可走自动闭单。
- 非 `A` 型要求 QE 关单。

2. `Finder_Date` 与时间维度联动：
- 变更 `Finder_Date` 必须重算 `Week/Month`。

3. `SerialNo` 与跨页面定位联动：
- 所有与 NCN 详情相关接口应支持以 `SerialNo` 回溯主单。

4. `SBU` 与维度筛选联动：
- 列表筛选建议支持数组 `sbu[]`（后续优化），避免字符串 contains 歧义。

---

## 5. 字段校验与错误码建议

统一建议：

- `400 Bad Request`：字段缺失、格式错误、枚举非法
- `401 Unauthorized`：未登录
- `403 Forbidden`：有登录但无字段/资源操作权限
- `404 Not Found`：NCN 不存在
- `409 Conflict`：`SerialNo` 冲突

关键错误文案建议：

- `Invalid NCN_Type`
- `Invalid SerialNo format`
- `Finder_Date is required`
- `Forbidden - No permission to edit this NCN entry`

---

## 6. 实施检查清单（开发/测试）

开发检查：

1. `POST /api/entry` 增加 `NCN_Type` 枚举与 `SerialNo` 格式校验。
2. `PUT /api/entry/:rowid` 增加字段白名单，禁止越权字段更新。
3. `GET /api/ncn` 统一 `Finder_Date` 参数格式处理（推荐 `YYYY-MM-DD`）。
4. 文档化 `NCN_Type` 闭单语义，避免前后端理解偏差。

测试检查：

1. `NCN_Type = A` 且 action 全关时应自动闭单。
2. 非 `A` 类型必须通过 QE close 才闭单。
3. 非法 `SerialNo` 创建应返回 `400`。
4. 修改 `Finder_Date` 后 `Week/Month` 应同步变化。
5. 未授权用户修改上述字段应返回 `403`。
