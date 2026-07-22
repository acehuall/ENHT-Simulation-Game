'use strict';
/* ---------- Trust in Balance UI tests ----------
   Drives the simulation in a real Chromium via Playwright and checks the
   facilitator-facing behaviours: skip, restart, rewind, fullscreen chrome, and
   the facilitator-notes modal (pause/restore, suppression, key-repeat, dialog
   semantics, budget formatting, layout stability).

   Run:  cd tests && npm install && npm test
   The chromium binary is auto-detected; override with PW_CHROMIUM=/path/to/chrome
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const PAGE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?skipintro=1';

function resolveChromium() {
  if (process.env.PW_CHROMIUM && fs.existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  try {
    const found = execSync('ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1')
      .toString().trim();
    if (found && fs.existsSync(found)) return found;
  } catch (_) { /* fall through to Playwright's bundled browser */ }
  return undefined;
}

/* ---- tiny test runner ---- */
let passed = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failures.push(name); console.log('  ✗ ' + name); }
}
function eq(actual, expected, name) {
  ok(actual === expected, name + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // Auto-confirm the restart prompt so restart is testable non-interactively.
  await page.addInitScript(() => { window.confirm = () => true; });
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => window.simulationStarted === true, { timeout: 5000 });
  page._errors = errors;
  return page;
}

const feedCount = page => page.$$eval('#eventFeedList .feed-entry', els => els.length);

