import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { QA_ACCOUNTS, QA_WORKSPACE_ID } from './qa-data.mjs';

const password = process.env.QA_FIREBASE_PASSWORD;
if (!password) {
  throw new Error('Set QA_FIREBASE_PASSWORD before running npm run qa:regression.');
}

const rootDir = process.cwd();
const reportPath = path.join(rootDir, 'QA_FIREBASE_REGRESSION_REPORT.md');
const port = Number(process.env.QA_APP_PORT ?? 4314);
const cdpPort = Number(process.env.QA_CDP_PORT ?? 9224);
const configuredBaseUrl = process.env.QA_BASE_URL?.trim();
const baseUrl = configuredBaseUrl
  ? configuredBaseUrl.replace(/\/+$/, '')
  : `http://127.0.0.1:${port}`;
const usesDeployedApp = Boolean(configuredBaseUrl);
const releaseCommit = process.env.RELEASE_COMMIT?.trim();
const today = new Date();
const reviewMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const npmCliPath = process.env.npm_execpath;
const npmCommand = npmCliPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmPrefixArgs = npmCliPath ? [npmCliPath] : [];
const npmNeedsShell = process.platform === 'win32' && !npmCliPath;
const axeSource = readFileSync(
  path.join(rootDir, 'node_modules', 'axe-core', 'axe.min.js'),
  'utf8',
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const report = {
  generatedAt: new Date().toISOString(),
  preflight: [],
  coverage: [],
  issues: [],
  consoleErrors: [],
  evidence: [],
};

function addCoverage(area, scenario, result, notes = '', account = '') {
  report.coverage.push({ area, scenario, result, notes, account });
}

function addIssue(severity, area, scenario, steps, expected, actual, evidence = '') {
  report.issues.push({ severity, area, scenario, steps, expected, actual, evidence });
}

function tail(text, max = 3200) {
  const normalized = text.replace(/\u001b\[[0-9;]*m/g, '');
  return normalized.length > max ? normalized.slice(-max) : normalized;
}

function runCommand(label, command, args) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
    shell: npmNeedsShell,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`;
  const entry = {
    label,
    command: [command, ...args].join(' '),
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    output: tail(output),
  };
  report.preflight.push(entry);
  addCoverage(
    'Pre-flight',
    label,
    entry.exitCode === 0 ? 'Pass' : 'Fail',
    `Exit ${entry.exitCode}; ${Math.round(entry.durationMs / 1000)}s`,
  );
  if (entry.exitCode !== 0) {
    addIssue(
      'High',
      'Pre-flight',
      label,
      `Run ${entry.command}`,
      'Command exits successfully.',
      `Exit ${entry.exitCode}`,
      entry.output,
    );
  }
  return entry;
}

async function checkReleaseCorrelation() {
  if (!usesDeployedApp || !releaseCommit) {
    return;
  }

  const response = await fetch(`${baseUrl}/release.json`, {
    cache: 'no-store',
    redirect: 'follow',
  });
  const contentType = response.headers.get('content-type') ?? '';
  const metadata = contentType.includes('application/json') ? await response.json() : null;
  const matches =
    response.ok &&
    metadata?.schemaVersion === 1 &&
    metadata?.environment === 'qa' &&
    metadata?.commit === releaseCommit;
  addCoverage(
    'Release correlation',
    'Deployed release metadata matches the workflow commit',
    matches ? 'Pass' : 'Fail',
    matches
      ? `Commit ${releaseCommit} is observable.`
      : `Expected commit ${releaseCommit}; received ${metadata?.commit ?? 'no JSON metadata'}.`,
  );
  if (!matches) {
    addIssue(
      'Critical',
      'Release correlation',
      'Deployed release metadata matches the workflow commit',
      'Fetch /release.json from the deployed QA origin.',
      `The response identifies QA commit ${releaseCommit}.`,
      `HTTP ${response.status}; commit ${metadata?.commit ?? 'unavailable'}.`,
    );
  }
}

function chromePath() {
  const candidates =
    process.platform === 'win32'
      ? [
          process.env.CHROME_BIN,
          path.join(
            process.env.ProgramFiles ?? '',
            'Google',
            'Chrome',
            'Application',
            'chrome.exe',
          ),
          path.join(
            process.env['ProgramFiles(x86)'] ?? '',
            'Google',
            'Chrome',
            'Application',
            'chrome.exe',
          ),
          path.join(
            process.env.ProgramFiles ?? '',
            'Microsoft',
            'Edge',
            'Application',
            'msedge.exe',
          ),
          path.join(
            process.env['ProgramFiles(x86)'] ?? '',
            'Microsoft',
            'Edge',
            'Application',
            'msedge.exe',
          ),
        ]
      : [
          process.env.CHROME_BIN,
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];

  const executable = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!executable) {
    throw new Error(
      'Unable to locate Chrome or Chromium. Set CHROME_BIN to the browser executable path.',
    );
  }
  return executable;
}

async function waitForHttp(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function startServer() {
  const child = spawn(
    npmCommand,
    [...npmPrefixArgs, 'run', 'start:qa', '--', '--port', String(port), '--host', '127.0.0.1'],
    {
      cwd: rootDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: npmNeedsShell,
    },
  );
  let log = '';
  child.stdout.on('data', (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });
  return { child, getLog: () => tail(log, 5000) };
}

async function startChrome() {
  const profileDir = path.join(os.tmpdir(), `budget-battowski-regression-${Date.now()}`);
  await mkdir(profileDir, { recursive: true });
  const child = spawn(
    chromePath(),
    [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--remote-allow-origins=*',
      '--disable-gpu',
      '--window-size=1365,900',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    { stdio: 'ignore', shell: false },
  );
  await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`, 30000);
  return child;
}

