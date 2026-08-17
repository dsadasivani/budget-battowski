import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FULL_COMMIT = /^[a-fA-F0-9]{40}$/;
const INCIDENT_REFERENCE = /^[A-Za-z][A-Za-z0-9._:/#-]{2,199}$/;

function requiredValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before validating a rollback.`);
  }
  return value;
}

function componentLabel(component) {
  return component === 'hosting' ? 'HOSTING' : 'FIRESTORE-RULES';
}

export function validateRollbackPlan(environment = process.env) {
  const rollbackEnvironment = requiredValue(environment, 'ROLLBACK_ENVIRONMENT').toLowerCase();
  const component = requiredValue(environment, 'ROLLBACK_COMPONENT').toLowerCase();
  const targetCommit = requiredValue(environment, 'ROLLBACK_TARGET_COMMIT').toLowerCase();
  const controlCommit = requiredValue(environment, 'ROLLBACK_CONTROL_COMMIT').toLowerCase();
  const currentRef = requiredValue(environment, 'ROLLBACK_CURRENT_REF');
  const incidentReference = requiredValue(environment, 'ROLLBACK_INCIDENT_REFERENCE');
  const confirmation = requiredValue(environment, 'ROLLBACK_CONFIRMATION');

  if (!['qa', 'production'].includes(rollbackEnvironment)) {
    throw new Error('ROLLBACK_ENVIRONMENT must be qa or production.');
  }
  if (!['hosting', 'firestore-rules'].includes(component)) {
    throw new Error('ROLLBACK_COMPONENT must be hosting or firestore-rules.');
  }
  if (!FULL_COMMIT.test(targetCommit)) {
    throw new Error('ROLLBACK_TARGET_COMMIT must be a full 40-character Git commit SHA.');
  }
  if (!FULL_COMMIT.test(controlCommit)) {
    throw new Error('ROLLBACK_CONTROL_COMMIT must be a full 40-character Git commit SHA.');
  }
  if (targetCommit === controlCommit) {
    throw new Error('ROLLBACK_TARGET_COMMIT must differ from the workflow control commit.');
  }
  if (!INCIDENT_REFERENCE.test(incidentReference)) {
    throw new Error(
      'ROLLBACK_INCIDENT_REFERENCE must be a ticket ID or URL without spaces or query parameters.',
    );
  }

  const requiredBranch = rollbackEnvironment === 'qa' ? 'develop' : 'master';
  if (currentRef !== requiredBranch) {
    throw new Error(
      `${rollbackEnvironment} rollback workflows must run from the ${requiredBranch} branch.`,
    );
  }

  const expectedConfirmation = `ROLLBACK ${rollbackEnvironment.toUpperCase()} ${componentLabel(component)}`;
  if (confirmation !== expectedConfirmation) {
    throw new Error(`Confirmation must exactly match: ${expectedConfirmation}`);
  }

  return {
    environment: rollbackEnvironment,
    component,
    targetCommit,
    controlCommit,
    currentRef,
    requiredBranch,
    incidentReference,
    expectedConfirmation,
  };
}

function markdown(plan) {
  return [
    '# Rollback Plan',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Environment | ${plan.environment} |`,
    `| Component | ${plan.component} |`,
    `| Control commit | ${plan.controlCommit} |`,
    `| Target commit | ${plan.targetCommit} |`,
    `| Required branch | ${plan.requiredBranch} |`,
    `| Incident | ${plan.incidentReference} |`,
    '',
    'This operation creates a new component deployment from the target commit. It does not move a Git branch or restore Firestore data.',
    '',
  ].join('\n');
}

async function writeOutput(outputPath, values) {
  if (!outputPath) {
    return;
  }
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await appendFile(path.resolve(outputPath), `${lines.join('\n')}\n`, 'utf8');
}

export async function validateAndRecordRollbackPlan(environment = process.env) {
  const plan = validateRollbackPlan(environment);
  await Promise.all([
    writeOutput(environment.GITHUB_OUTPUT?.trim(), {
      environment: plan.environment,
      component: plan.component,
      target_commit: plan.targetCommit,
      required_branch: plan.requiredBranch,
      incident_reference: plan.incidentReference,
    }),
    environment.GITHUB_STEP_SUMMARY?.trim()
      ? appendFile(path.resolve(environment.GITHUB_STEP_SUMMARY), markdown(plan), 'utf8')
      : Promise.resolve(),
  ]);
  return plan;
}

async function main() {
  const plan = await validateAndRecordRollbackPlan();
  console.log(`Validated ${plan.environment} ${plan.component} rollback to ${plan.targetCommit}.`);
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
