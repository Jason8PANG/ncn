# NCN 附件下载入口修复 — 部署说明

**提交**：`master` 分支，共 2 个 commit
- `a0e5017` 前端附件下载入口修复
- 后续 commit：`docker-compose.yml` 补传 `JWT_SECRET`

**改动范围**：
- 前端代码修复 → **只需重新发布前端**，`ncn-web` 容器**不需要**重建
- `docker-compose.yml` 补传变量 → 这一步**另算**（见第五节），只有你决定修 JWT_SECRET 时才需要 `docker compose up -d --build ncn-web`

**预计耗时**：前端 3–5 分钟（服务器端构建，node_modules 已就绪）

---

## 一、这次改了什么

| 文件 | 改动 |
|---|---|
| `ncn-frontend/src/utils/attachment.ts` | **新增**。附件下载与文件名提取的统一实现（`downloadAttachment` / `extractFileNameFromPath`），并改善错误提示（blob 错误体解析） |
| `ncn-frontend/src/pages/NCNList.tsx` | **NCN 列表「Att」列的回形针从静态图标改为可点击按钮**，点击直接下载附件；Tooltip 由 `Has attachment` 改为 `Download attachment`；列宽 45 → 55 |
| `ncn-frontend/src/pages/NCNEntry.tsx` | 删除页内重复的下载实现，改用 `utils/attachment` 共享方法（行为不变） |

**修复的问题**：原先 NCN 列表里的回形针只是一个提示图标，**没有任何点击事件**，点它没反应 → 用户以为"附件无法下载"。
（后端与文件存储经全量实测 2360/2361 正常，详见 `docs/NCN附件下载问题诊断报告.md`）

## 二、部署步骤

### 1. 拉代码

```bash
cd /root/ncn
git pull
```

> 服务器到 GitHub 偶发瞬时 `Could not resolve host`，重试 1–2 次即可。

确认拉到本次提交：

```bash
git log --oneline -1
```

### 2. 构建前端

服务器已具备 node v22.22.3 + npm 10.9.8，且 `node_modules` 已安装（518M），直接构建：

```bash
cd /root/ncn/ncn-frontend
npm run build
```

产物在 `dist/`。确认新增文件已产出：

```bash
ls -la dist/assets/
# 应看到一个新的 index-XXXXXXXX.js（hash 会变）
```

### 3. 发布到 nginx 目录

**注意：`/var/www/ncn/assets` 会无限累积旧 bundle（现在已堆了 8 个共 25MB），这次顺手清掉。**

```bash
# 3.1 备份（可选，但建议）
cp -r /var/www/ncn /var/www/ncn.bak.$(date +%Y%m%d_%H%M)

# 3.2 清空旧产物并发布
rm -rf /var/www/ncn/assets
mkdir -p /var/www/ncn/assets
cp -r /root/ncn/ncn-frontend/dist/* /var/www/ncn/

# 3.3 属主 + SELinux 上下文（**漏掉第 2 条会 403**）
chown -R nginx:nginx /var/www/ncn
chcon -R -t httpd_sys_content_t /var/www/ncn
restorecon -R /var/www/ncn
```

### 4. 验证（必做）

```bash
# 4.1 index.html 是否指向新 bundle
curl -s http://127.0.0.1/ -H "Host: ncnapp" | grep -o '/assets/index-[^"]*'

# 4.2 新 bundle 里是否真的有新逻辑（旧文案应为 0，新文案应为 1）
NEW=$(curl -s http://127.0.0.1/ -H "Host: ncnapp" | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
echo "当前 bundle: $NEW"
curl -s "http://127.0.0.1$NEW" -H "Host: ncnapp" -o /tmp/b.js
grep -c 'Download attachment' /tmp/b.js     # 期望 ≥ 1
grep -c 'Has attachment'      /tmp/b.js     # 期望 0
grep -c 'upload/download'     /tmp/b.js     # 期望 1

# 4.3 附件接口本身仍正常（返回 401 是对的——说明路由存在、只是没带登录 cookie）
curl -s -o /dev/null -w "download api => HTTP %{http_code}\n" -H "Host: ncnapp" \
  "http://127.0.0.1/api/upload/download?filePath=%5C%5Csuzvfile02%5CTaskManager%5CNCN_NCN2609043.jpg"

# 4.4 清理临时文件
rm -f /tmp/b.js
```

