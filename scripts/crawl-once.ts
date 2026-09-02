// Dry run: fetch both sources and print what would be sent. No db, no Telegram.
import { crawl } from '../crawler';
import { formatMessage } from '../telegram';

crawl().then((offers) => {
  for (const offer of offers) {
    console.log('---', offer.id);
    console.log(formatMessage(offer).replace(/<[^>]+>/g, ''));
    console.log('image:', offer.image);
  }
  console.log(`\nTotal: ${offers.length} offers`);
  const bad = offers.filter((o) => !o.title || !o.url || !o.id);
  if (bad.length) {
    console.error(`${bad.length} offers missing title/url/id`);
    process.exit(1);
  }
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
