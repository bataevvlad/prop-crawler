import { CronJob } from 'cron';
import { crawl } from './crawler';
import { countDb, getFromDb, saveToDb } from './db';
import { checkBot, sendMessage } from './telegram';
import { log } from './logger';
import { bot_key, chatid, cronSchedule, maxAgeHours, sendDelayMs, sendOnFirstRun, urlOLX, urlOTODOM } from './constants';
import { Offer } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

function ageHours(offer: Offer): number {
  const stamp = new Date(offer.refreshedAt || offer.createdAt).getTime();
  if (Number.isNaN(stamp)) return 0; // unknown age: treat as fresh
  return (Date.now() - stamp) / 3_600_000;
}

function isStale(offer: Offer): boolean {
  return maxAgeHours > 0 && ageHours(offer) > maxAgeHours;
}
const telegramEnabled = Boolean(bot_key && chatid);

async function research(notify: boolean): Promise<void> {
  if (running) {
    log.warn('Previous research still running, skipping this tick');
    return;
  }
  running = true;
  try {
    const offers = await crawl();
    let fresh = 0;
    for (const offer of offers) {
      const existing = await getFromDb(offer.id);
      if (existing) continue;
      fresh += 1;
      await saveToDb(offer);
      if (!notify) continue;
      if (isStale(offer)) {
        log.debug(`Skipping stale ${offer.id} (${ageHours(offer).toFixed(0)}h old): ${offer.title}`);
        continue;
      }
      if (!telegramEnabled) {
        log.info(`NEW ${offer.id}: ${offer.title} | ${offer.price} | ${offer.url}`);
        continue;
      }
      try {
        await sendMessage(offer);
        await sleep(sendDelayMs);
      } catch (error) {
        log.error(`Failed to send ${offer.id}: ${error}`);
      }
    }
    log.info(`Research done: ${offers.length} offers, ${fresh} new${notify ? '' : ' (seeded, not sent)'}`);
  } finally {
    running = false;
  }
}

async function main(): Promise<void> {
  if (!urlOLX && !urlOTODOM) {
    throw new Error('Set URL_OLX and/or URL_OTODOM (see .env.example)');
  }
  if (telegramEnabled) {
    const username = await checkBot();
    log.info(`Telegram bot @${username} OK`);
  } else {
    log.warn('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set: running in log-only mode, new offers are printed here');
  }

  const known = await countDb();
  const firstRun = known === 0;
  log.info(`Known offers in db: ${known}`);
  if (firstRun && !sendOnFirstRun) {
    log.info('First run: seeding db without sending notifications (SEND_ON_FIRST_RUN=true to change)');
  }

  await research(!firstRun || sendOnFirstRun);

  const job = new CronJob(cronSchedule, async () => {
    log.debug('Triggering research');
    try {
      await research(true);
    } catch (error) {
      log.error(`Error while doing research: ${error}`);
    }
  });
  job.start();
  log.info(`Scheduled research with cron "${cronSchedule}"`);
}

main().catch((error) => {
  log.error(`Fatal: ${error}`);
  process.exit(1);
});
