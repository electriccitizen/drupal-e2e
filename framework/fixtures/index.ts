import { test as base } from '@playwright/test';
import { ConsoleErrorTracker } from '../helpers/console-errors';
import { DrupalFormHelper } from '../helpers/drupal-form';
import { deleteNode, shouldSkipCleanup, ensureTestMedia } from '../helpers/cleanup';

type Fixtures = {
  consoleErrors: ConsoleErrorTracker;
  drupalForm: DrupalFormHelper;
  createdNids: number[];
};

export const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, use) => {
    const tracker = new ConsoleErrorTracker(page);
    await use(tracker);
  },

  drupalForm: async ({ page }, use) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const helper = new DrupalFormHelper(page, timestamp);
    await use(helper);
  },

  createdNids: async ({}, use) => {
    // Ensure test media exists before any test that might need it.
    ensureTestMedia();

    const nids: number[] = [];
    await use(nids);

    // Cleanup: delete all created nodes after the test.
    if (!shouldSkipCleanup()) {
      for (const nid of nids) {
        deleteNode(nid);
      }
    }
  },
});

export { expect } from '@playwright/test';
