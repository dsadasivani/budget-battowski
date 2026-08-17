import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { generateReleaseEvidence } from './release-evidence.mjs';

function releaseEnvironment(overrides = {}) {
  return {
    RELEASE_ENVIRONMENT: 'qa',
    RELEASE_REPOSITORY: 'owner/repository',
    RELEASE_COMMIT: 'abc123',
    RELEASE_REF: 'develop',
    RELEASE_EVENT: 'push',
    RELEASE_ACTOR: 'release-user',
    RELEASE_RUN_ID: '42',
    RELEASE_RUN_ATTEMPT: '1',
    RELEASE_RUN_URL: 'https://github.com/owner/repository/actions/runs/42',
    RELEASE_TARGET_URL: 'https://example.test',
    RELEASE_MIGRATION_STATUS: 'not-required',
    RELEASE_MIGRATION_NOTE: 'Clean UID-only schema.',
    RELEASE_DETAIL_REPORT: 'DETAIL_REPORT.md',
    RELEASE_CHECKS_JSON: JSON.stringify([
      { name: 'Build', outcome: 'success' },
      { name: 'Deploy', outcome: 'success' },
      { name: 'Regression', outcome: 'success' },
    ]),
    ...overrides,
  };
}

test('generates successful Markdown and JSON evidence with a detailed-report checksum', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'budget-release-evidence-'));
  try {
    await writeFile(
      path.join(tempDir, 'DETAIL_REPORT.md'),
      '# Detailed report\n\nResult: Pass (12 passed, 0 failed)\n',
      'utf8',
    );
    const { evidence, markdownPath, jsonPath } = await generateReleaseEvidence({
      environment: releaseEnvironment({
        GITHUB_STEP_SUMMARY: 'STEP_SUMMARY.md',
        UNAPPROVED_SECRET: 'must-not-appear',
      }),
      cwd: tempDir,
      generatedAt: '2026-08-17T00:00:00.000Z',
    });

    assert.equal(evidence.outcome, 'success');
    assert.equal(evidence.detailedReport.result, 'Pass (12 passed, 0 failed)');
    assert.match(evidence.detailedReport.sha256, /^[a-f0-9]{64}$/);
    const markdown = await readFile(markdownPath, 'utf8');
    const json = await readFile(jsonPath, 'utf8');
    assert.match(markdown, /Overall result: \*\*Pass\*\*/);
    assert.doesNotMatch(markdown, /must-not-appear/);
    assert.doesNotMatch(json, /must-not-appear/);
    assert.equal(JSON.parse(json).release.commit, 'abc123');
    assert.match(
      await readFile(path.join(tempDir, 'STEP_SUMMARY.md'), 'utf8'),
      /Overall result: \*\*Pass\*\*/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('records failed gates and a missing detailed report as failed release evidence', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'budget-release-evidence-'));
  try {
    const environment = releaseEnvironment({
      RELEASE_CHECKS_JSON: JSON.stringify([
        { name: 'Build', outcome: 'success' },
        { name: 'Deploy', outcome: 'failure' },
        { name: 'Regression', outcome: 'skipped' },
      ]),
    });
    const { evidence } = await generateReleaseEvidence({
      environment,
      cwd: tempDir,
      generatedAt: '2026-08-17T00:00:00.000Z',
    });

    assert.equal(evidence.outcome, 'failure');
    assert.equal(evidence.detailedReport.exists, false);
    assert.equal(evidence.detailedReport.result, 'Missing');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