### 5. 浏览器强制刷新

**Ctrl + F5**（bundle 文件名带 hash 会自动更新，一般无需强刷；若页面异常再强刷一次）

## 三、验收清单

| # | 操作 | 预期 |
|---|---|---|
| 1 | 打开 NCN 列表 | 有附件的行，Att 列显示蓝色回形针，鼠标悬停提示 **Download attachment**，光标变手型 |
| 2 | **点击回形针** | **直接下载附件；页面不跳转**（已 `stopPropagation`） |
| 3 | 打开任一 NCN 编辑页（列表里点铅笔）→ 滚到 Attachments 区 | Download / Delete 按钮仍在，点击 Download 正常下载 |
| 4 | 无附件的行 | Att 列为空；点了没反应（正常） |
| 5 | 抽查 3 个不同扩展名（jpg / pdf / xlsx） | 都能下载且能正常打开 |

## 四、回滚

```bash
rm -rf /var/www/ncn
mv /var/www/ncn.bak.<你备份时的时间戳> /var/www/ncn
chcon -R -t httpd_sys_content_t /var/www/ncn
```

---

# 五、另：P0 安全修复（JWT_SECRET）— ✅ 已执行

> **状态：已在 2026-09-22 完成并验证。** 容器内已拿到 64 位密钥
> `JWT_SECRET=fe2b27f8...969df0`，用旧的公开默认密钥自签 JWT 请求
> `/api/entry/owner/options` 返回 **401**（修复前是可正常通过的 200）。
> 下面保留完整步骤备查。

**这个不在本次代码提交里，需要改服务器配置。**

## 问题

`ncn-web` 容器没有 `JWT_SECRET` 这个环境变量，代码于是回落到硬编码的公开默认值：

```ts
// ncn-web/src/config/index.ts
secret: process.env.JWT_SECRET || 'ncn-jwt-secret-change-in-production',
```

源码在 GitHub 上 → **任何人都能用这个默认值伪造任意用户（含 Admin）的登录 cookie，绕过 LDAP 直接进系统**。已实测验证可利用。

## 修复步骤

```bash
# 1. 备份并生成强密钥写入 .env
cd /root/ncn
cp .env .env.bak.$(date +%Y%m%d_%H%M)
NEW_SECRET=$(openssl rand -hex 32)
grep -q '^JWT_SECRET=' .env && sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_SECRET|" .env || echo "JWT_SECRET=$NEW_SECRET" >> .env
grep '^JWT_SECRET=' .env    # 确认已写入，长度应为 64
```

**2. `docker-compose.yml` 里补传变量 —— 已随代码提交，`git pull` 后就位，不用手改。**

```yaml
      # （已在仓库中）
      - JWT_SECRET=${JWT_SECRET}
```

> 此前 compose **完全没有把这个变量传给容器**，所以哪怕 `.env` 里写了也不会生效。
> 这是本次一并修掉的根因。

```bash
# 3. 确认 compose 能正确解析出值（应看到 JWT_SECRET: <64位十六进制>，且无 "not set" 警告）
cd /root/ncn && docker compose config | grep -A1 JWT_SECRET

# 4. 重建后端
cd /root/ncn && docker compose up -d --build ncn-web

# 5. 验证容器里已拿到真实值（长度应为 64，且不是 ncn-jwt-secret-change-in-production）
docker inspect ncn-web --format '{{json .Config.Env}}' | tr ',' '\n' | grep JWT_SECRET

# 6. 验证服务健康
docker compose ps ncn-web
curl -s http://127.0.0.1:7000/api/health
```

