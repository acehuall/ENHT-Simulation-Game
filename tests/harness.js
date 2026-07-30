'use strict';
/* ---------- shared test harness ----------
   Everything the suites in tests/suites/ need: the page URL, the Chromium
   resolver, the assertion runner, and the page helpers.

   The suites are plain modules, not a framework. Each exports
   `async (t) => {...}` and receives one object carrying the shared browser and
   these helpers; ui.test.js runs them in order against a SINGLE browser, which
   is why the browser is passed in rather than launched per suite.
--------------------------------------------------------------------------- */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

/* Repo root, resolved once here. Suites live a directory deeper, so a suite
   doing path.resolve(__dirname, '..') would land in tests/ rather than the
   repo - which is exactly what broke when they were split out of ui.test.js. */
const REPO_ROOT = path.resolve(__dirname, '..');
const PAGE_URL = 'file://' + path.join(REPO_ROOT, 'index.html') + '?skipintro=1';

function resolveChromium() {
  if (process.env.PW_CHROMIUM && fs.existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  try {
    const found = execSync('ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1')
      .toString().trim();
    if (found && fs.existsSync(found)) return found;
  } catch (_) { /* fall through to Playwright's bundled browser */ }
  return undefined;
}

/* ---- tiny test runner ----
   One counter shared across every suite, so the final total is the whole run's
   and a suite cannot report a pass count of its own that nothing checks. */
function makeRunner() {
  const state = { passed: 0, failures: [] };
  function ok(cond, name) {
    if (cond) { state.passed++; console.log('  ✓ ' + name); }
    else { state.failures.push(name); console.log('  ✗ ' + name); }
  }
  function eq(actual, expected, name) {
    ok(actual === expected, name + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
  }
  return { state, ok, eq };
}

/* In-page helpers installed on every test page. Kept here rather than redefined
   per suite so a fix reaches every caller.

   parseMoney PRESERVES THE SIGN, and that is the whole reason it exists. Blocks
   used to parse a money cell with .replace(/[^0-9.]/g,''), which strips every
   non-numeric character - so "-£4.6m" came back as 4.6, and an assertion that a
   transfer INTO reserves rendered negative would have passed on a cell showing
   the opposite. The view emits U+2212 MINUS SIGN rather than an ASCII hyphen,
   so both are normalised before the number is matched. */
const IN_PAGE_HELPERS = () => {
  window.parseMoney = el => {
    const t = String(el && el.textContent != null ? el.textContent : el).replace(/−/g, '-');
    const m = t.match(/\d+(\.\d+)?/);
    if (!m) return NaN;
    /* The sign is looked for BEFORE the first digit rather than immediately
       before it: the currency symbol sits between them ("-£8.0m"), so a
       /-?\d+/ match would silently drop the minus and return 8. */
    return (/-/.test(t.slice(0, m.index)) ? -1 : 1) * parseFloat(m[0]);
  };
};

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // Auto-confirm the restart prompt so restart is testable non-interactively.
  await page.addInitScript(() => { window.confirm = () => true; });
  await page.addInitScript(IN_PAGE_HELPERS);
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => window.simulationStarted === true, { timeout: 5000 });
  page._errors = errors;
  return page;
}

const feedCount = page => page.$$eval('#eventFeedList .feed-entry', els => els.length);

/* Drive a fresh page all the way to the Year End Report through the real
   completion path: commit Q1-Q3, then take Q4 through the board pack so
   goToNextReportQuarter() fires the 'year-complete' branch that opens the
   overlay. `roles` (or null) is the board to score. */
async function driveToYearEnd(page, roles) {
  await page.evaluate((roleIds) => {
    resetGameState();
    if (roleIds) setBoardRoles(roleIds);
    for (let i = 0; i < 3; i++) {
      quarterComplete = true;
      const q = getCurrentQuarterId();
      confirmBoardDecision(q, getCurrentQuarter().options[0].id);
      advanceAfterDecision(q);
    }
    quarterComplete = true;
    openReport();
    _selectReportOption(0);            // proposes the Q4 option, records nothing
    _confirmSelectedReportOption();    // records the Q4 decision
    goToNextReportQuarter();           // 'year-complete' -> closeReport + openYearEnd
  }, roles || null);
}

module.exports = {
  PAGE_URL, REPO_ROOT, resolveChromium, makeRunner, IN_PAGE_HELPERS,
  freshPage, feedCount, driveToYearEnd
};
