'use strict';
/* ---------- Trust in Balance UI tests ----------
   Drives the simulation in a real Chromium via Playwright and checks the
   facilitator-facing behaviours end to end.

   Run:  cd tests && npm install && npm test
   The chromium binary is auto-detected; override with PW_CHROMIUM=/path/to/chrome

   THIS FILE IS THE ORCHESTRATOR ONLY. The assertions live in tests/suites/,
   split by subject; add a new suite by dropping a module in there and listing it
   in SUITES below.

   The page has no module system, so every "pure model" assertion also runs
   inside page.evaluate() against the real globals. A single browser is launched
   here and passed to every suite - suites do not launch their own, because
   browser startup dominates the runtime and each block already isolates itself
   with its own page.

   Run one suite while iterating:  npm test -- finance
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const {
  PAGE_URL, REPO_ROOT, resolveChromium, makeRunner, IN_PAGE_HELPERS,
  freshPage, feedCount, driveToYearEnd
} = require('./harness');

/* Order is the order they run in. Kept explicit rather than globbed so the
   output is stable and a suite cannot be added by accident. */
const SUITES = [
  ['general',         './suites/general.test.js'],
  ['board pack',      './suites/board-pack.test.js'],
  ['reporting model', './suites/reporting-model.test.js'],
  ['finance',         './suites/finance.test.js'],
  ['layout',          './suites/layout.test.js']
];

(async () => {
  /* Optional filter: `npm test -- finance` runs only matching suites. Substring
     match on the suite name, so `npm test -- report` catches reporting model. */
  const filter = process.argv[2];
  const selected = SUITES.filter(([name]) => !filter || name.indexOf(filter) >= 0);
  if (!selected.length) {
    console.error('no suite matches "' + filter + '"; known: ' + SUITES.map(s => s[0]).join(', '));
    process.exit(1);
  }

  const { state, ok, eq } = makeRunner();
  const browser = await chromium.launch({ executablePath: resolveChromium() });
  const t = { browser, ok, eq, freshPage, feedCount, driveToYearEnd, PAGE_URL, IN_PAGE_HELPERS, REPO_ROOT };

  try {
    for (const [name, file] of selected) {
      console.log('\n' + '='.repeat(48));
      console.log('SUITE: ' + name);
      console.log('='.repeat(48));
      await require(file)(t);
    }
  } finally {
    await browser.close();
  }

  console.log('\n' + '-'.repeat(48));
  if (filter) console.log('(filtered to "' + filter + '")');
  console.log(state.passed + ' passed, ' + state.failures.length + ' failed');
  if (state.failures.length) {
    console.log('FAILURES:\n  - ' + state.failures.join('\n  - '));
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
