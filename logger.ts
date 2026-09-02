import * as fs from 'fs';

const LOG_FILE = 'crawler.log';

function write(level: string, message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  console.log(line);
  fs.appendFile(LOG_FILE, line + '\n', () => undefined);
}

export const log = {
  debug: (message: string) => write('debug', message),
  info: (message: string) => write('info', message),
  warn: (message: string) => write('warn', message),
  error: (message: string) => write('error', message),
};
