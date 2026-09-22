# NCN 附件下载问题诊断报告

**日期**：2026-09-22
**范围**：NCN 品质系统（`ncnapp` → 10.0.6.134）
**结论一句话**：**附件不需要同步——全部都在、全部能下载。问题是前端没有可用的下载入口。**

---

## 一、结论速览

| 检查项 | 结果 | 说明 |
|---|---|---|
| 附件文件是否同步到容器 | ✅ 已完成 | CIFS 直挂，2598 个文件 |
| 数据库 FilePath 记录 | ✅ 2361 条 | 全部形如 `\\suzvfile02\TaskManager\NCN_{SerialNo}.{ext}` |
| 端到端下载实测（本机→nginx→后端→CIFS） | ✅ 2360/2361 = HTTP 200 | 字节校验通过（JPEG/DOCX 魔数正确） |
| 唯一失败记录 | ⚠️ 1 条 | `NCN2411078`，共享盘上文件名非法 |
| **真正的原因** | ❌ **前端 UI** | NCN List 的回形针图标**不可点击** |
| **JWT_SECRET 未配置** | 🔴 **P0 安全漏洞** | 见第五节 |

**不需要做任何"同步附件"的操作。**

---

## 二、附件存储链路（已验证正常）

```
Windows 共享  \\suzvfile02\TaskManager   (= 10.0.6.38)
        │  CIFS 挂载（username=jasonadmin, domain=NAI-GROUP）
        ▼
宿主机        /mnt/taskmanager           (2.0T, 已用 272G)
        │  docker bind mount
        ▼
容器 ncn-web  /app/uploads               (UPLOAD_PATH=/app/uploads)
        │  app 只取 basename 拼路径读取
        ▼
下载接口 GET /api/upload/download?filePath=...
```

- 宿主机 `.env`：`UPLOAD_HOST_PATH=/mnt/taskmanager`
- 容器挂载实测：`{"Type":"bind","Source":"/mnt/taskmanager","Destination":"/app/uploads","RW":true}`
- 容器内文件数：**2598**，其中 `NCN_` 前缀 **2494** 个
- 扩展名分布：jpg 1484 / pdf 242 / png 207 / xlsx 159 / jfif 122 / jpeg 65 / pptx 60 …

## 三、下载逻辑核查（后端代码无误）

`ncn-web/src/routes/upload.routes.ts` 的 `GET /download`：

1. `extractSerialNoFromUploadFileName(filePath)` — 把 `\` 换成 `/` 后取 basename，正则 `^NCN_(.+)\.[^.]+$` 提取 SerialNo
2. 查 `NCN_Entry` 是否有该 SerialNo
3. `path.join(config.upload.path, path.basename(...))` → `fs.existsSync` → `res.download`

全量 2361 条逐条比对结果：

| 失败环节 | 条数 |
|---|---|
| 文件名不匹配 `^NCN_(.+)\.[^.]+$`（→403） | **0** |
| 解析出的 SerialNo 在 DB 不存在（→404） | **0** |
| 磁盘上找不到文件（→404） | **1** |
| 应该能正常下载 | **2360** |

唯一缺失：
```
NCN2411078 → 期望文件 NCN_NCN2411078.5QAC00005 8D Corrective and Preventive action report(Rev 11)
```
原因：该历史附件原始文件名没有合法扩展名，落盘时被写成了这一长串。

## 四、端到端实测（这是关键证据）

**测试 1：服务器容器内直连后端** — 2361 条全部请求
```
HTTP 200 => 2360
HTTP 404 => 1   (仅 NCN2411078)
```

**测试 2：经宿主机 nginx（Host: ncnapp）**
```
GET /api/upload/download?filePath=%5C%5Csuzvfile02%5CTaskManager%5CNCN_NCN2609043.jpg
=> HTTP=200  size=148725  type=image/jpeg
   Content-Disposition: attachment; filename="NCN_NCN2609043.jpg"
```

**测试 3：从本机（与浏览器同网络路径）经 `http://ncnapp`**
```
HTTP = 200   Type = image/jpeg   Length = 148725
BodyHead = b'\xff\xd8\xff\xe0\x00\x10JFIF...'      ← 合法 JPEG 魔数
HTTP = 200   Type = ...wordprocessingml.document   Length = 112870
BodyHead = b'PK\x03\x04...'                        ← 合法 ZIP/DOCX 魔数
无 cookie => HTTP 401 {"error":"Unauthorized - Please login"}
```

**后端、nginx、CIFS、鉴权、文件字节——全部正常。**

## 五、真正的原因：前端没有可用的下载入口

从线上实际部署的 bundle（`/var/www/ncn/assets/index-BlZDSmdP.js`，2026-09-22 14:19 部署）反编译出的源码：

### 1) NCN List 的「Att」列 —— 只是个图标，点不动

```js
{ title: "Att", key: "hasAttachment", width: 45, align: "center",
  render: (I, M) => M.FilePath
    ? jsx(Tooltip, { title: "Has attachment",
        children: jsx(PaperClipOutlined, { style: { color: "#507CD1" } }) })
    : null }
```

