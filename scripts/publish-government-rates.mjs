import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import ts from 'typescript';

const require = createRequire(import.meta.url);
const firebaseCliAuth = require('firebase-tools/lib/auth');
const { CLOUD_PLATFORM } = require('firebase-tools/lib/scopes');

const QA_PROJECT_ID = 'budget-battowski-qa';
const CONFIGURATION_COLLECTION = 'investmentConfiguration';
const GOVERNMENT_RATES_DOCUMENT = 'governmentSavingsRates';
const projectId = process.argv[2]?.trim();

if (projectId !== QA_PROJECT_ID) {
  throw new Error(`This publisher only permits the QA project: ${QA_PROJECT_ID}.`);
}

async function loadBundledRates() {
  const sourcePath = path.join(
    process.cwd(),
    'src',
    'app',
    'domain',
    'investments',
    'government-interest-rates.ts',
  );
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    throw new Error(`Unable to load bundled rates: ${errors.map(({ code }) => code).join(', ')}`);
  }

  const encodedSource = Buffer.from(transpiled.outputText).toString('base64');
  const module = await import(`data:text/javascript;base64,${encodedSource}`);
  if (
    !Array.isArray(module.GOVERNMENT_INTEREST_RATES) ||
    !module.GOVERNMENT_INTEREST_RATES.length
  ) {
    throw new Error('The bundled government interest-rate table is empty or unavailable.');
  }
  return module.GOVERNMENT_INTEREST_RATES;
}

const account = firebaseCliAuth.getProjectDefaultAccount(process.cwd());
if (!account?.tokens?.refresh_token) {
  throw new Error('No Firebase CLI session found. Run `npx firebase-tools login` first.');
}

function firestoreValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, firestoreValue(item)]),
        ),
      },
    };
  }
  throw new Error(`Unsupported Firestore value: ${String(value)}`);
}

const rates = await loadBundledRates();
const updatedAt = new Date().toISOString();
const payload = { schemaVersion: 1, updatedAt, rates };
const document = {
  fields: Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, firestoreValue(value)]),
  ),
};
const token = await firebaseCliAuth.getAccessToken(account.tokens.refresh_token, [CLOUD_PLATFORM]);
const documentPath = `${CONFIGURATION_COLLECTION}/${GOVERNMENT_RATES_DOCUMENT}`;
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
const headers = {
  Authorization: `Bearer ${token.access_token}`,
  'Content-Type': 'application/json',
};
const writeResponse = await fetch(url, {
  method: 'PATCH',
  headers,
  body: JSON.stringify(document),
});
if (!writeResponse.ok) {
  throw new Error(`Firestore publish failed with HTTP ${writeResponse.status}.`);
}

const readResponse = await fetch(url, { headers });
if (!readResponse.ok) {
  throw new Error(`Firestore read-back failed with HTTP ${readResponse.status}.`);
}
const persisted = await readResponse.json();
if (!isDeepStrictEqual(persisted.fields, document.fields)) {
  throw new Error('Firestore read-back did not match the published rate configuration.');
}

console.log(
  JSON.stringify(
    {
      projectId,
      documentPath,
      schemaVersion: payload.schemaVersion,
      updatedAt,
      ratePeriods: rates.length,
      schemes: [...new Set(rates.map(({ scheme }) => scheme))],
    },
    null,
    2,
  ),
);
