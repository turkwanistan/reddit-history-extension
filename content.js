const ARCTIC_SHIFT_BASE = 'https://arctic-shift.photon-reddit.com';
const EMPTY_FEED_SELECTOR = '#empty-feed-content';
const PAGE_SIZE = 100;

function getUsernameFromUrl() {
  const match = location.pathname.match(/^\/u(?:ser)?\/([^/]+)/);
  return match ? match[1] : null;
}

// Arctic Shift is a third party, not Reddit itself, so its fields aren't
// trusted the way a same-origin API's would be. Blindly concatenating
// `https://www.reddit.com${permalink}` would let a value like "@evil.com/x"
// turn into a link that actually navigates to evil.com - the "@" makes a
// browser treat "www.reddit.com" as userinfo, not the host. These guards
// make sure every reddit.com link we build actually stays on reddit.com.
function isSafeRedditPath(path) {
  return typeof path === 'string'
    && /^\/(r|u|user)\//.test(path)
    && !path.includes('@')
    && !path.includes('://')
    && !path.startsWith('//');
}

function toRedditUrl(path) {
  return isSafeRedditPath(path) ? `https://www.reddit.com${path}` : 'https://www.reddit.com/';
}

function isSafeRedditName(name) {
  return typeof name === 'string' && /^[\w-]{1,30}$/.test(name);
}

// Link posts point at arbitrary external domains by design, but the URL
// still has to actually be http(s) - parsing with URL (the same parser the
// browser itself will use) rules out a "javascript:" or other unexpected
// scheme sneaking into an href.
function isSafeExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// `before` is the created_utc of the oldest item already loaded - Arctic Shift
// treats it as an exclusive cursor, confirmed by requesting two pages and
// checking there's no overlap/duplicate at the boundary.
async function fetchComments(username, before) {
  const params = new URLSearchParams({ author: username, limit: String(PAGE_SIZE), sort: 'desc' });
  if (before) params.set('before', String(before));
  const res = await fetch(`${ARCTIC_SHIFT_BASE}/api/comments/search?${params}`);
  if (!res.ok) {
    throw new Error(`Arctic Shift request failed: ${res.status}`);
  }
  const { data } = await res.json();
  return data;
}

async function fetchPosts(username, before) {
  const params = new URLSearchParams({ author: username, limit: String(PAGE_SIZE), sort: 'desc' });
  if (before) params.set('before', String(before));
  const res = await fetch(`${ARCTIC_SHIFT_BASE}/api/posts/search?${params}`);
  if (!res.ok) {
    throw new Error(`Arctic Shift request failed: ${res.status}`);
  }
  const { data } = await res.json();
  return data;
}

// Reddit renders `#empty-feed-content` as light DOM inside <shreddit-feed> once
// the SPA decides there's nothing to show - both for a genuinely empty history
// and for "user hides their posts". It doesn't exist in the initial HTML, so we
// have to wait for the SPA to render it rather than querying immediately.
function waitForElement(selector, { timeout = 10000 } = {}) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout);
  });
}

