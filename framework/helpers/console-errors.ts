import type { Page } from '@playwright/test';
import { SITE_CONFIG } from '../site-config';

/**
 * Patterns for known benign console errors from Drupal core/contrib.
 * Add site-specific patterns to SITE_CONFIG.consoleErrorIgnores.
 */
const BASE_IGNORED_PATTERNS: RegExp[] = [
  // Drupal core passive event listener warnings.
  /Added non-passive event listener/i,
  // Favicon 404 in local dev.
  /favicon\.ico/i,
  // Source map warnings from contrib.
  /Failed to load resource.*\.map/i,
  // Generic resource loading errors (missing assets, background requests in dev).
  /Failed to load resource/i,
  // Chrome DevTools noise.
  /DevTools/i,
  // Third-party tracking/analytics.
  /googletagmanager|google-analytics|gtag/i,
  // MIME type warnings.
  /MIME type.*not a supported stylesheet/i,
];

/** Combined ignore patterns: base + site-specific. */
const IGNORED_PATTERNS: RegExp[] = [
  ...BASE_IGNORED_PATTERNS,
  ...SITE_CONFIG.consoleErrorIgnores,
];

export class ConsoleErrorTracker {
  private _errors: string[] = [];

  constructor(page: Page) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!IGNORED_PATTERNS.some((p) => p.test(text))) {
          this._errors.push(text);
        }
      }
    });

    page.on('pageerror', (error) => {
      const text = error.message;
      if (!IGNORED_PATTERNS.some((p) => p.test(text))) {
        this._errors.push(`[pageerror] ${text}`);
      }
    });
  }

  errors(): string[] {
    return [...this._errors];
  }

  clear(): void {
    this._errors = [];
  }
}
