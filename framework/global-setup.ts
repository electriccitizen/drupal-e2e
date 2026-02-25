import { chromium, type FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SITE_CONFIG } from './site-config';

async function globalSetup(config: FullConfig) {
  const authDir = path.join(__dirname, '.auth');
  const authFile = path.join(authDir, 'session.json');

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Generate a one-time login link via Drush.
  const uliOutput = execSync(`ddev drush uli --no-browser --uri=${SITE_CONFIG.baseUrl}`, {
    encoding: 'utf-8',
  }).trim();

  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Navigate to the one-time login link — Drupal sets the session cookie.
  await page.goto(uliOutput);
  await page.waitForURL('**/user/1/edit**');

  await context.storageState({ path: authFile });
  await browser.close();
}

export default globalSetup;