function formatRelativeTime(unixSeconds) {
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const secondsAgo = Math.floor(Date.now() / 1000) - unixSeconds;
  for (const [name, secondsInUnit] of units) {
    const value = Math.floor(secondsAgo / secondsInUnit);
    if (value >= 1) return `${value} ${name}${value > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

const STYLE_ID = 'rch-styles';
const CLAMP_THRESHOLD = 500;

// Values pulled from Reddit's own design tokens (styles-css-*.css, RPL system) so
// this matches the real light/dark theme instead of a guessed palette. Referencing
// the var() names means it tracks Reddit's actual theme; the fallback hex is only
// for the rare case the page hasn't defined them yet.
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rch-heading {
      font: var(--font-16, 700 1rem/1.25rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      font-weight: 700;
      color: var(--color-neutral-content-strong, #181c1f);
      padding: 12px 0 0;
      width: 100%;
    }

    .rch-subtitle {
      font: var(--font-12-16-regular, 400 0.75rem/1rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-neutral-content-weak, #5c6c74);
      width: 100%;
      padding-bottom: 8px;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--color-neutral-border-weak, #00000019);
    }

    .rch-tabs {
      display: flex;
      gap: 20px;
      margin-bottom: 12px;
    }

    .rch-tab {
      background: none;
      border: none;
      padding: 0 0 8px;
      font: var(--font-14-20-semibold, 600 0.875rem/1.25rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-neutral-content-weak, #5c6c74);
      cursor: pointer;
      position: relative;
    }

    .rch-tab.rch-tab-active {
      color: var(--color-neutral-content-strong, #181c1f);
    }

    .rch-tab.rch-tab-active::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2px;
      background: currentColor;
    }

    .rch-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 24px 0;
      width: 100%;
      color: var(--color-neutral-content-weak, #5c6c74);
      font: var(--font-14-20-regular, 400 0.875rem/1.25rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
    }

    .rch-spinner {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid var(--color-neutral-border-weak, #00000019);
      border-top-color: var(--color-global-orangered, #ff4500);
      animation: rch-spin 0.7s linear infinite;
      flex: none;
    }

    @keyframes rch-spin {
      to { transform: rotate(360deg); }
    }

    .rch-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    .rch-item {
      box-sizing: border-box;
      border: 1px solid var(--color-neutral-border-weak, #00000019);
      border-radius: 8px;
      padding: 12px;
      background: var(--color-neutral-background, #ffffff);
      transition: background-color 0.15s ease;
    }

    .rch-item:hover {
      background: var(--color-neutral-background-hover, #f6f8f9);
    }

    .rch-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font: var(--font-12-16-regular, 400 0.75rem/1rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-neutral-content-weak, #5c6c74);
      margin-bottom: 6px;
    }

    .rch-subreddit-chip {
      background: var(--color-neutral-background-container, #f6f8f9);
      color: var(--color-neutral-content-strong, #181c1f);
      border-radius: var(--radius-full, 999px);
      padding: 2px 8px;
      font-weight: 600;
      text-decoration: none;
    }

    .rch-vote {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-weight: 600;
    }

    .rch-vote-arrow {
      font-size: 9px;
      line-height: 1;
    }

    .rch-vote.rch-up { color: var(--color-global-orangered, #ff4500); }
    .rch-vote.rch-down { color: var(--color-action-downvote, #7193ff); }
    .rch-vote.rch-zero { color: var(--color-neutral-content-weak, #5c6c74); }

    .rch-post-title {
      display: block;
      font: var(--font-14-20-semibold, 600 0.875rem/1.25rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-neutral-content-strong, #181c1f);
      text-decoration: none;
      margin-bottom: 4px;
    }

    .rch-post-title:hover {
      text-decoration: underline;
      color: var(--color-primary-background, #006cbf);
    }

    .rch-post-domain {
      display: inline-block;
      margin-top: 2px;
      font: var(--font-12-16-regular, 400 0.75rem/1rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-neutral-content-weak, #5c6c74);
      text-decoration: none;
    }

    .rch-post-domain:hover { text-decoration: underline; }

    .rch-body {
      font: var(--font-body-2, 400 0.875rem/1.25rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-neutral-content, #333d42);
      white-space: pre-wrap;
      overflow: hidden;
    }

    .rch-body.rch-clamped {
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
    }

    .rch-toggle {
      background: none;
      border: none;
      padding: 0;
      margin-top: 4px;
      font: var(--font-12-16-semibold, 600 0.75rem/1rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-primary-background, #006cbf);
      cursor: pointer;
    }

    .rch-toggle:hover { text-decoration: underline; }

    .rch-link {
      font-size: 12px;
      display: inline-block;
      margin-top: 6px;
      color: var(--color-primary-background, #006cbf);
      text-decoration: none;
    }

    .rch-link:hover {
      text-decoration: underline;
      color: var(--color-primary-hover, #0a449b);
    }

    .rch-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .rch-select,
    .rch-search {
      font: var(--font-12-16-regular, 400 0.75rem/1rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-neutral-content-strong, #181c1f);
      background: var(--color-neutral-background-container, #f6f8f9);
      border: 1px solid var(--color-neutral-border-weak, #00000019);
      padding: 6px 12px;
    }

    .rch-select {
      border-radius: var(--radius-full, 999px);
      cursor: pointer;
    }

    .rch-search {
      border-radius: 8px;
      flex: 1;
      min-width: 160px;
    }

    .rch-select:focus,
    .rch-search:focus {
      outline: 2px solid var(--color-primary-background, #006cbf);
      outline-offset: 1px;
    }

    .rch-empty {
      padding: 24px 0;
      text-align: center;
      color: var(--color-neutral-content-weak, #5c6c74);
      font: var(--font-14-20-regular, 400 0.875rem/1.25rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
    }

    .rch-load-more {
      align-self: center;
      margin-top: 4px;
      font: var(--font-button-b3, 700 0.875rem/1.125rem -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      color: var(--color-primary-background, #006cbf);
      background: var(--color-neutral-background-container, #f6f8f9);
      border: 1px solid var(--color-neutral-border-weak, #00000019);
      border-radius: var(--radius-full, 999px);
      padding: 8px 20px;
      cursor: pointer;
    }

    .rch-load-more:hover { background: var(--color-neutral-background-hover, #f6f8f9); }
    .rch-load-more:disabled { opacity: 0.6; cursor: default; }

    .rch-copy-btn {
      display: inline-flex;
      align-items: center;
      background: none;
      border: none;
      padding: 0;
      margin-left: auto;
      color: var(--color-neutral-content-weak, #5c6c74);
      cursor: pointer;
    }

    .rch-copy-btn:hover {
      color: var(--color-neutral-content-strong, #181c1f);
    }

    .rch-highlight {
      background: var(--color-alert-caution, #ffb000);
      color: var(--color-neutral-content-strong, #181c1f);
      border-radius: 2px;
      padding: 0 1px;
    }
  `;
  document.head.appendChild(style);
}

function renderLoading(container, label = 'Loading comment history via Arctic Shift…') {
  container.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'rch-loading';
  loading.innerHTML = `<span class="rch-spinner"></span><span>${label}</span>`;
  container.appendChild(loading);
}

function renderVote(score) {
  const vote = document.createElement('span');
  vote.className = `rch-vote ${score > 0 ? 'rch-up' : score < 0 ? 'rch-down' : 'rch-zero'}`;
  const arrow = score >= 0 ? '▲' : '▼';
  vote.innerHTML = `<span class="rch-vote-arrow">${arrow}</span><span>${Math.abs(score)}</span>`;
  return vote;
}

// Generic chain-link / checkmark glyphs (not a brand asset) so the button
// reads as a small icon instead of a text link, matching the meta row's
// otherwise compact, icon-free-but-terse style.
const COPY_LINK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
const COPY_CHECK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function setCopyButtonState(button, { icon, label }) {
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute('aria-label', label);
}

function buildCopyLinkButton(url) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rch-copy-btn';
  setCopyButtonState(button, { icon: COPY_LINK_ICON, label: 'Copy link' });
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopyButtonState(button, { icon: COPY_CHECK_ICON, label: 'Copied!' });
    } catch {
      setCopyButtonState(button, { icon: COPY_LINK_ICON, label: 'Copy failed' });
    }
    setTimeout(() => {
      setCopyButtonState(button, { icon: COPY_LINK_ICON, label: 'Copy link' });
    }, 1500);
  });
  return button;
}

