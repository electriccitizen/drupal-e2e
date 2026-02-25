import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import {
  parseDdevConfig,
  parseContentTypes,
  parseFieldInstances,
  parseFormDisplays,
  parseFieldStorages,
  parseParagraphTypes,
  discoverNesting,
  resolveFields,
  getParagraphFieldConfigs,
  type ResolvedFieldInfo,
} from '../parsers/index.js';
import { generateContentTypes, type ContentTypeGenData } from './content-types.js';
import { generateParagraphMap, type ParagraphGenData } from './paragraph-map.js';
import { generateSiteConfig } from './site-config.js';

interface GenerateOptions {
  configDir: string;
  outputDir: string;
  projectRoot: string;
}

interface GenerateResult {
  files: { path: string; content: string }[];
  warnings: string[];
}

/**
 * Main generator: reads config YAML, produces content-types.ts, paragraph-map.ts, site-config.ts.
 */
export function generate(options: GenerateOptions): GenerateResult {
  const { configDir, outputDir, projectRoot } = options;
  const warnings: string[] = [];

  // ── Parse DDEV config ───────────────────────────────────────────────
  let baseUrl = 'https://example.ddev.site';
  try {
    const ddev = parseDdevConfig(projectRoot);
    baseUrl = ddev.baseUrl;
  } catch (e) {
    warnings.push(`Could not parse DDEV config: ${(e as Error).message}. Using placeholder URL.`);
  }

  // ── Parse content types ─────────────────────────────────────────────
  const contentTypes = parseContentTypes(configDir);
  if (contentTypes.length === 0) {
    throw new Error(`No content types found in ${configDir}. Check that node.type.*.yml files exist.`);
  }

  // ── Parse node fields ───────────────────────────────────────────────
  const nodeFieldInstances = parseFieldInstances(configDir, 'node');
  const nodeFormDisplays = parseFormDisplays(configDir, 'node');
  const nodeFieldStorages = parseFieldStorages(configDir, 'node');

  // ── Parse paragraph types and fields ────────────────────────────────
  const paragraphTypes = parseParagraphTypes(configDir);
  const paragraphFieldInstances = parseFieldInstances(configDir, 'paragraph');
  const paragraphFormDisplays = parseFormDisplays(configDir, 'paragraph');
  const paragraphFieldStorages = parseFieldStorages(configDir, 'paragraph');

  // ── Discover nesting ────────────────────────────────────────────────
  const nestings = discoverNesting(configDir, paragraphFieldInstances, paragraphFormDisplays);
  const nestingByParent = new Map(nestings.map((n) => [n.parentType, n]));

  // ── Build per-content-type data ─────────────────────────────────────
  const dataByType = new Map<string, ContentTypeGenData>();

  // Detect global required fields (fields present on ALL content types that are required).
  const fieldPresenceCounts = new Map<string, { count: number; field: ResolvedFieldInfo }>();

  for (const ct of contentTypes) {
    const formDisplay = nodeFormDisplays.get(ct.type);
    const resolved = resolveFields(ct.type, nodeFieldInstances, formDisplay, nodeFieldStorages);

    for (const field of resolved) {
      if (field.required) {
        const existing = fieldPresenceCounts.get(field.fieldName);
        if (existing) {
          existing.count++;
        } else {
          fieldPresenceCounts.set(field.fieldName, { count: 1, field });
        }
      }
    }
  }

  // Fields present on ALL content types.
  const globalRequiredFieldNames = new Set<string>();
  const globalRequiredFields: ResolvedFieldInfo[] = [];
  for (const [fieldName, data] of fieldPresenceCounts) {
    if (data.count === contentTypes.length) {
      globalRequiredFieldNames.add(fieldName);
      globalRequiredFields.push(data.field);
    }
  }

  for (const ct of contentTypes) {
    const formDisplay = nodeFormDisplays.get(ct.type);
    const allResolved = resolveFields(ct.type, nodeFieldInstances, formDisplay, nodeFieldStorages);

    // Exclude global required fields from per-type list.
    const requiredNodeFields = allResolved.filter(
      (f) => f.required && !globalRequiredFieldNames.has(f.fieldName),
    );

    // Detect paragraph fields.
    const paragraphFieldConfigs = formDisplay
      ? getParagraphFieldConfigs(configDir, ct.type, formDisplay)
      : [];
    const hasParagraphs = paragraphFieldConfigs.length > 0;

    // Detect media library and CKEditor usage.
    const hasMediaLibrary = allResolved.some((f) => f.strategy === 'media') ||
      paragraphFieldConfigs.length > 0; // paragraph types might have media
    const hasCkeditor = allResolved.some((f) => f.strategy === 'ckeditor');

    // Check form display directly for media and CKEditor widgets too.
    let detectedMedia = hasMediaLibrary;
    let detectedCkeditor = hasCkeditor;
    if (formDisplay) {
      for (const f of formDisplay.fields) {
        if (f.widgetType === 'media_library_widget') detectedMedia = true;
        if (f.widgetType === 'text_textarea_with_summary' || f.widgetType === 'text_textarea') {
          detectedCkeditor = true;
        }
      }
    }

    // Determine primary vs secondary paragraph fields.
    let primaryParagraphField: typeof paragraphFieldConfigs[0] | undefined;
    let secondaryParagraphFields: typeof paragraphFieldConfigs = [];

    if (paragraphFieldConfigs.length === 1) {
      primaryParagraphField = paragraphFieldConfigs[0];
    } else if (paragraphFieldConfigs.length > 1) {
      // Primary = field with most allowed types.
      const sorted = [...paragraphFieldConfigs].sort(
        (a, b) => b.allowedTypes.length - a.allowedTypes.length,
      );
      primaryParagraphField = sorted[0];
      secondaryParagraphFields = sorted.slice(1);
    }

    dataByType.set(ct.type, {
      type: ct.type,
      hasParagraphs,
      hasMediaLibrary: detectedMedia,
      hasCkeditor: detectedCkeditor,
      requiredNodeFields,
      paragraphFields: paragraphFieldConfigs,
      primaryParagraphField,
      secondaryParagraphFields,
    });
  }

  // ── Build paragraph map data ────────────────────────────────────────
  const paragraphData = new Map<string, ParagraphGenData>();

  for (const pt of paragraphTypes) {
    const formDisplay = paragraphFormDisplays.get(pt.id);
    const resolved = resolveFields(
      pt.id,
      paragraphFieldInstances,
      formDisplay,
      paragraphFieldStorages,
    );

    // Include required fields only (matching current behavior).
    const requiredFields = resolved.filter((f) => f.required);

    paragraphData.set(pt.id, {
      id: pt.id,
      label: pt.label,
      fields: requiredFields,
      nested: nestingByParent.get(pt.id),
    });
  }

  // ── Detect candidate skipped paragraph types ────────────────────────
  // Heuristic: paragraph types with entity_reference fields that target
  // block_content or views (requires autocomplete, not handled by tests).
  // Safe targets that we CAN fill: media, taxonomy_term, user, node, paragraph.
  const SAFE_TARGETS = new Set(['media', 'taxonomy_term', 'user', 'node', 'paragraph']);
  const candidateSkipped: string[] = [];
  for (const pt of paragraphTypes) {
    const fields = paragraphFieldInstances.filter((f) => f.bundle === pt.id);
    for (const field of fields) {
      if (field.fieldType === 'entity_reference') {
        const target = getTargetTypeForField(configDir, 'paragraph', pt.id, field.fieldName);
        // Only skip if targeting something we can't handle (block_content, views, etc.)
        if (!SAFE_TARGETS.has(target) && target !== 'unknown') {
          candidateSkipped.push(pt.id);
          break;
        }
      }
    }
  }

  // ── Generate files ──────────────────────────────────────────────────
  const contentTypesTs = generateContentTypes(contentTypes, dataByType);
  const paragraphMapTs = generateParagraphMap(paragraphData);
  const siteConfigTs = generateSiteConfig({
    baseUrl,
    skippedParagraphTypes: candidateSkipped,
    consoleErrorIgnores: [],
    globalRequiredFields,
  });

  const helpersDir = path.join(outputDir, 'helpers');

  return {
    files: [
      { path: path.join(helpersDir, 'content-types.ts'), content: contentTypesTs },
      { path: path.join(helpersDir, 'paragraph-map.ts'), content: paragraphMapTs },
      { path: path.join(outputDir, 'site-config.ts'), content: siteConfigTs },
    ],
    warnings,
  };
}

/**
 * Helper to get the target entity type for an entity reference field.
 */
function getTargetTypeForField(
  configDir: string,
  entityType: string,
  bundle: string,
  fieldName: string,
): string {
  const filePath = path.join(configDir, `field.field.${entityType}.${bundle}.${fieldName}.yml`);
  if (!fs.existsSync(filePath)) return 'unknown';

  try {
    const data = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const settings = (data.settings ?? {}) as Record<string, unknown>;
    const handler = (settings.handler ?? '') as string;

    // Handler format: 'default:entity_type' (e.g. 'default:media', 'default:taxonomy_term').
    const match = handler.match(/^default:(\w+)$/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}
