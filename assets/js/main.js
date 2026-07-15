(() => {
  const root = document.documentElement;
  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const header = document.querySelector('[data-header]');

  if (navToggle && nav) {
    const closeNav = () => {
      nav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');
    };

    navToggle.addEventListener('click', () => {
      const open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
    });

    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNav));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeNav();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('zhijian-theme', next); } catch (error) {}
    });
  }

  if (header) {
    const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  document.querySelectorAll('[data-year]').forEach(node => {
    node.textContent = new Date().getFullYear();
  });

  const postContent = document.querySelector('[data-post-content]');
  const readingTime = document.querySelector('[data-reading-time]');
  const progressBar = document.querySelector('[data-reading-progress]');

  if (postContent && readingTime) {
    const text = postContent.textContent.trim();
    const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const latinWords = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/\b[\w'-]+\b/g) || []).length;
    const minutes = Math.max(1, Math.ceil(cjkCount / 350 + latinWords / 220));
    readingTime.textContent = `约 ${minutes} 分钟阅读`;
  }

  if (postContent && progressBar) {
    const updateProgress = () => {
      const rect = postContent.getBoundingClientRect();
      const start = window.scrollY + rect.top - window.innerHeight * 0.25;
      const end = start + postContent.offsetHeight - window.innerHeight * 0.5;
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start)));
      progressBar.style.transform = `scaleX(${progress})`;
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
  }

  const copyButton = document.querySelector('[data-copy-link]');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        copyButton.textContent = '已复制链接';
      } catch (error) {
        copyButton.textContent = '复制失败，请手动复制';
      }
      setTimeout(() => { copyButton.textContent = '复制文章链接'; }, 1800);
    });
  }

  const searchInput = document.querySelector('[data-post-search]');
  const cards = Array.from(document.querySelectorAll('[data-post-card]'));
  const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
  const resultsNote = document.querySelector('[data-results-note]');
  const emptyState = document.querySelector('[data-empty-state]');
  let activeFilter = 'all';

  const normalize = value => (value || '').toLocaleLowerCase().trim();

  const applyFilters = () => {
    const query = normalize(searchInput ? searchInput.value : '');
    let visible = 0;

    cards.forEach(card => {
      const haystack = normalize([
        card.dataset.title,
        card.dataset.description,
        card.dataset.tags,
        card.dataset.categories
      ].join(' '));

      const matchesSearch = !query || haystack.includes(query);
      const matchesTag = activeFilter === 'all' || normalize(card.dataset.tags).split(/\s+/).includes(normalize(activeFilter));
      const show = matchesSearch && matchesTag;
      card.hidden = !show;
      if (show) visible += 1;
    });

    if (resultsNote) {
      resultsNote.textContent = query || activeFilter !== 'all'
        ? `找到 ${visible} 篇匹配文章`
        : `显示全部 ${visible} 篇文章`;
    }
    if (emptyState) emptyState.hidden = visible !== 0;
  };

  if (searchInput) searchInput.addEventListener('input', applyFilters);

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter || 'all';
      filterButtons.forEach(item => item.classList.toggle('is-active', item === button));
      applyFilters();
    });
  });

  const revealItems = document.querySelectorAll('.post-card, .featured-card, .principle-grid article');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach(item => {
      item.classList.add('reveal');
      observer.observe(item);
    });
  } else {
    revealItems.forEach(item => item.classList.add('is-visible'));
  }
})();