function buildMetaRow(item, extra) {
  const meta = document.createElement('div');
  meta.className = 'rch-meta';

  const chip = document.createElement('a');
  chip.className = 'rch-subreddit-chip';
  chip.href = isSafeRedditName(item.subreddit) ? `https://www.reddit.com/r/${item.subreddit}/` : 'https://www.reddit.com/';
  chip.target = '_blank';
  chip.rel = 'noopener noreferrer';
  chip.textContent = `r/${item.subreddit}`;

  const time = document.createElement('span');
  time.textContent = formatRelativeTime(item.created_utc);

  meta.append(chip, time, renderVote(item.score));
  if (extra) meta.appendChild(extra);
  meta.appendChild(buildCopyLinkButton(toRedditUrl(item.permalink)));
  return meta;
}

// Appends `text` as DOM nodes (never innerHTML) with every case-insensitive
// occurrence of `query` wrapped in a <mark>, so the highlight always matches
// exactly what itemMatchesQuery used to include this item in the results.
function appendHighlightedText(container, text, query) {
  if (!query) {
    container.appendChild(document.createTextNode(text));
    return;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let start = 0;
  let idx;
  while ((idx = lowerText.indexOf(lowerQuery, start)) !== -1) {
    if (idx > start) container.appendChild(document.createTextNode(text.slice(start, idx)));
    const mark = document.createElement('mark');
    mark.className = 'rch-highlight';
    mark.textContent = text.slice(idx, idx + query.length);
    container.appendChild(mark);
    start = idx + query.length;
  }
  container.appendChild(document.createTextNode(text.slice(start)));
}

function addClampToggle(item, body, link) {
  body.classList.add('rch-clamped');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'rch-toggle';
  toggle.textContent = 'Show more';
  toggle.addEventListener('click', () => {
    const collapsed = body.classList.toggle('rch-clamped');
    toggle.textContent = collapsed ? 'Show more' : 'Show less';
  });
  item.insertBefore(toggle, link ?? null);
}

function renderCommentItem(comment, query = '') {
  const item = document.createElement('div');
  item.className = 'rch-item';
  item.appendChild(buildMetaRow(comment));

  const body = document.createElement('div');
  body.className = 'rch-body';
  appendHighlightedText(body, comment.body, query);
  item.appendChild(body);

  const link = document.createElement('a');
  link.href = toRedditUrl(comment.permalink);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'rch-link';
  link.textContent = 'View on Reddit';
  item.appendChild(link);

  if (comment.body.length > CLAMP_THRESHOLD) {
    addClampToggle(item, body, link);
  }

  return item;
}

function renderPostItem(post, query = '') {
  const item = document.createElement('div');
  item.className = 'rch-item';

  const commentsBadge = document.createElement('span');
  const commentCount = post.num_comments ?? 0;
  commentsBadge.textContent = `${commentCount} comment${commentCount === 1 ? '' : 's'}`;
  item.appendChild(buildMetaRow(post, commentsBadge));

  const title = document.createElement('a');
  title.className = 'rch-post-title';
  title.href = toRedditUrl(post.permalink);
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  appendHighlightedText(title, post.title, query);
  item.appendChild(title);

  if (post.is_self && post.selftext) {
    const body = document.createElement('div');
    body.className = 'rch-body';
    appendHighlightedText(body, post.selftext, query);
    item.appendChild(body);

    if (post.selftext.length > CLAMP_THRESHOLD) {
      addClampToggle(item, body, null);
    }
  } else if (!post.is_self && post.url) {
    const isLink = isSafeExternalUrl(post.url);
    const domain = document.createElement(isLink ? 'a' : 'span');
    domain.className = 'rch-post-domain';
    if (isLink) {
      domain.href = post.url;
      domain.target = '_blank';
      domain.rel = 'noopener noreferrer';
    }
    domain.textContent = `↗ ${post.domain}`;
    item.appendChild(domain);
  }

  return item;
}

const SORTERS = {
  new: (a, b) => b.created_utc - a.created_utc,
  old: (a, b) => a.created_utc - b.created_utc,
  top: (a, b) => b.score - a.score,
  bottom: (a, b) => a.score - b.score,
};

const SORT_LABELS = {
  new: 'Newest',
  old: 'Oldest',
  top: 'Top score',
  bottom: 'Most downvoted',
};

function getSubredditCounts(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.subreddit, (counts.get(item.subreddit) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function itemMatchesQuery(item, kind, q) {
  if (kind === 'comments') return item.body.toLowerCase().includes(q);
  return item.title.toLowerCase().includes(q) || (item.selftext || '').toLowerCase().includes(q);
}

function getFilteredItems(items, state, kind) {
  let result = items;

  if (state.subreddit !== 'all') {
    result = result.filter((item) => item.subreddit === state.subreddit);
  }

  const q = state.query.trim().toLowerCase();
  if (q) {
    result = result.filter((item) => itemMatchesQuery(item, kind, q));
  }

  return [...result].sort(SORTERS[state.sort]);
}

function buildToolbar(toolbar, items, state, kind, onChange) {
  toolbar.innerHTML = '';

  const sortSelect = document.createElement('select');
  sortSelect.className = 'rch-select';
  sortSelect.setAttribute('aria-label', `Sort ${kind}`);
  for (const [value, label] of Object.entries(SORT_LABELS)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    sortSelect.appendChild(option);
  }
  sortSelect.value = state.sort;
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    onChange();
  });

  const subredditSelect = document.createElement('select');
  subredditSelect.className = 'rch-select';
  subredditSelect.setAttribute('aria-label', 'Filter by subreddit');
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = `All subreddits (${items.length})`;
  subredditSelect.appendChild(allOption);
  for (const [subreddit, count] of getSubredditCounts(items)) {
    const option = document.createElement('option');
    option.value = subreddit;
    option.textContent = `r/${subreddit} (${count})`;
    subredditSelect.appendChild(option);
  }
  subredditSelect.value = state.subreddit;
  subredditSelect.addEventListener('change', () => {
    state.subreddit = subredditSelect.value;
    onChange();
  });

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'rch-search';
  searchInput.placeholder = kind === 'comments' ? 'Search comments…' : 'Search posts…';
  searchInput.value = state.query;
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    onChange();
  });

  toolbar.append(sortSelect, subredditSelect, searchInput);
}

