import { test, expect } from '../fixtures';

/**
 * Tests CKEditor 5 media embed full round-trip on the page content type.
 *
 * Verifies the "Insert Media" toolbar button opens the Media Library,
 * allows selecting media, inserts a drupal-media element into the editor,
 * saves the node, and confirms the embedded media renders on the front-end.
 */
test.describe('CKEditor media embed', () => {
  test('Embed media via CKEditor, save, and verify on front-end', async ({
    page,
    drupalForm,
    consoleErrors,
    createdNids,
  }) => {
    await page.goto('/node/add/page');
    await expect(page.locator('form.node-form')).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Fill title (required).
    await page.locator('#edit-title-0-value').fill('E2E CKEditor Embed Test');

    // Fill required node-level fields (e.g. editorial sections).
    await drupalForm.fillRequiredNodeFields('page');

    // Wait for CKEditor to initialize on the body field.
    const ckWrapper = page.locator('.field--name-body .ck-editor').first();
    await ckWrapper.waitFor({ state: 'visible', timeout: 15_000 });

    // Focus the CKEditor editable area.
    const editable = page.locator('.field--name-body .ck-editor__editable').first();
    await editable.click();
    await editable.pressSequentially('Testing media embed: ', { delay: 10 });

    // Find and click the "Insert Media" toolbar button (drupalMedia plugin).
    const toolbar = ckWrapper.locator('.ck-toolbar');
    const insertMediaBtn = toolbar.getByRole('button', { name: /media/i }).first();
    await insertMediaBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await insertMediaBtn.click();

    // Wait for the Media Library modal.
    const modal = page.locator('.media-library-widget-modal, .ui-dialog.media-library-widget-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    // Select the first media item.
    const mediaItem = modal.locator(
      '.media-library-item input[type="checkbox"], .js-media-library-item input[type="checkbox"]',
    ).first();
    if (await mediaItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      if (!(await mediaItem.isChecked())) {
        await mediaItem.check();
      }
    } else {
      const clickableItem = modal.locator('.media-library-item, .js-media-library-item').first();
      await clickableItem.click();
    }

    // Click "Insert selected".
    const insertBtn = modal.getByRole('button', { name: /insert selected/i });
    await insertBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await insertBtn.click();

    // Wait for modal to close.
    await modal.waitFor({ state: 'hidden', timeout: 15_000 });

    // Verify drupal-media element was inserted into the editor.
    const drupalMedia = editable.locator('drupal-media, .drupal-media');
    await expect(drupalMedia.first()).toBeVisible({ timeout: 10_000 });

    // Save the node — tests CKEditor sync (updateSourceElement) round-trip.
    const nid = await drupalForm.saveNode();
    createdNids.push(nid);

    // Verify we landed on the saved node page.
    expect(page.url()).not.toContain('/node/add');

    // Verify the embedded media rendered on the front-end.
    const renderedMedia = page.locator('article img, article picture, .field--name-body img, .field--name-body picture').first();
    await expect(renderedMedia).toBeVisible({ timeout: 10_000 });

    // Assert zero JS console errors across the entire flow.
    const errors = consoleErrors.errors();
    expect(
      errors,
      `JS errors during CKEditor media embed:\n${errors.join('\n')}`,
    ).toHaveLength(0);
  });
});
