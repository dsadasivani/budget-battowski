import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { generateRollbackEvidence } from './rollback-evidence.mjs';

function rollbackEnvironment(overrides = {}) {
  return {
    ROLLBACK_ENVIRONMENT: 'qa',
    ROLLBACK_COMPONENT: 'hosting',
    ROLLBACK_TARGET_COMMIT: '1111111111111111111111111111111111111111',
    ROLLBACK_CONTROL_COMMIT: '2222222222222222222222222222222222222222',
    ROLLBACK_CONTROL_REF: 'develop',
    ROLLBACK_INCIDENT_REFERENCE: 'INC-1234',
    ROLLBACK_REPOSITORY: 'owner/repository',
    ROLLBACK_ACTOR: 'release-user',
    ROLLBACK_RUN_ID: '42',
    ROLLBACK_RUN_ATTEMPT: '1',
    ROLLBACK_RUN_URL: 'https://github.com/owner/repository/actions/runs/42',
    ROLLBACK_TARGET_URL: 'https://example.test',
    ROLLBACK_DETAIL_REPORT: 'ROLLBACK_REPORT.md',
    ROLLBACK_CHECKS_JSON: JSON.stringify([
      { name: 'Validate plan', outcome: 'success' },
      { name: 'Deploy component', outcome: 'success' },
      { name: 'Verify rollback', outcome: 'success' },
    ]),
    ...overrides,
  };
}

test('generates successful rollback evidence with verification checksum', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'budget-rollback-evidence-'));
  try {
    await writeFile(
      path.join(tempDir, 'ROLLBACK_REPORT.md'),
      '# Verification\n\nResult: Pass (9 passed, 0 failed)\n',
      'utf8',
    );
    const { evidence, markdownPath } = await generateRollbackEvidence({
      environment: rollbackEnvironment({ UNAPPROVED_SECRET: 'must-not-appear' }),
      cwd: tempDir,
      generatedAt: '2026-08-17T00:00:00.000Z',
    });

    assert.equal(evidence.outcome, 'success');
    assert.equal(evidence.dataRestored, false);
    assert.equal(evidence.branchMoved, false);
    assert.match(evidence.detailedReport.sha256, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(await readFile(markdownPath, 'utf8'), /must-not-appear/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('records failed gates and missing verification as failed rollback evidence', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'budget-rollback-evidence-'));
  try {
    const { evidence } = await generateRollbackEvidence({
      environment: rollbackEnvironment({
        ROLLBACK_CHECKS_JSON: JSON.stringify([
          { name: 'Validate plan', outcome: 'success' },
          { name: 'Deploy component', outcome: 'failure' },
          { name: 'Verify rollback', outcome: 'skipped' },
        ]),
      }),
      cwd: tempDir,
    });

    assert.equal(evidence.outcome, 'failure');
    assert.equal(evidence.detailedReport.exists, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
