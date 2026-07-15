# 部署与后台启用

## 一、先完成项目配置

在项目目录运行：

```bash
python setup.py
```

脚本会要求填写：

- GitHub 用户名
- 仓库名
- 博客名称
- 作者名称
- 联系邮箱
- OAuth 代理地址

如果暂时没有 OAuth 代理地址，可以先保留默认值。前台仍然可以正常部署，后台登录需要完成第三部分。

## 二、部署到 GitHub Pages

1. 在 GitHub 创建一个公开仓库。
2. 把本项目全部文件推送到仓库的 `main` 分支。
3. 进入仓库 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **Deploy from a branch**。
5. Branch 选择 `main`，Folder 选择 `/(root)`，保存。
6. 等待 GitHub 完成构建。

项目仓库站点地址通常为：

```text
https://你的用户名.github.io/仓库名/
```

如果仓库名是 `你的用户名.github.io`，站点地址则为：

```text
https://你的用户名.github.io/
```

## 三、启用 `/admin/` 内容后台

GitHub Pages 只负责静态文件托管，无法直接保存账号密码或执行服务器端 OAuth。因此，Decap CMS 的 GitHub 登录需要一个很小的 OAuth 代理。

推荐使用 Decap CMS 官方文档引用的 Cloudflare Worker 模板：

```text
https://github.com/sterlingwes/decap-proxy
```

### 1. 创建 GitHub OAuth App

进入 GitHub：

```text
Settings → Developer settings → OAuth Apps → New OAuth App
```

填写：

- Homepage URL：你的 OAuth 代理地址，例如 `https://my-decap-proxy.workers.dev`
- Authorization callback URL：代理地址加 `/callback`，例如 `https://my-decap-proxy.workers.dev/callback`

保存 Client ID 和 Client Secret。

### 2. 部署 OAuth 代理

按照 decap-proxy 项目 README 操作，核心命令为：

```bash
git clone https://github.com/sterlingwes/decap-proxy
cd decap-proxy
cp wrangler.toml.sample wrangler.toml
npx wrangler login
npx wrangler secret put GITHUB_OAUTH_ID
npx wrangler secret put GITHUB_OAUTH_SECRET
npx wrangler deploy
```

Client ID 填入 `GITHUB_OAUTH_ID`，Client Secret 填入 `GITHUB_OAUTH_SECRET`。

### 3. 修改后台配置

打开 `admin/config.yml`，确认以下内容已经替换：

```yaml
backend:
  name: github
  repo: 你的用户名/你的仓库名
  branch: main
  base_url: https://你的代理地址.workers.dev
  auth_endpoint: /auth
```

同时确认：

```yaml
site_url: https://你的用户名.github.io/你的仓库名
display_url: https://你的用户名.github.io/你的仓库名
```

提交修改后访问：

```text
https://你的用户名.github.io/你的仓库名/admin/
```

拥有仓库写入权限的 GitHub 用户即可登录、创建文章、上传封面和正文图片。

## 四、本地预览

前台使用 Jekyll。安装 Ruby 后可以运行：

```bash
gem install bundler jekyll
jekyll serve
```

本地地址一般为：

```text
http://127.0.0.1:4000/仓库名/
```

Decap CMS 本地编辑模式需要额外运行：

```bash
npx decap-server
```

然后打开本地站点的 `/admin/`。

## 五、发布文章

后台创建的文章会写入 `_posts/`，图片会写入 `assets/images/uploads/`。保存或发布后，Decap CMS 会向 GitHub 提交变更；GitHub Pages 随后自动重新构建网站。

如果启用了 `editorial_workflow`：

- Draft：草稿
- In review：审核中
- Ready：等待发布
- Publish：合并并公开发布

## 六、常见问题

### 后台提示仓库不存在

检查 `admin/config.yml` 中 `repo` 是否严格为 `用户名/仓库名`，并确认登录账号拥有写入权限。

### 图片在项目站点中路径错误

本模板已经在文章布局中自动补充 GitHub Pages 的 `baseurl`。请不要把 `public_folder` 改成包含仓库名的路径，保持：

```yaml
public_folder: "/assets/images/uploads"
```

### 修改配置后页面仍是旧内容

GitHub Pages 构建可能尚未完成。进入仓库的 **Actions** 页面检查 Pages 构建状态，并强制刷新浏览器缓存。
