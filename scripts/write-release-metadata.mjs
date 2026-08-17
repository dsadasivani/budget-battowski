import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT_DIRECTORY = 'dist/budget-battowski/browser';
const SAFE_ENVIRONMENT = /^(qa|production)$/;
const SAFE_COMMIT = /^[a-fA-F0-9]{7,64}$/;
const SAFE_RUN_ID = /^\d{1,32}$/;

export async function writeReleaseMetadata({
  environment = process.env,
  cwd = process.cwd(),
  generatedAt = new Date().toISOString(),
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
} = {}) {
  const releaseEnvironment = environment.RELEASE_ENVIRONMENT?.trim().toLowerCase();
  const commit = environment.RELEASE_COMMIT?.trim();
  const runId = environment.RELEASE_RUN_ID?.trim();

  if (!releaseEnvironment || !SAFE_ENVIRONMENT.test(releaseEnvironment)) {
    throw new Error('RELEASE_ENVIRONMENT must be qa or production.');
  }
  if (!commit || !SAFE_COMMIT.test(commit)) {
    throw new Error('RELEASE_COMMIT must be a 7-64 character hexadecimal Git commit.');
  }
  if (runId && !SAFE_RUN_ID.test(runId)) {
    throw new Error('RELEASE_RUN_ID must contain only digits.');
  }

  const metadata = {
    schemaVersion: 1,
    environment: releaseEnvironment,
    commit,
    ...(runId ? { runId } : {}),
    generatedAt,
  };
  const directory = path.resolve(cwd, outputDirectory);
  const outputPath = path.join(directory, 'release.json');
  await mkdir(directory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return { metadata, outputPath };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  writeReleaseMetadata()
    .then(({ outputPath, metadata }) => {
      console.log(`Wrote ${metadata.environment} release metadata to ${outputPath}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