function buildTabs(tabsEl, activeTab, onSwitch) {
  tabsEl.innerHTML = '';
  for (const kind of ['comments', 'posts']) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `rch-tab${kind === activeTab ? ' rch-tab-active' : ''}`;
    tab.textContent = kind === 'comments' ? 'Comments' : 'Posts';
    tab.addEventListener('click', () => onSwitch(kind));
    tabsEl.appendChild(tab);
  }
}

function createTabState() {
  return {
    items: [],
    cursor: null,
    exhausted: false,
    loaded: false,
    sort: 'new',
    subreddit: 'all',
    query: '',
  };
}

function ingestPage(tabState, page) {
  tabState.items.push(...page);
  tabState.loaded = true;
  if (page.length < PAGE_SIZE) {
    tabState.exhausted = true;
  } else {
    tabState.cursor = page[page.length - 1].created_utc;
  }
}

const FETCHERS = { comments: fetchComments, posts: fetchPosts };
const ITEM_RENDERERS = { comments: renderCommentItem, posts: renderPostItem };
const EMPTY_LABELS = {
  comments: 'No comments match your filters.',
  posts: 'No posts match your filters.',
};
const NOUNS = { comments: 'Comments', posts: 'Posts' };

const PREFS_KEY = 'rch:prefs';
const DEFAULT_PREFS = { activeTab: 'comments', sort: 'new' };

