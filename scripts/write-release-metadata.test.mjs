import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { writeReleaseMetadata } from './write-release-metadata.mjs';

test('writes only allowlisted release correlation fields', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'budget-release-metadata-'));
  try {
    const { metadata, outputPath } = await writeReleaseMetadata({
      cwd: tempDir,
      generatedAt: '2026-08-17T00:00:00.000Z',
      outputDirectory: 'output',
      environment: {
        RELEASE_ENVIRONMENT: 'qa',
        RELEASE_COMMIT: 'abcdef1234567890',
        RELEASE_RUN_ID: '42',
        QA_FIREBASE_PASSWORD: 'must-not-appear',
      },
    });

    assert.deepEqual(metadata, {
      schemaVersion: 1,
      environment: 'qa',
      commit: 'abcdef1234567890',
      runId: '42',
      generatedAt: '2026-08-17T00:00:00.000Z',
    });
    const contents = await readFile(outputPath, 'utf8');
    assert.doesNotMatch(contents, /must-not-appear/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('rejects unsafe release metadata instead of publishing it', async () => {
  await assert.rejects(
    writeReleaseMetadata({
      environment: {
        RELEASE_ENVIRONMENT: 'qa<script>',
        RELEASE_COMMIT: 'not-a-commit',
      },
    }),
    /RELEASE_ENVIRONMENT/,
  );
});