### ⚠️ 只加 compose 那行是**不够的**

`JWT_SECRET` 在 `.env` 里为空白时，容器会拿到 `JWT_SECRET=`（空字符串），
代码里 `process.env.JWT_SECRET || '默认值'` 仍是**假值** → **继续用公开默认密钥，漏洞依旧**。

**必须 `.env` 里确实写入了真实值（第 1 步）。** 第 5 步的验证就是用来确认这一点的。

## ⚠️ 副作用（务必提前通知用户）

换密钥后，**所有已签发的登录 cookie 立即失效，全部用户需要重新登录一次**（有效期为 30 天，所以影响面 = 所有当前在用的用户）。

**建议在非工作时段执行，或提前在企业群里通知。**

## 为什么之前一直没人发现

两个原因叠加：
1. 容器里配了 `SESSION_SECRET`（历史上用 session 认证时留下的），看起来"密钥已经配了"，容易误判——而 JWT 用的是另一个变量名 `JWT_SECRET`。
2. **`docker-compose.yml` 的 `environment` 列表里根本没有 `JWT_SECRET`**，即使当时有人往 `.env` 里加过，也不会传进容器。

`.env.example` 里其实是写了 `JWT_SECRET=your-jwt-secret-key-here` 的，只是没人对照检查实际部署。


---

# 六、附：其他待清理项（非阻塞）

| 项 | 说明 |
|---|---|
| `/root/ncn/ncn-frontend/` 下有 8 个垃圾文件 | `-H`、`-d`、`Accept:`、`Content-Length:`、`Content-Type:`、`Host:`、`POST`、`User-Agent:` —— 之前某次 curl 命令写错产生的。可 `cd /root/ncn/ncn-frontend && rm -f -- -H -d 'Accept:' 'Content-Length:' 'Content-Type:' 'Host:' 'POST' 'User-Agent:'` |
| `NCN2411078` 附件缺失 | DB 记的文件名 `NCN_NCN2411078.5QAC00005 8D ...report(Rev 11)` 在共享盘上不存在（历史附件原始名无合法扩展名）。需手工重传附件 |
| `docker-compose.yml` 里的 `ncn-frontend` 容器 | 定义了但从未运行，线上实际由宿主机 nginx（`/var/www/ncn`）提供服务 → 容易误判部署方式，建议清理或加注释 |

---

# 七、变更记录（同一套部署流程）

后续前端小改动沿用**第二节**的发布步骤（`npm run build` → 覆盖 `/var/www/ncn` → `chown`/`chcon`/`restorecon`）。

| commit | 变更 |
|---|---|
| `a0e5017` | NCN List「Att」列回形针改为可点击下载 |
| `2fd98eb` | `docker-compose.yml` 补传 `JWT_SECRET` |
| 本次 | **Owner 显示姓名**（见下） |

## 本次：Owner 显示姓名

**问题**：NCN 编辑页「Owner / 责任人」下拉的标签是 `lanId - 姓名`（如 `huayun.zhou - 周华云`），
账号在前、字符串长，在 `Col span={6}` 的窄字段里被截断。NCN List 的 Owner 列也是直接显示账号。

**改动**（`ncn-frontend/src/pages/NCNEntry.tsx`、`NCNList.tsx`）：

| 位置 | 改前 | 改后 |
|---|---|---|
| NCNEntry Owner 下拉 label | `${lanId} - ${name}` | **`姓名`**（姓名为空时退回账号） |
| NCNEntry Owner 下拉搜索 | 只能按账号 | **姓名或账号都能搜**（`filterOption`） |
| NCNEntry Owner 下拉字号 | 14px | **13px**（姓名较长时也能完整显示） |
| NCNEntry Owner 下拉 disabled | `form.getFieldValue('OwnerDept')`（render 期取值，不响应式） | `Form.useWatch('OwnerDept', form)`（响应式） |
| NCNEntry Owner 回填 | `ownerOptions.find(o => o.label.startsWith(lanId))` —— 读的是**旧 state**，且依赖 label 文案 | 用 `loadOwnerOptions` **返回值**按 `value` 精确匹配，大小写不敏感 |
| NCN List Owner 列 | 直接显示账号 `huayun.zhou` | 显示**姓名**，映射不到时回退显示账号 |