async function loadPrefs() {
  try {
    const stored = await chrome.storage.local.get(PREFS_KEY);
    return { ...DEFAULT_PREFS, ...(stored[PREFS_KEY] || {}) };
  } catch (err) {
    console.error('[reddit-history] failed to load prefs:', err);
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  chrome.storage.local.set({ [PREFS_KEY]: prefs }).catch((err) => {
    console.error('[reddit-history] failed to save prefs:', err);
  });
}

// `generation` is a per-visit token so a slow fetch from a tab switch or a
// "Load more" click can't paint stale data into the page after the user has
// already navigated to a different profile (Reddit's shreddit-feed element
// persists across SPA navigations, so a stray callback would otherwise still
// find a live container to write into).
async function renderFeed(container, username, firstCommentsPagePromise, generation) {
  const prefs = await loadPrefs();
  if (generation !== renderGeneration) return;

  injectStyles();
  container.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'rch-heading';
  container.appendChild(heading);

  const subtitle = document.createElement('div');
  subtitle.className = 'rch-subtitle';
  subtitle.textContent = 'Restored via the Arctic Shift archive';
  container.appendChild(subtitle);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'rch-tabs';
  container.appendChild(tabsEl);

  const toolbarEl = document.createElement('div');
  toolbarEl.className = 'rch-toolbar';
  container.appendChild(toolbarEl);

  const listEl = document.createElement('div');
  listEl.className = 'rch-list';
  container.appendChild(listEl);

  const tabs = { comments: createTabState(), posts: createTabState() };
  tabs.comments.sort = prefs.sort;
  tabs.posts.sort = prefs.sort;
  let activeTab = prefs.activeTab === 'posts' ? 'posts' : 'comments';
  let loadingMore = false;

  async function loadPage(kind) {
    const tabState = tabs[kind];
    const page = await FETCHERS[kind](username, tabState.cursor ?? undefined);
    ingestPage(tabState, page);
  }

  // Split in two on purpose: sort/subreddit/search changes fire on every
  // keystroke and must NOT touch the toolbar's own DOM (rebuilding the
  // <select>/<input> elements replaces the very node the user is typing
  // into, which was silently kicking focus out of the search box after
  // every character). Only renderAll() - called for tab switches and after
  // Load More, where the item set itself may have changed - rebuilds tabs
  // and the toolbar; renderList() only ever touches heading/list/load-more.
  function renderList() {
    if (generation !== renderGeneration) return;
    const tabState = tabs[activeTab];

    const filtered = getFilteredItems(tabState.items, tabState, activeTab);
    const totalLabel = `${tabState.items.length}${tabState.exhausted ? '' : '+'}`;
    heading.textContent = filtered.length === tabState.items.length
      ? `Hidden ${NOUNS[activeTab]} (${totalLabel})`
      : `Hidden ${NOUNS[activeTab]} — showing ${filtered.length} of ${totalLabel}`;

    listEl.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rch-empty';
      empty.textContent = EMPTY_LABELS[activeTab];
      listEl.appendChild(empty);
    } else {
      for (const item of filtered) {
        try {
          listEl.appendChild(ITEM_RENDERERS[activeTab](item, tabState.query.trim()));
        } catch (err) {
          // Archived data is third-party and occasionally malformed; one bad
          // record shouldn't take the rest of the list (and the load-more
          // button after it) down with it.
          console.error(`[reddit-history] failed to render ${activeTab} item`, item, err);
        }
      }
    }

    if (!tabState.exhausted) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.type = 'button';
      loadMoreBtn.className = 'rch-load-more';
      loadMoreBtn.textContent = loadingMore ? 'Loading…' : `Load more ${NOUNS[activeTab].toLowerCase()}`;
      loadMoreBtn.disabled = loadingMore;
      loadMoreBtn.addEventListener('click', async () => {
        loadingMore = true;
        renderList();
        try {
          await loadPage(activeTab);
        } catch (err) {
          console.error(`[reddit-history] failed to load more ${activeTab}:`, err);
          tabState.exhausted = true;
        }
        loadingMore = false;
        renderAll();
      });
      listEl.appendChild(loadMoreBtn);
    }

    savePrefs({ activeTab, sort: tabState.sort });
  }

  function renderAll() {
    if (generation !== renderGeneration) return;
    const tabState = tabs[activeTab];

    buildTabs(tabsEl, activeTab, async (kind) => {
      if (kind === activeTab) return;
      activeTab = kind;
      if (!tabs[kind].loaded) {
        renderLoading(listEl, `Loading ${NOUNS[kind].toLowerCase()}…`);
        try {
          await loadPage(kind);
        } catch (err) {
          console.error(`[reddit-history] failed to load ${kind}:`, err);
          if (generation !== renderGeneration) return;
          tabs[kind].loaded = true;
          tabs[kind].exhausted = true;
        }
      }
      renderAll();
    });

    buildToolbar(toolbarEl, tabState.items, tabState, activeTab, renderList);
    renderList();
  }

  renderLoading(listEl, `Loading ${NOUNS[activeTab].toLowerCase()}…`);
  try {
    const firstPage = await firstCommentsPagePromise;
    if (generation !== renderGeneration) return;
    ingestPage(tabs.comments, firstPage);

    // The eager fetch above only ever grabs comments (kicked off before prefs
    // were known), so if the user's last-used tab was Posts, fetch that too
    // before the first paint instead of showing it empty.
    if (activeTab === 'posts') {
      await loadPage('posts');
      if (generation !== renderGeneration) return;
    }
  } catch (err) {
    console.error(`[reddit-history] failed to load ${NOUNS[activeTab].toLowerCase()}:`, err);
    if (generation !== renderGeneration) return;
    const errorEl = document.createElement('div');
    errorEl.className = 'rch-empty';
    errorEl.textContent = `Failed to load ${NOUNS[activeTab].toLowerCase()} history.`;
    listEl.innerHTML = '';
    listEl.appendChild(errorEl);
    return;
  }
  renderAll();
}

