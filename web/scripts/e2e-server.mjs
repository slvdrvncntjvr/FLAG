import { createServer } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import next from 'next';

// A single owned server process avoids the `next dev` supervisor restarting or
// exiting while its worker still holds the port or temporary application files.
const temp = dirname(process.env.E2E_OTP_FILE ?? '');
const token = process.env.E2E_READY_TOKEN;
if (!basename(temp).startsWith('flag-e2e-') || resolve(process.cwd()) !== resolve(join(temp, 'app'))
  || !token || !/^[a-f0-9]{48}$/.test(token)) throw new Error('Owned isolated E2E application required');
const app = next({ dev: true, dir: process.cwd(), hostname: 'localhost', port: 3000, webpack: true });
const handle = app.getRequestHandler();
const server = createServer((request, response) => {
  if (request.url === `/__flag_e2e_ready_${token}`) {
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    response.end(token);
    return;
  }
  void handle(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
await app.prepare();
const upgrade = app.getUpgradeHandler();
server.on('upgrade', (request, socket, head) => { void upgrade(request, socket, head).catch(() => socket.destroy()); });
await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(3000, 'localhost', accept);
});
console.log('Owned isolated Next server listening.');
