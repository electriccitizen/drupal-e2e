import { execSync } from 'child_process';

/**
 * Delete a node via Drush. Drupal cascades deletion to paragraphs.
 * Silently ignores errors (node may already be deleted).
 */
export function deleteNode(nid: number): void {
  try {
    execSync(`ddev drush entity:delete node ${nid} -y`, {
      encoding: 'utf-8',
      timeout: 30_000,
    });
  } catch {
    // Node may not exist — ignore.
  }
}

/**
 * Ensure at least one image media entity exists.
 * Creates a minimal test image if the media library is empty.
 */
export function ensureTestMedia(): void {
  const count = execSync(
    `ddev drush php:eval "echo \\Drupal::entityQuery('media')->condition('bundle', 'image')->accessCheck(FALSE)->count()->execute();"`,
    { encoding: 'utf-8', timeout: 30_000 },
  ).trim();

  if (parseInt(count, 10) === 0) {
    execSync(
      `ddev drush php:eval "
        \\$file = \\Drupal\\file\\Entity\\File::create([
          'uri' => 'public://e2e-test-image.png',
          'status' => 1,
        ]);
        // 1x1 red PNG.
        file_put_contents('sites/default/files/e2e-test-image.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='));
        \\$file->save();
        \\$media = \\Drupal\\media\\Entity\\Media::create([
          'bundle' => 'image',
          'name' => 'E2E Test Image',
          'field_media_image' => ['target_id' => \\$file->id(), 'alt' => 'E2E test'],
          'status' => 1,
        ]);
        \\$media->save();
        echo 'Created test media: ' . \\$media->id();
      "`,
      { encoding: 'utf-8', timeout: 30_000 },
    );
  }
}

/**
 * Whether cleanup should be skipped (env flag).
 */
export function shouldSkipCleanup(): boolean {
  return process.env.SKIP_CLEANUP === 'true';
}