// Reddit still renders its own "Overview/Posts/Comments" tab strip and the
// "Feed options" sort button above the feed even when the feed itself is
// blank - neither does anything useful on a profile with no visible activity,
// so we hide them, but only once we've actually confirmed this is that case
// (empty-feed-content exists). Both live outside <shreddit-feed> as siblings
// before it, not inside the container we render into.
const NATIVE_TABGROUP_SELECTOR = '#profile-feed-tabgroup';
const NATIVE_FEED_OPTIONS_SELECTOR = 'button[aria-label="Feed options"]';

function restoreNativeControls() {
  const tabgroup = document.querySelector(NATIVE_TABGROUP_SELECTOR);
  if (tabgroup) {
    tabgroup.style.display = '';
    const wrapper = tabgroup.parentElement;
    if (wrapper) wrapper.style.marginTop = '';
  }

  const feedOptionsButton = document.querySelector(NATIVE_FEED_OPTIONS_SELECTOR);
  const feedOptionsWrapper = feedOptionsButton?.closest('.my-md');
  if (feedOptionsWrapper) {
    feedOptionsWrapper.style.display = '';
    const outerWrapper = feedOptionsWrapper.parentElement;
    if (outerWrapper) outerWrapper.style.margin = '';
  }
}

// `generation` guards the async half below: the Feed-options button hydrates
// behind a lazy <faceplate-loader> and may not exist yet when this runs, so
// we have to wait for it - but if the user has already navigated to a
// different profile by the time it appears, hiding it would hide a DIFFERENT
// profile's legitimate, working control.
async function hideNativeControls(generation) {
  const tabgroup = document.querySelector(NATIVE_TABGROUP_SELECTOR);
  if (tabgroup) {
    tabgroup.style.display = 'none';

    // The tabgroup's own wrapper div carries Reddit's margin-top above the
    // tab strip. We can't hide the wrapper itself - our rendered feed lives
    // in a sibling <faceplate-tabpanel> inside that same wrapper - so just
    // zero the margin that would otherwise sit above nothing.
    const wrapper = tabgroup.parentElement;
    if (wrapper) wrapper.style.marginTop = '0';
  }

  try {
    // Unlike the tabgroup, the Feed-options button's nearest "my-md"
    // ancestor exists solely to hold this one control (verified against
    // real markup), so hiding that whole wrapper is safe and also collapses
    // its own margin. It in turn sits inside one more plain wrapper div
    // (also exclusively its own) that carries a separate margin of its own -
    // hiding the inner div doesn't collapse that, so zero it too.
    const feedOptionsButton = await waitForElement(NATIVE_FEED_OPTIONS_SELECTOR);
    if (generation !== renderGeneration) return;
    const feedOptionsWrapper = feedOptionsButton.closest('.my-md');
    if (feedOptionsWrapper) {
      feedOptionsWrapper.style.display = 'none';
      const outerWrapper = feedOptionsWrapper.parentElement;
      if (outerWrapper) outerWrapper.style.margin = '0';
    }
  } catch {
    // Never appeared - nothing to hide.
  }
}

