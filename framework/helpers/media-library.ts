import type { Page, Locator } from '@playwright/test';

/**
 * Helper for interacting with Drupal's Media Library dialog.
 *
 * Handles opening the modal, selecting existing media, and inserting it.
 * Does NOT upload new media — relies on pre-existing media entities.
 */
export class MediaLibraryHelper {
  constructor(private page: Page) {}

  /**
   * Open Media Library from a media field, select the first item, and insert it.
   *
   * @param container - The parent locator containing the media field.
   * @param fieldCssName - CSS-friendly field name (e.g. "field-image").
   */
  async selectMedia(container: Locator, fieldCssName: string): Promise<void> {
    const fieldWrapper = container.locator(`.field--name-${fieldCssName}`).first();

    // Find and click the "Add media" button within this field.
    const addMediaBtn = fieldWrapper.getByRole('button', { name: /add media/i }).first();
    await addMediaBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addMediaBtn.click();

    // Wait for the Media Library modal to appear.
    const modal = this.page.locator('.media-library-widget-modal, .ui-dialog.media-library-widget-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // Wait for media items to load inside the modal.
    await this.page.waitForLoadState('networkidle');

    // Select the first media item (checkbox or clickable thumbnail).
    const mediaItem = modal.locator(
      '.media-library-item input[type="checkbox"], .js-media-library-item input[type="checkbox"]',
    ).first();

    if (await mediaItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      if (!(await mediaItem.isChecked())) {
        await mediaItem.check();
      }
    } else {
      // Some views use a clickable item instead of checkbox.
      const clickableItem = modal.locator('.media-library-item, .js-media-library-item').first();
      await clickableItem.click();
    }

    // Click the "Insert selected" button.
    const insertBtn = modal.getByRole('button', { name: /insert selected/i });
    await insertBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await insertBtn.click();

    // Wait for the modal to close and AJAX to complete.
    await modal.waitFor({ state: 'hidden', timeout: 15_000 });
    await this.waitForAjax();
  }

  /**
   * Wait for Drupal AJAX to complete.
   */
  private async waitForAjax(timeout = 30_000): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const jq = (window as any).jQuery;
        return !jq || jq.active === 0;
      },
      { timeout },
    );
    await this.page.waitForLoadState('networkidle');
  }
}