(async () => {
  const browser = await chromium.launch({ executablePath: resolveChromium() });

  /* ---------------- SKIP ---------------- */
  console.log('\nskip:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(800);
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({
      clock: Math.round(clock),
      qlen: QLEN,
      complete: quarterComplete,
      boardRoom: document.querySelector('.frame').classList.contains('showBoardRoom'),
      reportOpen: isReportOpen(),
      paused: paused
    }));
    eq(s.clock, s.qlen, 'skip jumps clock to end of quarter');
    ok(s.complete, 'skip marks the quarter complete');
    ok(s.boardRoom, 'skip switches to the board room scene');
    ok(s.reportOpen, 'skip opens the board pack');
    ok(s.paused, 'skip leaves the simulation paused');
    ok((await feedCount(page)) >= 3, 'skip flushes timeline beats into the feed');
    ok(page._errors.length === 0, 'skip: no console/page errors');
    await page.close();
  }

  /* ---------------- RESTART ---------------- */
  console.log('\nrestart:');
  {
    const page = await freshPage(browser);
    // Advance well into the quarter (no overlay open, so R is honoured).
    await page.evaluate(() => { seekSimulation(30); render(); });
    await page.waitForTimeout(150);
    const before = await feedCount(page);
    await page.keyboard.press('r');            // confirm() is stubbed to true
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({
      clock: Math.round(clock),
      paused: paused,
      complete: quarterComplete,
      boardRoom: document.querySelector('.frame').classList.contains('showBoardRoom'),
      scene: currentScene
    }));
    eq(s.clock, 0, 'restart resets the clock to zero');
    ok(!s.paused, 'restart resumes play');
    ok(!s.complete, 'restart clears the complete flag');
    ok(!s.boardRoom, 'restart returns to the simulation scene');
    const after = await feedCount(page);
    ok(after >= 2 && after < before, 'restart rebuilds the feed from the start');
    ok(page._errors.length === 0, 'restart: no console/page errors');
    await page.close();
  }

  /* ---------------- REWIND (scrub back) ---------------- */
  console.log('\nrewind:');
  {
    const page = await freshPage(browser);
    // Forward to near the end, then rewind - the feed must rebuild, not duplicate.
    await page.evaluate(() => { seekSimulation(QLEN - 1); render(); });
    await page.waitForTimeout(150);
    const far = await feedCount(page);
    await page.evaluate(() => { seekSimulation(4); render(); });
    await page.waitForTimeout(150);
    const near = await feedCount(page);
    // Re-render at the same point: no duplicate entries should accumulate.
    await page.evaluate(() => { render(); render(); });
    const nearAgain = await feedCount(page);
    const budgetReset = await page.evaluate(() => { seekSimulation(0); render(); return Math.round(getMetricValue('waiting')); });
    ok(near < far, 'rewind trims the feed back to events seen so far');
    eq(nearAgain, near, 'rewind does not duplicate feed entries on re-render');
    eq(budgetReset, 68, 'rewind to zero restores starting metrics');
    ok(page._errors.length === 0, 'rewind: no console/page errors');
    await page.close();
  }

  /* ---------------- FULLSCREEN CHROME ---------------- */
  console.log('\nfullscreen:');
  {
    const page = await freshPage(browser);
    // The clipping fix lives in CSS. file:// <link> sheets are not readable via
    // the CSSOM (SecurityError), so assert the rules from the source on disk.
    const layoutCss = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'css', 'layout.css'), 'utf8');
    ok(/\.stage:fullscreen\s+\.feed\s*\{[^}]*display:\s*none/.test(layoutCss), 'feed is hidden in fullscreen');
    ok(/\.stage:fullscreen\s*\{[^}]*overflow:\s*auto/.test(layoutCss), 'fullscreen stage scrolls instead of clipping');
    // Best-effort real fullscreen (headless may reject); when it works the feed must compute to none.
    const entered = await page.evaluate(async () => {
      const st = document.querySelector('.stage');
      try { await st.requestFullscreen(); } catch (_) { return false; }
      return !!document.fullscreenElement;
    });
    if (entered) {
      const feedDisplay = await page.$eval('#eventFeed', el => getComputedStyle(el).display);
      eq(feedDisplay, 'none', 'feed computes to display:none while actually fullscreen');
      await page.evaluate(() => document.exitFullscreen());
    } else {
      console.log('  (real fullscreen unavailable in this environment - CSS rule asserted instead)');
    }
    ok(page._errors.length === 0, 'fullscreen: no console/page errors');
    await page.close();
  }

  /* ---------------- LAYOUT STABILITY (feed does not shove the page) ---------------- */
  console.log('\nlayout stability:');
  {
    const page = await freshPage(browser);
    const ctrlTop = () => page.$eval('.ctrl', el => Math.round(el.getBoundingClientRect().top));
    const empty = await feedCount(page);
    const topBefore = await ctrlTop();
    await page.evaluate(() => { seekSimulation(QLEN); render(); }); // fill the feed
    await page.waitForTimeout(100);
    const full = await feedCount(page);
    const topAfter = await ctrlTop();
    ok(full > empty, 'feed gains entries as the quarter plays out');
    eq(topAfter, topBefore, 'controls below the feed do not move as entries are added');
    await page.close();
  }

  /* ---------------- MODAL BEHAVIOUR ---------------- */
  console.log('\nfacilitator modal:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(400);
    const runningBefore = await page.evaluate(() => paused);

    // Open with the visible button (discoverable access).
    await page.click('#btnNotes');
    await page.waitForTimeout(150);
    const opened = await page.evaluate(() => {
      const r = document.getElementById('facilRoot');
      return {
        open: !r.hidden,
        role: r.getAttribute('role'),
        modal: r.getAttribute('aria-modal'),
        labelledby: r.getAttribute('aria-labelledby'),
        titleId: (document.getElementById('facilTitle') || {}).id,
        focusOnClose: document.activeElement === r.querySelector('.facil-close'),
        paused: paused
      };
    });
    ok(opened.open, 'notes open from the visible Notes button');
    eq(opened.role, 'dialog', 'overlay has role=dialog');
    eq(opened.modal, 'true', 'overlay is aria-modal');
    eq(opened.labelledby, 'facilTitle', 'overlay is labelled by its heading');
    eq(opened.titleId, 'facilTitle', 'heading carries the referenced id');
    ok(opened.focusOnClose, 'focus moves into the dialog on open');
    ok(opened.paused, 'opening notes pauses the simulation');

    // Budget formatting inside the notes (Q1 option A budget effect is -1.8).
    const effects = await page.$$eval('#facilRoot .facil-effects', els => els.map(e => e.textContent));
    ok(effects.some(t => /-£\d/.test(t)), 'budget effect renders sign before the pound (e.g. -£1.8m)');
    ok(!effects.some(t => /£-/.test(t)), 'budget effect never renders £- ordering');

    // Suppression: skip/pause are ignored while the modal owns the screen.
    const clockPre = await page.evaluate(() => Math.round(clock));
    await page.keyboard.press('s');
    await page.keyboard.press('p');
    await page.waitForTimeout(100);
    const afterKeys = await page.evaluate(() => ({
      clock: Math.round(clock),
      complete: quarterComplete,
      paused: paused,
      open: !document.getElementById('facilRoot').hidden
    }));
    eq(afterKeys.clock, clockPre, 'S is suppressed while notes are open');
    ok(!afterKeys.complete, 'notes stay up; quarter not skipped');
    ok(afterKeys.paused, 'P is suppressed while notes are open');
    ok(afterKeys.open, 'notes remain open after suppressed keys');

    // Key repeat must not re-toggle the modal.
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', repeat: true, bubbles: true }));
    });
    await page.waitForTimeout(80);
    ok(await page.evaluate(() => !document.getElementById('facilRoot').hidden), 'repeated F keydown does not close the modal');

    // F (single) closes and restores the prior run state.
    await page.keyboard.press('f');
    await page.waitForTimeout(120);
    const closed = await page.evaluate(() => ({
      hidden: document.getElementById('facilRoot').hidden,
      paused: paused
    }));
    ok(closed.hidden, 'F closes the notes');
    eq(closed.paused, runningBefore, 'closing notes restores the prior pause state');

    // Escape closes too, and backdrop click closes.
    await page.click('#btnNotes');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    ok(await page.evaluate(() => document.getElementById('facilRoot').hidden), 'Escape closes the notes');

    await page.click('#btnNotes');
    await page.waitForTimeout(100);
    await page.mouse.click(5, 5); // top-left backdrop, away from the modal
    await page.waitForTimeout(100);
    ok(await page.evaluate(() => document.getElementById('facilRoot').hidden), 'clicking the backdrop closes the notes');

    ok(page._errors.length === 0, 'modal: no console/page errors');
    await page.close();
  }

  /* ---------------- METRIC SEMANTICS ---------------- */
  console.log('\nmetric semantics:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const validTones = { critical: true, warn: true, neutral: true, good: true, great: true };
      const validDirs = { below: true, above: true };
      const validSeverities = { warn: true, critical: true, praise: true };
      const roleNames = PREGAME.roles.map(role => role.name);
      let coverage = true;
      let ordering = true;
      let tonesValid = true;
      let ownersValid = true;
      let thresholdsValid = true;
      let indexAgreement = true;
      let idempotent = true;
      let authoredDirections = true;

      METRIC_DEFS.forEach(def => {
        if (def.bands[def.bands.length - 1].to !== def.max) coverage = false;
        for (let i = 0; i < def.bands.length; i++) {
          if (!validTones[def.bands[i].tone]) tonesValid = false;
          if (i && def.bands[i - 1].to >= def.bands[i].to) ordering = false;
        }
        const steps = def.money ? Math.round((def.max - def.min) * 10) : def.max - def.min;
        for (let i = 0; i <= steps; i++) {
          const value = def.money ? Math.round((def.min + i / 10) * 10) / 10 : def.min + i;
          const band = getMetricBand(def.key, value);
          const index = getMetricBandIndex(def.key, value);
          if (!band) coverage = false;
          if (def.bands[index] !== band) indexAgreement = false;
          if (getThresholdCrossings(def.key, value, value).length !== 0) idempotent = false;
        }
        [-10, 10].forEach(offset => {
          const value = offset < 0 ? def.min + offset : def.max + offset;
          const band = getMetricBand(def.key, value);
          if (!band || def.bands[getMetricBandIndex(def.key, value)] !== band) indexAgreement = false;
        });
        if (!roleNames.includes(def.owner)) ownersValid = false;
        def.thresholds.forEach(threshold => {
          if (typeof threshold.at !== 'number' || threshold.at !== threshold.at ||
              !validDirs[threshold.dir] || !validSeverities[threshold.severity] ||
              threshold.at < def.min || threshold.at > def.max ||
              typeof threshold.title !== 'string' || !threshold.title ||
              typeof threshold.line !== 'string' || !threshold.line) thresholdsValid = false;
          const epsilon = def.money ? 0.1 : 1;
          const down = getThresholdCrossings(def.key, threshold.at + epsilon, threshold.at);
          const up = getThresholdCrossings(def.key, threshold.at - epsilon, threshold.at);
          const expected = threshold.dir === 'below' ? down : up;
          const reverse = threshold.dir === 'below' ? up : down;
          if (expected.filter(c => c.threshold === threshold && c.direction === threshold.dir).length !== 1 ||
              reverse.filter(c => c.threshold === threshold).length !== 0) authoredDirections = false;
        });
      });

      const safetyDown = getThresholdCrossings('safety', 60, 30).map(c => c.threshold.at);
      const waitingUp = getThresholdCrossings('waiting', 60, 90).map(c => c.threshold.at);
      const boundaryFirst = getThresholdCrossings('safety', 60, 55);
      const boundaryAgain = getThresholdCrossings('safety', 55, 55);
      const criticalStats = { budget: 0, waiting: 60, patsat: 82, morale: 80, safety: 20, rep: 82 };
      const healthyStats = { budget: 1.5, waiting: 40, patsat: 90, morale: 90, safety: 90, rep: 90 };
      const tiedStats = { budget: -2, waiting: 80, patsat: 82, morale: 80, safety: 85, rep: 82 };
      const criticalPosture = getBoardPosture(criticalStats);
      const healthyPosture = getBoardPosture(healthyStats);
      const tiedPosture = getBoardPosture(tiedStats);
      const beforeGame = JSON.stringify(GAME.stats);
      const beforeCurrent = JSON.stringify(METRIC_CUR);
      METRIC_DEFS.forEach(def => {
        getMetricBand(def.key, def.min - 1);
        getMetricBandIndex(def.key, def.max + 1);
        getThresholdCrossings(def.key, def.max, def.min);
        describeMetric(def.key, def.start);
      });
      getBoardPosture(METRIC_CUR);
      const purity = beforeGame === JSON.stringify(GAME.stats) && beforeCurrent === JSON.stringify(METRIC_CUR);
      const tickBandCounts = METRIC_DEFS.map((_, i) =>
        Array.from(document.getElementById('t' + i).classList).filter(name => /^band-/.test(name)).length);
      const tickerAccess = METRIC_DEFS.every((def, i) => {
        const tick = document.getElementById('t' + i);
        return tick.tabIndex === 0 && !!tick.title &&
          tick.getAttribute('aria-label').indexOf(def.full + ':') === 0 &&
          tick.getAttribute('aria-label').indexOf(getMetricBand(def.key, getMetricValue(def.key)).label) >= 0;
      });
      const posture = document.getElementById('postureStrip');
      const postureBandCount = Array.from(posture.classList).filter(name => /^band-/.test(name)).length;
      const budgetDescription = describeMetric('budget', -1.8);

      return {
        coverage,
        ordering,
        tonesValid,
        ownersValid,
        thresholdsValid,
        indexAgreement,
        unknownIndex: getMetricBandIndex('nosuchmetric', 50),
        idempotent,
        authoredDirections,
        safetyDown,
        waitingUp,
        boundaryAt: boundaryFirst.length === 1 && boundaryFirst[0].threshold.at === 55,
        boundaryRepeat: boundaryAgain.length,
        waitingLowTone: getMetricBand('waiting', 40).tone,
        waitingHighTone: getMetricBand('waiting', 90).tone,
        criticalPosture,
        healthyTone: healthyPosture.tone,
        tiedWorst: tiedPosture.worstKey,
        tickBandCounts,
        tickerAccess,
        postureText: posture.textContent,
        postureBandCount,
        purity,
        budgetValueText: budgetDescription.valueText,
        toneRanks: [getToneRank('critical'), getToneRank('warn'), getToneRank('neutral'),
          getToneRank('good'), getToneRank('great')]
      };
    });

    ok(s.coverage, 'semantics: bands cover every metric range and end at max');
    ok(s.ordering, 'semantics: band upper bounds are strictly ascending');
    ok(s.tonesValid, 'semantics: every band tone is valid');
    ok(s.ownersValid, 'semantics: every owner matches a real board role');
    ok(s.thresholdsValid, 'semantics: every threshold is well formed');
    ok(s.indexAgreement, 'semantics: band index agrees with band lookup across and outside ranges');
    eq(s.unknownIndex, -1, 'semantics: unknown metric has no band index');
    ok(s.idempotent, 'semantics: equal values never cross a threshold');
    ok(s.authoredDirections, 'semantics: thresholds fire once only in their authored direction');
    eq(s.waitingLowTone, 'great', 'semantics: waiting tones are inverted for goodUp:false at low values');
    eq(s.waitingHighTone, 'critical', 'semantics: waiting tones are inverted for goodUp:false at high values');
    eq(JSON.stringify(s.safetyDown), JSON.stringify([55, 35]), 'semantics: downward multi-crossings end on the worst threshold');
    eq(JSON.stringify(s.waitingUp), JSON.stringify([72, 85]), 'semantics: upward multi-crossings end nearest the next value');
    ok(s.boundaryAt, 'semantics: moving exactly onto a below threshold fires');
    eq(s.boundaryRepeat, 0, 'semantics: remaining on a threshold does not refire');
    eq(s.criticalPosture.tone, 'critical', 'semantics: posture reflects one critical metric');
    eq(s.criticalPosture.worstKey, 'safety', 'semantics: posture identifies the critical metric');
    ok(s.healthyTone !== 'critical', 'semantics: an all-healthy board is not critical');
    eq(s.tiedWorst, 'budget', 'semantics: posture ties use METRIC_DEFS order');
    ok(s.tickBandCounts.every(count => count === 1), 'semantics: every ticker carries exactly one band class');
    ok(s.tickerAccess, 'semantics: tickers expose focusable hover and screen-reader explanations');
    ok(/^BOARD:/.test(s.postureText) && s.postureBandCount === 1, 'semantics: posture strip renders one board tone');
    ok(s.purity, 'semantics: derivation functions do not mutate game or playback stats');
    eq(s.budgetValueText, '&#8722;&pound;1.8m', 'semantics: metric description reuses ticker money formatting');
    eq(JSON.stringify(s.toneRanks), JSON.stringify([0, 1, 2, 3, 4]), 'semantics: shared tone ranks run from worst to best');

    await page.evaluate(() => { seekSimulation(QLEN); render(); });
    await page.waitForTimeout(100);
    const colour = await page.evaluate(() => {
      const tick = document.getElementById('t0');
      return {
        band: tick.classList.contains('band-warn'),
        value: getComputedStyle(tick.querySelector('.tv')).color,
        neutral: getComputedStyle(document.querySelector('#t1 .tv')).color
      };
    });
    ok(colour.band, 'semantics: Q1 closing budget enters the warn band');
    ok(colour.value !== colour.neutral, 'semantics: ticker band class changes the computed value colour');
    ok(page._errors.length === 0, 'semantics: no console/page errors');
    await page.close();
  }

  await browser.close();

  console.log('\n' + '-'.repeat(48));
  console.log(passed + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('FAILURES:\n  - ' + failures.join('\n  - '));
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