**数据来源**：`GET /api/entry/owner/options` → 已返回 `{ lanId, name }`，**无需改后端**。
`NCN_Entry.Owner` 里存的仍是 lanId，**入库值不变**，只是显示层换成姓名。

**已知边界**：
- 该接口只返回**在职**员工（`Leave_Date IS NULL`）。若某条历史 NCN 的责任人已离职，
  下拉里找不到 → 编辑页保留原 lanId 显示（不会清空数据），列表里回退显示账号。
- 同名不同人极罕见；如需区分，下拉里搜索账号即可精确定位。

**验证**：`tsc --noEmit` 通过，产物 `index-DU6wG2FO.js` 中确认
`label: name || lanId`、`filterOption`、`fontSize:13`、`useWatch` 均已生效。

**未改动**：`IssueLog.tsx` 的「Action Owner」下拉**仍是** `lanId - 姓名`（写法相同）。

---

## 本次（更新）：筛选保持 + Owner 显示账号 + NCN Action 标识

> ⚠️ **这一批同时改了后端**（`ncn-web/src/routes/ncn.routes.ts`），
> 所以**必须重建 ncn-web 容器**，不能只发前端。

### 1. NCN List 筛选条件不再丢失

**问题**：设好筛选 → 点编辑进 NCN Entry → 返回 NCN List，筛选条件全被清空，要重选一遍。

**根因**：`NCNList` 的 `Form` 实例是组件局部的，组件卸载即销毁；`useEffect(..., [])`
挂载时固定执行 `handleSearch({})`，所以每次回来都是「查全部 + 空表单」。

**改法**：把筛选条件存进 **sessionStorage**（`ncn-list:filter`）
- `handleSearch` 每次执行前 `saveFilter(values)`
- 挂载时 `loadSavedFilter()` → 有则 `form.setFieldsValue()` 回填表单并直接用该条件查询
- `Reset` 按钮额外 `clearSavedFilter()` + 回到第 1 页
- `dayjs` 的 `dateRange` 序列化成 ISO 字符串，读回时还原成 `dayjs` 对象（否则 RangePicker 显示不出来）

**为什么用 sessionStorage 而不是 URL query**：返回列表的入口有多处
（NCN Entry 的 `Back to List`、保存后 `navigate('/ncn-list')`、侧边栏菜单），
它们都不带 query，只有本地存储能覆盖全部返回路径。sessionStorage 按标签页隔离，关标签页自动清。

> 注：**页码 (currentPage) 不持久化**，回来仍从第 1 页开始。需要一起记忆的话说一声。

### 2. Owner 改回显示账号（lanId），不显示姓名

| 位置 | 改前 | 改后 |
|---|---|---|
| NCN List「Owner」列 | 姓名（`周华云`） | **账号 `huayun.zhou`**（直出原值） |
| NCN Entry「Owner / 责任人」下拉 | 姓名（`周华云`） | **账号 `huayun.zhou`** |
| NCN List 的 Owner 筛选下拉 | `姓名 (账号)` | `账号 - 姓名` |

依据：`NCN_Action_Detail.ActionOwner` 里存的就是纯账号（实测样例 `ju.wang`/`Cathy.lu`），
NCN Action 页的 Action Owner 列也是直接显示该原值 → 两处显示口径统一。

**姓名没有丢**：仍留在下拉 option 的 `name` 字段里，`filterOption` 支持
「输账号」或「输姓名」都能搜到；入库值一直是 lanId，数据库未动。

