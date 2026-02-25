import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { mapWidgetType, isExcludedField, isParagraphWidget, type FieldStrategyType } from './widget-mapper.js';

// ── Field instance data ─────────────────────────────────────────────────

export interface FieldInstanceInfo {
  fieldName: string;
  entityType: string;
  bundle: string;
  label: string;
  required: boolean;
  fieldType: string;
}

/**
 * Parse all field.field.{entityType}.*.*.yml for a given entity type.
 */
export function parseFieldInstances(
  configDir: string,
  entityType: 'node' | 'paragraph',
): FieldInstanceInfo[] {
  const prefix = `field.field.${entityType}.`;
  const files = fs.readdirSync(configDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith('.yml'),
  );

  const fields: FieldInstanceInfo[] = [];

  for (const file of files) {
    const data = yaml.load(fs.readFileSync(path.join(configDir, file), 'utf-8')) as Record<
      string,
      unknown
    >;
    fields.push({
      fieldName: data.field_name as string,
      entityType: data.entity_type as string,
      bundle: data.bundle as string,
      label: data.label as string,
      required: data.required === true,
      fieldType: data.field_type as string,
    });
  }

  return fields;
}

// ── Form display data ───────────────────────────────────────────────────

export interface FormDisplayFieldInfo {
  fieldName: string;
  widgetType: string;
  weight: number;
}

export interface FormDisplayInfo {
  entityType: string;
  bundle: string;
  fields: FormDisplayFieldInfo[];
  hiddenFields: string[];
}

/**
 * Parse a single core.entity_form_display.*.yml file.
 */
function parseFormDisplay(filePath: string): FormDisplayInfo | null {
  if (!fs.existsSync(filePath)) return null;

  const data = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  const content = (data.content ?? {}) as Record<string, unknown>;
  const hidden = (data.hidden ?? {}) as Record<string, unknown>;

  const fields: FormDisplayFieldInfo[] = [];
  for (const [fieldName, config] of Object.entries(content)) {
    const cfg = config as Record<string, unknown>;
    if (cfg.type) {
      fields.push({
        fieldName,
        widgetType: cfg.type as string,
        weight: (cfg.weight as number) ?? 0,
      });
    }
  }

  return {
    entityType: data.targetEntityType as string,
    bundle: data.bundle as string,
    fields: fields.sort((a, b) => a.weight - b.weight),
    hiddenFields: Object.keys(hidden),
  };
}

/**
 * Parse all form displays for a given entity type.
 */
export function parseFormDisplays(
  configDir: string,
  entityType: 'node' | 'paragraph',
): Map<string, FormDisplayInfo> {
  const prefix = `core.entity_form_display.${entityType}.`;
  const suffix = '.default.yml';
  const files = fs.readdirSync(configDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith(suffix),
  );

  const displays = new Map<string, FormDisplayInfo>();

  for (const file of files) {
    const display = parseFormDisplay(path.join(configDir, file));
    if (display) {
      displays.set(display.bundle, display);
    }
  }

  return displays;
}

// ── Field storage data ──────────────────────────────────────────────────

export interface FieldStorageInfo {
  fieldName: string;
  entityType: string;
  type: string;
  cardinality: number;
  targetType?: string;
}

/**
 * Parse all field.storage.*.yml files for a given entity type.
 */
export function parseFieldStorages(
  configDir: string,
  entityType: 'node' | 'paragraph',
): Map<string, FieldStorageInfo> {
  const prefix = `field.storage.${entityType}.`;
  const files = fs.readdirSync(configDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith('.yml'),
  );

  const storages = new Map<string, FieldStorageInfo>();

  for (const file of files) {
    const data = yaml.load(fs.readFileSync(path.join(configDir, file), 'utf-8')) as Record<
      string,
      unknown
    >;
    const settings = (data.settings ?? {}) as Record<string, unknown>;
    const fieldName = data.field_name as string;

    storages.set(fieldName, {
      fieldName,
      entityType: data.entity_type as string,
      type: data.type as string,
      cardinality: (data.cardinality as number) ?? 1,
      targetType: settings.target_type as string | undefined,
    });
  }

  return storages;
}

