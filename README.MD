# Property rent apartment finder in Poland

Notifier for new rental offers on olx.pl and otodom.pl. While running, it
re-checks the search pages every minute and posts each new offer to a Telegram
chat or channel (photo + title, price, location, date, link).

## How it works

Both sites are server-rendered React apps and embed the listing data as JSON
for hydration. The crawler reads that JSON instead of scraping the markup:

- OLX: `window.__PRERENDERED_STATE__` -> `listing.listing.ads`
- Otodom: `<script id="__NEXT_DATA__">` -> `props.pageProps.data.searchAds.items`

Seen offers are stored as `db/<source>-<id>.json`. Only offers not yet in `db/`
are sent.

## Setup

Requirements: Node.js 20 or newer.

```
npm install
cp .env.example .env
```

Then edit `.env`:

### Search URLs

For OLX:

1. Open https://www.olx.pl/nieruchomosci/mieszkania/wynajem/
2. Choose city and filters.
3. Copy the URL from the address bar into `URL_OLX`.

For Otodom:

1. Open https://www.otodom.pl/pl/wyniki/wynajem/mieszkanie/
2. Choose city and filters.
3. Copy the URL from the address bar into `URL_OTODOM`.

Leave either URL empty to disable that source.

### Telegram bot

1. Create a bot with @BotFather and copy its token into `TELEGRAM_BOT_TOKEN`.
2. Create a channel or group and add the bot as administrator.
3. Get the chat id (for example with @getidsbot or @userinfobot) and put it
   into `TELEGRAM_CHAT_ID`. Channel ids look like `-100xxxxxxxxxx`.

If the token or chat id is missing the crawler still runs and prints new offers
to the log instead of sending them.

### Optional settings

| Variable            | Default       | Meaning                                                    |
| ------------------- | ------------- | ---------------------------------------------------------- |
| `SEND_ON_FIRST_RUN` | `false`       | On an empty `db/` every listing is new. By default the first run only remembers them. |
| `CRON_SCHEDULE`     | `* * * * *`   | How often to re-check (cron syntax).                       |
| `SEND_DELAY_MS`     | `3500`        | Pause between Telegram messages (group limit ~20/min).     |

## Running

```
npm run crawl   # dry run: fetch both sources and print parsed offers, nothing sent
npm start       # run the notifier
tail -f crawler.log
```

Keep the terminal open, or run it under a process manager (pm2, launchd,
systemd). Example launchd agent for macOS (`~/Library/LaunchAgents/crawler.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>crawler</string>
    <key>WorkingDirectory</key>
    <string>/path/to/prop-crawler</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npm</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/path/to/prop-crawler/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/prop-crawler/launchd.err</string>
</dict>
</plist>
```

Load it with `launchctl load ~/Library/LaunchAgents/crawler.plist`.

## Troubleshooting

- `OLX: __PRERENDERED_STATE__ not found` or `Otodom: __NEXT_DATA__ not found`:
  the site changed its page structure or served a bot-check page. Run
  `npm run crawl` and inspect.
- `HTTP 403` from OLX: the request was blocked by CloudFront. Node's built-in
  fetch works; plain curl does not. Try again in a few minutes.
- `Telegram getMe failed: 401`: wrong bot token.
- `Telegram sendPhoto failed: 400 ... chat not found`: wrong chat id, or the bot
  is not a member/admin of the chat.
