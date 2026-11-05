// Synthetic owned processes only. Every fixture has a bounded lifetime even if
// its test fails; IPC contains PIDs/ports, never application output or secrets.
import { spawn } from 'node:child_process';
import net from 'node:net';

const mode = process.argv[2];
setTimeout(() => process.exit(0), 15_000);
if (mode === 'race') {
  process.send({ pid: process.pid });
  setTimeout(() => process.exit(0), 200);
} else if (mode === 'tree' || mode === 'orphan-pipe') {
  const descendant = spawn(process.execPath, [import.meta.filename, 'server'], {
    // Windows normally cleans up non-detached descendants when their Node
    // parent exits. Explicit detachment exercises a genuinely surviving child.
    detached: mode === 'orphan-pipe' && process.platform === 'win32',
    windowsHide: true, stdio: ['ignore', 1, 2, 'ipc'],
  });
  descendant.on('error', () => process.exit(2));
  descendant.on('message', message => {
    process.send({ pid: process.pid, descendantPid: message.pid, port: message.port });
    if (mode === 'orphan-pipe') setTimeout(() => process.exit(0), 50);
  });
} else if (mode === 'server') {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => process.send({ pid: process.pid, port: server.address().port }));
} else {
  process.send?.({ pid: process.pid });
}
