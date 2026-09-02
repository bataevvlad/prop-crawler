import { noImageUrl, urlOLX, urlOTODOM, userAgent } from './constants';
import { Offer } from './types';
import { log } from './logger';

/**
 * Both sites are server-rendered React/Next.js apps. Instead of scraping the
 * (frequently changing) markup, we read the JSON state each page embeds for
 * hydration:
 *   - OLX:    `window.__PRERENDERED_STATE__ = "<json string>"`
 *   - Otodom: `<script id="__NEXT_DATA__" type="application/json">{...}</script>`
 */
export async function crawl(): Promise<Offer[]> {
  const results = await Promise.allSettled([
    urlOLX ? crawlOLX(urlOLX) : Promise.resolve([] as Offer[]),
    urlOTODOM ? crawlOTODOM(urlOTODOM) : Promise.resolve([] as Offer[]),
  ]);

  const offers: Offer[] = [];
  results.forEach((result, index) => {
    const source = index === 0 ? 'OLX' : 'Otodom';
    if (result.status === 'fulfilled') {
      log.debug(`${source}: ${result.value.length} offers`);
      offers.push(...result.value);
    } else {
      log.error(`${source} crawl failed: ${result.reason}`);
    }
  });
  return offers;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

// ---------------------------------------------------------------------------
// OLX
// ---------------------------------------------------------------------------

interface OlxAd {
  id: number;
  title: string;
  url: string;
  createdTime?: string;
  lastRefreshTime?: string;
  price?: { displayValue?: string };
  location?: { pathName?: string; cityName?: string; districtName?: string };
  photos?: string[];
}

export function parseOLX(html: string): Offer[] {
  const match = html.match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*");/);
  if (!match) {
    throw new Error('OLX: __PRERENDERED_STATE__ not found in page');
  }
  // The state is a JSON string literal containing JSON.
  const state = JSON.parse(JSON.parse(match[1]));
  const ads: OlxAd[] = state?.listing?.listing?.ads ?? [];

  return ads.map((ad) => {
    const image = ad.photos?.[0]
      ? ad.photos[0].replace(/;s=\d+x\d+.*$/, ';s=1280x1024')
      : noImageUrl;
    return {
      id: `olx-${ad.id}`,
      source: 'olx',
      title: ad.title,
      price: ad.price?.displayValue || 'brak ceny',
      location: ad.location?.pathName
        || [ad.location?.cityName, ad.location?.districtName].filter(Boolean).join(', '),
      date: formatDate(ad.createdTime),
      url: ad.url,
      image,
      createdAt: ad.createdTime || '',
      refreshedAt: ad.lastRefreshTime || ad.createdTime || '',
    };
  });
}

async function crawlOLX(url: string): Promise<Offer[]> {
  log.debug('Crawling OLX...');
  return parseOLX(await fetchHtml(url));
}

// ---------------------------------------------------------------------------
// Otodom
// ---------------------------------------------------------------------------

interface OtodomItem {
  id: number;
  title: string;
  slug: string;
  dateCreated?: string;
  createdAtFirst?: string | null;
  pushedUpAt?: string | null;
  totalPrice?: { value: number; currency: string } | null;
  rentPrice?: { value: number; currency: string } | null;
  areaInSquareMeters?: number | null;
  roomsNumber?: string | null;
  hidePrice?: boolean;
  images?: { medium?: string; large?: string }[];
  location?: {
    address?: {
      street?: { name?: string } | null;
      city?: { name?: string } | null;
    } | null;
    reverseGeocoding?: {
      locations?: { name: string; locationLevel: string }[];
    } | null;
  } | null;
}

export function parseOTODOM(html: string): Offer[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('Otodom: __NEXT_DATA__ not found in page');
  }
  const data = JSON.parse(match[1]);
  const items: OtodomItem[] = data?.props?.pageProps?.data?.searchAds?.items ?? [];

  return items.map((item) => {
    const price = item.hidePrice || !item.totalPrice
      ? 'zapytaj o cenę'
      : formatMoney(item.totalPrice.value, item.totalPrice.currency)
        + (item.rentPrice?.value ? ` (+ ${formatMoney(item.rentPrice.value, item.rentPrice.currency)} czynsz)` : '');

    const details = [
      item.areaInSquareMeters ? `${item.areaInSquareMeters} m²` : '',
      item.roomsNumber ? `${roomsToNumber(item.roomsNumber)} pok.` : '',
    ].filter(Boolean).join(', ');

    const geo = item.location?.reverseGeocoding?.locations ?? [];
    const district = geo.find((l) => l.locationLevel === 'district')?.name;
    const city = item.location?.address?.city?.name
      || geo.find((l) => l.locationLevel === 'city_or_village')?.name;
    const street = item.location?.address?.street?.name;
    const location = [street, district, city].filter(Boolean).join(', ');

    return {
      id: `otodom-${item.id}`,
      source: 'otodom',
      title: details ? `${item.title} (${details})` : item.title,
      price,
      location,
      date: formatDate(item.dateCreated),
      url: `https://www.otodom.pl/pl/oferta/${item.slug}`,
      image: item.images?.[0]?.large || item.images?.[0]?.medium || noImageUrl,
      createdAt: warsawToIso(item.createdAtFirst || item.dateCreated),
      refreshedAt: warsawToIso(item.pushedUpAt || item.dateCreated),
    };
  });
}

async function crawlOTODOM(url: string): Promise<Offer[]> {
  log.debug('Crawling Otodom...');
  return parseOTODOM(await fetchHtml(url));
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Otodom timestamps look like "2026-09-02 17:22:34" with no zone; they are
// Warsaw local time. Convert to ISO with the correct offset so the age check
// works regardless of the server's timezone.
export function warsawToIso(value?: string | null): string {
  if (!value) return '';
  if (/[zZ]|[+-]\d\d:\d\d$/.test(value)) return value;
  const naive = new Date(value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(naive.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw', timeZoneName: 'longOffset',
  }).formatToParts(naive);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00';
  return value.replace(' ', 'T') + (offset || '+00:00');
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(warsawToIso(value));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' });
}

function formatMoney(value: number, currency: string): string {
  const symbol = currency === 'PLN' ? 'zł' : currency;
  return `${value.toLocaleString('pl-PL')} ${symbol}`;
}

const ROOMS: Record<string, string> = {
  ONE: '1', TWO: '2', THREE: '3', FOUR: '4', FIVE: '5',
  SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', TEN: '10', MORE: '10+',
};

function roomsToNumber(value: string): string {
  return ROOMS[value] || value;
}
