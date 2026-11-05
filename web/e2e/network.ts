import { test, type Page } from '@playwright/test';
import { scenarioIp } from '../scripts/e2e-isolation.mjs';

export async function isolateOtpIp(page: Page): Promise<string> {
  if (!process.env.E2E_OTP_FILE) throw new Error('Isolated E2E harness required');
  const info = test.info();
  const ip = scenarioIp(info.project.name, info.testId, info.retry);
  await page.setExtraHTTPHeaders({ 'cf-connecting-ip': ip });
  return ip;
}
