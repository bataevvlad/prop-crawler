import { bot_key, chatIds } from './constants';
import { Offer } from './types';
import { log } from './logger';

const API = `https://api.telegram.org/bot${bot_key}`;

interface TelegramResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

async function call(method: string, body: Record<string, unknown>): Promise<TelegramResponse> {
  const response = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as TelegramResponse;
  if (json.ok) return json;

  if (response.status === 429 && json.parameters?.retry_after) {
    const wait = json.parameters.retry_after;
    log.warn(`Telegram rate limit, retrying in ${wait}s`);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return call(method, body);
  }
  throw new Error(`Telegram ${method} failed: ${response.status} ${json.description || ''}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMessage(offer: Offer): string {
  const { title, price, location, date, url, source } = offer;
  const tag = source === 'olx' ? '#olx' : '#otodom';
  const meta = [location, date].filter(Boolean).join(', ');
  return `<a href="${url}">${escapeHtml(title)}</a>\n\n<b>${escapeHtml(price)}</b>\n${escapeHtml(meta)}\n${tag}`;
}

export async function sendMessage(offer: Offer): Promise<void> {
  if (!bot_key || chatIds.length === 0) {
    throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured');
  }
  const caption = formatMessage(offer);
  const failures: string[] = [];

  for (const chatId of chatIds) {
    log.debug(`Sending offer ${offer.id} to chat ${chatId}`);
    try {
      try {
        // Telegram downloads the photo itself; no need to store it locally.
        await call('sendPhoto', { chat_id: chatId, photo: offer.image, caption, parse_mode: 'HTML' });
      } catch (error) {
        // Photo URL rejected (too large, wrong type, expired) - fall back to text.
        log.warn(`sendPhoto failed for ${offer.id} in ${chatId}, falling back to text: ${error}`);
        await call('sendMessage', { chat_id: chatId, text: caption, parse_mode: 'HTML' });
      }
    } catch (error) {
      failures.push(`${chatId}: ${error}`);
    }
  }
  if (failures.length) {
    throw new Error(`Failed for ${failures.length}/${chatIds.length} chats: ${failures.join('; ')}`);
  }
}

/** Verifies the bot token; returns the bot username. */
export async function checkBot(): Promise<string> {
  const json = (await call('getMe', {})) as TelegramResponse & { result?: { username?: string } };
  return json.result?.username || 'unknown';
}
