import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { FieldInstanceInfo } from './fields.js';
import type { FormDisplayInfo } from './fields.js';

export interface NestingInfo {
  /** The parent paragraph type that contains nested children. */
  parentType: string;
  /** The entity reference revisions field that holds children. */
  field: string;
  /** The child paragraph type(s) allowed. First entry is the primary child type. */
  childTypes: string[];
}

/**
 * Discover parent→child nesting relationships for paragraph types.
 *
 * A paragraph type is a "container" if it has an entity_reference_revisions
 * field targeting other paragraph types.
 */
export function discoverNesting(
  configDir: string,
  paragraphFieldInstances: FieldInstanceInfo[],
  paragraphFormDisplays: Map<string, FormDisplayInfo>,
): NestingInfo[] {
  const nestings: NestingInfo[] = [];

  // Find paragraph fields that reference other paragraphs.
  const refFields = paragraphFieldInstances.filter(
    (f) => f.fieldType === 'entity_reference_revisions',
  );

  for (const field of refFields) {
    // Check form display to confirm this field is visible.
    const display = paragraphFormDisplays.get(field.bundle);
    if (!display) continue;

    const displayField = display.fields.find((f) => f.fieldName === field.fieldName);
    if (!displayField) continue;

    // Read the field config to get allowed target bundles.
    const fieldConfigPath = path.join(
      configDir,
      `field.field.paragraph.${field.bundle}.${field.fieldName}.yml`,
    );
    if (!fs.existsSync(fieldConfigPath)) continue;

    const data = yaml.load(fs.readFileSync(fieldConfigPath, 'utf-8')) as Record<string, unknown>;
    const settings = (data.settings ?? {}) as Record<string, unknown>;
    const handlerSettings = (settings.handler_settings ?? {}) as Record<string, unknown>;
    const targetBundles = (handlerSettings.target_bundles ?? {}) as Record<string, string>;

    const childTypes = Object.keys(targetBundles);
    if (childTypes.length === 0) continue;

    nestings.push({
      parentType: field.bundle,
      field: field.fieldName,
      childTypes,
    });
  }

  return nestings;
}
