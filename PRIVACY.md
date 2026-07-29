# Privacy Policy — Reddit Comment History

**Effective date:** 2026-07-29

This extension does not collect, transmit, sell, or share any personal data. This
page explains exactly what it does with the information it touches, in plain
language, matching what the code actually does.

## What the extension does

When you visit a Reddit profile page (`reddit.com/user/<username>` or
`reddit.com/u/<username>`), the extension reads the username directly from the
page URL you are already viewing. If Reddit shows that profile's comment/post
history as blank, the extension requests that same username's public comment
and post history from [Arctic Shift](https://arctic-shift.photon-reddit.com)
— a free, independent, unauthenticated archive of historical Reddit data —
and displays the results directly on the page in place of the blank area.

That's the entire data flow. There is no server operated by this extension's
developer. Nothing passes through any middleman except your browser and
Arctic Shift's API.

## What is sent to third parties

- **To Arctic Shift** (`arctic-shift.photon-reddit.com`): only the Reddit
  username currently being viewed, plus pagination parameters (result limit,
  sort order, and a date cursor for "load more"). This is the same username
  that is already publicly visible in the page's URL — the extension does
  not send your own Reddit username, account information, or any browsing
  history beyond the single profile page you're currently on.
- **To Reddit**: nothing beyond the normal page requests your browser already
  makes by visiting reddit.com. The extension does not read, modify, or
  transmit your Reddit cookies, login session, or account data.
- **To anyone else**: nothing. No analytics, no error/crash reporting
  service, no advertising networks, no fingerprinting.

## What is stored locally

The extension uses Chrome's local storage (`chrome.storage.local`) to
remember exactly two preferences between visits, so the extension doesn't
reset to defaults every time you look at a profile:

- which tab you last used (Comments or Posts)
- which sort order you last used (Newest / Oldest / Top score / Most
  downvoted)

This is stored only on your own device. It is never transmitted anywhere,
never synced to an account, and contains no personal or identifying
information — just two short preference strings.

## Clipboard access

The "copy link" button writes a single Reddit permalink URL to your
clipboard, and only when you click it. The extension never reads your
clipboard.

## What the extension does not do

- No user accounts, sign-in, or authentication of any kind.
- No cookies set by the extension.
- No analytics, telemetry, or usage tracking.
- No advertising.
- No data is sold or shared with any third party for any purpose.

## Third-party service

Arctic Shift is operated independently of this extension and has its own
data practices; see [arctic-shift.photon-reddit.com](https://arctic-shift.photon-reddit.com).
It is a free, volunteer-run service with no uptime guarantee — if it is slow,
unavailable, or discontinued, this extension will be unable to fetch history
until it is available again.

## Changes to this policy

If this policy changes, the "Effective date" above will be updated and the
change will be reflected in this same file in the extension's source
repository.

## Contact

Questions about this policy or the extension can be directed to:
- Email: juan.rittgers@gmail.com
- Source code: https://github.com/turkwanistan/reddit-history-extension