function killProcessTree(child) {
  if (!child?.pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      encoding: 'utf8',
      shell: false,
    });
    return;
  }

  child.kill();
}

async function cdpNewPage(url) {
  const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  }).then((response) => response.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const callbacks = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && callbacks.has(message.id)) {
      const { resolve, reject } = callbacks.get(message.id);
      callbacks.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.message}: ${message.error.data ?? ''}`));
      } else {
        resolve(message.result);
      }
      return;
    }

    if (message.method && listeners.has(message.method)) {
      for (const listener of listeners.get(message.method)) {
        listener(message.params);
      }
    }
  });

  const page = {
    ws,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const callId = ++id;
        callbacks.set(callId, { resolve, reject });
        ws.send(JSON.stringify({ id: callId, method, params }));
      });
    },
    once(method) {
      return new Promise((resolve) => {
        const listener = (params) => {
          listeners.set(
            method,
            (listeners.get(method) ?? []).filter((item) => item !== listener),
          );
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), listener]);
      });
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    },
  };

  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  page.on('Runtime.exceptionThrown', (params) => {
    report.consoleErrors.push({
      source: 'Runtime.exceptionThrown',
      message: params.exceptionDetails?.text ?? 'Runtime exception',
    });
  });
  page.on('Log.entryAdded', (params) => {
    const entry = params.entry;
    if (entry?.level === 'error') {
      report.consoleErrors.push({ source: 'Log.entryAdded', message: entry.text });
    }
  });
  return page;
}

async function evaluate(page, expression, timeout = 10000) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function navigate(page, url) {
  const loaded = page.once('Page.loadEventFired');
  await page.send('Page.navigate', { url });
  await loaded;
  await delay(900);
}

async function waitFor(page, expression, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await evaluate(page, expression, 5000).catch((error) => error.message);
    if (lastValue === true) {
      return;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for expression: ${expression}. Last value: ${lastValue}`);
}

async function setViewport(page, viewport) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
}

