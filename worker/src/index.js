const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    if (!isAllowedOrigin(origin, env)) {
      return json({ error: '请求来源不受信任。' }, 403, {});
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/login' && request.method === 'POST') {
        return handleLogin(request, env, cors);
      }

      const session = await requireSession(request, env);

      if (url.pathname === '/api/session' && request.method === 'GET') {
        return json({ authenticated: true, user: session.sub }, 200, cors);
      }

      if (url.pathname === '/api/upload-image' && request.method === 'POST') {
        return handleImageUpload(request, env, cors);
      }

      if (url.pathname === '/api/publish' && request.method === 'POST') {
        return handlePublish(request, env, cors);
      }

      return json({ error: '接口不存在。' }, 404, cors);
    } catch (error) {
      console.error(error);
      const status = error.status || 500;
      const message = status >= 500 ? '服务器处理失败，请检查 Worker 日志和 GitHub Token 权限。' : error.message;
      return json({ error: message }, status, cors);
    }
  }
};

async function handleLogin(request, env, cors) {
  assertSecrets(env, ['ADMIN_USER', 'ADMIN_PASSWORD', 'SESSION_SECRET']);
  const body = await readJson(request);
  const username = String(body.username || '');
  const password = String(body.password || '');

  const userOk = await secureEqual(username, env.ADMIN_USER);
  const passOk = await secureEqual(password, env.ADMIN_PASSWORD);
  if (!userOk || !passOk) throw httpError(401, '账号或密码错误。');

  const token = await createToken({ sub: env.ADMIN_USER }, env.SESSION_SECRET);
  return json({ token, expiresIn: TOKEN_LIFETIME_SECONDS }, 200, cors);
}

async function handleImageUpload(request, env, cors) {
  assertSecrets(env, ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_BRANCH']);
  const body = await readJson(request);
  const parsed = parseImageDataUrl(body.dataUrl);
  if (parsed.bytes.length > MAX_IMAGE_BYTES) throw httpError(413, '图片不能超过 5 MB。');

  const extension = extensionForMime(parsed.mime);
  const sourceName = sanitizeFileBase(String(body.filename || 'image').replace(/\.[^.]+$/, '')) || 'image';
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const path = `assets/images/uploads/${year}/${month}/${unique}-${sourceName}.${extension}`;

  await putGithubFile(env, path, parsed.bytes, `Upload blog image: ${sourceName}`);
  return json({ url: `/${path}`, path }, 201, cors);
}

async function handlePublish(request, env, cors) {
  assertSecrets(env, ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_BRANCH']);
  const body = await readJson(request);

  const title = cleanText(body.title, 80);
  const description = cleanText(body.description, 240);
  const author = cleanText(body.author || '你的名字', 80);
  const markdownBody = String(body.body || '').trim();
  if (!title) throw httpError(400, '文章标题不能为空。');
  if (!description) throw httpError(400, '文章摘要不能为空。');
  if (!markdownBody) throw httpError(400, '文章正文不能为空。');

  const date = normalizePostDate(body.date);
  const datePrefix = date.slice(0, 10);
  const slug = slugify(title) || `post-${Date.now().toString(36)}`;
  const filename = `${datePrefix}-${slug}-${crypto.randomUUID().slice(0, 6)}.md`;
  const path = `_posts/${filename}`;

  const categories = cleanList(body.categories, 8, 40);
  const tags = cleanList(body.tags, 16, 40);
  const cover = sanitizeAssetPath(body.cover);
  const frontMatter = [
    '---',
    `title: ${yamlString(title)}`,
    `date: ${date}`,
    `author: ${yamlString(author)}`,
    `description: ${yamlString(description)}`,
    ...(cover ? [`cover: ${yamlString(cover)}`] : []),
    'categories:',
    ...(categories.length ? categories : ['随笔']).map(item => `  - ${yamlString(item)}`),
    'tags:',
    ...tags.map(item => `  - ${yamlString(item)}`),
    `featured: ${Boolean(body.featured)}`,
    'published: true',
    '---',
    '',
    markdownBody,
    ''
  ].join('\n');

  await putGithubFile(env, path, encoder.encode(frontMatter), `Publish blog post: ${title}`);
  return json({ success: true, path, filename }, 201, cors);
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

function corsHeaders(origin, env) {
  if (!isAllowedOrigin(origin, env)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().includes('application/json')) throw httpError(415, '请求格式必须是 JSON。');
  try { return await request.json(); }
  catch (error) { throw httpError(400, 'JSON 数据格式错误。'); }
}

function assertSecrets(env, names) {
  const missing = names.filter(name => !env[name]);
  if (missing.length) throw httpError(500, `Worker 缺少配置：${missing.join(', ')}`);
}

async function requireSession(request, env) {
  assertSecrets(env, ['SESSION_SECRET']);
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw httpError(401, '登录状态已失效，请重新登录。');
  const token = authorization.slice(7).trim();
  try { return await verifyToken(token, env.SESSION_SECRET); }
  catch (error) { throw httpError(401, '登录状态已失效，请重新登录。'); }
}

async function createToken(payload, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify({ ...payload, iat: now, exp: now + TOKEN_LIFETIME_SECONDS })));
  const signature = await hmacSign(`${header}.${body}`, secret);
  return `${header}.${body}.${base64UrlEncode(signature)}`;
}

async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [header, payload, signature] = parts;
  const expected = await hmacSign(`${header}.${payload}`, secret);
  const actual = base64UrlDecode(signature);
  if (!secureEqualBytes(expected, actual)) throw new Error('Invalid signature');
  const parsed = JSON.parse(decoder.decode(base64UrlDecode(payload)));
  const now = Math.floor(Date.now() / 1000);
  if (!parsed.exp || parsed.exp < now) throw new Error('Expired token');
  return parsed;
}

async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function secureEqual(left, right) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(left))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(right)))
  ]);
  return secureEqualBytes(new Uint8Array(a), new Uint8Array(b));
}

function secureEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a[i] ^ b[i];
  return result === 0;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-zA-Z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) throw httpError(400, '图片格式无效。');
  const binary = atob(match[2].replace(/\s/g, ''));
  return { mime: match[1], bytes: Uint8Array.from(binary, char => char.charCodeAt(0)) };
}

function extensionForMime(mime) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[mime];
}

function sanitizeFileBase(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55);
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanList(value, maxItems, maxLength) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map(item => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function normalizePostDate(value) {
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!match) throw httpError(400, '发布日期格式错误。');
  const [, year, month, day, hour, minute] = match;
  const valid = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+08:00`);
  if (Number.isNaN(valid.getTime())) throw httpError(400, '发布日期无效。');
  return `${year}-${month}-${day} ${hour}:${minute}:00 +0800`;
}

function sanitizeAssetPath(value) {
  const path = String(value || '').trim();
  if (!path) return '';
  if (!/^\/assets\/images\/uploads\/[a-zA-Z0-9/_\-.]+$/.test(path)) throw httpError(400, '封面图片路径无效。');
  return path;
}

async function putGithubFile(env, path, bytes, message) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${encodedPath}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'zhijian-blog-admin-worker',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      message,
      content: bytesToBase64(bytes),
      branch: env.GITHUB_BRANCH
    })
  });

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.message || '';
    } catch (error) {}
    if (response.status === 401 || response.status === 403) {
      throw httpError(502, `GitHub Token 无权写入仓库：${detail || response.status}`);
    }
    throw httpError(502, `GitHub 文件提交失败：${detail || response.status}`);
  }
  return response.json();
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