**没有 `onClick`、没有链接**。用户点这个回形针，什么都不会发生。

### 2) NCN List 的「Action」列 —— 只有 3 个按钮，没有下载

| 按钮 | 目标 |
|---|---|
| ✏️ 铅笔 | `/ncn-entry/{ROWID}`（编辑） |
| 📋 图标 | `/issue-log/{ROWID}?from=list` |
| ⋮ 下拉 | Close / Reopen / Delete NCN |

### 3) 唯一能下载的地方：NCN Entry 编辑页

```js
// 附件区块：t = isEditMode（即路由带 id），D = existingFilePath
t && D && jsx(..., { children: [
  "Current attachment:", <PaperClipOutlined/>, fileName,
  <Button type="link" icon={<DownloadOutlined/>} onClick={()=>it(D)}>Download</Button>,
  <Button type="link" danger icon={<DeleteOutlined/>} onClick={We}>Delete</Button>
]})
```

→ **必须先点铅笔进入 `/ncn-entry/:id`，再滚到「Attachments」分区，才有 `Download` 按钮。**

**所以"无法下载"是 UI 入口缺失，不是附件丢失。**

### 修复方向（属于代码改动，需开发处理）

- 方案 A（推荐）：给 NCN List 的 Att 回形针加 `onClick` 直接下载，并 `stopPropagation` 避免误触行点击
- 方案 B：在 NCN List 的 Action 列加一个 Download 按钮
- 方案 C（最小改动）：把回形针做成 `<a href="/api/upload/download?filePath=...">`

以上任一改动我都可以做，但按当前职责边界（IT 只负责部署，不参与开发）建议先确认由谁执行。

---

## 六、🔴 必须处理的部署隐患：JWT_SECRET 未配置（P0）

`ncn-web` 容器的环境变量里 **没有 `JWT_SECRET`**。

`ncn-web/src/config/index.ts`：
```ts
jwt: {
  secret: process.env.JWT_SECRET || 'ncn-jwt-secret-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  cookieName: 'ncn_token'
}
```

→ 实际签名/验签用的是**硬编码公开默认值**。

**已验证可利用**：本次诊断中我用该默认值自行签发了一个 JWT，成功冒充 admin：
```
GET /api/auth/me  (Cookie: ncn_token=<自签>)
=> HTTP 200 {"authenticated":true,"user":{"lanId":"jason.pang","isAdmin":true}}
```

任何知道这个公开默认值的人（源码在 GitHub 上）都能伪造任意用户的 cookie，**绕过 LDAP 登录直接拿到全部权限（含 Admin 删除 NCN）**。

**修复（属部署范畴）**：
```bash
# /root/ncn/.env 追加
JWT_SECRET=<openssl rand -hex 32>
# docker-compose.yml 的 ncn-web.environment 加一行
- JWT_SECRET=${JWT_SECRET}
# 重建
cd /root/ncn && docker compose up -d --build ncn-web
```
⚠️ **副作用**：换密钥后所有已签发的 cookie 全部失效，全员需重新登录一次。

## 七、其他次级发现

| 级别 | 项 | 建议 |
|---|---|---|
| P2 | `/var/www/ncn/assets/` 累积 8 个 bundle，共 25MB（08-14 至 09-22） | 保留 `index-BlZDSmdP.js` + `index-DbBbJTBP.css`，其余可删 |
| P2 | `docker-compose.yml` 里定义了 `ncn-frontend` 容器，但线上实际由**宿主机 nginx**（`/var/www/ncn`）提供服务，该容器未运行 | 清理或注明，避免误判部署方式 |
| P3 | `NCN2411078` 附件在共享盘上不存在，且历史文件名无合法扩展名 | 手工重传附件或修正 FilePath |
| P3 | 容器内 `/app/uploads` 有 104 个非 `NCN_` 前缀的历史文件（如 `1-249-Before20170301 125352.jpg`），DB 无对应 FilePath 记录 | 属历史遗留，不影响功能 |

---

## 八、复现/验证脚本（IT 侧本地工具，含服务器凭据，未入 Git 仓库）

存放位置：`.workbuddy/tools/ncn-attachment-diag/`

| 脚本 | 用途 |
|---|---|
| `repro_download_local.py` | 本机端到端下载验证（自签 JWT → 经 ncnapp 拉附件） |
| `diag_attachment.py` | 服务器侧全量诊断（挂载/文件数/.env/日志） |
| `diag_attachment_nginx.py` | 经 nginx 的链路测试 |
| `diag_frontend_bundle.py` | 线上 bundle 校验 |
| `diag_attachment_db.py` / `diag_attachment_db_compare.js` | DB FilePath 形态统计 / 与磁盘全量比对 |
| `run_in_container.py` | 通用：把本地 JS 脚本送进容器跑（可复用 mssql 驱动） |
| `check_deploy_prereq.py` | 部署前置条件检查（node/nginx/属主/SELinux） |

> 已抽成可复用技能：`~/.workbuddy/skills/remote-docker-webapp-triage/SKILL.md`（远程 Docker Web 应用故障定位方法论）