async function login(page, email) {
  await navigate(page, baseUrl);
  await waitFor(page, `Boolean(document.querySelector('.qa-login-form'))`);
  await evaluate(
    page,
    `(async () => {
      const app = globalThis.ng.getComponent(document.querySelector('app-root'));
      app.qaLoginForm.setValue({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} });
      globalThis.ng.applyChanges(app);
      await app.loginWithPassword();
      return true;
    })()`,
    30000,
  );
  try {
    await waitFor(
      page,
      `(() => {
        const shell = globalThis.ng?.getComponent?.(document.querySelector('app-root'));
        const app = shell?.budget?.store ?? shell;
        return app?.userEmail?.() === ${JSON.stringify(email)}
          && app?.workspaces?.().some((workspace) => workspace.id === ${JSON.stringify(QA_WORKSPACE_ID)});
      })()`,
      45000,
    );
  } catch (error) {
    const authState = await evaluate(
      page,
      `(() => {
        const shell = globalThis.ng?.getComponent?.(document.querySelector('app-root'));
        const app = shell?.budget?.store ?? shell;
        return {
          userEmail: app?.userEmail?.() ?? null,
          workspaceIds: app?.workspaces?.().map((workspace) => workspace.id) ?? [],
          syncError: app?.syncError?.() ?? null,
          syncStatus: app?.syncStatus?.() ?? null,
        };
      })()`,
    ).catch(() => null);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message} Auth state: ${JSON.stringify(authState)}`);
  }
  await ensureQaWorkspace(page);
}

async function ensureQaWorkspace(page) {
  await waitFor(
    page,
    `(() => {
      const shell = globalThis.ng?.getComponent?.(document.querySelector('app-root'));
      const app = shell?.budget?.store ?? shell;
      return app?.userEmail?.()
        && app?.workspaces?.().some((workspace) => workspace.id === ${JSON.stringify(QA_WORKSPACE_ID)});
    })()`,
    45000,
  );
  await evaluate(
    page,
    `(async () => {
      const shell = globalThis.ng.getComponent(document.querySelector('app-root'));
      const app = shell?.budget?.store ?? shell;
      await app.selectWorkspace(${JSON.stringify(QA_WORKSPACE_ID)});
      return true;
    })()`,
    30000,
  );
  await waitFor(
    page,
    `(() => {
      const shell = globalThis.ng?.getComponent?.(document.querySelector('app-root'));
      const app = shell?.budget?.store ?? shell;
      return app?.workspaceId?.() === ${JSON.stringify(QA_WORKSPACE_ID)}
        && !app?.showPageSkeleton?.()
        && app?.categories?.().length >= 8
        && app?.paymentModes?.().length >= 7;
    })()`,
    45000,
  );
}

async function logout(page) {
  await evaluate(
    page,
    `(async () => {
      const shell = globalThis.ng?.getComponent?.(document.querySelector('app-root'));
      const app = shell?.budget?.store ?? shell;
      if (app?.userEmail?.()) {
        await app.logout();
      }
      return true;
    })()`,
    30000,
  ).catch(() => undefined);
  await delay(1200);
}

async function runAxe(page, route, viewportName) {
  await navigate(page, `${baseUrl}${route.path}`);
  await ensureQaWorkspace(page);
  await waitFor(page, `document.body.textContent.includes(${JSON.stringify(route.text)})`);
  await evaluate(page, `${axeSource}\ntrue;`, 10000);
  const violations = await evaluate(
    page,
    `(async () => {
      const result = await axe.run(document, {
        resultTypes: ['violations'],
        rules: { 'color-contrast': { enabled: true } },
      });
      return result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.slice(0, 3).map((node) => ({
          target: node.target.join(' '),
          failureSummary: node.failureSummary,
        })),
      }));
    })()`,
    25000,
  );
  addCoverage(
    'Accessibility and route smoke',
    `${viewportName} ${route.path}`,
    violations.length ? 'Fail' : 'Pass',
    violations.length ? `${violations.length} AXE violation(s)` : `Rendered ${route.text}`,
    QA_ACCOUNTS.owner,
  );
  for (const violation of violations) {
    addIssue(
      violation.impact === 'critical' ? 'Critical' : 'High',
      'Accessibility',
      `${viewportName} ${route.path}: ${violation.id}`,
      `Open ${route.path} at ${viewportName} viewport and run AXE.`,
      violation.help,
      violation.nodes.map((node) => `${node.target}: ${node.failureSummary}`).join('\n'),
    );
  }
}

async function runOwnerBehaviorChecks(page) {
  const result = await evaluate(
    page,
    `(async () => {
      const shell = globalThis.ng.getComponent(document.querySelector('app-root'));
      const app = shell?.budget?.store ?? shell;
      const out = [];
      const add = (scenario, ok, notes = '') => out.push({ scenario, ok, notes });
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const repo = app.repository?.();
      const runWrite = async (collectionName, signalName, record) => {
        await app.runFirebaseWrite(
          async () => repo.upsert(collectionName, record),
          () => app[signalName].update((items) => [...items.filter((item) => item.id !== record.id), record]),
        );
      };
      const runDelete = async (collectionName, signalName, recordId) => {
        await app.runFirebaseWrite(
          async () => repo.delete(collectionName, recordId),
          () => app[signalName].update((items) => items.filter((item) => item.id !== recordId)),
        );
      };

      try {
        app.setSelectedMonth('2026-06');
        app.setSelectedMember('ALL');
        await wait(600);
        add('Owner can manage workspace', app.canManageWorkspace() === true, String(app.canManageWorkspace()));
        add('Seeded collections loaded', app.categories().length >= 8 && app.expenses().length >= 5 && app.loanAccounts().length >= 3, JSON.stringify({
          categories: app.categories().length,
          expenses: app.expenses().length,
          loanAccounts: app.loanAccounts().length,
        }));
        add('Dashboard totals populated', app.monthlyIncome() > 0 && app.outflowTotal() > 0 && app.debtEmiTotal() > 0, JSON.stringify({
          income: app.monthlyIncome(),
          outflow: app.outflowTotal(),
          debtEmi: app.debtEmiTotal(),
        }));
        add('Member filter changes selected state', (() => {
          app.setSelectedMember('qa.editor@budget.test');
          const editorOutflow = app.outflowTotal();
          app.setSelectedMember('ALL');
          return editorOutflow > 0 && editorOutflow < app.outflowTotal();
        })(), 'Editor member outflow compared with all-member outflow.');

        const archivedMode = await app.archivePaymentMode('pm-archive-target');
        add('Archive payment mode', archivedMode && app.archivedPaymentModes().some((mode) => mode.id === 'pm-archive-target'));
        const restoredMode = await app.restorePaymentMode('pm-archive-target');
        add('Restore payment mode', restoredMode && app.activePaymentModes().some((mode) => mode.id === 'pm-archive-target'));
        const restrictedAccount = await app.archivePaymentAccount('acct-hdfc');
        add('Mapped account archive is blocked', restrictedAccount === false, app.syncStatus());
        const restoredAccount = await app.restorePaymentAccount('acct-archived');
        add('Restore archived payment account', restoredAccount && app.activePaymentAccounts().some((account) => account.id === 'acct-archived'));

        app.setSelectedMonth(${JSON.stringify(reviewMonth)});
        await wait(600);
        const reviewRows = app.monthlyReviewRows();
        add('Monthly review has pending rows', reviewRows.length >= 4, String(reviewRows.length));
        if (reviewRows.length < 2) {
          throw new Error(
            'Monthly review returned fewer than two pending rows for ${reviewMonth}.',
          );
        }
        const selectedReviewRows = reviewRows.slice(0, 4).map((row, index) => ({
          ...row,
          amount: index === 0 ? row.amount + 111 : row.amount,
          amountModified: index === 0,
          pendingDelete: index === 1,
        }));
        await app.applyMonthlyReview({ rows: selectedReviewRows });
        await wait(1800);
        const approvedRow = selectedReviewRows[0];
        const skippedRow = selectedReviewRows[1];
        const approved = approvedRow?.sourceType === 'expense'
          ? app.expenses().some((expense) => expense.templateId === approvedRow.sourceId && expense.month === ${JSON.stringify(reviewMonth)} && expense.amount === approvedRow.amount)
          : app.investments().some((investment) => investment.sourceInvestmentId === approvedRow.sourceId && investment.amount === approvedRow.amount);
        const skipped = skippedRow?.sourceType === 'expense'
          ? app.templates().some((template) => template.id === skippedRow.sourceId && template.skippedMonths?.includes(${JSON.stringify(reviewMonth)}))
          : app.investments().some((investment) => investment.id === skippedRow.sourceId && investment.skippedMonths?.includes(${JSON.stringify(reviewMonth)}));
        add('Monthly review approve row', Boolean(approved), approvedRow ? JSON.stringify(approvedRow) : 'No approved row selected');
        add('Monthly review delete/skip row', Boolean(skipped), skippedRow ? JSON.stringify(skippedRow) : 'No skipped row selected');

        const mayCountBefore = app.expenses().filter((expense) => expense.month === '2026-05').length;
        app.setSelectedMonth('2026-05');
        await wait(2500);
        const mayExpenses = app.expenses().filter((expense) => expense.month === '2026-05');
        add('Past month recurring/EMI prefill', mayExpenses.length > mayCountBefore && mayExpenses.some((expense) => expense.templateId === 'loan:loan-personal'), JSON.stringify({
          before: mayCountBefore,
          after: mayExpenses.length,
          templateIds: mayExpenses.map((expense) => expense.templateId).filter(Boolean),
        }));

        const expense = {
          id: 'qa-runtime-expense',
          month: '2026-06',
          date: '2026-06-22',
          name: 'Runtime QA Expense',
          categoryId: 'cat-groceries',
          amount: 3210,
          type: 'one-time',
          note: 'Created by regression',
          memberEmail: 'qa.owner@budget.test',
          paymentModeId: 'pm-upi-gpay',
        };
        await runWrite('expenses', 'expenses', expense);
        add('Create one-time expense', app.expenses().some((item) => item.id === expense.id));
        await runWrite('expenses', 'expenses', { ...expense, amount: 4321, note: 'Updated by regression' });
        add('Update one-time expense', app.expenses().some((item) => item.id === expense.id && item.amount === 4321));
        await runDelete('expenses', 'expenses', expense.id);
        add('Delete one-time expense', !app.expenses().some((item) => item.id === expense.id));

        const investment = {
          id: 'qa-runtime-investment',
          name: 'Runtime QA Investment',
          amount: 9876,
          categoryId: 'cat-investments',
          frequency: 'one-time',
          date: '2026-06-23',
          notes: 'Created by regression',
          memberEmail: 'qa.owner@budget.test',
          paymentModeId: 'pm-upi-gpay',
        };
        await runWrite('investments', 'investments', investment);
        add('Create one-time investment', app.investments().some((item) => item.id === investment.id));
        await runWrite('investments', 'investments', { ...investment, amount: 10001 });
        add('Update investment', app.investments().some((item) => item.id === investment.id && item.amount === 10001));
        await runDelete('investments', 'investments', investment.id);
        add('Delete investment', !app.investments().some((item) => item.id === investment.id));

        const loanAccount = {
          id: 'qa-runtime-loan',
          schemaVersion: 2,
          lender: 'Runtime QA Lender',
          loanType: 'Test',
          contract: {
            sanctionedAmount: 100000,
            disbursedAmount: 100000,
            disbursementDate: '2026-06-01',
            firstEmiDate: '2026-06-10',
            originalTenureMonths: 9,
            contractualMaturityDate: '2027-02-10',
            initialEmi: 10000,
            initialAnnualRate: 10.5,
            interestType: 'fixed',
            interestCalculationMethod: 'monthly-reducing',
            dayCountConvention: 'actual-365',
            compoundingFrequency: 'monthly',
            postPrepaymentStrategy: 'keep-emi-reduce-tenure',
            roundingPolicy: {
              monetaryScale: 2,
              interestRounding: 'half-up',
              installmentRounding: 'half-up',
              finalInstallmentAdjustment: true,
            },
          },
          notes: 'Created by regression',
          memberEmail: 'qa.owner@budget.test',
          paymentModeId: 'pm-upi-gpay',
        };
        await runWrite('loanAccounts', 'loanAccounts', loanAccount);
        add('Create loan', app.loanAccounts().some((item) => item.id === loanAccount.id));
        await runWrite('loanAccounts', 'loanAccounts', { ...loanAccount, notes: 'Updated by regression' });
        add('Update loan', app.loanAccounts().some((item) => item.id === loanAccount.id && item.notes === 'Updated by regression'));
        await runDelete('loanAccounts', 'loanAccounts', loanAccount.id);
        add('Delete loan', !app.loanAccounts().some((item) => item.id === loanAccount.id));
      } catch (error) {
        add('Owner behavior check execution', false, error instanceof Error ? error.stack ?? error.message : String(error));
      }

      return out;
    })()`,
    90000,
  );

  for (const item of result) {
    addCoverage(
      'Functional regression',
      item.scenario,
      item.ok ? 'Pass' : 'Fail',
      item.notes,
      QA_ACCOUNTS.owner,
    );
    if (!item.ok) {
      addIssue(
        'High',
        'Functional regression',
        item.scenario,
        `Log in as ${QA_ACCOUNTS.owner} and execute the seeded QA behavior check.`,
        'Scenario passes against the seeded QA workspace.',
        item.notes || 'Scenario returned false.',
      );
    }
  }
}

async function runRoleChecks(page, email) {
  const result = await evaluate(
    page,
    `(async () => {
      const shell = globalThis.ng.getComponent(document.querySelector('app-root'));
      const app = shell?.budget?.store ?? shell;
      const out = [];
      const add = (scenario, ok, notes = '') => out.push({ scenario, ok, notes });
      const repo = app.repository?.();
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      try {
        await app.selectWorkspace(${JSON.stringify(QA_WORKSPACE_ID)});
        await wait(800);
        const isOwner = app.userEmail() === 'qa.owner@budget.test';
        add('Workspace member can load QA workspace', app.workspaceId() === ${JSON.stringify(QA_WORKSPACE_ID)} && app.categories().length >= 8, JSON.stringify({
          email: app.userEmail(),
          workspaceId: app.workspaceId(),
          categories: app.categories().length,
        }));
        add('Workspace management permission is owner-only', app.canManageWorkspace() === isOwner, String(app.canManageWorkspace()));
        const record = {
          id: 'qa-role-write-' + app.userEmail().split('@')[0].replace(/\\W/g, '-'),
          month: '2026-06',
          date: '2026-06-24',
          name: 'Role Write Check',
          categoryId: 'cat-utilities',
          amount: 123,
          type: 'one-time',
          note: 'Role write check',
          memberEmail: app.userEmail(),
          paymentModeId: app.userEmail() === 'qa.editor@budget.test'
            ? 'pm-card-rupay'
            : app.userEmail() === 'qa.member@budget.test'
              ? 'pm-wallet-paytm'
              : 'pm-upi-gpay',
        };
        await app.runFirebaseWrite(
          async () => repo.upsert('expenses', record),
          () => app.expenses.update((items) => [...items.filter((item) => item.id !== record.id), record]),
        );
        const created = app.expenses().some((item) => item.id === record.id);
        await app.runFirebaseWrite(
          async () => repo.delete('expenses', record.id),
          () => app.expenses.update((items) => items.filter((item) => item.id !== record.id)),
        );
        add('Workspace member can write subcollection records', created && !app.expenses().some((item) => item.id === record.id), app.userEmail());
      } catch (error) {
        add('Role check execution', false, error instanceof Error ? error.stack ?? error.message : String(error));
      }
      return out;
    })()`,
    60000,
  );

  for (const item of result) {
    addCoverage(
      'Role and permission regression',
      item.scenario,
      item.ok ? 'Pass' : 'Fail',
      item.notes,
      email,
    );
    if (!item.ok) {
      addIssue(
        'High',
        'Role and permission regression',
        `${email}: ${item.scenario}`,
        `Log in as ${email} and use the seeded QA workspace.`,
        'Role behavior matches workspace membership rules.',
        item.notes || 'Scenario returned false.',
      );
    }
  }
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

async function writeReport() {
  const passed = report.coverage.filter((item) => item.result === 'Pass').length;
  const failedCoverage = report.coverage.filter((item) => item.result === 'Fail').length;
  const failed = failedCoverage > 0 || report.issues.length > 0;
  const lines = [
    '# QA Firebase Regression Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Target: ${baseUrl}`,
    `Workspace: ${QA_WORKSPACE_ID}`,
    `Result: ${
      failed
        ? `Fail (${passed} passed, ${failedCoverage} coverage failed, ${report.issues.length} issue(s))`
        : `Pass (${passed} passed, 0 failed)`
    }`,
    '',
    '## Automated Checks',
    markdownTable(
      ['Check', 'Command', 'Exit', 'Duration', 'Output Tail'],
      report.preflight.map((item) => [
        item.label,
        item.command,
        item.exitCode,
        `${Math.round(item.durationMs / 1000)}s`,
        item.output,
      ]),
    ),
    '',
    '## Coverage',
    markdownTable(
      ['Area', 'Account', 'Scenario', 'Result', 'Notes'],
      report.coverage.map((item) => [
        item.area,
        item.account,
        item.scenario,
        item.result,
        item.notes,
      ]),
    ),
    '',
    '## Issues',
    report.issues.length
      ? markdownTable(
          ['Severity', 'Area', 'Scenario', 'Steps', 'Expected', 'Actual', 'Evidence'],
          report.issues.map((item) => [
            item.severity,
            item.area,
            item.scenario,
            item.steps,
            item.expected,
            item.actual,
            item.evidence,
          ]),
        )
      : 'No blocking issues observed in the automated QA Firebase regression run.',
    '',
    '## Console Errors',
    report.consoleErrors.length
      ? markdownTable(
          ['Source', 'Message'],
          report.consoleErrors.map((item) => [item.source, item.message]),
        )
      : 'No browser console errors captured by the CDP runner.',
    '',
    '## Residual Risk',
    '- Bulk-editor form typing was not exhaustively driven field-by-field; create/update/delete coverage was exercised through the authenticated app store and Firestore listener path.',
    '- Import/export was covered by route/control smoke and existing unit coverage, not by uploading a binary file in this browser run.',
    '- The final QA workspace is intentionally left in its post-regression mutated state for debugging; rerun `npm run qa:seed` to reset it.',
    '',
  ];

  await writeFile(reportPath, lines.join('\n'), 'utf8');
}

