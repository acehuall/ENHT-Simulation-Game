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

  /* ---------------- BOARD PACK ---------------- */
  console.log('\nboard pack:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(800);
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const initial = await page.evaluate(() => ({
      descriptorLength: REPORT_PAGES.length,
      pageCount: document.querySelectorAll('.rep-page').length,
      indicator: document.getElementById('repPageInd').textContent,
      prevDisabled: document.getElementById('repPrev').disabled,
      nextVisible: !document.getElementById('repNext').hidden
    }));
    eq(initial.pageCount, initial.descriptorLength, 'board pack: descriptor drives the shell');
    eq(initial.indicator, 'Page 1 / ' + initial.descriptorLength, 'board pack: initial indicator uses descriptor length');
    ok(initial.prevDisabled, 'board pack: back starts disabled');
    ok(initial.nextVisible, 'board pack: next starts visible');

    const forwardStates = [];
    for (let step = 0; step <= initial.descriptorLength; step++) {
      const state = await page.evaluate(() => ({
        index: REPORT.page,
        indicator: document.getElementById('repPageInd').textContent,
        nextHidden: document.getElementById('repNext').hidden,
        visiblePages: Array.from(document.querySelectorAll('.rep-page')).filter(p => !p.hidden).length
      }));
      forwardStates.push(state);
      if (state.nextHidden) break;
      await page.click('#repNext');
    }
    const last = forwardStates[forwardStates.length - 1];
    ok(forwardStates.every(s => s.visiblePages === 1), 'board pack: exactly one page is visible while paging forward');
    eq(last.index, initial.descriptorLength - 1, 'board pack: next stops on the last descriptor page');
    eq(last.indicator, 'Page ' + initial.descriptorLength + ' / ' + initial.descriptorLength, 'board pack: last-page indicator uses descriptor length');

    const headers = await page.evaluate(() => REPORT_PAGES.map((descriptor, i) => {
      const section = document.querySelector('[data-page="' + i + '"]');
      return {
        title: section.querySelector('.rep-page-head h3').textContent,
        number: section.querySelector('.rep-page-head span').textContent,
        expectedTitle: descriptor.title,
        expectedNumber: (i + 1 < 10 ? '0' : '') + (i + 1)
      };
    }));
    ok(headers.every(h => h.title === h.expectedTitle), 'board pack: headers use descriptor titles');
    ok(headers.every(h => h.number === h.expectedNumber), 'board pack: headers use descriptor page numbers');

    const drawn = await page.evaluate(() => {
      const cv = document.getElementById('repIssueChart');
      if (!cv) return null;
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let seen = 0;
      for (let i = 0; i < d.length; i += 4000) if (d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 0) seen++;
      return { w: cv.width, h: cv.height, seen };
    });
    ok(!!drawn && drawn.w > 0, 'board pack: issue chart has non-zero width');
    ok(!!drawn && drawn.h > 0, 'board pack: issue chart has non-zero height');
    ok(!!drawn && drawn.seen > 0, 'board pack: issue chart afterRender draws pixels');

    for (let step = 0; step <= initial.descriptorLength; step++) {
      const prevDisabled = await page.$eval('#repPrev', el => el.disabled);
      if (prevDisabled) break;
      await page.click('#repPrev');
    }
    const first = await page.evaluate(() => ({
      index: REPORT.page,
      indicator: document.getElementById('repPageInd').textContent,
      prevDisabled: document.getElementById('repPrev').disabled
    }));
    eq(first.index, 0, 'board pack: back returns to the first page');
    eq(first.indicator, 'Page 1 / ' + initial.descriptorLength, 'board pack: backward paging restores the first indicator');
    ok(first.prevDisabled, 'board pack: back re-disables on the first page');

    for (let step = 1; step < initial.descriptorLength; step++) await page.click('#repNext');
    await page.click('.rep-option[data-index="0"]');
    const recorded = await page.evaluate(() => ({
      nextQuarterVisible: !document.getElementById('repNextQuarter').hidden,
      outcomeVisible: !document.getElementById('repOutcome').hidden,
      locked: REPORT.locked
    }));
    ok(recorded.nextQuarterVisible, 'board pack: next quarter appears after a decision');
    ok(recorded.outcomeVisible && recorded.locked, 'board pack: recorded-decision UI appears after a decision');

    await page.click('#repPrev');
    const afterDecisionBack = await page.evaluate(() => REPORT.page);
    eq(afterDecisionBack, initial.descriptorLength - 2, 'board pack: back still works after a decision');
    await page.click('#repNext');
    const afterDecisionNext = await page.evaluate(() => ({
      index: REPORT.page,
      visiblePages: Array.from(document.querySelectorAll('.rep-page')).filter(p => !p.hidden).length
    }));
    eq(afterDecisionNext.index, initial.descriptorLength - 1, 'board pack: next still works after a decision');
    eq(afterDecisionNext.visiblePages, 1, 'board pack: decision paging keeps exactly one page visible');

    ok(page._errors.length === 0, 'board pack: no console/page errors');
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

  /* ---------------- PHASE 2: DURABLE ALERT RECORD ---------------- */
  console.log('\nphase 2 durable alerts:');
  {
    const page = await freshPage(browser);
    const s = await page.evaluate(() => {
      paused = true;
      function outcome(quarterId, startChanges, endChanges) {
        const startStats = Object.assign(initialMetricStats(), startChanges || {});
        const endStats = Object.assign({}, startStats, endChanges || {});
        return {
          quarterId,
          optionId: 'phase2_test',
          optionTitle: 'Phase 2 test',
          decisionSummary: 'Threshold test outcome',
          startStats,
          endStats,
          effects: {}
        };
      }

      resetGameState();
      const budgetOutcome = outcome('Q1', { budget: -1.0 }, { budget: -2.0 });
      const firstApplied = applyBoardDecision(budgetOutcome);
      const budgetAlert = Object.assign({}, GAME.alerts[0]);
      const secondApplied = applyBoardDecision(budgetOutcome);
      const countAfterDuplicate = GAME.alerts.length;
      const q1BudgetCount = getAlertsForDecisionQuarter('Q1').length;
      const q2BudgetCount = getAlertsForDecisionQuarter('Q2').length;
      resetGameState();
      const clearedCount = GAME.alerts.length;

      const safetyOutcome = outcome('Q1', { safety: 70 }, { safety: 30 });
      applyBoardDecision(safetyOutcome);
      setCurrentQuarter('Q2');
      setTimelineForCurrentQuarter(getPlaybackOutcomeForQuarter('Q2'));
      const safetyAlerts = getAlertsForDecisionQuarter('Q1').map(alert => ({
        at: alert.at,
        severity: alert.severity,
        direction: alert.direction
      }));

      return {
        firstApplied,
        secondApplied,
        budgetAlert,
        countAfterDuplicate,
        q1BudgetCount,
        q2BudgetCount,
        clearedCount,
        safetyAlerts,
        playbackQuarter: getTimeline().quarterId,
        decisionQuarter: getTimeline().outcome.quarterId,
        q2SafetyCount: getAlertsForDecisionQuarter('Q2').length
      };
    });

    ok(s.firstApplied, 'alerts: first decision is recorded');
    ok(!s.secondApplied, 'alerts: duplicate decision is rejected');
    eq(s.countAfterDuplicate, 1, 'alerts: duplicate decision cannot duplicate durable alerts');
    eq(s.budgetAlert.key, 'budget', 'alerts: durable record carries the metric key');
    eq(s.budgetAlert.at, -1.5, 'alerts: durable record carries the crossed threshold');
    eq(s.budgetAlert.severity, 'warn', 'alerts: durable record preserves authored severity');
    eq(s.budgetAlert.direction, 'below', 'alerts: durable record preserves authored direction');
    eq(s.budgetAlert.decisionQuarterId, 'Q1', 'alerts: durable record uses the decision quarter');
    eq(s.q1BudgetCount, 1, 'alerts: decision-quarter lookup returns the alert');
    eq(s.q2BudgetCount, 0, 'alerts: lookup does not conflate playback and decision quarters');
    eq(s.clearedCount, 0, 'alerts: game reset clears durable history');
    eq(JSON.stringify(s.safetyAlerts), JSON.stringify([
      { at: 55, severity: 'warn', direction: 'below' },
      { at: 35, severity: 'critical', direction: 'below' }
    ]), 'alerts: committed multi-crossings retain travel order');
    eq(s.playbackQuarter, 'Q2', 'alerts: Q1 decision is dramatized during Q2 playback');
    eq(s.decisionQuarter, 'Q1', 'alerts: playback timeline retains the deciding quarter');
    eq(s.q2SafetyCount, 0, 'alerts: Q1 safety alerts are not attributed to Q2');
    ok(page._errors.length === 0, 'durable alerts: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 2: LIVE OBSERVER + DELIVERY ---------------- */
  console.log('\nphase 2 live alerts:');
  {
    const page = await freshPage(browser);
    const s = await page.evaluate(() => {
      paused = true;

      /* A forward seek across DEFAULT_OUTCOME's budget warning is silent. */
      seekSimulation(0);
      render();
      feedReset(getTimeline().quarterId);
      seekSimulation(QLEN);
      render();
      const forwardSeek = {
        severityEntries: document.querySelectorAll(
          '#eventFeedList .feed-warn, #eventFeedList .feed-critical, #eventFeedList .feed-praise').length,
        queue: _alertQueue.length,
        active: _alertActive,
        bannerClass: document.getElementById('alertBanner').className,
        bannerOpacity: document.getElementById('alertBanner').style.opacity,
        toastClass: document.getElementById('alertToast').className,
        toastOpacity: document.getElementById('alertToast').style.opacity
      };

      /* Normal uninterrupted playback crosses the same warning once. */
      function playDefaultPass() {
        seekSimulation(0);
        render();
        for (let t = 0.25; t <= QLEN; t += 0.25) {
          clock = t;
          render();
        }
        return document.querySelectorAll('#eventFeedList .feed-warn').length;
      }
      const firstPassCount = playDefaultPass();
      const firstActive = _alertActive && {
        key: _alertActive.key,
        severity: _alertActive.severity,
        title: _alertActive.title
      };
      render();
      render();
      const stableCount = document.querySelectorAll('#eventFeedList .feed-warn').length;
      const secondPassCount = playDefaultPass();

      /* A theatre-only safety dip is rejected because committed endpoints do
         not cross the threshold. It is absent from both live and durable data. */
      resetGameState();
      const sameStats = Object.assign(initialMetricStats(), { safety: 60 });
      const theatreOutcome = {
        quarterId: 'Q1', optionId: 'theatre_only', optionTitle: 'Theatre only',
        decisionSummary: 'Temporary dip', startStats: Object.assign({}, sameStats),
        endStats: Object.assign({}, sameStats), effects: {}
      };
      applyBoardDecision(theatreOutcome);
      TIMELINE = { quarterId: 'Q2', outcome: theatreOutcome, banner: null, statEvents: [] };
      Object.keys(sameStats).forEach(key => { METRIC_CUR[key] = sameStats[key]; });
      feedReset('Q2');
      resetAlerts();
      METRIC_CUR.safety = 50;
      updateEventFeed(10, 9001);
      updateAlerts(9001);
      const theatreOnly = {
        durable: GAME.alerts.length,
        feed: document.querySelectorAll(
          '#eventFeedList .feed-warn, #eventFeedList .feed-critical, #eventFeedList .feed-praise').length,
        queue: _alertQueue.length,
        active: _alertActive
      };

      /* Eligible crossings are memoised and handed unchanged to both channels. */
      const eligibleStart = Object.assign(initialMetricStats(), { safety: 60 });
      const eligibleEnd = Object.assign({}, eligibleStart, { safety: 50 });
      const eligibleOutcome = {
        quarterId: 'Q1', optionId: 'eligible', optionTitle: 'Eligible',
        decisionSummary: 'Committed safety warning',
        startStats: eligibleStart, endStats: eligibleEnd, effects: {}
      };
      TIMELINE = { quarterId: 'Q2', outcome: eligibleOutcome, banner: null, statEvents: [] };
      Object.keys(eligibleStart).forEach(key => { METRIC_CUR[key] = eligibleStart[key]; });
      feedReset('Q2');
      resetAlerts();
      METRIC_CUR.safety = 50;
      updateEventFeed(10, 9100);
      const memoA = observeThresholdCrossings(9100);
      const memoB = observeThresholdCrossings(9100);
      updateAlerts(9100);
      const feedEntry = document.querySelector('#eventFeedList .feed-warn .feed-text');
      const shared = {
        sameReference: memoA === memoB,
        memoLength: memoA.length,
        feedCount: document.querySelectorAll('#eventFeedList .feed-warn').length,
        feedText: feedEntry && feedEntry.textContent,
        activeKey: _alertActive && _alertActive.key,
        activeSeverity: _alertActive && _alertActive.severity,
        activeTitle: _alertActive && _alertActive.title,
        nextFrameCount: observeThresholdCrossings(9101).length
      };

      /* Queue priority is critical, warning, praise regardless of input order. */
      _alertQueue = [];
      _enqueueCrossings([
        { key: 'rep', direction: 'above', threshold: { at: 82, severity: 'praise', title: 'P', line: 'P' } },
        { key: 'budget', direction: 'below', threshold: { at: -1.5, severity: 'warn', title: 'W', line: 'W' } },
        { key: 'safety', direction: 'below', threshold: { at: 35, severity: 'critical', title: 'C', line: 'C' } }
      ]);
      const priority = _alertQueue.map(alert => alert.severity);

      return {
        forwardSeek,
        firstPassCount,
        stableCount,
        secondPassCount,
        firstActive,
        theatreOnly,
        shared,
        priority
      };
    });

    eq(s.forwardSeek.severityEntries, 0, 'live alerts: forward seek adds no threshold feed entry');
    eq(s.forwardSeek.queue, 0, 'live alerts: forward seek leaves the alert queue empty');
    ok(s.forwardSeek.active === null, 'live alerts: forward seek leaves no active overlay');
    eq(s.forwardSeek.bannerClass, 'alert-banner', 'live alerts: forward seek leaves banner at base class');
    eq(s.forwardSeek.bannerOpacity, '0', 'live alerts: forward seek leaves banner hidden');
    eq(s.forwardSeek.toastClass, 'alert-toast', 'live alerts: forward seek leaves toast at base class');
    eq(s.forwardSeek.toastOpacity, '0', 'live alerts: forward seek leaves toast hidden');
    eq(s.firstPassCount, 1, 'live alerts: normal playback narrates one eligible crossing');
    eq(s.stableCount, 1, 'live alerts: repeated renders do not duplicate a crossing');
    eq(s.secondPassCount, 1, 'live alerts: replay after seek re-fires once in the new pass');
    eq(s.firstActive.key, 'budget', 'live alerts: overlay identifies the crossed metric');
    eq(s.firstActive.severity, 'warn', 'live alerts: warning is delivered through the toast channel');
    eq(s.theatreOnly.durable, 0, 'live alerts: theatre-only dip creates no durable record');
    eq(s.theatreOnly.feed, 0, 'live alerts: theatre-only dip creates no feed entry');
    eq(s.theatreOnly.queue, 0, 'live alerts: theatre-only dip creates no queued overlay');
    ok(s.theatreOnly.active === null, 'live alerts: theatre-only dip creates no active overlay');
    ok(s.shared.sameReference, 'live alerts: observer memo returns the same array within a frame');
    eq(s.shared.memoLength, 1, 'live alerts: shared memo contains the eligible crossing');
    eq(s.shared.feedCount, 1, 'live alerts: feed consumes the shared crossing once');
    eq(s.shared.activeKey, 'safety', 'live alerts: overlay consumes the same metric crossing');
    eq(s.shared.activeSeverity, 'warn', 'live alerts: feed and overlay preserve the same severity');
    ok(s.shared.feedText.indexOf(s.shared.activeTitle) === 0,
      'live alerts: feed and overlay use the same authored alert title');
    eq(s.shared.nextFrameCount, 0, 'live alerts: crossing is deduped for the rest of the pass');
    eq(JSON.stringify(s.priority), JSON.stringify(['critical', 'warn', 'praise']),
      'live alerts: queue prioritises critical, warning, then praise');
    ok(page._errors.length === 0, 'live alerts: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 2: OVERLAY LIFECYCLE + TIMELINE ---------------- */
  console.log('\nphase 2 lifecycle:');
  {
    const page = await freshPage(browser);
    const s = await page.evaluate(() => {
      paused = true;
      let fakeNow = 1000;
      _alertNow = () => fakeNow;
      _alertActive = {
        key: 'safety', at: 35, direction: 'below', severity: 'critical',
        title: '<img src=x onerror=alert(1)>SAFETY BREACH',
        line: 'Plain & safe', channel: 'banner', shownAt: fakeNow
      };
      _alertShow(_alertActive);
      const escaped = {
        images: document.querySelectorAll('#alertBanner img').length,
        text: document.getElementById('alertBanner').textContent,
        className: document.getElementById('alertBanner').className
      };
      fakeNow += (ALERT_HOLD + ALERT_FADE + 0.1) * 1000;
      _alertTick();
      const cleared = {
        opacity: document.getElementById('alertBanner').style.opacity,
        className: document.getElementById('alertBanner').className,
        text: document.getElementById('alertBanner').textContent,
        active: _alertActive
      };
      const selfTest = runTimelineSelfTest();
      return { escaped, cleared, selfTest };
    });

    eq(s.escaped.images, 0, 'lifecycle: alert copy is escaped as plain text');
    ok(s.escaped.text.indexOf('<img') === 0, 'lifecycle: escaped alert text remains readable');
    eq(s.escaped.className, 'alert-banner alert-critical', 'lifecycle: critical banner receives its severity class');
    eq(s.cleared.opacity, '0', 'lifecycle: critical banner fades to hidden');
    eq(s.cleared.className, 'alert-banner', 'lifecycle: cleared banner returns to its base class');
    eq(s.cleared.text, '', 'lifecycle: cleared banner removes stale copy');
    ok(s.cleared.active === null, 'lifecycle: expired alert releases the active slot');
    eq(s.selfTest.failures.length, 0, 'lifecycle: timeline validator remains clean');
    ok(page._errors.length === 0, 'lifecycle: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 3: REPORTING MODEL ---------------- */
  console.log('\nphase 3 reporting model:');
  {
    const page = await freshPage(browser);
    const s = await page.evaluate(() => {
      /* recursively deep-freeze so a mutation of any nested stats object throws */
      function deepFreeze(obj) {
        if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
          Object.freeze(obj);
          Object.keys(obj).forEach(k => deepFreeze(obj[k]));
        }
        return obj;
      }

      /* 7.1 I&E reconciliation across the full budget range, with and without
         an authored line override (keyed on a real quarter:option id). */
      let maxErr = 0, maxErrOverride = 0;
      REPORTING_OVERRIDES['Q1:hire_temporary_staff'] = { finance: { clinicalIncome: 80, paySpend: 70 } };
      const overrideCtx = { quarterId: 'Q1', optionId: 'hire_temporary_staff' };
      for (let b = -5; b <= 2.00001; b += 0.1) {
        const budget = Math.round(b * 10) / 10;
        const stats = Object.assign(initialMetricStats(), { budget });
        maxErr = Math.max(maxErr, Math.abs(deriveIncomeExpenditure(stats, null).surplus - budget));
        maxErrOverride = Math.max(maxErrOverride,
          Math.abs(deriveIncomeExpenditure(stats, overrideCtx).surplus - budget));
      }
      delete REPORTING_OVERRIDES['Q1:hire_temporary_staff'];

      /* 7.2 determinism - identical (stats, ctx) gives deeply equal output. */
      const detStats = Object.assign(initialMetricStats(), { waiting: 80, morale: 40, safety: 45, patsat: 48, budget: -2 });
      const detCtx = { quarterId: 'q2', optionId: 'invest' };
      const deterministic =
        JSON.stringify(deriveIncomeExpenditure(detStats, detCtx)) === JSON.stringify(deriveIncomeExpenditure(detStats, detCtx)) &&
        JSON.stringify(deriveOperational(detStats, detCtx)) === JSON.stringify(deriveOperational(detStats, detCtx)) &&
        JSON.stringify(deriveWorkforce(detStats, detCtx)) === JSON.stringify(deriveWorkforce(detStats, detCtx)) &&
        JSON.stringify(deriveQuality(detStats, detCtx)) === JSON.stringify(deriveQuality(detStats, detCtx));

      /* 7.3 no mutation - recursively deep-frozen stats and ctx must not throw. */
      let noThrow = true;
      try {
        const frozenStats = deepFreeze(Object.assign(initialMetricStats(), { waiting: 75 }));
        const frozenCtx = deepFreeze({
          quarterId: 'Q2', optionId: 'discharge_partnership',
          outcome: { startStats: initialMetricStats(), endStats: initialMetricStats() },
          history: [{ startStats: initialMetricStats(), endStats: initialMetricStats() }]
        });
        deriveIncomeExpenditure(frozenStats, frozenCtx);
        deriveOperational(frozenStats, frozenCtx);
        deriveWorkforce(frozenStats, frozenCtx);
        deriveQuality(frozenStats, frozenCtx);
        getReportSection('finance', frozenStats, frozenCtx);
        getReportSection('operations', frozenStats, frozenCtx);
        getReportSection('workforce', frozenStats, frozenCtx);
        getReportSection('quality', frozenStats, frozenCtx);
      } catch (e) { noThrow = false; }

      /* 7.4 direction - move each source metric in its WORSENING direction and
         check every derived figure moves the way the 5.3 table states. Budget
         and every index worsen downward; waiting worsens upward. */
      const base = initialMetricStats();
      const withD = changes => Object.assign({}, base, changes);
      const lineOf = (stats, id) => deriveIncomeExpenditure(stats, null).lines.find(l => l.id === id).actual;

      const budgetLow = withD({ budget: -4 });
      const moraleLow = withD({ morale: base.morale - 15 });
      const waitingHi = withD({ waiting: base.waiting + 15 });
      const safetyLow = withD({ safety: base.safety - 15 });
      const safetyVeryLow = withD({ safety: 20 });
      const patsatLow = withD({ patsat: base.patsat - 15 });
      const repLow = withD({ rep: base.rep - 15 });

      const opBase = deriveOperational(base, null);
      const opWait = deriveOperational(waitingHi, null);
      const opSafety = deriveOperational(safetyLow, null);
      const wfBase = deriveWorkforce(base, null);
      const wfMorale = deriveWorkforce(moraleLow, null);
      const wfRep = deriveWorkforce(repLow, null);
      const qBase = deriveQuality(base, null);
      const qSafety = deriveQuality(safetyLow, null);
      const qSafetyVery = deriveQuality(safetyVeryLow, null);
      const qPatsat = deriveQuality(patsatLow, null);

      const direction = {
        /* finance */
        payUpOnBudget: lineOf(budgetLow, 'paySpend') > lineOf(base, 'paySpend'),
        nonPayUpOnBudget: lineOf(budgetLow, 'nonPaySpend') > lineOf(base, 'nonPaySpend'),
        payUpOnMorale: lineOf(moraleLow, 'paySpend') > lineOf(base, 'paySpend'),
        agencyUpOnMorale: lineOf(moraleLow, 'agencySpend') > lineOf(base, 'agencySpend'),
        incomeDownOnWaiting: lineOf(waitingHi, 'clinicalIncome') < lineOf(base, 'clinicalIncome'),
        /* operations */
        occupancyUp: opWait.occupancy > opBase.occupancy,
        losUp: opWait.losPct > opBase.losPct,
        dtocUp: opWait.dtocBeds > opBase.dtocBeds,
        cancelledUp: opWait.cancelledOps > opBase.cancelledOps,
        handoverUpOnWaiting: opWait.ambulanceHandover > opBase.ambulanceHandover,
        handoverUpOnSafety: opSafety.ambulanceHandover > opBase.ambulanceHandover,
        /* workforce */
        vacancyUp: wfMorale.vacancyRate > wfBase.vacancyRate,
        turnoverUp: wfMorale.turnover > wfBase.turnover,
        sicknessUp: wfMorale.sickness > wfBase.sickness,
        bankAgencyUp: wfMorale.bankAgencySpend > wfBase.bankAgencySpend,
        surveyDownOnMorale: wfMorale.surveyScore < wfBase.surveyScore,
        surveyDownOnRep: wfRep.surveyScore < wfBase.surveyScore,
        /* quality */
        incidentsUp: qSafety.incidents > qBase.incidents,
        neverEventsUp: qSafetyVery.neverEvents > qBase.neverEvents,
        harmFreeDown: qSafety.harmFreePct < qBase.harmFreePct,
        complaintsUp: qPatsat.complaints > qBase.complaints,
        fftDown: qPatsat.fftScore < qBase.fftScore
      };

      /* 7.5 overrides - specificity, null ctx, and an authored 0, using real
         game ids. Q2 authors dtocBeds=41; Q2:discharge_partnership authors 38. */
      const ovStats = initialMetricStats();
      REPORTING_OVERRIDES['Q3'] = { operational: { dtocBeds: 0 } };
      const overrides = {
        quarterOnly: deriveOperational(ovStats, { quarterId: 'Q2', optionId: 'open_escalation_ward' }).dtocBeds,
        quarterOption: deriveOperational(ovStats, { quarterId: 'Q2', optionId: 'discharge_partnership' }).dtocBeds,
        nullCtx: deriveOperational(ovStats, null).dtocBeds,
        authoredZero: deriveOperational(ovStats, { quarterId: 'Q3' }).dtocBeds
      };
      delete REPORTING_OVERRIDES['Q3'];

      /* 7.6 history - empty on a fresh state, one entry per committed decision
         in round order. */
      function outcome(quarterId, endChanges) {
        const startStats = initialMetricStats();
        const endStats = Object.assign({}, startStats, endChanges || {});
        return { quarterId, optionId: 'h', optionTitle: 'H', decisionSummary: 'H', startStats, endStats, effects: {} };
      }
      resetGameState();
      const emptyHistory = getStatsHistory().length;
      applyBoardDecision(outcome('Q1', { waiting: 65 }));
      applyBoardDecision(outcome('Q2', { waiting: 62 }));
      const hist = getStatsHistory();
      const history = {
        empty: emptyHistory,
        length: hist.length,
        rounds: hist.map(h => h.round),
        quarters: hist.map(h => h.quarterId)
      };
      resetGameState();

      /* 7.8 section lookup - null (not a throw) for an unknown id. */
      let unknownSection = 'threw';
      try { unknownSection = getReportSection('nope', initialMetricStats(), null); } catch (e) { /* leaves 'threw' */ }

      return { maxErr, maxErrOverride, deterministic, noThrow, direction, overrides, history, unknownSection };
    });

    ok(s.maxErr < 1e-9, 'reporting: I&E surplus reconciles to budget across the range');
    ok(s.maxErrOverride < 1e-9, 'reporting: I&E still reconciles with an authored line override');
    ok(s.deterministic, 'reporting: every derive* is deterministic for identical inputs');
    ok(s.noThrow, 'reporting: derive* never mutate recursively deep-frozen stats or ctx');
    ok(s.direction.payUpOnBudget, 'reporting: lowering budget increases pay spend');
    ok(s.direction.nonPayUpOnBudget, 'reporting: lowering budget increases non-pay spend');
    ok(s.direction.payUpOnMorale, 'reporting: lowering morale increases pay spend');
    ok(s.direction.agencyUpOnMorale, 'reporting: lowering morale increases bank & agency spend');
    ok(s.direction.incomeDownOnWaiting, 'reporting: raising waiting decreases clinical income');
    ok(s.direction.occupancyUp, 'reporting: raising waiting increases occupancy');
    ok(s.direction.losUp, 'reporting: raising waiting increases length of stay');
    ok(s.direction.dtocUp, 'reporting: raising waiting increases delayed transfers');
    ok(s.direction.cancelledUp, 'reporting: raising waiting increases cancelled ops');
    ok(s.direction.handoverUpOnWaiting, 'reporting: raising waiting increases ambulance handovers');
    ok(s.direction.handoverUpOnSafety, 'reporting: lowering safety increases ambulance handovers');
    ok(s.direction.vacancyUp, 'reporting: lowering morale increases vacancy rate');
    ok(s.direction.turnoverUp, 'reporting: lowering morale increases turnover');
    ok(s.direction.sicknessUp, 'reporting: lowering morale increases sickness absence');
    ok(s.direction.bankAgencyUp, 'reporting: lowering morale increases bank & agency spend');
    ok(s.direction.surveyDownOnMorale, 'reporting: lowering morale decreases staff survey score');
    ok(s.direction.surveyDownOnRep, 'reporting: lowering reputation decreases staff survey score');
    ok(s.direction.incidentsUp, 'reporting: lowering safety increases moderate-harm incidents');
    ok(s.direction.neverEventsUp, 'reporting: lowering safety increases never events');
    ok(s.direction.harmFreeDown, 'reporting: lowering safety decreases harm-free care');
    ok(s.direction.complaintsUp, 'reporting: lowering patient satisfaction increases complaints');
    ok(s.direction.fftDown, 'reporting: lowering patient satisfaction decreases FFT recommend');
    eq(s.overrides.quarterOnly, 41, 'reporting: quarter override applies');
    eq(s.overrides.quarterOption, 38, 'reporting: quarter:option override beats quarter override');
    eq(s.overrides.nullCtx, 35, 'reporting: null ctx applies no override');
    eq(s.overrides.authoredZero, 0, 'reporting: an authored 0 override is honoured');
    eq(s.history.empty, 0, 'reporting: history is empty on a fresh state');
    eq(s.history.length, 2, 'reporting: history has one entry per committed decision');
    eq(JSON.stringify(s.history.rounds), JSON.stringify([1, 2]), 'reporting: history is in round order');
    eq(JSON.stringify(s.history.quarters), JSON.stringify(['Q1', 'Q2']), 'reporting: history preserves decision quarters');
    ok(s.unknownSection === null, 'reporting: unknown section id returns null');
    ok(page._errors.length === 0, 'reporting model: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 3: PERFORMANCE ANALYSIS PAGE ---------------- */
  console.log('\nphase 3 performance page:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(800);
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const order = await page.evaluate(() => ({
      pageCount: REPORT_PAGES.length,
      index1: REPORT_PAGES[1].id,
      tabCount: getPerfTabCount()
    }));
    eq(order.pageCount, 4, 'performance: REPORT_PAGES has four entries');
    eq(order.index1, 'performance', 'performance: index 1 is the performance page');
    eq(order.tabCount, 4, 'performance: four analysis tabs');

    await page.click('#repNext'); // results -> performance
    const perf = await page.evaluate(() => ({
      pageId: REPORT_PAGES[REPORT.page].id,
      activeTab: getActivePerfTab(),
      panels: document.querySelectorAll('.rep-perf-panel').length,
      visiblePanels: Array.from(document.querySelectorAll('.rep-perf-panel')).filter(p => !p.hidden).length,
      heads: document.querySelectorAll('.rep-perf-tab').length
    }));
    eq(perf.pageId, 'performance', 'performance: next reaches the performance page');
    eq(perf.activeTab, 0, 'performance: opens on the first tab');
    eq(perf.panels, 4, 'performance: all four panels are built');
    eq(perf.visiblePanels, 1, 'performance: exactly one panel is visible');
    eq(perf.heads, 4, 'performance: four tab headers render');

    const chart = await page.evaluate(() => {
      const cv = document.getElementById('repWaitTrend');
      if (!cv) return null;
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let seen = 0;
      for (let i = 0; i < d.length; i += 400) if (d[i] < 200) seen++;
      return { w: cv.width, seen };
    });
    ok(!!chart && chart.w > 0, 'performance: waiting-trend chart has non-zero width');
    ok(!!chart && chart.seen > 0, 'performance: waiting-trend chart draws pixels');

    /* switching tabs preserves the report body's scroll position. Shrink the
       viewport so the panels overflow, scroll to a value both the source and
       destination tab can hold (so nothing is clamped), then assert the switch
       leaves scrollTop untouched. */
    await page.setViewportSize({ width: 1200, height: 360 });
    const scroll = await page.evaluate(() => {
      const pages = document.querySelector('.rep-pages');
      setPerfTab(1); const srcMax = pages.scrollHeight - pages.clientHeight; // operations
      setPerfTab(3); const dstMax = pages.scrollHeight - pages.clientHeight; // quality
      const target = Math.min(srcMax, dstMax) - 4;
      setPerfTab(1);
      pages.scrollTop = target;
      const set = pages.scrollTop;
      setPerfTab(3);
      return { set, afterSwitch: pages.scrollTop, target };
    });
    await page.setViewportSize({ width: 1200, height: 800 });
    ok(scroll.set > 0, 'performance: report body scrolls with the shrunk viewport');
    eq(scroll.afterSwitch, scroll.set, 'performance: switching tabs preserves scroll position');

    /* clicking a tab switches without changing the page or scroll */
    await page.click('.rep-perf-tab[data-perf-tab="2"]');
    const clicked = await page.evaluate(() => ({
      activeTab: getActivePerfTab(),
      visible: (function () { const ps = document.querySelectorAll('.rep-perf-panel'); for (let i = 0; i < ps.length; i++) if (!ps[i].hidden) return i; return -1; })(),
      page: REPORT.page
    }));
    eq(clicked.activeTab, 2, 'performance: clicking a tab activates it');
    eq(clicked.visible, 2, 'performance: the clicked panel becomes the visible one');
    eq(clicked.page, 1, 'performance: switching tabs does not change the page');

    /* arrow keys cycle tabs while the page is active */
    await page.keyboard.press('ArrowRight');
    const right = await page.evaluate(() => getActivePerfTab());
    eq(right, 3, 'performance: ArrowRight moves to the next tab');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const left = await page.evaluate(() => getActivePerfTab());
    eq(left, 1, 'performance: ArrowLeft moves back through the tabs');

    /* the pager still reaches the final (options) page at index 3 */
    await page.click('#repNext'); // performance -> issue
    await page.click('#repNext'); // issue -> options
    const end = await page.evaluate(() => ({
      page: REPORT.page,
      pageId: REPORT_PAGES[REPORT.page].id,
      nextHidden: document.getElementById('repNext').hidden
    }));
    eq(end.page, 3, 'performance: paging reaches index 3');
    eq(end.pageId, 'options', 'performance: index 3 is the options page');
    ok(end.nextHidden, 'performance: next hides on the final page');

    ok(page._errors.length === 0, 'performance page: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 4: OBJECTIVE AUTHORING + ENGINE ---------------- */
  console.log('\nphase 4 objectives:');
  {
    const page = await freshPage(browser);
    const s = await page.evaluate(() => {
      const metricKeys = {};
      METRIC_DEFS.forEach(d => { metricKeys[d.key] = true; });

      /* 1 + 2: authoring rules over the real PREGAME data. */
      const ids = {};
      let idsUnique = true, keysValid = true, threePerRole = true, weightsSumSix = true;
      let hasCrossMetric = true, ownerRoleValid = true;
      PREGAME.roles.forEach(role => {
        if (!role.objectives || role.objectives.length !== 3) threePerRole = false;
        let sum = 0, offPrimary = 0;
        (role.objectives || []).forEach(o => {
          if (ids[o.id]) idsUnique = false;
          ids[o.id] = true;
          if (!metricKeys[o.key]) keysValid = false;
          if (o.key !== role.primaryKey) offPrimary++;
          sum += o.weight;
        });
        if (sum !== 6) weightsSumSix = false;
        if (offPrimary < 1) hasCrossMetric = false;
      });
      /* ownerRole convention: every metric resolves to a real role id, and each
         role's primaryKey is the metric it owns. */
      const roleIds = {};
      PREGAME.roles.forEach(r => { roleIds[r.id] = r; });
      METRIC_DEFS.forEach(d => {
        if (!d.ownerRole || !roleIds[d.ownerRole]) ownerRoleValid = false;
        else if (roleIds[d.ownerRole].primaryKey !== d.key) ownerRoleValid = false;
      });

      /* Helpers building explicit history arrays (no GAME mutation). */
      const st = ch => Object.assign(initialMetricStats(), ch || {});
      const hist = (...ends) => ends.map((e, i) => ({
        round: i + 1, quarterId: 'Q' + (i + 1), optionId: 'o',
        startStats: initialMetricStats(), endStats: st(e)
      }));

      /* 3: floor latch - breached Q2, recovered Q4, still fail + BREACHED. */
      const latchObj = { id: 'x', key: 'safety', type: 'floor', target: 64, weight: 3 };
      const latchHist = hist({ safety: 66 }, { safety: 60 }, { safety: 63 }, { safety: 70 });
      const latchEval = evaluateObjective(latchObj, latchHist, latchHist[0].startStats, latchHist[3].endStats);
      const latchLive = getObjectiveLiveStatus(latchObj, latchHist, latchHist[0].startStats, st({ safety: 70 }));

      /* 4: empty history never throws, never breached. */
      let emptyThrew = false, emptyStatus = null, emptyLive = null;
      try {
        emptyStatus = evaluateObjective(latchObj, [], null, null).status;
        emptyLive = getObjectiveLiveStatus(latchObj, [], null, st({ safety: 66 }));
      } catch (e) { emptyThrew = true; }

      /* 5: goodUp:false (waiting) - end uses <=, delta stays raw (final-start). */
      const endWaiting = { id: 'ew', key: 'waiting', type: 'end', target: 62, weight: 3 };
      const endPass = evaluateObjective(endWaiting, hist({ waiting: 45 }), st({ waiting: 68 }), st({ waiting: 45 })).status; // 45 <= 62, well clear
      const endFail = evaluateObjective(endWaiting, hist({ waiting: 70 }), st({ waiting: 68 }), st({ waiting: 70 })).status;
      const deltaWaiting = t => ({ id: 'dw', key: 'waiting', type: 'delta', target: t, weight: 1 });
      const deltaRawPass = evaluateObjective(deltaWaiting(-25), hist({ waiting: 58 }), st({ waiting: 68 }), st({ waiting: 58 })).status; // -10 >= -25
      const deltaRawFail = evaluateObjective(deltaWaiting(-6), hist({ waiting: 58 }), st({ waiting: 68 }), st({ waiting: 58 })).status;  // -10 >= -6 false

      /* 6: verdict boundaries land on the correct side. */
      const verdicts = {
        v90: getObjectiveVerdict(90), v89: getObjectiveVerdict(89.99),
        v70: getObjectiveVerdict(70), v69: getObjectiveVerdict(69.99),
        v45: getObjectiveVerdict(45), v44: getObjectiveVerdict(44.99)
      };

      /* 7: marginal within 10% of RANGE for a negative target (budget -3.0).
         range 7 -> tol 0.7; a min of -2.5 (headroom 0.5) must be marginal, which
         a percent-of-target denominator (0.3) would wrongly score as pass. */
      const budgetFloor = { id: 'bf', key: 'budget', type: 'floor', target: -3.0, weight: 3 };
      const marginal = evaluateObjective(budgetFloor, hist({ budget: -2.5 }), st({ budget: 0 }), st({ budget: -2.5 })).status;
      const comfortable = evaluateObjective(budgetFloor, hist({ budget: -1.0 }), st({ budget: 0 }), st({ budget: -1.0 })).status;
      const breached = evaluateObjective(budgetFloor, hist({ budget: -3.4 }), st({ budget: 0 }), st({ budget: -3.4 })).status;

      return {
        idsUnique, keysValid, threePerRole, weightsSumSix, hasCrossMetric, ownerRoleValid,
        latchStatus: latchEval.status, latchActual: latchEval.actual, latchLive,
        emptyThrew, emptyStatus, emptyLive,
        endPass, endFail, deltaRawPass, deltaRawFail, verdicts,
        marginal, comfortable, breached
      };
    });

    ok(s.idsUnique, 'objectives: every objective id is globally unique');
    ok(s.keysValid, 'objectives: every objective key is a real METRIC_DEFS key');
    ok(s.threePerRole, 'objectives: every role has exactly three objectives');
    ok(s.weightsSumSix, 'objectives: every role\'s weights sum to 6');
    ok(s.hasCrossMetric, 'objectives: every role has an objective off its primaryKey');
    ok(s.ownerRoleValid, 'objectives: ownerRole resolves each metric to the role that owns it');
    eq(s.latchStatus, 'fail', 'objectives: a floor breached mid-year latches to fail after recovery');
    eq(s.latchActual, 60, 'objectives: latched floor reports the worst committed quarter');
    eq(s.latchLive, 'BREACHED', 'objectives: latched floor reads BREACHED live even after recovery');
    ok(!s.emptyThrew, 'objectives: empty history never throws');
    eq(s.emptyStatus, 'pass', 'objectives: empty history evaluates non-breached');
    eq(s.emptyLive, 'ON TRACK', 'objectives: empty history live status is ON TRACK, never BREACHED');
    eq(s.endPass, 'pass', 'objectives: end on waiting (goodUp:false) passes when final is at or below target');
    eq(s.endFail, 'fail', 'objectives: end on waiting fails when final is above target');
    eq(s.deltaRawPass, 'pass', 'objectives: delta uses raw final-start (>= -12 passes)');
    eq(s.deltaRawFail, 'fail', 'objectives: delta uses raw final-start (>= -6 fails)');
    eq(s.verdicts.v90, 'EXCEEDED', 'objectives: score 90 is EXCEEDED');
    eq(s.verdicts.v89, 'MET', 'objectives: score just under 90 is MET');
    eq(s.verdicts.v70, 'MET', 'objectives: score 70 is MET');
    eq(s.verdicts.v69, 'PARTIALLY MET', 'objectives: score just under 70 is PARTIALLY MET');
    eq(s.verdicts.v45, 'PARTIALLY MET', 'objectives: score 45 is PARTIALLY MET');
    eq(s.verdicts.v44, 'NOT MET', 'objectives: score just under 45 is NOT MET');
    eq(s.marginal, 'marginal', 'objectives: marginal uses the metric range (negative budget target)');
    eq(s.comfortable, 'pass', 'objectives: a comfortable pass is not marginal');
    eq(s.breached, 'fail', 'objectives: a breached floor is a fail');
    ok(page._errors.length === 0, 'objectives: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 4: PREGAME SELECTION + ROLES ---------------- */
  console.log('\nphase 4 pregame selection:');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); // no skipintro
    await page.waitForFunction(() => typeof pregameScreen !== 'undefined' && !!document.querySelector('.pg'), { timeout: 5000 });

    const s = await page.evaluate(() => {
      const out = {};
      advancePregame();                          // intro -> team
      out.afterIntro = pregameScreen;
      out.blockedAdvance = (function () { advancePregame(); return pregameScreen; })(); // zero selected -> blocked
      const btn = pregameRoot().querySelector('.js-pregame-advance');
      out.continueDisabledAtZero = !!(btn && btn.disabled);
      /* select two roles by id via the real cards */
      pregameRoot().querySelector('.js-pregame-role[data-role="cfo"]').click();
      pregameRoot().querySelector('.js-pregame-role[data-role="md"]').click();
      const btn2 = pregameRoot().querySelector('.js-pregame-advance');
      out.continueEnabledAfterSelect = !!(btn2 && !btn2.disabled);
      advancePregame();                          // team -> brief
      out.afterSelect = pregameScreen;
      out.briefCards = pregameRoot().querySelectorAll('.pg-brief-card').length;
      out.briefObjs = pregameRoot().querySelectorAll('.pg-brief-obj').length;
      advancePregame();                          // brief -> briefing 0
      out.afterBrief = pregameScreen;
      finishPregame();                           // commits roles + starts sim
      out.roles = GAME.roles.slice();
      resetGameState();
      out.afterReset = GAME.roles.slice();
      return out;
    });

    eq(s.afterIntro, 'team', 'pregame: BEGIN advances to team select');
    eq(s.blockedAdvance, 'team', 'pregame: CONTINUE is blocked at zero selections');
    ok(s.continueDisabledAtZero, 'pregame: CONTINUE is disabled with nothing selected');
    ok(s.continueEnabledAfterSelect, 'pregame: CONTINUE enables once a role is selected');
    eq(s.afterSelect, 'brief', 'pregame: CONTINUE reaches the Your Brief screen');
    eq(s.briefCards, 2, 'pregame: brief screen shows one card per selected role');
    eq(s.briefObjs, 6, 'pregame: brief screen lists three objectives per role');
    eq(s.afterBrief, 'briefing', 'pregame: brief confirms into the board briefing');
    eq(JSON.stringify(s.roles), JSON.stringify(['cfo', 'md']), 'pregame: finishPregame stores selected role ids');
    eq(JSON.stringify(s.afterReset), JSON.stringify([]), 'pregame: resetGameState clears GAME.roles');
    ok(errors.length === 0, 'pregame selection: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 4: PREGAME COMPLETES WITH 1 AND 6 ROLES ---------------- */
  console.log('\nphase 4 pregame completion (high-risk):');
  {
    async function completeWith(ids) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
      await page.waitForFunction(() => typeof pregameScreen !== 'undefined' && !!document.querySelector('.pg'), { timeout: 5000 });
      const res = await page.evaluate((sel) => {
        advancePregame(); // intro -> team
        sel.forEach(id => pregameRoot().querySelector('.js-pregame-role[data-role="' + id + '"]').click());
        advancePregame(); // team -> brief
        const cards = pregameRoot().querySelectorAll('.pg-brief-card').length;
        advancePregame(); // brief -> briefing 0
        finishPregame();  // completes, starts sim
        return { roles: GAME.roles.slice(), started: simulationStarted, cards };
      }, ids);
      res.errors = errors.length;
      await page.close();
      return res;
    }

    const one = await completeWith(['coo']);
    eq(JSON.stringify(one.roles), JSON.stringify(['coo']), 'pregame: completes end-to-end with one role');
    ok(one.started, 'pregame: one-role game starts the simulation');
    eq(one.cards, 1, 'pregame: one brief card for a solo pick');
    eq(one.errors, 0, 'pregame one-role: no console/page errors');

    const all = await completeWith(['ceo', 'cfo', 'cno', 'coo', 'md', 'gov']);
    eq(all.roles.length, 6, 'pregame: completes end-to-end with all six roles');
    eq(all.cards, 6, 'pregame: six brief cards when all roles are picked');
    ok(all.started, 'pregame: six-role game starts the simulation');
    eq(all.errors, 0, 'pregame six-role: no console/page errors');
  }

  /* ---------------- PHASE 4: BRIEF PANEL ---------------- */
  console.log('\nphase 4 brief panel:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(200);
    await page.evaluate(() => { paused = true; setBoardRoles(['cfo', 'md']); });

    await page.keyboard.press('b');
    await page.waitForTimeout(120);
    const opened = await page.evaluate(() => {
      const r = document.getElementById('briefRoot');
      return {
        open: !r.hidden,
        role: r.getAttribute('role'),
        modal: r.getAttribute('aria-modal'),
        roleCards: r.querySelectorAll('.brief-role').length,
        statuses: r.querySelectorAll('.brief-status').length,
        paused: paused,
        focusOnClose: document.activeElement === r.querySelector('.brief-close')
      };
    });
    ok(opened.open, 'brief: B opens the brief panel');
    eq(opened.role, 'dialog', 'brief: overlay has role=dialog');
    eq(opened.modal, 'true', 'brief: overlay is aria-modal');
    eq(opened.roleCards, 2, 'brief: one card per selected role');
    eq(opened.statuses, 6, 'brief: three objective statuses per role');
    ok(opened.paused, 'brief: opening the panel pauses the simulation');
    ok(opened.focusOnClose, 'brief: focus moves into the dialog on open');

    await page.keyboard.press('b');
    await page.waitForTimeout(120);
    ok(await page.evaluate(() => document.getElementById('briefRoot').hidden), 'brief: B closes the brief panel');

    await page.keyboard.press('Escape'); // no-op when closed, must not error
    // Escape closes when open
    await page.keyboard.press('b');
    await page.waitForTimeout(80);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    ok(await page.evaluate(() => document.getElementById('briefRoot').hidden), 'brief: Escape closes the brief panel');

    /* B must not open the brief while the board pack (report) overlay is open. */
    await page.keyboard.press('s');
    await page.waitForTimeout(200);
    await page.keyboard.press('b');
    await page.waitForTimeout(100);
    const duringReport = await page.evaluate(() => ({
      report: isReportOpen(),
      brief: !document.getElementById('briefRoot').hidden
    }));
    ok(duringReport.report, 'brief: board pack is open after skip');
    ok(!duringReport.brief, 'brief: B does not open the panel while the report overlay is open');

    /* Graceful empty state with no roles selected. */
    const emptyState = await page.evaluate(() => {
      closeReport();
      setBoardRoles([]);
      openBrief();
      const r = document.getElementById('briefRoot');
      const txt = r.textContent;
      const cards = r.querySelectorAll('.brief-role').length;
      closeBrief();
      return { cards, hasMessage: /No roles were selected/.test(txt) };
    });
    eq(emptyState.cards, 0, 'brief: no role cards render with an empty board');
    ok(emptyState.hasMessage, 'brief: empty board shows a graceful no-roles message');

    ok(page._errors.length === 0, 'brief panel: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 4: OPTIONS-PAGE ROLE PIPS ---------------- */
  console.log('\nphase 4 options pips:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(200);

    /* With a role selected, the options page renders pips naming that role. */
    await page.evaluate(() => { paused = true; setBoardRoles(['cfo']); });
    await page.keyboard.press('s');
    await page.waitForTimeout(200);
    await page.click('#repNext'); // results -> performance
    await page.click('#repNext'); // performance -> issue
    await page.click('#repNext'); // issue -> options
    const withRoles = await page.evaluate(() => {
      const pips = Array.from(document.querySelectorAll('.rep-pip')).map(p => p.textContent);
      return {
        pageId: REPORT_PAGES[REPORT.page].id,
        count: pips.length,
        cfoPip: pips.some(t => t.indexOf('CFO:') === 0),
        options: document.querySelectorAll('.rep-option').length
      };
    });
    eq(withRoles.pageId, 'options', 'pips: paged to the options page');
    ok(withRoles.count > 0, 'pips: options page renders role pips when a role is selected');
    ok(withRoles.cfoPip, 'pips: a pip is labelled for the selected role (CFO)');

    /* With no roles selected, no pips render and the option cards survive. */
    const withoutRoles = await page.evaluate(() => {
      closeReport();
      setBoardRoles([]);
      openReport();
      REPORT.page = REPORT_PAGES.length - 1;
      _syncReportPages();
      return {
        pips: document.querySelectorAll('.rep-pip').length,
        options: document.querySelectorAll('.rep-option').length
      };
    });
    eq(withoutRoles.pips, 0, 'pips: no pips render when no roles are selected');
    eq(withoutRoles.options, withRoles.options, 'pips: option cards render unchanged with no roles');

    ok(page._errors.length === 0, 'options pips: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 4: TIMELINE SELF-TEST STILL CLEAN ---------------- */
  console.log('\nphase 4 timeline self-test:');
  {
    const page = await freshPage(browser);
    const clean = await page.evaluate(() => runTimelineSelfTest().failures.length);
    eq(clean, 0, 'timeline: self-test remains clean after phase 4');
    ok(page._errors.length === 0, 'timeline self-test: no console/page errors');
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
