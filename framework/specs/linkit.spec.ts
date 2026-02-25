import { test, expect } from '../fixtures';
import { execSync } from 'child_process';

/**
 * Tests LinkIt autocomplete integration in CKEditor 5.
 *
 * Verifies that the LinkIt module's autocomplete works inside CKEditor's
 * link balloon: searches for an existing node, selects it, inserts the link,
 * saves the node, and confirms the link renders with a valid internal href.
 *
 * Requires: LinkIt module enabled, at least one published node, and a text
 * format with the linkit filter and CKEditor plugin enabled.
 */
test.describe('LinkIt autocomplete', () => {
  test('Insert internal link via LinkIt, save, and verify on front-end', async ({
    page,
    drupalForm,
    consoleErrors,
    createdNids,
  }) => {
    // Get a published node title to search for.
    const titleResult = execSync(
      'ddev drush sql:query "SELECT title FROM node_field_data WHERE status=1 AND title IS NOT NULL ORDER BY nid DESC LIMIT 1"',
      { encoding: 'utf-8', timeout: 15_000 },
    ).trim();
    expect(titleResult.length).toBeGreaterThan(0);

    // Use the first few words as a search term.
    const searchTerm = titleResult.split(/\s+/).slice(0, 3).join(' ');

    await page.goto('/node/add/page');
    await expect(page.locator('form.node-form')).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Fill title.
    await page.locator('#edit-title-0-value').fill('E2E LinkIt Test');

    // Fill required node-level fields.
    await drupalForm.fillRequiredNodeFields('page');

    // Wait for CKEditor to initialize on the body field.
    const ckWrapper = page.locator('.field--name-body .ck-editor').first();
    await ckWrapper.waitFor({ state: 'visible', timeout: 15_000 });

    // Type link text into the editor.
    const editable = page.locator('.field--name-body .ck-editor__editable').first();
    await editable.click();
    await editable.pressSequentially('LinkIt test link', { delay: 10 });

    // Select all text in the editor.
    await page.keyboard.press('Control+a');

    // Click the Link toolbar button.
    const linkButton = ckWrapper
      .locator('.ck-toolbar')
      .getByRole('button', { name: 'Link' });
    await linkButton.click();

    // Wait for the link balloon UI.
    // Scope to the CKEditor balloon to avoid matching metatag fields.
    const linkUrlInput = page.locator('.ck-link-form input.form-linkit-autocomplete');
    await linkUrlInput.waitFor({ state: 'visible', timeout: 10_000 });

    // Type search term slowly to trigger LinkIt autocomplete.
    await linkUrlInput.pressSequentially(searchTerm, { delay: 50 });

    // Wait for the LinkIt autocomplete dropdown.
    const autocompleteList = page.locator('.linkit-ui-autocomplete');
    await autocompleteList.waitFor({ state: 'visible', timeout: 15_000 });

    // Click the first actual result (not a group divider).
    const firstResult = autocompleteList
      .locator('.linkit-result-line-wrapper')
      .first();
    await firstResult.waitFor({ state: 'visible', timeout: 10_000 });
    await firstResult.click();

    // Verify the input was populated with an internal path.
    const linkValue = await linkUrlInput.inputValue();
    expect(linkValue).toMatch(/^\//);

    // Click Insert to confirm the link.
    const insertButton = page.getByRole('button', {
      name: 'Insert',
      exact: true,
    });
    await insertButton.click();

    // Verify the link was inserted in the editor.
    const insertedLink = editable.locator('a').first();
    await expect(insertedLink).toBeVisible({ timeout: 5_000 });

    // Save the node.
    const nid = await drupalForm.saveNode();
    createdNids.push(nid);

    // Verify we left the node/add form.
    expect(page.url()).not.toContain('/node/add');

    // Verify the rendered page contains the LinkIt-resolved link.
    // LinkIt resolves entity UUIDs to full aliased URLs (absolute, not relative).
    const renderedLink = page.getByRole('link', { name: 'LinkIt test link' });
    await expect(renderedLink).toBeVisible({ timeout: 10_000 });
    const href = await renderedLink.getAttribute('href');
    expect(href).toBeTruthy();
    // LinkIt should resolve to a real URL — not the raw /node/NID internal path.
    expect(href).not.toMatch(/\/node\/\d+$/);

    // Assert zero JS console errors across the entire flow.
    const errors = consoleErrors.errors();
    expect(
      errors,
      `JS errors during LinkIt test:\n${errors.join('\n')}`,
    ).toHaveLength(0);
  });
});
