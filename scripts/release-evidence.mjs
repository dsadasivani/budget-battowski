import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_MARKDOWN_PATH = 'RELEASE_EVIDENCE.md';
const DEFAULT_JSON_PATH = 'release-evidence.json';

function requiredValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before generating release evidence.`);
  }
  return value;
}

function parseChecks(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `RELEASE_CHECKS_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('RELEASE_CHECKS_JSON must contain at least one release check.');
  }
  return parsed.map((check, index) => {
    if (!check || typeof check !== 'object') {
      throw new Error(`Release check ${index + 1} must be an object.`);
    }
    const name = typeof check.name === 'string' ? check.name.trim() : '';
    const outcome = typeof check.outcome === 'string' ? check.outcome.trim().toLowerCase() : '';
    if (!name || !outcome) {
      throw new Error(`Release check ${index + 1} requires name and outcome.`);
    }
    return {
      name,
      outcome,
      required: check.required !== false,
    };
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

export function buildReleaseEvidence(environment, detailReport, generatedAt) {
  const checks = parseChecks(requiredValue(environment, 'RELEASE_CHECKS_JSON'));
  const requiredChecksPassed = checks
    .filter((check) => check.required)
    .every((check) => check.outcome === 'success');
  const detailedVerificationPassed = detailReport.exists && /^Pass\b/i.test(detailReport.result);
  const outcome = requiredChecksPassed && detailedVerificationPassed ? 'success' : 'failure';

  return {
    schemaVersion: 1,
    generatedAt,
    outcome,
    environment: requiredValue(environment, 'RELEASE_ENVIRONMENT'),
    release: {
      repository: requiredValue(environment, 'RELEASE_REPOSITORY'),
      commit: requiredValue(environment, 'RELEASE_COMMIT'),
      ref: requiredValue(environment, 'RELEASE_REF'),
      event: requiredValue(environment, 'RELEASE_EVENT'),
      actor: requiredValue(environment, 'RELEASE_ACTOR'),
      runId: requiredValue(environment, 'RELEASE_RUN_ID'),
      runAttempt: environment.RELEASE_RUN_ATTEMPT?.trim() || '1',
      runUrl: requiredValue(environment, 'RELEASE_RUN_URL'),
      targetUrl: requiredValue(environment, 'RELEASE_TARGET_URL'),
    },
    migration: {
      status: requiredValue(environment, 'RELEASE_MIGRATION_STATUS'),
      note: requiredValue(environment, 'RELEASE_MIGRATION_NOTE'),
    },
    checks,
    detailedReport: detailReport,
  };
}

export function releaseEvidenceMarkdown(evidence) {
  return [
    '# Release Evidence',
    '',
    `Generated: ${evidence.generatedAt}`,
    `Overall result: **${evidence.outcome === 'success' ? 'Pass' : 'Fail'}**`,
    '',
    '## Release identity',
    '',
    markdownTable(
      ['Field', 'Value'],
      [
        ['Environment', evidence.environment],
        ['Repository', evidence.release.repository],
        ['Commit', evidence.release.commit],
        ['Ref', evidence.release.ref],
        ['Event', evidence.release.event],
        ['Actor', evidence.release.actor],
        ['Workflow run', evidence.release.runUrl],
        ['Run attempt', evidence.release.runAttempt],
        ['Target', evidence.release.targetUrl],
      ],
    ),
    '',
    '## Required gates',
    '',
    markdownTable(
      ['Check', 'Required', 'Outcome'],
      evidence.checks.map((check) => [check.name, check.required ? 'Yes' : 'No', check.outcome]),
    ),
    '',
    '## Migration disposition',
    '',
    markdownTable(['Status', 'Reason'], [[evidence.migration.status, evidence.migration.note]]),
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
    'This manifest contains release metadata and a report checksum only. The detailed report remains a separate file in the same artifact.',
    '',
  ].join('\n');
}

export async function generateReleaseEvidence({
  environment = process.env,
  cwd = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const detailReportPath = path.resolve(cwd, requiredValue(environment, 'RELEASE_DETAIL_REPORT'));
  const detailReportExists = existsSync(detailReportPath);
  const detailReportContent = detailReportExists ? readFileSync(detailReportPath) : null;
  const detailReport = {
    fileName: path.basename(detailReportPath),
    exists: detailReportExists,
    result: detailReportContent ? reportResult(detailReportContent.toString('utf8')) : 'Missing',
    sha256: detailReportContent ? sha256(detailReportContent) : null,
  };
  const evidence = buildReleaseEvidence(environment, detailReport, generatedAt);
  const markdown = releaseEvidenceMarkdown(evidence);
  const markdownPath = path.resolve(
    cwd,
    environment.RELEASE_EVIDENCE_MARKDOWN?.trim() || DEFAULT_MARKDOWN_PATH,
  );
  const jsonPath = path.resolve(
    cwd,
    environment.RELEASE_EVIDENCE_JSON?.trim() || DEFAULT_JSON_PATH,
  );

  await Promise.all([
    writeFile(markdownPath, markdown, 'utf8'),
    writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'),
  ]);
  const stepSummaryPath = environment.GITHUB_STEP_SUMMARY?.trim();
  if (stepSummaryPath) {
    await appendFile(
      path.isAbsolute(stepSummaryPath) ? stepSummaryPath : path.resolve(cwd, stepSummaryPath),
      markdown,
      'utf8',
    );
  }

  return { evidence, markdownPath, jsonPath };
}

async function main() {
  const { evidence, markdownPath, jsonPath } = await generateReleaseEvidence();
  console.log(`Release evidence result: ${evidence.outcome.toUpperCase()}`);
  console.log(`Release evidence Markdown: ${markdownPath}`);
  console.log(`Release evidence JSON: ${jsonPath}`);
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
