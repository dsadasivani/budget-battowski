import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const configuredBaseUrl = process.env.PRODUCTION_BASE_URL?.trim();
const baseUrl = (configuredBaseUrl || 'https://budget-battowski.web.app').replace(/\/+$/, '');
const targetOrigin = new URL(baseUrl).origin;
const cdpPort = Number(process.env.PRODUCTION_CDP_PORT ?? 9225);
const releaseCommit = process.env.RELEASE_COMMIT?.trim() || process.env.GITHUB_SHA || 'local';
const reportPath = path.join(rootDir, 'PRODUCTION_SMOKE_REPORT.md');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const report = {
  generatedAt: new Date().toISOString(),
  coverage: [],
  issues: [],
  consoleErrors: [],
};

function addCoverage(area, scenario, result, notes = '') {
  report.coverage.push({ area, scenario, result, notes });
}

function addIssue(severity, area, scenario, expected, actual) {
  report.issues.push({ severity, area, scenario, expected, actual });
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

async function waitForHttp(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.ok) {
        return response;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function checkHostingAssets() {
  const response = await waitForHttp(baseUrl, 90000);
  const html = await response.text();
  const isHtml = response.headers.get('content-type')?.includes('text/html') ?? false;
  const shellFound = html.includes('<app-root');
  const rootPassed = response.ok && isHtml && shellFound;
  addCoverage(
    'Hosting',
    'Root document is available',
    rootPassed ? 'Pass' : 'Fail',
    `HTTP ${response.status}; HTML ${isHtml}; app root ${shellFound}`,
  );
  if (!rootPassed) {
    addIssue(
      'Critical',
      'Hosting',
      'Root document is available',
      'The production URL returns the Angular HTML shell.',
      `HTTP ${response.status}; content-type ${response.headers.get('content-type')}; app root ${shellFound}`,
    );
    return;
  }

  const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(
    (match) => new URL(match[1], baseUrl).href,
  );
  const sameOriginAssets = [...new Set(assets)].filter(
    (assetUrl) => new URL(assetUrl).origin === targetOrigin,
  );
  const results = await Promise.all(
    sameOriginAssets.map(async (assetUrl) => {
      try {
        const assetResponse = await fetch(assetUrl, { redirect: 'follow' });
        return { assetUrl, status: assetResponse.status, ok: assetResponse.ok };
      } catch (error) {
        return {
          assetUrl,
          status: 0,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  const failedAssets = results.filter((result) => !result.ok);
  const assetsPassed = sameOriginAssets.length > 0 && failedAssets.length === 0;
  addCoverage(
    'Hosting',
    'Hashed application assets are available',
    assetsPassed ? 'Pass' : 'Fail',
    `${results.length - failedAssets.length}/${sameOriginAssets.length} assets returned successfully`,
  );
  for (const failure of failedAssets) {
    addIssue(
      'Critical',
      'Hosting',
      'Hashed application asset is available',
      `${failure.assetUrl} returns successfully.`,
      failure.error || `HTTP ${failure.status}`,
    );
  }
}

async function checkReleaseCorrelation() {
  if (releaseCommit === 'local') {
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/release.json`, {
      cache: 'no-store',
      redirect: 'follow',
    });
    const contentType = response.headers.get('content-type') ?? '';
    const metadata = contentType.includes('application/json') ? await response.json() : null;
    const matches =
      response.ok &&
      metadata?.schemaVersion === 1 &&
      metadata?.environment === 'production' &&
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
        `release.json identifies production commit ${releaseCommit}.`,
        `HTTP ${response.status}; commit ${metadata?.commit ?? 'unavailable'}.`,
      );
    }
  } catch (error) {
    addIssue(
      'Critical',
      'Release correlation',
      'Deployed release metadata is readable',
      `release.json identifies production commit ${releaseCommit}.`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function startChrome() {
  const profileDir = path.join(os.tmpdir(), `budget-battowski-production-smoke-${Date.now()}`);
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
  page.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      report.consoleErrors.push({
        source: 'Runtime.consoleAPICalled',
        message: params.args?.map((argument) => argument.value ?? argument.description).join(' '),
      });
    }
  });
  page.on('Log.entryAdded', (params) => {
    if (params.entry?.level === 'error') {
      report.consoleErrors.push({ source: 'Log.entryAdded', message: params.entry.text });
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

async function verifySignedOutRoute(page, route) {
  await navigate(page, `${baseUrl}${route}`);
  await waitFor(
    page,
    `Boolean(document.querySelector('.login-shell')) && !document.querySelector('.global-loader-shell')`,
    45000,
  );
  const state = await evaluate(
    page,
    `({
      title: document.title,
      pathname: location.pathname,
      loginTitle: document.querySelector('#login-title')?.textContent?.trim() ?? '',
      googleLoginAvailable: Boolean(document.querySelector('.google-login:not([disabled])')),
      status: document.querySelector('.login-auth-dock p')?.textContent?.trim() ?? ''
    })`,
  );
  const passed =
    state.title === 'Budget Battowski' &&
    state.pathname === route &&
    state.loginTitle === 'Open your budget workspace' &&
    state.googleLoginAvailable &&
    state.status.includes('Secure sign in keeps household finance data private.');
  addCoverage(
    'Browser',
    `Signed-out application shell at ${route}`,
    passed ? 'Pass' : 'Fail',
    JSON.stringify(state),
  );
  if (!passed) {
    addIssue(
      'Critical',
      'Browser',
      `Signed-out application shell at ${route}`,
      'Authentication initializes, the loader clears, and Google sign-in is available without a sync error.',
      JSON.stringify(state),
    );
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
    '# Production Smoke Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Target: ${baseUrl}`,
    `Release commit: ${releaseCommit}`,
    `Result: ${
      failed
        ? `Fail (${passed} passed, ${failedCoverage} coverage failed, ${report.issues.length} issue(s))`
        : `Pass (${passed} passed, 0 failed)`
    }`,
    '',
    '## Coverage',
    markdownTable(
      ['Area', 'Scenario', 'Result', 'Notes'],
      report.coverage.map((item) => [item.area, item.scenario, item.result, item.notes]),
    ),
    '',
    '## Issues',
    report.issues.length
      ? markdownTable(
          ['Severity', 'Area', 'Scenario', 'Expected', 'Actual'],
          report.issues.map((item) => [
            item.severity,
            item.area,
            item.scenario,
            item.expected,
            item.actual,
          ]),
        )
      : 'No blocking issues observed in the non-destructive production smoke run.',
    '',
    '## Console Errors',
    report.consoleErrors.length
      ? markdownTable(
          ['Source', 'Message'],
          report.consoleErrors.map((item) => [item.source, item.message]),
        )
      : 'No browser console errors captured by the CDP runner.',
    '',
    '## Scope',
    '- This smoke is anonymous and read-only. It does not create, update, or delete production data.',
    '- Authenticated workspace discovery and financial CRUD remain covered by the credentialed QA regression.',
    '',
  ];
  await writeFile(reportPath, lines.join('\n'), 'utf8');
}

async function main() {
  let chrome;
  let page;
  try {
    await checkHostingAssets();
    await checkReleaseCorrelation();
    chrome = await startChrome();
    page = await cdpNewPage(baseUrl);
    for (const route of ['/dashboard', '/expenses', '/planning', '/workspace', '/settings']) {
      await verifySignedOutRoute(page, route);
    }
    await delay(1200);
    if (report.consoleErrors.length) {
      addIssue(
        'Critical',
        'Browser',
        'Runtime and console remain error-free',
        'No runtime exceptions or browser console errors occur during production route smoke.',
        `${report.consoleErrors.length} error(s) captured.`,
      );
    } else {
      addCoverage(
        'Browser',
        'Runtime and console remain error-free',
        'Pass',
        'No errors captured.',
      );
    }
  } catch (error) {
    addIssue(
      'Critical',
      'Runner',
      'Production smoke execution',
      'The non-destructive smoke runner completes all checks.',
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
  } finally {
    page?.ws?.close();
    killProcessTree(chrome);
    await writeReport();
  }

  console.log(`Production smoke report: ${reportPath}`);
  console.log(`Production smoke result: ${report.issues.length ? 'FAILED' : 'PASSED'}`);
  if (report.issues.length) {
    process.exitCode = 1;
  }
}

main();
