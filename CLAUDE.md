# prop-crawler — notes for AI assistants

Telegram notifier for new rental listings on olx.pl and otodom.pl (Poznań).
Read this before touching anything. Human-facing docs are in `README.MD`.

## What runs where

- **Production is this MacBook**, via a launchd user agent `com.propcrawler`
  (`~/Library/LaunchAgents/com.propcrawler.plist`, template in
  `deploy/com.propcrawler.plist`). It runs `tsx index.ts` wrapped in
  `caffeinate -i`. Starts at login, restarts on crash.
  - status:  `launchctl print gui/$UID/com.propcrawler | grep state`
  - logs:    `tail -f launchd.log` (also `crawler.log`, both gitignored)
  - restart: `launchctl kickstart -k gui/$UID/com.propcrawler` (needed after any `.env` change)
  - stop:    `launchctl bootout gui/$UID/com.propcrawler`
- **Do not start a second instance** with `npm start` while the agent is
  running; both would send duplicate Telegram messages. Check `pgrep -fl "tsx index.ts"` first.
- Cloud hosting was tried (GCP e2-micro) and abandoned on 2026-09-02 because
  Google Billing kept closing the account. The owner decided the MacBook is
  fine. Do not propose cloud again unless asked. An empty GCP project
  `prop-crawler-poznan` may still exist; it costs nothing.

## Repos

- `origin` = the owner's fork `github.com/bataevvlad/prop-crawler` (push here, `master`).
- `upstream` = a colleague's original `malashkevich/prop-crawler`. **Never push there.**
- No AI attribution in commits or PRs. Conventional Commits, subject ≤ 50 chars.

## Config and secrets

- All config is in `.env` (gitignored, mode 600). Template: `.env.example`.
- `TELEGRAM_BOT_TOKEN` is a secret. Never print it, commit it, or paste it into
  chat output. Mask it when showing `.env` (`sed 's/\(TOKEN=\).*/\1***/'`).
- `TELEGRAM_CHAT_ID` is comma separated; currently two private chats (owner +
  a friend). A new recipient must press Start on `@Poznan_Flats_bot`; their id
  then shows up in `https://api.telegram.org/bot<TOKEN>/getUpdates`.
- Freshness: `MAX_AGE_HOURS` (default 24) is judged on the **creation** date.
  Owners "bump" months-old ads back to page 1; those are dropped unless
  `INCLUDE_BUMPED=true`. The owner wants only brand-new listings.
- First run with an empty `db/` seeds silently (`SEND_ON_FIRST_RUN=false`).
  If you ever `rm -rf db`, this prevents a flood of ~60 messages.

## How scraping works (and why)

- Both sites are React/Next SSR. We do **not** parse markup. We read the JSON
  each page embeds for hydration:
  - OLX: `window.__PRERENDERED_STATE__ = "<json string>"` → `listing.listing.ads[]`
  - Otodom: `<script id="__NEXT_DATA__">` → `props.pageProps.data.searchAds.items[]`
- Fetching uses Node's built-in `fetch` with a Chrome User-Agent. **curl gets
  403 from OLX's CloudFront** (TLS fingerprint), so test with `npm run crawl`
  or `node -e`, not curl.
- Otodom timestamps (`dateCreated`, `pushedUpAt`) have no timezone and are
  Warsaw local time; `warsawToIso()` in `crawler.ts` handles it.
- The listing includes promoted ads, so ~10–15 of ~65 items per fetch are
  weeks old. That is expected; the age filter handles it.
- Telegram: raw Bot API via fetch. `sendPhoto` with the image URL, falls back
  to `sendMessage` on failure, retries on 429. No local image downloads.

## Toolchain

- Node ≥ 20 (machine has 25). `tsx` runs TS directly; `ts-node` does not work
  on Node 25, don't reintroduce it.
- Deps kept minimal on purpose: `cron`, `dotenv`. Old `got`, `cheerio`, `jfs`,
  `node-telegram-bot-api`, `logger` were removed (unmaintained / vulnerable).
- `npm run typecheck` before committing. `npm run crawl` is a dry run that
  fetches both sites and prints parsed offers without touching `db/` or Telegram.

## If it stops working

1. `tail -50 launchd.log launchd.err`.
2. `npm run crawl`. If it says `__PRERENDERED_STATE__ not found` or
   `__NEXT_DATA__ not found`, the site changed its embedded state or served a
   bot-check page. Fetch the page with Node, save the HTML, and look for the
   new JSON blob; update the regex / path in `crawler.ts`.
3. `HTTP 403` from OLX: usually transient; if persistent, the User-Agent in
   `constants.ts` may need updating to a current Chrome version.
4. Telegram `401`: token revoked. `400 chat not found`: recipient never
   pressed Start, or blocked the bot.