`fontSize: 13` 保留（账号较长时字段内可完整显示）。

### 3. 「Issue Log」→「NCN Action」+ 已维护标识

**文字改名**（仅页面文案，**未动数据库、未动路由 `/issue-log/:id`**）：

| 位置 | 改前 | 改后 |
|---|---|---|
| NCN Action 页标题 | `Issue Log - NCN {id}` | `NCN Action - NCN {id}` |
| NCN Entry 页按钮 | `Log Issue` | `NCN Action` |

**新增「Act」列**：在 NCN List 的 `Att` 列右边，宽 50，居中。
该 NCN 在 `NCN_Action_Detail` 里有记录时显示**绿色实心勾**，Tooltip `NCN Action maintained`；没有则不显示。

**后端改动**（`ncn.routes.ts` 列表接口）：
```ts
// 一次取全部 DISTINCT NCN_ID，再内存比对，避免逐行 COUNT 的 N+1 查询
const actionRows = await NCN_Action_Detail.findAll({
  attributes: ['NCN_ID'], group: ['NCN_ID'], raw: true
});
const ncnIdsWithAction = new Set(actionRows.map(r => Number(r.NCN_ID)));
// 每条 entry 补一个 HasAction 布尔字段
```
关联依据（实测）：`NCN_Action_Detail.NCN_ID` → `NCN_Entry.ROWID`，
23918 行 Action 中 23899 行能匹配上（19 行为孤儿数据），
**11642 个 NCN 已维护过 Action**。

**未改**：`ncn-web/src/utils/email.ts:191-192` 的通知邮件里仍写着
`Click below to view Issue Log:` / `Open Issue Log →`。
邮件链接（`issueLogUrl`）用的还是 `/issue-log/...` 路由，**功能不受影响**，只是文案没改名。
要不要一起改，说一声。

### 4. 左侧菜单默认收起

`ncn-frontend/src/components/MainLayout.tsx`：

```diff
- const [collapsed, setCollapsed] = useState(false);   // 默认展开
+ const [collapsed, setCollapsed] = useState(true);    // 默认收起
```

- 默认只显示图标（Sider 宽 80px，顶部 logo 显示 `NCN`）
- 点击 Header 左上角的图标（收起时是 `MenuUnfoldOutlined` ⇨）展开
- 仅在**整页刷新**时回到收起状态；在应用内路由跳转（列表 ↔ 编辑）不会重置，
  因为 `MainLayout` 是布局组件、不会卸载

> 没做持久化（没往 localStorage/sessionStorage 存折叠状态）。
> 如果需要「记住上次展开/收起」，说一声。

### 5. NCN List 的 SBU 列宽 150 → 120

`NCNList.tsx` 的 SBU 列（`dataIndex: 'SBU_Des'`）宽度由 150 收到 **120**。

依据（实测 `NCN_Entry.SBU_Des` 取值）：

| 取值 | 行数 | 字符数 |
|---|---|---|
| SBU1 | 9987 | 4 |
| SBU2 | 1625 | 4 |
| Penang Plant | 872 | 12 |
| PLANT2 | 624 | 6 |
| Medical-HMLV | 5 | 12 |
| Industrial | 4 | 10 |

最长 12 字符，93% 的行 ≤6 字符 → 120 够用，且不再留大片空白。

> 未对 SBU 列加 `ellipsis`。如果现场发现 `Penang Plant` 偶尔被截断，可
> 调回 130 或加 `ellipsis: { showTitle: false }` + Tooltip（同 Defect Description 列写法）。

### 6. NCN List 默认每页 10 条

`NCNList.tsx`：`useState(50)` → `useState(10)`。

`pagination` 的 `showSizeChanger: true` 保持不变，用户仍可手动切 10 / 20 / 50 / 100
（antd 默认 `pageSizeOptions` 就含这四档）。





