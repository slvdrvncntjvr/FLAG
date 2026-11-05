// Keep the enclosing wait longer than Playwright's finite suite budget so its
// own result and teardown can complete on slower local hosts.
export function playwrightChildWait(args) {
  let suiteTimeout = 900_000;
  let supplied = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--') break;
    if (argument !== '--global-timeout' && !argument.startsWith('--global-timeout=')) continue;
    if (supplied) throw new Error('Only one E2E global timeout is permitted');
    supplied = true;
    const value = argument === '--global-timeout' ? args[++index] : argument.slice('--global-timeout='.length);
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new Error('E2E global timeout must be a positive integer in milliseconds');
    suiteTimeout = Number(value);
    if (!Number.isSafeInteger(suiteTimeout) || suiteTimeout > 1_800_000) throw new Error('E2E global timeout must not exceed 1800000 milliseconds');
  }
  return suiteTimeout + 60_000;
}
