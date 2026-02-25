import { test, expect } from '../fixtures';
import {
  CONTENT_TYPES,
  SIMPLE_TYPES,
  PARAGRAPH_FIELDS,
  type ContentType,
} from '../helpers/content-types';
import { PARAGRAPH_MAP, SKIPPED_PARAGRAPH_TYPES } from '../helpers/paragraph-map';

/**
 * Filter content types via TYPES env var (comma-separated).
 * Example: TYPES=page,event npx playwright test node-create
 */
function getFilteredTypes(): ContentType[] {
  const env = process.env.TYPES;
  if (!env) return [...CONTENT_TYPES];
  const requested = env.split(',').map((t) => t.trim()) as ContentType[];
  return requested.filter((t) => CONTENT_TYPES.includes(t));
}

const typesToTest = getFilteredTypes();

test.describe('Content creation smoke test', () => {
  for (const contentType of typesToTest) {
    test(`Create ${contentType} node with all paragraph types`, async ({
      page,
      drupalForm,
      consoleErrors,
      createdNids,
    }) => {
      // Navigate to node/add form.
      await page.goto(`/node/add/${contentType}`);
      await expect(page.locator('form.node-form')).toBeVisible();
      await page.waitForLoadState('networkidle');

      // Fill title.
      await drupalForm.fillTitle(contentType);

      // Fill required node-level fields (media, dates, selects, etc.).
      await drupalForm.fillRequiredNodeFields(contentType);

      const isSimple = SIMPLE_TYPES.includes(contentType);
      const paragraphConfig = PARAGRAPH_FIELDS[contentType];

      if (!isSimple && paragraphConfig) {
        // Paragraph types: add all allowed paragraph types to primary field.
        const { primary, secondary } = paragraphConfig;

        for (const paragraphType of primary.allowedTypes) {
          if (SKIPPED_PARAGRAPH_TYPES.has(paragraphType)) continue;

          const def = PARAGRAPH_MAP[paragraphType];
          if (!def) continue;

          // Add the paragraph.
          const subform = await drupalForm.addParagraph(primary.field, paragraphType);
          if (!subform) continue;

          // Fill its required fields (+ nested children).
          await drupalForm.fillParagraphFields(subform, paragraphType);
        }

        // Add one simple paragraph to each secondary field.
        if (secondary) {
          for (const sec of secondary) {
            const subform = await drupalForm.addParagraph(sec.field, sec.addType);
            if (subform) {
              await drupalForm.fillParagraphFields(subform, sec.addType);
            }
          }
        }
      }

      // Save the node.
      const nid = await drupalForm.saveNode();
      createdNids.push(nid);

      // Verify the node page loaded successfully (not still on node/add form).
      await expect(page.locator('body')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(page.url()).not.toContain('/node/add');

      // Assert zero JS console errors across the entire flow.
      const errors = consoleErrors.errors();
      expect(
        errors,
        `JS errors during ${contentType} creation:\n${errors.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});
