import 'dotenv/config';

// All values can be set in a `.env` file (see `.env.example`) or as environment
// variables. Leave a URL empty to disable that source.
export const urlOLX = process.env.URL_OLX || '';
export const urlOTODOM = process.env.URL_OTODOM || '';
export const bot_key = process.env.TELEGRAM_BOT_TOKEN || '';
// One or more chat ids, comma separated (private chats, groups or channels).
export const chatIds = (process.env.TELEGRAM_CHAT_ID || '').split(',').map((id) => id.trim()).filter(Boolean);

// On the very first run (empty db) every listing is "new". By default we only
// remember them and start notifying from the next check. Set to "true" to send
// everything on the first run as well.
export const sendOnFirstRun = process.env.SEND_ON_FIRST_RUN === 'true';

// Cron schedule for re-checking. Default: every minute.
export const cronSchedule = process.env.CRON_SCHEDULE || '* * * * *';

// Only notify about offers created within this many hours. Older ones are
// remembered silently. 0 disables the check.
export const maxAgeHours = Number(process.env.MAX_AGE_HOURS || 24);

// Owners can "refresh" (bump) an old listing back to the top. By default such
// bumps do not count as fresh; set to "true" to treat a bump like a new offer.
export const includeBumped = process.env.INCLUDE_BUMPED === 'true';

// Pause between Telegram messages (ms) to stay under the ~20 msg/min group limit.
export const sendDelayMs = Number(process.env.SEND_DELAY_MS || 3500);

export const noImageUrl = 'https://media.istockphoto.com/vectors/no-image-available-sign-vector-id922962354?k=20&m=922962354&s=612x612&w=0&h=f-9tPXlFXtz9vg_-WonCXKCdBuPUevOBkp3DQ-i0xqo=';

export const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
