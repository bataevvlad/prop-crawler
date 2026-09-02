import * as fs from 'fs/promises';
import * as path from 'path';
import { Offer } from './types';

// One JSON file per offer in ./db, keyed by offer id.
const DB_DIR = 'db';

function fileFor(key: string): string {
  return path.join(DB_DIR, `${key.replace(/[^\w.-]/g, '_')}.json`);
}

export async function getFromDb(key: string): Promise<Offer | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), 'utf8')) as Offer;
  } catch {
    return null;
  }
}

export async function saveToDb(offer: Offer): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  await fs.writeFile(fileFor(offer.id), JSON.stringify(offer, null, 2));
}

export async function countDb(): Promise<number> {
  try {
    return (await fs.readdir(DB_DIR)).filter((name) => name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}
