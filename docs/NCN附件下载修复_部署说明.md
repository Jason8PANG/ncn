# NCN 附件下载入口修复 — 部署说明

**提交**：见本次 commit（`master` 分支）
**改动范围**：**仅前端**。后端 `ncn-web` 无改动，**不需要重建容器**。
**预计耗时**：3–5 分钟（服务器端构建，node_modules 已就绪）

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

# 五、另：P0 安全修复（JWT_SECRET）— 建议单独安排一次

**这个不在本次代码提交里，需要改服务器配置。** 请确认要不要做。

## 问题

`ncn-web` 容器没有 `JWT_SECRET` 这个环境变量，代码于是回落到硬编码的公开默认值：

```ts
// ncn-web/src/config/index.ts
secret: process.env.JWT_SECRET || 'ncn-jwt-secret-change-in-production',
```

源码在 GitHub 上 → **任何人都能用这个默认值伪造任意用户（含 Admin）的登录 cookie，绕过 LDAP 直接进系统**。已实测验证可利用。

## 修复步骤

```bash
# 1. 生成强密钥并写入 .env
cd /root/ncn
cp .env .env.bak.$(date +%Y%m%d_%H%M)
NEW_SECRET=$(openssl rand -hex 32)
grep -q '^JWT_SECRET=' .env && sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_SECRET|" .env || echo "JWT_SECRET=$NEW_SECRET" >> .env
grep '^JWT_SECRET=' .env
```

**2. ⚠️ 关键：`docker-compose.yml` 目前根本没把 `JWT_SECRET` 传给容器**，必须补一行。
在 `services.ncn-web.environment` 下（紧跟 `- SESSION_SECRET=${SESSION_SECRET}` 后面）加入：

```yaml
      - JWT_SECRET=${JWT_SECRET}
```

```bash
# 3. 重建后端
cd /root/ncn && docker compose up -d --build ncn-web

# 4. 验证容器里已拿到（长度应为 64）
docker inspect ncn-web --format '{{json .Config.Env}}' | tr ',' '\n' | grep JWT_SECRET

# 5. 验证服务健康
docker compose ps ncn-web
curl -s http://127.0.0.1:7000/api/health
```

## ⚠️ 副作用（务必提前通知用户）

换密钥后，**所有已签发的登录 cookie 立即失效，全部用户需要重新登录一次**（有效期为 30 天，所以影响面 = 所有当前在用的用户）。

**建议在非工作时段执行，或提前在企业群里通知。**

## 为什么之前一直没人发现

容器里配了 `SESSION_SECRET`（历史上用 session 认证时留下的），看起来"密钥已经配了"，容易误判。而 JWT 用的是另一个变量名 `JWT_SECRET`，两边都没人核对。

---

# 六、附：其他待清理项（非阻塞）

| 项 | 说明 |
|---|---|
| `/root/ncn/ncn-frontend/` 下有 8 个垃圾文件 | `-H`、`-d`、`Accept:`、`Content-Length:`、`Content-Type:`、`Host:`、`POST`、`User-Agent:` —— 之前某次 curl 命令写错产生的。可 `cd /root/ncn/ncn-frontend && rm -f -- -H -d 'Accept:' 'Content-Length:' 'Content-Type:' 'Host:' 'POST' 'User-Agent:'` |
| `NCN2411078` 附件缺失 | DB 记的文件名 `NCN_NCN2411078.5QAC00005 8D ...report(Rev 11)` 在共享盘上不存在（历史附件原始名无合法扩展名）。需手工重传附件 |
| `docker-compose.yml` 里的 `ncn-frontend` 容器 | 定义了但从未运行，线上实际由宿主机 nginx（`/var/www/ncn`）提供服务 → 容易误判部署方式，建议清理或加注释 |
