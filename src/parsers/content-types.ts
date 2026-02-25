import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface ContentTypeInfo {
  /** Machine name (e.g. 'page'). */
  type: string;
  /** Human label (e.g. 'Basic page'). */
  name: string;
}

/**
 * Parse all node.type.*.yml files in the config directory.
 * Returns a sorted list of content type machine names and labels.
 */
export function parseContentTypes(configDir: string): ContentTypeInfo[] {
  const files = fs.readdirSync(configDir).filter((f) => /^node\.type\.\w+\.yml$/.test(f));

  const types: ContentTypeInfo[] = [];

  for (const file of files) {
    const data = yaml.load(fs.readFileSync(path.join(configDir, file), 'utf-8')) as Record<
      string,
      unknown
    >;
    if (data.type && data.name) {
      types.push({
        type: data.type as string,
        name: data.name as string,
      });
    }
  }

  return types.sort((a, b) => a.type.localeCompare(b.type));
}
