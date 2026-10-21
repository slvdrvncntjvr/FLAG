import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error(`Browser error: ${error.message.replace(/\b\d{6}\b/g, '[redacted]')}`));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== 'localhost') throw new Error('E2E request escaped localhost');
    return route.fallback();
  });
});

test('anonymous routes redirect and deny indexing (INV-7)', async ({ page, request }) => {
  await page.goto('/home');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/sign-in$/);
  for (const path of ['/home', '/onboarding', '/sign-in', '/legal/privacy', '/legal/terms']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
  }
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
});

for (const role of ['freelancer', 'client'] as const) {
  test(`real local OTP, ${role} acknowledgments, retries and session revocation`, async ({ page, context, request }) => {
    const email = `e2e-${role}-${Date.now()}@example.invalid`;
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(email);
    // Transport fault injection only; the successful retries below hit real D1 auth.
    await page.route('**/api/auth/email-otp/send-verification-otp', route => route.abort('failed'), { times: 1 });
    await page.getByRole('button', { name: 'Send code', exact: true }).click();
    await expect(page.locator('p[role=alert]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send code', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Send code', exact: true }).click();
    await expect(page.getByLabel('Code', { exact: true })).toBeVisible();
    let otp = '';
    await expect.poll(async () => {
      const codes: Record<string, string> = JSON.parse(await readFile(process.env.E2E_OTP_FILE!, 'utf8'));
      otp = codes[email] ?? ''; return otp.length;
    }).toBe(6);
    await page.getByLabel('Code', { exact: true }).fill(otp);
    await page.route('**/api/auth/sign-in/email-otp', route => route.abort('failed'), { times: 1 });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('p[role=alert]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    for (const fault of [
      { status: 503, code: 'EMAIL_DELIVERY_FAILED', message: 'Could not check the code. Try again later.' },
      { status: 400, code: 'INVALID_OTP', message: 'Code is incorrect or expired.' },
      { status: 400, code: 'OTP_EXPIRED', message: 'Code is incorrect or expired.' },
      { status: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again after fifteen minutes.' },
    ]) {
      await page.route('**/api/auth/sign-in/email-otp', route => route.fulfill({
        status: fault.status, contentType: 'application/json', body: JSON.stringify({ code: fault.code, message: 'Injected UI fault' }),
      }), { times: 1 });
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.locator('p[role=alert]')).toHaveText(fault.message);
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    }
    const authenticatedResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/sign-in/email-otp'));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const response = await authenticatedResponse;
    expect(response.status()).toBe(200);
    const sessionCookies = await context.cookies();
    expect(sessionCookies.some(cookie => cookie.name.includes('session_token'))).toBe(true);
    const sessionResponse = await context.request.get('/api/auth/get-session');
    const session: { user?: { email?: string } } | null = await sessionResponse.json();
    expect(session?.user?.email).toBe(email);
    console.log('Real OTP response 200; session cookie present; local get-session matches synthetic account.');
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto('/home');
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole('radio', { name: role === 'client' ? /^Client/ : /^Freelancer/ }).check();
    await expect(page.getByRole('checkbox')).toHaveCount(role === 'freelancer' ? 5 : 2);
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
    expect(await page.getByRole('checkbox').count()).toBe(role === 'freelancer' ? 5 : 2);
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: role === 'client' ? 'Client account' : 'Freelancer account' })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/home$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.route('**/api/auth/sign-out', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary local fault' }) }), { times: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('p[role=alert]')).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.route('**/api/auth/sign-out', route => route.abort('failed'), { times: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('p[role=alert]')).toHaveText('Could not sign out. Try again later.');
    await expect(page).toHaveURL(/\/home$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Save the old cookie and replay it after logout to prove server revocation.
    const cookies = await context.cookies();
    const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL('http://localhost:3000/');
    await page.goto('/home');
    await expect(page).toHaveURL(/\/sign-in$/);
    const revoked = await request.get('/api/auth/get-session', { headers: { cookie: cookieHeader } });
    expect(await revoked.json()).toBeNull();
  });
}
