import { test, expect } from '../fixtures';
import { CONTENT_TYPES } from '../helpers/content-types';

test.describe('Node add forms — console errors', () => {
  for (const type of CONTENT_TYPES) {
    test(`node/add/${type} has no JS console errors`, async ({ page, consoleErrors }) => {
      await page.goto(`/node/add/${type}`);
      await expect(page.locator('form.node-form')).toBeVisible();

      // Wait for full page load including CKEditor initialization.
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const errors = consoleErrors.errors();
      expect(errors, `JS errors on node/add/${type}:\n${errors.join('\n')}`).toHaveLength(0);
    });
  }
});
