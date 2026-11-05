import { createHash } from 'node:crypto';
import net from 'node:net';
export { stopOwnedChild } from './process-lifecycle.mjs';

// Each scenario has its own /64, while all actors within it share the real
// production OTP caps. These headers are used only against the isolated server.
export function scenarioIp(project, testId, retry) {
  const digest = createHash('sha256').update(JSON.stringify([project, testId, retry])).digest('hex');
  return `fd00:${digest.slice(0, 4)}:${digest.slice(4, 8)}:${digest.slice(8, 12)}::1`;
}
export async function assertPortFree(port = 3000) {
  for (const host of ['127.0.0.1', '::1']) {
    await new Promise((accept, reject) => {
      const probe = net.createServer();
      probe.once('error', error => {
        if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) accept();
        else reject(new Error(`Local E2E port ${port} is unavailable on ${host}`, { cause: error }));
      });
      probe.listen({ port, host, ipv6Only: host === '::1' }, () => probe.close(error => error ? reject(error) : accept()));
    });
  }
}

export async function ownsReadyServer(child, url, token) {
  if (child.exitCode !== null || child.signalCode !== null) throw new Error('Owned local server exited');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    const matches = response.ok && (await response.text()) === token;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Owned local server exited');
    return matches;
  } catch (error) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Owned local server exited', { cause: error });
    return false;
  }
}