// ── Resolved field info (combines field instance + form display + storage) ──

export interface ResolvedFieldInfo {
  fieldName: string;
  label: string;
  required: boolean;
  fieldType: string;
  widgetType: string;
  strategy: FieldStrategyType;
  weight: number;
  cardinality: number;
}

/**
 * Get all paragraph reference field names on a content type's form display.
 * Returns field names where the widget is a paragraphs widget.
 */
export function getParagraphFieldNames(formDisplay: FormDisplayInfo): string[] {
  return formDisplay.fields
    .filter((f) => isParagraphWidget(f.widgetType))
    .map((f) => f.fieldName);
}

/**
 * Resolve complete field information for a bundle, combining
 * field instances, form display, and field storage.
 *
 * Returns only fields that:
 * 1. Are in the form display (not hidden)
 * 2. Have a known fillable widget type
 * 3. Are not system/admin fields
 * 4. Are not paragraph reference fields
 */
export function resolveFields(
  bundle: string,
  fieldInstances: FieldInstanceInfo[],
  formDisplay: FormDisplayInfo | undefined,
  fieldStorages: Map<string, FieldStorageInfo>,
): ResolvedFieldInfo[] {
  if (!formDisplay) return [];

  const bundleFields = fieldInstances.filter((f) => f.bundle === bundle);
  const fieldsByName = new Map(bundleFields.map((f) => [f.fieldName, f]));

  const resolved: ResolvedFieldInfo[] = [];

  for (const displayField of formDisplay.fields) {
    const { fieldName, widgetType, weight } = displayField;

    // Skip excluded fields.
    if (isExcludedField(fieldName)) continue;

    // Skip paragraph reference fields.
    if (isParagraphWidget(widgetType)) continue;

    // Skip title field (handled separately).
    if (fieldName === 'title') continue;

    const fieldInstance = fieldsByName.get(fieldName);
    if (!fieldInstance) continue;

    const storage = fieldStorages.get(fieldName);
    const cardinality = storage?.cardinality ?? 1;

    const strategy = mapWidgetType(widgetType, fieldInstance.fieldType, cardinality);
    if (!strategy) continue;

    resolved.push({
      fieldName,
      label: fieldInstance.label,
      required: fieldInstance.required,
      fieldType: fieldInstance.fieldType,
      widgetType,
      strategy,
      weight,
      cardinality,
    });
  }

  return resolved.sort((a, b) => a.weight - b.weight);
}

// ── Paragraph allowed types extraction ──────────────────────────────────

export interface ParagraphFieldConfig {
  fieldName: string;
  allowedTypes: string[];
  weight: number;
}

/**
 * Extract allowed paragraph types from a paragraph reference field's field config.
 */
export function extractParagraphAllowedTypes(
  configDir: string,
  entityType: string,
  bundle: string,
  fieldName: string,
): string[] {
  const filePath = path.join(configDir, `field.field.${entityType}.${bundle}.${fieldName}.yml`);
  if (!fs.existsSync(filePath)) return [];

  const data = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const handlerSettings = (settings.handler_settings ?? {}) as Record<string, unknown>;
  const targetBundles = (handlerSettings.target_bundles ?? {}) as Record<string, string>;

  return Object.keys(targetBundles).sort();
}

/**
 * Get paragraph field configurations for a content type.
 * Returns primary (most allowed types) and secondary paragraph fields.
 */
export function getParagraphFieldConfigs(
  configDir: string,
  bundle: string,
  formDisplay: FormDisplayInfo,
): ParagraphFieldConfig[] {
  const paragraphFieldNames = getParagraphFieldNames(formDisplay);

  return paragraphFieldNames.map((fieldName) => {
    const displayField = formDisplay.fields.find((f) => f.fieldName === fieldName);
    return {
      fieldName,
      allowedTypes: extractParagraphAllowedTypes(configDir, 'node', bundle, fieldName),
      weight: displayField?.weight ?? 0,
    };
  });
}
