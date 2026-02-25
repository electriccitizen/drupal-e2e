import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

/**
 * Parse .ddev/config.yaml to extract the site name and base URL.
 */
export function parseDdevConfig(projectRoot: string): { name: string; baseUrl: string } {
  const configPath = path.join(projectRoot, '.ddev', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`DDEV config not found at ${configPath}`);
  }

  const data = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  const name = data.name as string;

  if (!name) {
    throw new Error('DDEV config.yaml missing "name" field');
  }

  return {
    name,
    baseUrl: `https://${name}.ddev.site`,
  };
}
