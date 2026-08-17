import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateRollbackPlan } from './validate-rollback-plan.mjs';

function rollbackEnvironment(overrides = {}) {
  return {
    ROLLBACK_ENVIRONMENT: 'qa',
    ROLLBACK_COMPONENT: 'hosting',
    ROLLBACK_TARGET_COMMIT: '1111111111111111111111111111111111111111',
    ROLLBACK_CONTROL_COMMIT: '2222222222222222222222222222222222222222',
    ROLLBACK_CURRENT_REF: 'develop',
    ROLLBACK_INCIDENT_REFERENCE: 'INC-1234',
    ROLLBACK_CONFIRMATION: 'ROLLBACK QA HOSTING',
    ...overrides,
  };
}

test('accepts a fully confirmed QA Hosting rollback plan', () => {
  assert.deepEqual(validateRollbackPlan(rollbackEnvironment()), {
    environment: 'qa',
    component: 'hosting',
    targetCommit: '1111111111111111111111111111111111111111',
    controlCommit: '2222222222222222222222222222222222222222',
    currentRef: 'develop',
    requiredBranch: 'develop',
    incidentReference: 'INC-1234',
    expectedConfirmation: 'ROLLBACK QA HOSTING',
  });
});

test('requires production rollbacks to run from master with exact confirmation', () => {
  assert.throws(
    () =>
      validateRollbackPlan(
        rollbackEnvironment({
          ROLLBACK_ENVIRONMENT: 'production',
          ROLLBACK_COMPONENT: 'firestore-rules',
          ROLLBACK_CONFIRMATION: 'ROLLBACK PRODUCTION FIRESTORE-RULES',
        }),
      ),
    /must run from the master branch/,
  );
});

test('rejects short SHAs, the control commit, and free-form incident text', () => {
  assert.throws(
    () => validateRollbackPlan(rollbackEnvironment({ ROLLBACK_TARGET_COMMIT: '1111111' })),
    /full 40-character/,
  );
  assert.throws(
    () =>
      validateRollbackPlan(
        rollbackEnvironment({
          ROLLBACK_TARGET_COMMIT: '2222222222222222222222222222222222222222',
        }),
      ),
    /must differ/,
  );
  assert.throws(
    () =>
      validateRollbackPlan(
        rollbackEnvironment({ ROLLBACK_INCIDENT_REFERENCE: 'customer email included here' }),
      ),
    /ticket ID or URL/,
  );
  assert.throws(
    () =>
      validateRollbackPlan(
        rollbackEnvironment({ ROLLBACK_CONFIRMATION: 'ROLLBACK QA FIRESTORE-RULES' }),
      ),
    /Confirmation must exactly match/,
  );
});
