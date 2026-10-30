import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Deliberately support only single-line dotenv assignments. Validate the whole
// file before editing so a credential's continuation can never become a URL.
export function parseLocalConfig(config) {
  const entries = new Map();
  for (const line of config.matchAll(/([^\r\n]*)(?:\r\n|\n|\r|$)/g)) {
    if (!line[1].trim() || /^\s*#/.test(line[1])) continue;
    const assignment = /^[\t ]*(?:export[\t ]+)?([\w.-]+)[\t ]*=[\t ]*(.*)$/.exec(line[1]);
    if (!assignment) throw new Error('Unsupported local dotenv syntax; use single-line assignments.');
    const [, name, raw] = assignment;
    if (entries.has(name)) throw new Error(`Duplicate ${name} assignments; resolve locally before repair.`);
    let value;
    if (/^["'`]/.test(raw)) {
      const quoted = /^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)[\t ]*(?:#.*)?$/.exec(raw);
      if (!quoted) throw new Error('Unsupported local dotenv syntax; use closed single-line quotes and optional comments.');
      value = quoted[1].slice(1, -1);
      if (raw[0] === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    } else {
      value = raw.split('#', 1)[0].trim();
    }
    entries.set(name, { value, start: line.index, end: line.index + line[1].length });
  }
  return entries;
}

export function repairLocalUrl(config) {
  const entry = parseLocalConfig(config).get('BETTER_AUTH_URL');
  if (entry) return `${config.slice(0, entry.start)}BETTER_AUTH_URL=http://localhost:3000${config.slice(entry.end)}`;
  const newline = config.includes('\r\n') ? '\r\n' : '\n';
  return `${config}${config && !config.endsWith('\n') ? newline : ''}BETTER_AUTH_URL=http://localhost:3000${newline}`;
}

export function setupLocal(file, example, repair = false) {
  if (existsSync(file)) {
    if (!repair) return 'Existing .dev.vars preserved; use --repair-url to set only the localhost URL.';
    const before = readFileSync(file, 'utf8');
    const after = repairLocalUrl(before);
    if (after !== before) writeFileSync(file, after);
    return 'Local URL checked/repaired; all other configuration preserved.';
  }
  const config = repairLocalUrl(readFileSync(example, 'utf8'));
  writeFileSync(file, `${config}\nBETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 });
  return 'Created .dev.vars with a fresh local secret; no credentials printed.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.version !== 'v24.22.1') throw new Error('Use pinned Node 24.22.1 before local setup.');
    if (process.argv.slice(2).some(arg => arg !== '--repair-url')) throw new Error('Usage: node scripts/setup-local.mjs [--repair-url]');
    console.log(setupLocal(new URL('../.dev.vars', import.meta.url), new URL('../local-config.example', import.meta.url), process.argv.includes('--repair-url')));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
