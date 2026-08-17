import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_MARKDOWN_PATH = 'ROLLBACK_EVIDENCE.md';
const DEFAULT_JSON_PATH = 'rollback-evidence.json';
const SAFE_VALUE = /^[A-Za-z0-9._:/#-]{1,256}$/;

function requiredValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before generating rollback evidence.`);
  }
  return value;
}

function safeValue(environment, name) {
  const value = requiredValue(environment, name);
  return SAFE_VALUE.test(value) ? value : 'invalid-input-redacted';
}

function parseChecks(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `ROLLBACK_CHECKS_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('ROLLBACK_CHECKS_JSON must contain at least one rollback check.');
  }
  return parsed.map((check, index) => {
    const name = typeof check?.name === 'string' ? check.name.trim() : '';
    const outcome = typeof check?.outcome === 'string' ? check.outcome.trim().toLowerCase() : '';
    if (!name || !outcome) {
      throw new Error(`Rollback check ${index + 1} requires name and outcome.`);
    }
    return { name, outcome };
  });
}

function reportResult(content) {
  return content.match(/^Result:\s*(.+)$/im)?.[1]?.trim() ?? 'Unknown';
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(' |')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n');
}

export function buildRollbackEvidence(environment, detailReport, generatedAt) {
  const checks = parseChecks(requiredValue(environment, 'ROLLBACK_CHECKS_JSON'));
  const checksPassed = checks.every((check) => check.outcome === 'success');
  const verificationPassed = detailReport.exists && /^Pass\b/i.test(detailReport.result);

  return {
    schemaVersion: 1,
    generatedAt,
    outcome: checksPassed && verificationPassed ? 'success' : 'failure',
    rollback: {
      environment: safeValue(environment, 'ROLLBACK_ENVIRONMENT'),
      component: safeValue(environment, 'ROLLBACK_COMPONENT'),
      targetCommit: safeValue(environment, 'ROLLBACK_TARGET_COMMIT'),
      controlCommit: safeValue(environment, 'ROLLBACK_CONTROL_COMMIT'),
      controlRef: safeValue(environment, 'ROLLBACK_CONTROL_REF'),
      incidentReference: safeValue(environment, 'ROLLBACK_INCIDENT_REFERENCE'),
      repository: safeValue(environment, 'ROLLBACK_REPOSITORY'),
      actor: safeValue(environment, 'ROLLBACK_ACTOR'),
      runId: safeValue(environment, 'ROLLBACK_RUN_ID'),
      runAttempt: safeValue(environment, 'ROLLBACK_RUN_ATTEMPT'),
      runUrl: safeValue(environment, 'ROLLBACK_RUN_URL'),
      targetUrl: safeValue(environment, 'ROLLBACK_TARGET_URL'),
    },
    checks,
    detailedReport: detailReport,
    dataRestored: false,
    branchMoved: false,
  };
}

export function rollbackEvidenceMarkdown(evidence) {
  return [
    '# Rollback Evidence',
    '',
    `Generated: ${evidence.generatedAt}`,
    `Overall result: **${evidence.outcome === 'success' ? 'Pass' : 'Fail'}**`,
    '',
    '## Rollback identity',
    '',
    markdownTable(
      ['Field', 'Value'],
      [
        ['Environment', evidence.rollback.environment],
        ['Component', evidence.rollback.component],
        ['Target commit', evidence.rollback.targetCommit],
        ['Control commit', evidence.rollback.controlCommit],
        ['Control ref', evidence.rollback.controlRef],
        ['Incident', evidence.rollback.incidentReference],
        ['Actor', evidence.rollback.actor],
        ['Workflow run', evidence.rollback.runUrl],
        ['Run attempt', evidence.rollback.runAttempt],
        ['Target URL', evidence.rollback.targetUrl],
      ],
    ),
    '',
    '## Required gates',
    '',
    markdownTable(
      ['Check', 'Outcome'],
      evidence.checks.map((check) => [check.name, check.outcome]),
    ),
    '',
    '## Detailed verification',
    '',
    markdownTable(
      ['File', 'Available', 'Result', 'SHA-256'],
      [
        [
          evidence.detailedReport.fileName,
          evidence.detailedReport.exists ? 'Yes' : 'No',
          evidence.detailedReport.result,
          evidence.detailedReport.sha256 || '',
        ],
      ],
    ),
    '',
    'The rollback created a new component deployment from an older source commit. It did not restore Firestore data or move a Git branch.',
    '',
  ].join('\n');
}

export async function generateRollbackEvidence({
  environment = process.env,
  cwd = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const detailReportPath = path.resolve(cwd, requiredValue(environment, 'ROLLBACK_DETAIL_REPORT'));
  const detailReportExists = existsSync(detailReportPath);
  const detailReportContent = detailReportExists ? readFileSync(detailReportPath) : null;
  const detailReport = {
    fileName: path.basename(detailReportPath),
    exists: detailReportExists,
    result: detailReportContent ? reportResult(detailReportContent.toString('utf8')) : 'Missing',
    sha256: detailReportContent ? sha256(detailReportContent) : null,
  };
  const evidence = buildRollbackEvidence(environment, detailReport, generatedAt);
  const markdown = rollbackEvidenceMarkdown(evidence);
  const markdownPath = path.resolve(cwd, DEFAULT_MARKDOWN_PATH);
  const jsonPath = path.resolve(cwd, DEFAULT_JSON_PATH);
  await Promise.all([
    writeFile(markdownPath, markdown, 'utf8'),
    writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'),
  ]);
  const stepSummaryPath = environment.GITHUB_STEP_SUMMARY?.trim();
  if (stepSummaryPath) {
    await appendFile(path.resolve(stepSummaryPath), markdown, 'utf8');
  }
  return { evidence, markdownPath, jsonPath };
}

async function main() {
  const { evidence } = await generateRollbackEvidence();
  console.log(`Rollback evidence result: ${evidence.outcome.toUpperCase()}`);
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