async function main() {
  runCommand('Unit suite', npmCommand, [...npmPrefixArgs, 'test', '--', '--watch=false']);
  runCommand('QA build', npmCommand, [...npmPrefixArgs, 'run', 'build:qa']);

  let server;
  let chrome;
  let page;
  try {
    if (!usesDeployedApp) {
      server = startServer();
    }
    await waitForHttp(baseUrl, 120000);
    await checkReleaseCorrelation();
    chrome = await startChrome();
    page = await cdpNewPage(baseUrl);

    await login(page, QA_ACCOUNTS.owner);
    addCoverage(
      'Auth/workspace',
      'Owner password login',
      'Pass',
      'QA login form authenticated and loaded workspace.',
      QA_ACCOUNTS.owner,
    );

    const routes = [
      { path: '/dashboard', text: 'Dashboard' },
      { path: '/expenses', text: 'Monthly Expenses' },
      { path: '/planning', text: 'Planning' },
      { path: '/investments', text: 'Investments' },
      { path: '/loans', text: 'Loans' },
      { path: '/categories', text: 'Categories' },
      { path: '/payment-modes', text: 'Payment Modes' },
      { path: '/import-export', text: 'Import' },
      { path: '/workspace', text: 'Workspace' },
      { path: '/settings', text: 'Settings' },
    ];
    for (const viewport of [
      { name: 'desktop', width: 1365, height: 900, mobile: false },
      { name: 'mobile', width: 390, height: 844, mobile: true },
    ]) {
      await setViewport(page, viewport);
      for (const route of routes) {
        await runAxe(page, route, viewport.name);
      }
    }

    await runOwnerBehaviorChecks(page);
    await logout(page);

    for (const email of [QA_ACCOUNTS.editor, QA_ACCOUNTS.member]) {
      await login(page, email);
      addCoverage(
        'Auth/workspace',
        `${email} password login`,
        'Pass',
        'QA login form authenticated and loaded workspace.',
        email,
      );
      await runRoleChecks(page, email);
      await logout(page);
    }
  } catch (error) {
    addIssue(
      'Critical',
      'Runner',
      'QA Firebase regression execution',
      'Run npm run qa:regression with QA_FIREBASE_PASSWORD set.',
      'Runner completes all automated scenarios.',
      error instanceof Error ? (error.stack ?? error.message) : String(error),
      server?.getLog?.() ?? '',
    );
  } finally {
    page?.ws?.close();
    killProcessTree(chrome);
    killProcessTree(server?.child);
    await writeReport();
  }

  console.log(`QA regression report: ${reportPath}`);
  console.log(`QA regression result: ${report.issues.length ? 'FAILED' : 'PASSED'}`);
  if (report.issues.length) {
    process.exitCode = 1;
  }
}

main();
