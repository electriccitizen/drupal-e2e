import type { Page, Locator } from '@playwright/test';
import { execSync } from 'child_process';
import {
  PARAGRAPH_MAP,
  SKIPPED_PARAGRAPH_TYPES,
  type FieldDef,
  type ParagraphDef,
} from './paragraph-map';
import { MediaLibraryHelper } from './media-library';
import {
  REQUIRED_NODE_FIELDS,
  type ContentType,
  type NodeFieldStrategy,
} from './content-types';
import { SITE_CONFIG } from '../site-config';

/**
 * AJAX-aware helper for interacting with Drupal node forms.
 *
 * Handles Paragraphs widget interactions, CKEditor fields, Media Library,
 * and other Drupal form elements with proper AJAX waiting.
 */
export class DrupalFormHelper {
  private mediaLibrary: MediaLibraryHelper;

  constructor(
    private page: Page,
    private timestamp: string,
  ) {
    this.mediaLibrary = new MediaLibraryHelper(page);
  }

  // ── AJAX waiting ────────────────────────────────────────────────────

  /**
   * Wait for Drupal AJAX (jQuery) to complete plus network idle.
   */
  async waitForAjax(timeout = 30_000): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const jq = (window as any).jQuery;
        return !jq || jq.active === 0;
      },
      { timeout },
    );
    await this.page.waitForLoadState('networkidle');
  }

  // ── Title field ─────────────────────────────────────────────────────

  async fillTitle(contentType: string): Promise<void> {
    const titleInput = this.page.locator('#edit-title-0-value');
    if (await titleInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const title = `E2E Smoke: ${contentType} ${this.timestamp}`;
      await titleInput.fill(title);
    }
    // Some types (bios) use First Name / Last Name instead of title.
  }

  // ── Required node-level fields ──────────────────────────────────────

  /**
   * Fill all required node-level fields (beyond title) for a content type.
   * Also handles global required fields from site config.
   */
  async fillRequiredNodeFields(contentType: ContentType): Promise<void> {
    // Fill global required fields (e.g. editorial_sections, domain access).
    for (const field of SITE_CONFIG.globalRequiredFields) {
      await this.fillNodeField({
        widget: field.widget as NodeFieldStrategy['widget'],
        fieldName: field.fieldName,
      });
    }

    const fields = REQUIRED_NODE_FIELDS[contentType];
    if (!fields) return;

    for (const field of fields) {
      await this.fillNodeField(field);
    }
  }

  private async fillNodeField(field: NodeFieldStrategy): Promise<void> {
    const fieldCssName = field.fieldName.replace(/_/g, '-');
    const wrapper = this.page.locator(`.field--name-${fieldCssName}`).first();

    switch (field.widget) {
      case 'ckeditor': {
        const editable = wrapper.locator('.ck-editor__editable').first();
        await editable.waitFor({ state: 'visible', timeout: 15_000 });
        await editable.click();
        await editable.pressSequentially(
          `E2E test ${field.fieldName} content ${this.timestamp}`,
          { delay: 10 },
        );
        break;
      }

      case 'textarea': {
        const textarea = wrapper.locator('textarea').first();
        await textarea.waitFor({ state: 'visible', timeout: 10_000 });
        await textarea.fill(`E2E test ${field.fieldName} ${this.timestamp}`);
        break;
      }

      case 'text': {
        const input = wrapper.locator('input[type="text"]').first();
        await input.waitFor({ state: 'visible', timeout: 10_000 });
        await input.fill(`E2E-${this.timestamp.slice(0, 20)}`);
        break;
      }

      case 'select': {
        // Try visible select first, fall back to JS for hidden selects.
        const select = wrapper.locator('select').first();
        if (await select.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await this.selectFirstValidOption(select);
        } else {
          // Hidden select — use JS to set value.
          await this.page.evaluate((cssName) => {
            const sel = document.querySelector(
              `.field--name-${cssName} select`,
            ) as HTMLSelectElement;
            if (!sel) return;
            for (const opt of Array.from(sel.options)) {
              if (opt.value && opt.value !== '' && opt.value !== '_none') {
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                break;
              }
            }
          }, fieldCssName);
        }
        break;
      }

      case 'radios': {
        await this.page.evaluate((fieldName) => {
          const selectors = [
            `.field--name-${fieldName.replace(/_/g, '-')} input[type="radio"]`,
            `#edit-${fieldName.replace(/_/g, '-')} input[type="radio"]`,
            `[data-drupal-selector="edit-${fieldName.replace(/_/g, '-')}"] input[type="radio"]`,
            `input[type="radio"][name^="${fieldName}"]`,
          ];
          const details = document.querySelectorAll('details:not([open])');
          details.forEach((d) => (d as HTMLDetailsElement).open = true);
          for (const sel of selectors) {
            const radio = document.querySelector(sel) as HTMLInputElement;
            if (radio && !radio.checked) {
              radio.click();
              return;
            }
          }
        }, field.fieldName);
        break;
      }

      case 'checkboxes': {
        await this.page.evaluate((fieldName) => {
          const details = document.querySelectorAll('details:not([open])');
          details.forEach((d) => (d as HTMLDetailsElement).open = true);
          const selectors = [
            `.field--name-${fieldName.replace(/_/g, '-')} input[type="checkbox"]`,
            `#edit-${fieldName.replace(/_/g, '-')} input[type="checkbox"]`,
            `[data-drupal-selector="edit-${fieldName.replace(/_/g, '-')}"] input[type="checkbox"]`,
            `input[type="checkbox"][name^="${fieldName}"]`,
          ];
          for (const sel of selectors) {
            const cb = document.querySelector(sel) as HTMLInputElement;
            if (cb && !cb.checked) {
              cb.click();
              return;
            }
          }
        }, field.fieldName);
        break;
      }

      case 'media': {
        await this.mediaLibrary.selectMedia(this.page.locator('form.node-form'), fieldCssName);
        break;
      }

      case 'smartdate': {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];

        const dateInputs = wrapper.getByRole('textbox', { name: /^date/i });
        const startDate = dateInputs.first();
        if (await startDate.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await startDate.clear();
          await startDate.fill(dateStr);
        }

        const timeInputs = wrapper.getByRole('textbox', { name: /^time/i });
        const startTime = timeInputs.first();
        if (await startTime.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await startTime.clear();
          await startTime.fill('10:00');
        }

        if (await dateInputs.count() > 1) {
          const endDate = dateInputs.nth(1);
          if (await endDate.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await endDate.clear();
            await endDate.fill(dateStr);
          }
        }
        if (await timeInputs.count() > 1) {
          const endTime = timeInputs.nth(1);
          if (await endTime.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await endTime.clear();
            await endTime.fill('11:00');
          }
        }
        break;
      }

      case 'cshs': {
        const maxLevels = 5;
        for (let level = 0; level < maxLevels; level++) {
          const comboboxes = wrapper.getByRole('combobox');
          const count = await comboboxes.count();
          if (count <= level) break;

          const cb = comboboxes.nth(level);
          if (!(await cb.isVisible({ timeout: 3_000 }).catch(() => false))) break;

          const options = cb.locator('option');
          const optCount = await options.count();
          let selected = false;
          for (let i = 0; i < optCount; i++) {
            const val = await options.nth(i).getAttribute('value');
            const text = await options.nth(i).textContent();
            if (val && val !== '' && val !== '_none' && !text?.includes('Please select')) {
              await cb.selectOption({ index: i });
              selected = true;
              break;
            }
          }
          if (!selected) break;

          await this.page.waitForTimeout(1_000);
        }
        break;
      }
    }
  }

  // ── Paragraph operations ────────────────────────────────────────────

  /**
   * Add a paragraph type to a paragraph field via the "Add {label}" button.
   */
  async addParagraph(fieldName: string, paragraphType: string): Promise<Locator | null> {
    if (SKIPPED_PARAGRAPH_TYPES.has(paragraphType)) {
      return null;
    }

    const def = PARAGRAPH_MAP[paragraphType];
    if (!def) {
      throw new Error(`Unknown paragraph type: ${paragraphType}`);
    }

    const fieldWrapper = this.page.locator(
      `.field--name-${fieldName.replace(/_/g, '-')}`,
    ).first();

    const tableBody = fieldWrapper.locator('table').first().locator(':scope > tbody').first();
    const existingRows = await tableBody.locator(':scope > tr').count();

    const addButton = fieldWrapper.getByRole('button', {
      name: new RegExp(`^Add ${def.label}$`, 'i'),
    });

    if (await addButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addButton.click();
    } else {
      const dropdownToggle = fieldWrapper
        .locator('.paragraphs-dropbutton-wrapper .dropbutton-toggle button, .paragraphs-dropbutton-wrapper .dropbutton__toggle')
        .first();

      if (await dropdownToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await dropdownToggle.click();
        await this.page.waitForTimeout(500);
      }

      const dropdownButton = fieldWrapper.getByRole('button', {
        name: new RegExp(`Add ${def.label}`, 'i'),
      }).last();
      await dropdownButton.click();
    }

    await this.waitForAjax();

    const newRow = tableBody.locator(':scope > tr').nth(existingRows);
    await newRow.waitFor({ state: 'attached', timeout: 15_000 });

    const newSubform = newRow.locator('.paragraphs-subform').first();
    const isVisible = await newSubform.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!isVisible) {
      if (def.fields.length === 0 && !def.nested) {
        return null;
      }
      const editBtn = newRow.getByRole('button', { name: /^edit$/i }).first();
      if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await editBtn.click();
        await this.waitForAjax();
        await newSubform.waitFor({ state: 'visible', timeout: 15_000 });
      } else {
        return null;
      }
    }

    return newSubform;
  }

  /**
   * Fill all required fields in a paragraph subform.
   */
  async fillParagraphFields(
    subform: Locator,
    paragraphType: string,
  ): Promise<void> {
    const def = PARAGRAPH_MAP[paragraphType];
    if (!def) return;

    for (const field of def.fields) {
      await this.fillField(subform, field, paragraphType);
    }

    if (def.nested) {
      await this.addNestedChild(subform, def);
    }
  }

  private async addNestedChild(
    parentSubform: Locator,
    parentDef: ParagraphDef,
  ): Promise<void> {
    const nested = parentDef.nested!;
    const childDef = PARAGRAPH_MAP[nested.childType];
    if (!childDef) return;

    const nestedFieldWrapper = parentSubform.locator(
      `.field--name-${nested.field.replace(/_/g, '-')}`,
    ).first();

    const existingCount = await nestedFieldWrapper
      .locator('.paragraphs-subform')
      .count();

    let childSubform: Locator;

    if (existingCount > 0) {
      childSubform = nestedFieldWrapper.locator('.paragraphs-subform').first();
    } else {
      const addChildBtn = nestedFieldWrapper.getByRole('button', {
        name: new RegExp(`Add ${childDef.label}`, 'i'),
      });

      if (await addChildBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addChildBtn.click();
      } else {
        const toggle = nestedFieldWrapper
          .locator('.paragraphs-dropbutton-wrapper .dropbutton-toggle button, .paragraphs-dropbutton-wrapper .dropbutton__toggle')
          .first();
        if (await toggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await toggle.click();
          await this.page.waitForTimeout(500);
        }
        const btn = nestedFieldWrapper.getByRole('button', {
          name: new RegExp(`Add ${childDef.label}`, 'i'),
        });
        await btn.click();
      }

      await this.waitForAjax();

      childSubform = nestedFieldWrapper.locator('.paragraphs-subform').first();
      await childSubform.waitFor({ state: 'visible', timeout: 15_000 });
    }

    for (const field of childDef.fields) {
      await this.fillField(childSubform, field, nested.childType);
    }
  }

  // ── Field filling (paragraph subform context) ─────────────────────

  private async fillField(
    container: Locator,
    field: FieldDef,
    contextType: string,
  ): Promise<void> {
    const fieldCssName = field.name.replace(/_/g, '-');

    switch (field.strategy.type) {
      case 'text': {
        const input = container
          .locator(`.field--name-${fieldCssName} input[type="text"]`)
          .first();
        await input.waitFor({ state: 'visible', timeout: 10_000 });
        await input.fill(`Test ${field.name} ${this.timestamp}`);
        break;
      }

      case 'ckeditor': {
        const editable = container
          .locator(`.field--name-${fieldCssName} .ck-editor__editable`)
          .first();
        await editable.waitFor({ state: 'visible', timeout: 15_000 });
        await editable.click();
        await editable.pressSequentially(
          `Test ${contextType} ${field.name} content`,
          { delay: 10 },
        );
        break;
      }

      case 'textarea': {
        const textarea = container
          .locator(`.field--name-${fieldCssName} textarea`)
          .first();
        await textarea.waitFor({ state: 'visible', timeout: 10_000 });
        await textarea.fill(`Test ${field.name} ${this.timestamp}`);
        break;
      }

      case 'select': {
        const select = container
          .locator(`.field--name-${fieldCssName} select`)
          .first();
        await select.waitFor({ state: 'visible', timeout: 10_000 });
        await this.selectFirstValidOption(select);
        break;
      }

      case 'boolean': {
        const checkbox = container
          .locator(`.field--name-${fieldCssName} input[type="checkbox"]`)
          .first();
        if (await checkbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
          if (!(await checkbox.isChecked())) {
            await checkbox.check();
          }
        } else {
          await container.evaluate((el, cssName) => {
            const cb = el.querySelector(
              `.field--name-${cssName} input[type="checkbox"]`,
            ) as HTMLInputElement;
            if (cb && !cb.checked) cb.click();
          }, fieldCssName);
        }
        break;
      }

      case 'media': {
        await this.mediaLibrary.selectMedia(container, fieldCssName);
        break;
      }

      case 'link': {
        const uriInput = container
          .locator(`.field--name-${fieldCssName} input[name*="uri"]`)
          .first();
        await uriInput.waitFor({ state: 'visible', timeout: 10_000 });
        await uriInput.fill('https://example.com');
        const titleInput = container
          .locator(`.field--name-${fieldCssName} input[name*="title"]`)
          .first();
        if (await titleInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await titleInput.fill(`Test link ${this.timestamp}`);
        }
        break;
      }
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────

  private async selectFirstValidOption(select: Locator): Promise<void> {
    const options = select.locator('option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const val = await options.nth(i).getAttribute('value');
      if (val && val !== '' && val !== '_none') {
        await select.selectOption({ index: i });
        return;
      }
    }
  }

  // ── Save form ───────────────────────────────────────────────────────

  async saveNode(): Promise<number> {
    await this.waitForAjax();

    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await this.page.waitForTimeout(500);

    // Sync all CKEditor5 instances to their textareas before submitting.
    await this.page.evaluate(() => {
      const editors = (window as any).Drupal?.CKEditor5Instances;
      if (editors) {
        for (const [, editor] of editors) {
          try {
            editor.updateSourceElement();
          } catch {
            // Ignore errors from read-only or destroyed editors.
          }
        }
      }
    });

    await this.page.evaluate(() => {
      const editors = (window as any).Drupal?.CKEditor5Instances;
      if (editors && editors.forEach) {
        editors.forEach((editor: any) => {
          try {
            editor.updateSourceElement();
          } catch {
            // Ignore errors from destroyed editors.
          }
        });
      }
    });

    const navigationPromise = this.page.waitForNavigation({ timeout: 120_000 });

    await this.page.evaluate(() => {
      const form = document.querySelector('form.node-form') as HTMLFormElement;
      if (!form) throw new Error('No node form found');

      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'op';
      hidden.value = 'Save';
      form.appendChild(hidden);

      form.submit();
    });

    await navigationPromise;
    await this.page.waitForLoadState('networkidle');

    if (this.page.url().includes('/node/add')) {
      const errors = await this.page.evaluate(() => {
        const el = document.querySelector('.messages--error');
        return el ? el.textContent?.substring(0, 1000)?.trim() : null;
      });
      if (errors) {
        throw new Error(`Form validation errors:\n${errors}`);
      }
      throw new Error('Form submitted but stayed on /node/add - no error messages found');
    }

    const nid = await this.page.evaluate(() => {
      const ds = (window as any).drupalSettings;
      if (ds?.path?.currentPath) {
        const match = ds.path.currentPath.match(/node\/(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
      const body = document.querySelector('body');
      const path = body?.getAttribute('data-drupal-link-system-path');
      if (path) {
        const match = path.match(/node\/(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
      const editLink = document.querySelector('a[href*="/node/"][href*="/edit"]') as HTMLAnchorElement;
      if (editLink) {
        const match = editLink.href.match(/\/node\/(\d+)\/edit/);
        if (match) return parseInt(match[1], 10);
      }
      const urlMatch = window.location.pathname.match(/\/node\/(\d+)/);
      if (urlMatch) return parseInt(urlMatch[1], 10);
      return null;
    });

    if (!nid) {
      try {
        const result = execSync(
          'ddev drush sql:query "SELECT nid FROM node_field_data ORDER BY created DESC, nid DESC LIMIT 1"',
          { encoding: 'utf-8', timeout: 15_000 },
        ).trim();
        const drushNid = parseInt(result, 10);
        if (drushNid) return drushNid;
      } catch {
        // Ignore Drush errors.
      }
      throw new Error(`Could not extract NID from page: ${this.page.url()}`);
    }

    return nid;
  }
}
