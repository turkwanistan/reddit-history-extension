# Reddit Comment History Extension

## Problem

Reddit's current UI no longer reliably shows a user's comment/post history when you
click into their profile (`reddit.com/user/<username>` or the older `/u/<username>`,
which redirects there) — the overview tab can come up blank. Right now the workaround
is Googling the username to find their activity indirectly. A handful of existing
websites solve this (e.g. https://rosint.dev/), but there's no Chrome extension that
does it inline on Reddit itself.

## Intent

Build a Manifest V3 Chrome extension, from scratch, as a learning project (no prior
Chrome extension experience). When visiting a Reddit profile page, the extension
detects the username from the URL and renders that user's comment (and possibly post)
history directly into the page, replacing the blank area.

This is explicitly a learning project — prioritize things that teach real extension
concepts (content scripts, background service workers, host permissions, SPA
navigation detection) over the fastest possible hack.

## Data source: Arctic Shift API

Investigated two reference projects:
- https://github.com/ArthurHeitmann/arctic_shift_ui — SvelteKit frontend, just calls the API below
- https://github.com/ArthurHeitmann/arctic_shift — the actual data project (Pushshift-successor, archives Reddit posts/comments)

Arctic Shift exposes a free, public, **unauthenticated** REST API — this is what
`arctic_shift_ui` and presumably rosint.dev are built on:

- Base URL: `https://arctic-shift.photon-reddit.com`
- Relevant endpoint: `/api/comments/search?author=<username>&limit=100&sort=desc`
  (also `/api/posts/search?author=<username>...` for submissions)
- Pagination via `after`/`before` (dates), `limit` up to 100 (or `"auto"` for more)
- Full API docs: https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md
- No official uptime/performance guarantee (their own words) — a hobby-run free service,
  not something to depend on for anything beyond a personal-use extension.

**Why this beats hitting Reddit's own JSON endpoints directly:** no auth or CORS
fight with Reddit itself, sidesteps Reddit's 2023 third-party API lockdown entirely,
and it includes deleted/removed comments (real archive, not a live mirror). Trade-off:
data comes from periodic dumps, so very recent comments may lag behind live Reddit.

**Verified 2026-07-29:** `arctic-shift.photon-reddit.com` responds with
`access-control-allow-origin: *` — wide open CORS. The content script can `fetch()`
it directly; no background service worker hop is required just to get around CORS.
(`curl -s -D - -o /dev/null "https://arctic-shift.photon-reddit.com/api/comments/search?author=spez&limit=1" -H "Origin: chrome-extension://test"` → `HTTP/2 200`, `access-control-allow-origin: *`)

## Planned architecture (Manifest V3)

1. **Content script**, matches `*://www.reddit.com/user/*` (and `/u/*`).
   - Reddit's new UI is a React SPA — navigating between profiles does **not** trigger
     a full page load, it's a `history.pushState` navigation. The content script needs
     to detect URL changes itself (patch `pushState`/`replaceState`, or listen for
     `popstate` + a `MutationObserver` fallback) rather than relying on script
     injection re-running per-navigation.
   - Extracts `<username>` from the URL when it changes.
2. **Background service worker** (if CORS requires it) — does the actual `fetch()` to
   Arctic Shift's API using `host_permissions` for `arctic-shift.photon-reddit.com`,
   returns parsed JSON to the content script via `chrome.runtime.sendMessage`.
3. **Rendering** — content script builds simple DOM elements (no framework needed) to
   replace the blank profile content area: list of comments with subreddit, snippet,
   timestamp, score, and a link back to the original permalink.
4. **Pagination** — "load more" using the `after`/`before` cursor from the API.

## Open decisions (not yet settled)

- Scope: comments only, or comments + posts/submissions?
- Rendering: fully replace Reddit's blank content area, or inject a separate panel
  alongside it?
- Whether to publish to the Chrome Web Store eventually, or keep it as an unpacked
  personal extension (affects whether a privacy policy / review process matters).

## Next steps

1. ~~Verify Arctic Shift's CORS behavior~~ — done, see above. Content-script-only
   fetch works; no background worker needed for CORS.
2. Scaffold `manifest.json` (MV3) and content script (no background worker needed
   unless a future need arises).
3. Get username detection + a raw JSON fetch working end-to-end first: `console.log`
   the response before building any rendering.
4. Build the DOM rendering once data is confirmed flowing.
5. Handle pagination.
6. (Later) Icon, packaging, decide on Web Store publishing.