let currentUsername = null;
let renderGeneration = 0;

async function onProfileVisited(username) {
  console.log('[reddit-history] profile detected:', username);
  const generation = ++renderGeneration;
  try {
    const firstPagePromise = fetchComments(username);
    const container = await waitForElement(EMPTY_FEED_SELECTOR);
    if (generation !== renderGeneration) return;

    hideNativeControls(generation);
    injectStyles();
    renderLoading(container);
    await renderFeed(container, username, firstPagePromise, generation);
  } catch (err) {
    console.error('[reddit-history] failed:', err);
  }
}

function handleUrlChange() {
  const username = getUsernameFromUrl();
  if (username !== currentUsername) {
    currentUsername = username;
    restoreNativeControls();
    if (username) {
      onProfileVisited(username);
    }
  }
}

// Reddit's profile pages are a React SPA, so navigating between users doesn't
// trigger a full page load. Reddit's router (shreddit) uses the Navigation API
// (window.navigation) rather than history.pushState/replaceState, so patching
// pushState/replaceState alone misses these navigations - "navigatesuccess"
// fires after the URL has actually updated.
if ('navigation' in window) {
  window.navigation.addEventListener('navigatesuccess', handleUrlChange);
}

for (const method of ['pushState', 'replaceState']) {
  const original = history[method];
  history[method] = function (...args) {
    const result = original.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
    return result;
  };
}

window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
window.addEventListener('locationchange', handleUrlChange);

handleUrlChange();
