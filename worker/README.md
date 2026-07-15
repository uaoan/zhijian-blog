# 固定账号密码后台：Worker 部署说明

这个 Worker 负责：

- 验证固定管理员账号和密码
- 生成 12 小时有效的签名登录令牌
- 把图片提交到 `assets/images/uploads/`
- 把文章提交到 `_posts/`
- 把 GitHub Token、密码和签名密钥保存在 Cloudflare Secret 中

不要把管理员密码或 GitHub Token 直接写入 `admin.js`、`config.js` 或其他 GitHub 仓库文件。

## 1. 创建 GitHub Fine-grained Token

在 GitHub 的个人设置中创建 Fine-grained personal access token：

- Repository access：只选择 `uaoan/zhijian-blog`
- Repository permissions：`Contents` 设置为 `Read and write`
- `Metadata` 保持只读

复制生成的 Token，关闭页面后 GitHub 不会再次完整显示它。

## 2. 安装并登录 Wrangler

```bash
cd worker
npm install
npx wrangler login
```

## 3. 设置四个 Secret

逐条运行以下命令。命令执行后会提示输入值，输入内容不会保存到仓库。

```bash
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SESSION_SECRET
```

输入值：

- `ADMIN_USER`：输入你指定的固定管理员账号
- `ADMIN_PASSWORD`：输入你指定的固定管理员密码
- `GITHUB_TOKEN`：粘贴第 1 步创建的 GitHub Token
- `SESSION_SECRET`：输入一个至少 32 位的随机字符串，只用于签署登录令牌

生成随机 `SESSION_SECRET` 的一种方法：

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## 4. 部署 Worker

```bash
npm run deploy
```

部署成功后，终端会显示类似地址：

```text
https://zhijian-blog-admin.你的子域.workers.dev
```

## 5. 填写后台接口地址

打开博客项目的：

```text
admin/config.js
```

把：

```js
API_BASE: "https://YOUR-WORKER-SUBDOMAIN.workers.dev"
```

改成第 4 步得到的真实地址。末尾不要加 `/`。

提交并推送到 GitHub 后，访问：

```text
https://uaoan.github.io/zhijian-blog/admin/
```

## 6. 修改固定账号或密码

以后不需要改网页文件，重新运行对应 Secret 命令即可：

```bash
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASSWORD
```

随后 Wrangler 会更新并部署 Worker。

## 安全提醒

- GitHub Pages 中的 JavaScript 对所有访问者可见，所以不能把固定密码硬编码进前端。
- GitHub Token 必须只放在 Worker Secret 中。
- 当前后台没有公开注册入口，只有 Secret 中设置的固定账号可以登录。
- 建议给管理员密码使用更长的随机组合；你刚刚在聊天中发送过的密码应视为已经暴露。
