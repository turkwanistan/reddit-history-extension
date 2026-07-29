const ARCTIC_SHIFT_BASE = 'https://arctic-shift.photon-reddit.com';
const EMPTY_FEED_SELECTOR = '#empty-feed-content';

function getUsernameFromUrl() {
  const match = location.pathname.match(/^\/u(?:ser)?\/([^/]+)/);
  return match ? match[1] : null;
}

async function fetchComments(username) {
  const url = `${ARCTIC_SHIFT_BASE}/api/comments/search?author=${encodeURIComponent(username)}&limit=100&sort=desc`;
  const res = await fetch(url);
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

function renderComments(container, comments) {
  container.innerHTML = '';

  const heading = document.createElement('div');
  heading.textContent = `Comment history via Arctic Shift (${comments.length})`;
  heading.style.cssText = 'font-weight: bold; padding: 12px 0; width: 100%;';
  container.appendChild(heading);

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%;';

  for (const comment of comments) {
    const item = document.createElement('div');
    item.style.cssText = 'border: 1px solid var(--color-neutral-border, #343536); border-radius: 8px; padding: 12px;';

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size: 12px; opacity: 0.7; margin-bottom: 4px;';
    meta.textContent = `r/${comment.subreddit} · ${formatRelativeTime(comment.created_utc)} · ${comment.score} points`;

    const body = document.createElement('div');
    body.textContent = comment.body;
    body.style.cssText = 'font-size: 14px; white-space: pre-wrap;';

    const link = document.createElement('a');
    link.href = `https://www.reddit.com${comment.permalink}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on Reddit';
    link.style.cssText = 'font-size: 12px; display: inline-block; margin-top: 4px;';

    item.append(meta, body, link);
    list.appendChild(item);
  }

  container.appendChild(list);
}

let currentUsername = null;

async function onProfileVisited(username) {
  console.log('[reddit-history] profile detected:', username);
  try {
    const [comments, container] = await Promise.all([
      fetchComments(username),
      waitForElement(EMPTY_FEED_SELECTOR),
    ]);

    if (username !== currentUsername) return;

    console.log('[reddit-history] comments response:', comments);
    renderComments(container, comments);
  } catch (err) {
    console.error('[reddit-history] failed:', err);
  }
}

function handleUrlChange() {
  const username = getUsernameFromUrl();
  if (username !== currentUsername) {
    currentUsername = username;
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
