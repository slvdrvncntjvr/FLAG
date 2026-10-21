import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const config = readFileSync(new URL('../local-config.example', import.meta.url), 'utf8');
writeFileSync(new URL('../.dev.vars', import.meta.url), `${config}\nBETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 });
console.log('Created web/.dev.vars with a fresh local secret; no credentials printed.');
