(() => {
  'use strict';

  // 固定登录信息使用 SHA-256 摘要保存，未直接写入明文。
  // 纯静态页面仍可被懂前端的人绕过，因此它不是服务器级安全认证。
  const USER_HASH = 'b93204f2e4435b6b14309de0fbf5711ac852ea9f6a0ca7ca051b6bf4b84a2995';
  const PASS_HASH = 'b50a7c658f5db2a256b6f84edf7715fe1263b0f663bb314bc2cdac421104dceb';
  const SESSION_KEY = 'zhijian_offline_admin_session';
  const DRAFT_KEY = 'zhijian_offline_admin_draft_v2';
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

  const $ = selector => document.querySelector(selector);
  const loginView = $('[data-login-view]');
  const editorView = $('[data-editor-view]');
  const loginForm = $('[data-login-form]');
  const loginMessage = $('[data-login-message]');
  const loginButton = $('[data-login-button]');
  const postForm = $('[data-post-form]');
  const publishMessage = $('[data-publish-message]');
  const exportButton = $('[data-export-button]');
  const saveState = $('[data-save-state]');
  const coverInput = postForm?.elements.cover;
  const coverPreview = $('[data-cover-preview]');
  const coverEmpty = $('[data-cover-empty]');
  const removeCoverButton = $('[data-remove-cover]');
  const coverDrop = $('[data-cover-drop]');
  const bodyEditor = $('[data-body-editor]');
  const bodyImageInput = $('[data-body-image-input]');
  const imageQueue = $('[data-image-queue]');
  const imageList = $('[data-image-list]');

  let coverFile = null;
  let bodyFiles = [];
  let saveTimer = null;

  function setMessage(node, message, success = false) {
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-success', success);
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function showLogin() {
    loginView.hidden = false;
    editorView.hidden = true;
  }

  function showEditor() {
    loginView.hidden = true;
    editorView.hidden = false;
    setDefaultDate();
    restoreDraft();
  }

  function setDefaultDate() {
    const input = postForm?.elements.date;
    if (!input || input.value) return;
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    input.value = now.toISOString().slice(0, 16);
  }

  function validateImage(file) {
    if (!file) throw new Error('请选择图片。');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      throw new Error('只支持 JPG、PNG、WebP 或 GIF 图片。');
    }
    if (file.size > MAX_IMAGE_SIZE) throw new Error(`图片 ${file.name} 不能超过 5 MB。`);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('读取图片失败。'));
      reader.readAsDataURL(file);
    });
  }

  function cleanFilename(filename) {
    const dot = filename.lastIndexOf('.');
    const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
    let base = dot >= 0 ? filename.slice(0, dot) : filename;
    base = base.normalize('NFKD')
      .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'image';
    return `${base}${extension}`;
  }

  function uniqueImageName(file, index = 0) {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const clean = cleanFilename(file.name);
    return `${stamp}${index ? `-${index}` : ''}-${clean}`;
  }

  async function setCover(file) {
    validateImage(file);
    coverFile = file;
    coverPreview.src = await fileToDataUrl(file);
    coverPreview.hidden = false;
    coverEmpty.hidden = true;
    removeCoverButton.hidden = false;
    scheduleDraftSave();
  }

  function removeCover() {
    coverFile = null;
    if (coverInput) coverInput.value = '';
    coverPreview.removeAttribute('src');
    coverPreview.hidden = true;
    coverEmpty.hidden = false;
    removeCoverButton.hidden = true;
    scheduleDraftSave();
  }

  function splitList(value) {
    return String(value || '')
      .split(/[,，]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function serializeDraft() {
    if (!postForm) return {};
    const formData = new FormData(postForm);
    return {
      title: formData.get('title') || '',
      date: formData.get('date') || '',
      author: formData.get('author') || '',
      description: formData.get('description') || '',
      categories: formData.get('categories') || '',
      tags: formData.get('tags') || '',
      featured: formData.get('featured') === 'on',
      body: formData.get('body') || ''
    };
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(serializeDraft()));
      if (saveState) {
        saveState.textContent = `草稿已保存 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    } catch (error) {
      if (saveState) saveState.textContent = '草稿保存失败';
    }
  }

  function scheduleDraftSave() {
    if (saveState) saveState.textContent = '正在保存…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 500);
  }

  function restoreDraft() {
    if (!postForm) return;
    let draft;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (error) {}
    if (!draft) return;
    for (const [key, value] of Object.entries(draft)) {
      const field = postForm.elements[key];
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else if (!field.value || key !== 'date') field.value = value;
    }
    if (saveState) saveState.textContent = '已恢复本地草稿';
  }

  function clearDraft(confirmFirst = true) {
    if (confirmFirst && !window.confirm('确定要清空当前表单、本地草稿和已选择图片吗？')) return;
    localStorage.removeItem(DRAFT_KEY);
    postForm.reset();
    bodyFiles = [];
    renderImageQueue();
    removeCover();
    setDefaultDate();
    if (postForm.elements.author) postForm.elements.author.value = '你的名字';
    if (postForm.elements.categories) postForm.elements.categories.value = '随笔';
    if (saveState) saveState.textContent = '尚未保存';
    setMessage(publishMessage, '');
  }

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.setRangeText(text, start, end, 'end');
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderImageQueue() {
    if (!imageQueue || !imageList) return;
    imageQueue.hidden = bodyFiles.length === 0;
    imageList.replaceChildren();
    bodyFiles.forEach((item, index) => {
      const chip = document.createElement('span');
      chip.className = 'image-chip';
      const name = document.createElement('span');
      name.textContent = item.exportName;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = '从导出包移除';
      remove.addEventListener('click', () => {
        bodyFiles.splice(index, 1);
        renderImageQueue();
        setMessage(publishMessage, '图片已从导出包移除。正文中的图片语法需要手动删除。');
      });
      chip.append(name, remove);
      imageList.append(chip);
    });
  }

  function slugify(text) {
    let slug = String(text || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .slice(0, 70);
    return slug || 'new-post';
  }

  function yamlString(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function buildMarkdown(data, coverPath) {
    const dateValue = String(data.date || '').replace('T', ' ');
    const dateWithSeconds = dateValue.length === 16 ? `${dateValue}:00 +0800` : `${dateValue} +0800`;
    const categories = JSON.stringify(data.categories);
    const tags = JSON.stringify(data.tags);
    const lines = [
      '---',
      `title: ${yamlString(data.title)}`,
      `date: ${dateWithSeconds}`,
      `author: ${yamlString(data.author || '你的名字')}`,
      `description: ${yamlString(data.description)}`,
      coverPath ? `cover: ${yamlString(coverPath)}` : '',
      `categories: ${categories}`,
      `tags: ${tags}`,
      `featured: ${data.featured ? 'true' : 'false'}`,
      'published: true',
      '---',
      '',
      data.body.trim(),
      ''
    ];
    return lines.filter((line, index) => line !== '' || index > 9).join('\n');
  }

  // ZIP writer：使用“存储”模式，不依赖 npm 或外部 CDN。
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  function u16(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255]);
  }

  function u32(value) {
    return new Uint8Array([
      value & 255,
      (value >>> 8) & 255,
      (value >>> 16) & 255,
      (value >>> 24) & 255
    ]);
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  async function createZip(files) {
    const encoder = new TextEncoder();
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;
    const { time, day } = dosDateTime();

    for (const file of files) {
      const nameBytes = encoder.encode(file.path.replace(/\\/g, '/'));
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(await file.data.arrayBuffer());
      const crc = crc32(data);

      const localHeader = concatBytes([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
        nameBytes
      ]);
      localChunks.push(localHeader, data);

      const centralHeader = concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
        u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
      ]);
      centralChunks.push(centralHeader);
      offset += localHeader.length + data.length;
    }

    const central = concatBytes(centralChunks);
    const end = concatBytes([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(central.length), u32(offset), u16(0)
    ]);

    return new Blob([...localChunks, central, end], { type: 'application/zip' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(loginForm);
    loginButton.disabled = true;
    loginButton.textContent = '正在登录…';
    setMessage(loginMessage, '');

    try {
      const [userHash, passHash] = await Promise.all([
        sha256(data.get('username')),
        sha256(data.get('password'))
      ]);
      if (userHash !== USER_HASH || passHash !== PASS_HASH) {
        throw new Error('账号或密码不正确。');
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      loginForm.reset();
      showEditor();
    } catch (error) {
      setMessage(loginMessage, error.message || '登录失败。');
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = '登录';
    }
  });

  $('[data-toggle-password]')?.addEventListener('click', event => {
    const input = loginForm.elements.password;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? '隐藏' : '显示';
  });

  $('[data-logout]')?.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  });

  coverInput?.addEventListener('change', async () => {
    if (!coverInput.files?.[0]) return;
    try {
      await setCover(coverInput.files[0]);
      setMessage(publishMessage, '封面已加入导出包。', true);
    } catch (error) {
      setMessage(publishMessage, error.message);
      removeCover();
    }
  });

  removeCoverButton?.addEventListener('click', event => {
    event.preventDefault();
    removeCover();
  });

  ['dragenter', 'dragover'].forEach(name => coverDrop?.addEventListener(name, event => {
    event.preventDefault();
    coverDrop.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach(name => coverDrop?.addEventListener(name, event => {
    event.preventDefault();
    coverDrop.classList.remove('is-dragging');
  }));
  coverDrop?.addEventListener('drop', async event => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try { await setCover(file); }
    catch (error) { setMessage(publishMessage, error.message); }
  });

  $('[data-add-body-image]')?.addEventListener('click', () => bodyImageInput?.click());

  bodyImageInput?.addEventListener('change', () => {
    const selected = [...(bodyImageInput.files || [])];
    if (!selected.length) return;

    try {
      const markdownLines = [];
      selected.forEach((file, index) => {
        validateImage(file);
        const exportName = uniqueImageName(file, bodyFiles.length + index + 1);
        bodyFiles.push({ file, exportName });
        const alt = file.name.replace(/\.[^.]+$/, '') || '文章图片';
        markdownLines.push(`![${alt}](/assets/images/uploads/${exportName})`);
      });
      insertAtCursor(bodyEditor, `\n${markdownLines.join('\n\n')}\n`);
      renderImageQueue();
      setMessage(publishMessage, `已加入 ${selected.length} 张正文图片。`, true);
    } catch (error) {
      setMessage(publishMessage, error.message);
    } finally {
      bodyImageInput.value = '';
    }
  });

  postForm?.addEventListener('input', scheduleDraftSave);
  $('[data-clear-draft]')?.addEventListener('click', () => clearDraft(true));

  postForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!postForm.reportValidity()) return;

    exportButton.disabled = true;
    exportButton.textContent = '正在生成…';
    setMessage(publishMessage, '正在生成文章和图片发布包…');

    try {
      const formData = new FormData(postForm);
      const title = String(formData.get('title') || '').trim();
      const dateInput = String(formData.get('date') || '');
      const datePart = dateInput.slice(0, 10);
      const slug = slugify(title);
      const postFilename = `${datePart}-${slug}.md`;

      let coverPath = '';
      const files = [];

      if (coverFile) {
        const coverName = uniqueImageName(coverFile);
        coverPath = `/assets/images/uploads/${coverName}`;
        files.push({ path: `assets/images/uploads/${coverName}`, data: coverFile });
      }

      bodyFiles.forEach(item => {
        files.push({ path: `assets/images/uploads/${item.exportName}`, data: item.file });
      });

      const markdown = buildMarkdown({
        title,
        date: dateInput,
        author: String(formData.get('author') || '').trim(),
        description: String(formData.get('description') || '').trim(),
        categories: splitList(formData.get('categories')),
        tags: splitList(formData.get('tags')),
        featured: formData.get('featured') === 'on',
        body: String(formData.get('body') || '')
      }, coverPath);

      files.unshift({
        path: `_posts/${postFilename}`,
        data: new TextEncoder().encode(markdown)
      });

      const guide = [
        '纸间博客发布包',
        '',
        '1. 解压本 ZIP。',
        `2. 将 _posts/${postFilename} 上传到 GitHub 仓库的 _posts 目录。`,
        '3. 将 assets/images/uploads 目录中的图片上传到仓库对应目录。',
        '4. 提交后等待 GitHub Pages Actions 构建完成。',
        '5. 强制刷新博客页面。',
        ''
      ].join('\r\n');

      files.push({
        path: '上传说明.txt',
        data: new TextEncoder().encode(guide)
      });

      const zip = await createZip(files);
      downloadBlob(zip, `${datePart}-${slug}-发布包.zip`);

      localStorage.removeItem(DRAFT_KEY);
      if (saveState) saveState.textContent = '发布包已导出';
      setMessage(publishMessage, '导出成功。请解压 ZIP 并把文件上传到 GitHub 仓库。', true);
    } catch (error) {
      console.error(error);
      setMessage(publishMessage, error.message || '导出失败。');
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = '导出发布包';
    }
  });

  if (sessionStorage.getItem(SESSION_KEY) === '1') showEditor();
  else showLogin();
})();
