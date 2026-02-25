import { test, expect } from '../fixtures';
import {
  PARAGRAPHS_TYPES,
  MEDIA_LIBRARY_TYPES,
  CKEDITOR_TYPES,
} from '../helpers/content-types';

test.describe('Node add forms — Paragraphs widget', () => {
  for (const type of PARAGRAPHS_TYPES) {
    test(`node/add/${type} loads Paragraphs widget`, async ({ page }) => {
      await page.goto(`/node/add/${type}`);
      await expect(page.locator('form.node-form')).toBeVisible();
      await expect(page.locator('.field--widget-paragraphs').first()).toBeAttached();
    });
  }
});

test.describe('Node add forms — CKEditor 5', () => {
  for (const type of CKEDITOR_TYPES) {
    test(`node/add/${type} loads CKEditor 5`, async ({ page }) => {
      await page.goto(`/node/add/${type}`);
      await expect(page.locator('form.node-form')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await expect(page.locator('.ck-editor').first()).toBeVisible();
    });
  }
});

test.describe('Node add forms — Media Library', () => {
  for (const type of MEDIA_LIBRARY_TYPES) {
    test(`node/add/${type} loads Media Library button`, async ({ page }) => {
      await page.goto(`/node/add/${type}`);
      await expect(page.locator('form.node-form')).toBeVisible();
      await expect(page.getByRole('button', { name: /add media/i }).first()).toBeVisible();
    });
  }
});
