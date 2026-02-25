import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface ParagraphTypeInfo {
  /** Machine name (e.g. 'text'). */
  id: string;
  /** Human-readable label (e.g. 'Text'). Must match "Add {label}" button. */
  label: string;
}

/**
 * Parse all paragraphs.paragraphs_type.*.yml files.
 */
export function parseParagraphTypes(configDir: string): ParagraphTypeInfo[] {
  const files = fs.readdirSync(configDir).filter(
    (f) => /^paragraphs\.paragraphs_type\.\w+\.yml$/.test(f),
  );

  const types: ParagraphTypeInfo[] = [];

  for (const file of files) {
    const data = yaml.load(fs.readFileSync(path.join(configDir, file), 'utf-8')) as Record<
      string,
      unknown
    >;
    if (data.id && data.label) {
      types.push({
        id: data.id as string,
        label: data.label as string,
      });
    }
  }

  return types.sort((a, b) => a.id.localeCompare(b.id));
}
