# drupal-e2e

Generate Playwright E2E smoke tests from Drupal config YAML. Reads `config/sync/` and generates site-specific test configuration, then runs tests that create nodes with all paragraph types and assert zero JS errors.

## Prerequisites

- Node.js 18+
- DDEV-based Drupal 11 site
- Exported config in `config/sync/`

## Install

```bash
npm install --save-dev @playwright/test github:electriccitizen/drupal-e2e
npx playwright install chromium
```

## Quick Start

### 1. Initialize framework files

Copies generic specs, helpers, fixtures, and `playwright.config.ts` into your project:

```bash
npx drupal-e2e init
```

### 2. Generate site-specific config

Reads `config/sync/` YAML and generates content type definitions, paragraph maps, and site config:

```bash
npx drupal-e2e generate
```

### 3. Review generated config

Check `tests/playwright/site-config.ts` for:
- `skippedParagraphTypes` — types that can't be automated
- `consoleErrorIgnores` — patterns for known-benign console errors
- `globalRequiredFields` — fields required on all content types (e.g. Domain Access)

### 4. Run tests

```bash
# Single content type
TYPES=page npx playwright test node-create

# Full suite
npx playwright test
```

## CLI Options

```
npx drupal-e2e generate [options]
npx drupal-e2e init [options]

Options:
  --config-dir=<path>   Path to Drupal config/sync/ directory (default: ./config/sync)
  --output-dir=<path>   Output directory for test files (default: ./tests/playwright)
  --project-root=<path> Project root for DDEV config detection (default: .)
  --help                Show help
```

## What Gets Generated

| File | Purpose |
|------|---------|
| `site-config.ts` | Base URL, skipped types, console ignores, global required fields |
| `helpers/content-types.ts` | Content type list, paragraph field mappings, required fields |
| `helpers/paragraph-map.ts` | Paragraph type registry with labels, fields, nesting |

## What Gets Initialized

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright config (project root) |
| `global-setup.ts` | Auth via `ddev drush uli` |
| `fixtures/index.ts` | Custom test fixtures |
| `helpers/drupal-form.ts` | Form interaction helper |
| `helpers/media-library.ts` | Media Library modal helper |
| `helpers/cleanup.ts` | Node cleanup + test media seeding |
| `helpers/console-errors.ts` | Console error tracking |
| `specs/node-create.spec.ts` | Main smoke test |
| `specs/ckeditor-embed.spec.ts` | CKEditor media embed test |
| `specs/node-form-console-errors.spec.ts` | Console error check per content type |
| `specs/node-form-widgets.spec.ts` | Widget presence verification |

## Regenerating After Changes

After content type, field, or paragraph changes:

```bash
npx drupal-e2e generate
git diff tests/playwright/  # Review changes
```

Note: `generate` overwrites `site-config.ts`, `content-types.ts`, and `paragraph-map.ts`. Re-apply any manual customizations after regenerating.
