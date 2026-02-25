#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { generate } from './generators/index.js';

const USAGE = `
drupal-e2e — Generate Playwright E2E tests from Drupal config YAML

Commands:
  generate  Parse config/sync/ YAML and generate site-specific test files
  init      Copy generic framework files into tests/playwright/

Options:
  --config-dir=<path>   Path to Drupal config/sync/ directory (default: ./config/sync)
  --output-dir=<path>   Output directory for test files (default: ./tests/playwright)
  --project-root=<path> Project root for DDEV config detection (default: .)
  --help                Show this help message
`;

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  const flags = parseFlags(args.slice(1));

  switch (command) {
    case 'generate':
      runGenerate(flags);
      break;
    case 'init':
      runInit(flags);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--(\w[\w-]*)=(.+)$/);
    if (match) {
      flags[match[1]] = match[2];
    }
  }
  return flags;
}

function runGenerate(flags: Record<string, string>) {
  const configDir = path.resolve(flags['config-dir'] ?? './config/sync');
  const outputDir = path.resolve(flags['output-dir'] ?? './tests/playwright');
  const projectRoot = path.resolve(flags['project-root'] ?? '.');

  if (!fs.existsSync(configDir)) {
    console.error(`Config directory not found: ${configDir}`);
    process.exit(1);
  }

  console.log(`Generating from: ${configDir}`);
  console.log(`Output to: ${outputDir}`);
  console.log('');

  const result = generate({ configDir, outputDir, projectRoot });

  // Write generated files.
  for (const file of result.files) {
    const dir = path.dirname(file.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file.path, file.content, 'utf-8');
    console.log(`  wrote: ${path.relative(process.cwd(), file.path)}`);
  }

  // Print warnings.
  if (result.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }

  console.log('');
  console.log('Done! Review the generated files, especially:');
  console.log('  - site-config.ts: skipped types, global required fields, console error ignores');
  console.log('  - helpers/paragraph-map.ts: verify labels match "Add {label}" buttons');
  console.log('  - helpers/content-types.ts: verify allowed paragraph types and required fields');
}

function runInit(flags: Record<string, string>) {
  const outputDir = path.resolve(flags['output-dir'] ?? './tests/playwright');
  const projectRoot = path.resolve(flags['project-root'] ?? '.');

  // Framework files are stored relative to this CLI script.
  const frameworkDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    'framework',
  );

  if (!fs.existsSync(frameworkDir)) {
    console.error(`Framework directory not found: ${frameworkDir}`);
    console.error('Ensure the drupal-e2e package is installed correctly.');
    process.exit(1);
  }

  console.log(`Initializing test framework in: ${outputDir}`);
  console.log('');

  // Copy framework files preserving directory structure.
  const filesToCopy = getFilesRecursive(frameworkDir);

  for (const relPath of filesToCopy) {
    const src = path.join(frameworkDir, relPath);
    const dest = path.join(outputDir, relPath);
    const destDir = path.dirname(dest);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Special handling for playwright.config.ts — goes in project root.
    if (relPath === 'playwright.config.ts') {
      const configDest = path.join(projectRoot, 'playwright.config.ts');
      if (fs.existsSync(configDest)) {
        console.log(`  skip: playwright.config.ts (already exists)`);
      } else {
        fs.copyFileSync(src, configDest);
        console.log(`  wrote: playwright.config.ts`);
      }
      continue;
    }

    if (fs.existsSync(dest)) {
      console.log(`  skip: ${relPath} (already exists)`);
    } else {
      fs.copyFileSync(src, dest);
      console.log(`  wrote: ${relPath}`);
    }
  }

  console.log('');
  console.log('Framework initialized. Next steps:');
  console.log('  1. Run: npx drupal-e2e generate');
  console.log('  2. Review generated site-config.ts');
  console.log('  3. Run: npx playwright test');
}

function getFilesRecursive(dir: string, prefix = ''): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...getFilesRecursive(path.join(dir, entry.name), relPath));
    } else {
      files.push(relPath);
    }
  }

  return files;
}

main();
