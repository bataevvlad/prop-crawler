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
   into `TELEGRAM_CHAT_ID`. Channel ids look like `-100xxxxxxxxxx`. Several
   recipients: comma separated, e.g. `123,456`. Each private recipient must
   press Start on the bot first.

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

Keep the terminal open, or run it under a process manager.

### macOS: run permanently with launchd

`deploy/com.propcrawler.plist` starts the crawler at login, restarts it on
crash, and wraps it in `caffeinate -i` so the Mac does not idle-sleep while it
runs. Closing the lid still sleeps the machine, so keep it open and plugged in
(or disable lid sleep with a tool like Amphetamine).

```
sed -e "s#/path/to/prop-crawler#$PWD#g" -e "s#/path/to/node/bin#$(dirname $(which node))#g" \
  deploy/com.propcrawler.plist > ~/Library/LaunchAgents/com.propcrawler.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.propcrawler.plist
```

Manage it:

```
launchctl print gui/$UID/com.propcrawler | grep state   # status
tail -f launchd.log                                       # logs
launchctl kickstart -k gui/$UID/com.propcrawler          # restart (after editing .env)
launchctl bootout gui/$UID/com.propcrawler               # stop and uninstall
```

## Running 24/7 for free on Google Cloud

The Always Free tier includes one `e2-micro` VM (us-west1, us-central1 or
us-east1 only). Plenty for this crawler.

1. Install the gcloud CLI and log in:
   ```
   brew install --cask google-cloud-sdk
   gcloud init
   ```
2. Create the VM (requires a project with billing enabled; the e2-micro itself
   is not charged):
   ```
   gcloud compute instances create prop-crawler \
     --zone=us-central1-a --machine-type=e2-micro \
     --image-family=debian-12 --image-project=debian-cloud \
     --boot-disk-size=30GB --boot-disk-type=pd-standard
   ```
3. SSH in and run the setup script:
   ```
   gcloud compute ssh prop-crawler --zone=us-central1-a
   curl -fsSL https://raw.githubusercontent.com/bataevvlad/prop-crawler/master/deploy/setup-gcp.sh | bash
   sudo nano /opt/prop-crawler/.env      # fill in URLs, token, chat id
   sudo systemctl start crawler
   journalctl -u crawler -f
   ```

The service (`deploy/crawler.service`) restarts on crash and on reboot.

## Troubleshooting

- `OLX: __PRERENDERED_STATE__ not found` or `Otodom: __NEXT_DATA__ not found`:
  the site changed its page structure or served a bot-check page. Run
  `npm run crawl` and inspect.
- `HTTP 403` from OLX: the request was blocked by CloudFront. Node's built-in
  fetch works; plain curl does not. Try again in a few minutes.
- `Telegram getMe failed: 401`: wrong bot token.
- `Telegram sendPhoto failed: 400 ... chat not found`: wrong chat id, or the bot
  is not a member/admin of the chat.
