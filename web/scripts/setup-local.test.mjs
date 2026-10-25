import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repairLocalUrl, setupLocal } from './setup-local.mjs';
import { checkLocal } from './check-local.mjs';
import { CLOUDFLARE_ACCOUNT_ID } from './check-resource-bindings.mjs';

test('dotenv quotes and comments determine readiness without exposing values', () => {
  for (const quote of ['"', "'", '`']) {
    const prefix = `BETTER_AUTH_URL=${quote}http://localhost:3000${quote} # local\n`;
    assert.deepEqual(checkLocal(`${prefix}BETTER_AUTH_SECRET=${quote}${quote} # empty`, 'v24.22.1', { CLOUDFLARE_ACCOUNT_ID }).problems, ['BETTER_AUTH_SECRET is missing or empty; supply a private local secret without replacing existing credentials.']);
    assert.deepEqual(checkLocal(`${prefix}BETTER_AUTH_SECRET=${quote}synthetic#hash${quote}# comment`, 'v24.22.1', { CLOUDFLARE_ACCOUNT_ID }).problems, []);
  }
  assert.equal(checkLocal('BETTER_AUTH_URL=http://localhost:3000#comment\nBETTER_AUTH_SECRET=#empty', 'v24.22.1', { CLOUDFLARE_ACCOUNT_ID }).problems.length, 1);
  assert.match(checkLocal('BETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET="" # empty', 'v24.22.1', { CLOUDFLARE_ACCOUNT_ID }).problems.join(), /SECRET is missing or empty/);
  assert.equal(checkLocal('BETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET=synthetic\nBREVO_API_KEY="" # absent', 'v24.22.1', { CLOUDFLARE_ACCOUNT_ID }).mail, false);
});

test('malformed, multiline and duplicate configuration fails safely before repair writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'flag-local-test-'));
  try {
    const file = join(root, '.dev.vars');
    for (const quote of ['"', "'", '`']) {
      const config = `BETTER_AUTH_SECRET=${quote}synthetic\nBETTER_AUTH_URL=https://example.invalid\n${quote}\n`;
      writeFileSync(file, config);
      assert.ok(checkLocal(config, 'v24.22.1', { CLOUDFLARE_ACCOUNT_ID }).problems.length);
      assert.throws(() => setupLocal(file, 'unused', true), /Unsupported/);
      assert.equal(readFileSync(file, 'utf8'), config);
    }
    for (const config of ['BETTER_AUTH_SECRET="unterminated', 'BETTER_AUTH_SECRET="value" trailing', 'not an assignment', 'BETTER_AUTH_SECRET=a\nexport BETTER_AUTH_SECRET=b']) {
      assert.ok(checkLocal(config, 'v24.22.1', { CLOUDFLARE_ACCOUNT_ID }).problems.length);
      assert.throws(() => repairLocalUrl(config), /Unsupported|Duplicate/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('URL repair preserves other bytes and is idempotent', () => {
  for (const url of ['', 'BETTER_AUTH_URL=https://example.invalid\r\n']) {
    const original = '# local\r\nBETTER_AUTH_SECRET=synthetic\r\nBREVO_API_KEY=synthetic-mail\r\n';
    const repaired = repairLocalUrl(original + url);
    assert.ok(repaired.startsWith(original));
    assert.equal(repairLocalUrl(repaired), repaired);
    assert.equal(checkLocal(repaired, 'v24.22.1', { CLOUDFLARE_ACCOUNT_ID }).problems.length, 0);
  }
  assert.throws(() => repairLocalUrl('BETTER_AUTH_URL=a\nBETTER_AUTH_URL=b\n'), /Duplicate/);
});

test('existing file is preserved by default and repair never rotates secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'flag-local-test-'));
  try {
    const file = join(root, '.dev.vars');
    const example = join(root, 'example');
    writeFileSync(example, 'BETTER_AUTH_URL=http://localhost:3000\n');
    setupLocal(file, example);
    const created = readFileSync(file, 'utf8');
    assert.match(created, /BETTER_AUTH_SECRET=[A-Za-z0-9_-]{64}/);
    setupLocal(file, example);
    assert.equal(readFileSync(file, 'utf8'), created);
    const existing = 'BETTER_AUTH_SECRET=synthetic\nRESEND_API_KEY=keep-me';
    writeFileSync(file, existing);
    setupLocal(file, example);
    assert.equal(readFileSync(file, 'utf8'), existing);
    setupLocal(file, example, true);
    assert.equal(readFileSync(file, 'utf8'), repairLocalUrl(existing));
    setupLocal(file, example, true);
    assert.equal(readFileSync(file, 'utf8'), repairLocalUrl(existing));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readiness rejects wrong runtime, URL, missing secret and account without printing credentials', () => {
  const { problems } = checkLocal('BETTER_AUTH_URL=https://example.invalid\nBREVO_API_KEY=do-not-print', 'v24.8.0', { CLOUDFLARE_ACCOUNT_ID: 'wrong' });
  assert.equal(problems.length, 4);
  assert.ok(problems.every(problem => !problem.includes('do-not-print')));
});
