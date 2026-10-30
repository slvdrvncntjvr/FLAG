import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { normalizeIP } from '@better-auth/core/utils/ip';
import { assertPortFree, ownsReadyServer, scenarioIp, stopOwnedChild } from './e2e-isolation.mjs';

test('actors in one scenario retain one real OTP bucket; other cases, projects and retries separate', () => {
  const ip = scenarioIp('desktop', 'synthetic-case', 0);
  assert.equal(ip, scenarioIp('desktop', 'synthetic-case', 0));
  const addresses = [ip, scenarioIp('mobile-360', 'synthetic-case', 0), scenarioIp('desktop', 'other-case', 0), scenarioIp('desktop', 'synthetic-case', 1)];
  assert.equal(new Set(addresses.map(address => normalizeIP(address, { ipv6Subnet: 64 }))).size, addresses.length);
  assert.ok(addresses.every(address => net.isIP(address) === 6));
});

for (const host of ['127.0.0.1', '::1']) test(`preflight refuses an occupied ${host} port`, async t => {
  const server = net.createServer();
  try {
    await new Promise((accept, reject) => { server.once('error', reject); server.listen({ port: 0, host, ipv6Only: host === '::1' }, accept); });
  } catch (error) {
    if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) return t.skip('IPv6 unavailable');
    throw error;
  }
  try { await assert.rejects(assertPortFree(server.address().port), error => error.message.includes(`unavailable on ${host}`)); }
  finally { await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())); }
});

test('readiness rejects another healthy server and an exited child', async () => {
  let requests = 0;
  const server = createServer((_request, response) => { requests++; response.end('current-run'); });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const child = { exitCode: null, signalCode: null };
  try {
    assert.equal(await ownsReadyServer(child, url, 'different-run'), false);
    assert.equal(await ownsReadyServer(child, url, 'current-run'), true);
    const before = requests;
    await assert.rejects(ownsReadyServer({ exitCode: 1, signalCode: null }, url, 'current-run'), /exited/);
    await assert.rejects(ownsReadyServer({ exitCode: null, signalCode: 'SIGTERM' }, url, 'current-run'), /exited/);
    assert.equal(requests, before);
  } finally { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
});

test('readiness rechecks process ownership after receiving a matching response', async () => {
  const child = { exitCode: null, signalCode: null };
  const server = createServer((_request, response) => { child.exitCode = 1; response.end('current-run'); });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  try { await assert.rejects(ownsReadyServer(child, `http://127.0.0.1:${server.address().port}/`, 'current-run'), /exited/); }
  finally { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
});

test('teardown accepts observed closure after a Windows kill-command normal-exit race', async () => {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  await stopOwnedChild(child, () => {
    queueMicrotask(() => { child.exitCode = 0; child.emit('close', 0); });
    return { status: 128 }; // The exit event cannot be processed until terminate returns.
  }, 100);
  assert.equal(child.listenerCount('close'), 0);
});

test('teardown requires actual closure even when termination reports success', async () => {
  const child = new EventEmitter();
  await assert.rejects(stopOwnedChild(child, () => ({ status: 0 }), 10), /did not close/);
  assert.equal(child.listenerCount('close'), 0);
});

test('teardown retains a failed termination when the child remains live', async () => {
  const child = new EventEmitter();
  await assert.rejects(stopOwnedChild(child, () => { throw new Error('synthetic kill failure'); }, 10), error => {
    assert.equal(error.cause.message, 'synthetic kill failure');
    return /did not close/.test(error.message);
  });
});
