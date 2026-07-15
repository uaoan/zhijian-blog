#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parent

username = input("GitHub 用户名: ").strip()
repo = input("仓库名（例如 my-blog；用户主页仓库请输入 username.github.io）: ").strip()
title = input("博客名称 [纸间]: ").strip() or "纸间"
author = input("作者名称 [你的名字]: ").strip() or "你的名字"
email = input("联系邮箱 [hello@example.com]: ").strip() or "hello@example.com"
proxy = input("OAuth 代理地址（可稍后填写）[https://YOUR-OAUTH-PROXY.workers.dev]: ").strip() or "https://YOUR-OAUTH-PROXY.workers.dev"

if not username or not repo:
    raise SystemExit("用户名和仓库名不能为空。")

is_user_site = repo.lower() == f"{username.lower()}.github.io"
baseurl = "" if is_user_site else f"/{repo}"
site_url = f"https://{username}.github.io{baseurl}"

replacements = {
    "YOUR_GITHUB_USERNAME": username,
    "YOUR_REPOSITORY": repo,
    "https://YOUR-OAUTH-PROXY.workers.dev": proxy.rstrip("/"),
    'title: 纸间': f'title: "{title}"',
    '  name: 你的名字': f'  name: "{author}"',
    '  email: hello@example.com': f'  email: "{email}"',
    'default: "你的名字"': f'default: "{author}"',
}

for relative in ["_config.yml", "admin/config.yml"]:
    path = root / relative
    text = path.read_text(encoding="utf-8")
    for old, new in replacements.items():
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")

config_path = root / "_config.yml"
config = config_path.read_text(encoding="utf-8")
config = config.replace(f'baseurl: "/{repo}"', f'baseurl: "{baseurl}"')
config_path.write_text(config, encoding="utf-8")

for post in (root / "_posts").glob("*.md"):
    text = post.read_text(encoding="utf-8").replace('author: "你的名字"', f'author: "{author}"')
    post.write_text(text, encoding="utf-8")

print("\n配置完成：")
print(f"网站地址：{site_url}")
print("下一步：把整个目录推送到 GitHub，然后在 Settings > Pages 中选择 main / (root)。")
print("后台地址：网站地址 + /admin/")
