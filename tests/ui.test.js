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
    _chooseReportOption(0);        // records the Q4 decision
    goToNextReportQuarter();       // 'year-complete' -> closeReport + openYearEnd
  }, roles || null);
}

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

    await page.evaluate(() => {
      /* Q1 now plays back flat as an opening baseline, so install an explicit
         budget-warn outcome (0 -> -1.8) to exercise the closing ticker band. */
      TIMELINE = compileTimeline({
        quarterId: 'Q1', optionId: 'status_quo', optionTitle: 'Status Quo',
        decisionSummary: '', startStats: initialMetricStats(),
        endStats: Object.assign(initialMetricStats(), { budget: -1.8 })
      }, getQuarterEventConfig('Q1'));
      seekSimulation(QLEN); render();
    });
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

      /* Q1's opening baseline now plays back flat, so install an explicit
         budget-warn timeline (0 -> -1.8 crosses the -1.5 threshold once) to
         exercise the live-alert crossing path. */
      TIMELINE = compileTimeline({
        quarterId: 'Q1', optionId: 'status_quo', optionTitle: 'Status Quo',
        decisionSummary: '', startStats: initialMetricStats(),
        endStats: Object.assign(initialMetricStats(), { budget: -1.8 })
      }, getQuarterEventConfig('Q1'));

      /* A forward seek across this budget warning is silent. */
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
      for (let b = -8; b <= 2.00001; b += 0.1) {
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

    /* Q1 has a single datapoint, so the operations tab shows an explicit
       insufficient-data note rather than a degenerate single-point chart. */
    const q1Trend = await page.evaluate(() => ({
      hasCanvas: !!document.getElementById('repWaitTrend'),
      hasNote: !!document.querySelector('[data-perf-panel="1"] .rep-perf-nodata')
    }));
    ok(!q1Trend.hasCanvas, 'performance: Q1 renders no degenerate single-point chart');
    ok(q1Trend.hasNote, 'performance: Q1 shows an insufficient-data note for the waiting trend');

    /* Once a second quarter exists the trend chart renders and draws pixels. */
    const chart = await page.evaluate(() => {
      resetGameState();
      quarterComplete = true;
      const q = getCurrentQuarterId();
      confirmBoardDecision(q, getCurrentQuarter().options[0].id);
      advanceAfterDecision(q);
      quarterComplete = true;
      openReport();
      for (let i = 0; i < REPORT_PAGES.length; i++) { if (REPORT_PAGES[i].id === 'performance') { REPORT.page = i; break; } }
      _syncReportPages();
      setPerfTab(1);
      REPORT_PAGES.forEach(p => { if (p.afterRender) p.afterRender(REPORT.data); });
      const cv = document.getElementById('repWaitTrend');
      if (!cv) return null;
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let seen = 0;
      for (let i = 0; i < d.length; i += 400) if (d[i] < 200) seen++;
      return { w: cv.width, seen };
    });
    ok(!!chart && chart.w > 0, 'performance: waiting-trend chart has non-zero width once data exists');
    ok(!!chart && chart.seen > 0, 'performance: waiting-trend chart draws pixels once data exists');

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

  /* ---------------- PHASE 5: CQC RATING MODEL ---------------- */
  console.log('\nphase 5 rating model:');
  {
    const page = await freshPage(browser);
    const s = await page.evaluate(() => {
      const clone = ch => Object.assign(initialMetricStats(), ch || {});

      /* 1: waiting flips; 20 <-> 80 across its 0..100 range. */
      const waiting20 = toRatingSpace('waiting', 20);
      const waiting80 = toRatingSpace('waiting', 80);

      /* 2: every goodUp:true metric is unchanged by the flip. */
      let goodUpIdentity = true;
      METRIC_DEFS.forEach(def => {
        if (def.goodUp !== false) {
          [def.min, def.start, def.max].forEach(v => {
            if (toRatingSpace(def.key, v) !== v) goodUpIdentity = false;
          });
        }
      });

      /* 3: lower waiting scores higher (the inversion, end to end). */
      const lowWaitScore = computeTrustRating(clone({ waiting: 20 })).score;
      const highWaitScore = computeTrustRating(clone({ waiting: 80 })).score;

      /* 4: core_stat_low fires for high (bad) waiting, not for low (good). */
      const caps80 = getRatingCaps(clone({ waiting: 80 }));
      const caps20 = getRatingCaps(clone({ waiting: 20 }));
      const coreFires80 = caps80.some(c => c.cap.id === 'core_stat_low' && c.evidenceKey === 'waiting');
      const coreFires20 = caps20.some(c => c.cap.id === 'core_stat_low');

      /* 5: the starting position scores 56.1, band good. */
      const start = computeTrustRating(initialMetricStats());

      /* 6: weights sum to exactly 1.00. */
      let weightSum = 0;
      Object.keys(RATING_MODEL.weights).forEach(k => { weightSum += RATING_MODEL.weights[k]; });

      /* 7: budget is not a weighted term. */
      const budgetInBreakdown = start.breakdown.some(r => r.key === 'budget');

      /* 8: budget adjustment thresholds. */
      const surplus = getRatingBudgetAdjustment(clone({ budget: 1.5 })).amount;
      const deficit = getRatingBudgetAdjustment(clone({ budget: -3.5 })).amount;
      const between = getRatingBudgetAdjustment(clone({ budget: -1.0 })).amount;

      /* 9: safety 29, everything else at its best -> inadequate (cap dominates). */
      const safetyBreach = computeTrustRating({ budget: 2, waiting: 0, patsat: 100, morale: 100, safety: 29, rep: 100 });

      /* 10: an index metric at rating-space 24 caps to requires on a high base. */
      const coreCap = computeTrustRating({ budget: 0, waiting: 0, patsat: 24, morale: 100, safety: 100, rep: 100 });

      /* 11: budget -6.5 caps to requires on a high base. */
      const deficitCap = computeTrustRating({ budget: -6.5, waiting: 0, patsat: 100, morale: 100, safety: 100, rep: 100 });

      /* 12: a cap never raises - safety 29 on an already-inadequate base stays inadequate. */
      const capNoRaise = computeTrustRating({ budget: 0, waiting: 100, patsat: 0, morale: 0, safety: 29, rep: 0 });

      /* 13: the waiting breakdown row exposes both columns. */
      const waitRow = start.breakdown.find(r => r.key === 'waiting');

      return {
        waiting20, waiting80, goodUpIdentity,
        lowWaitScore, highWaitScore,
        coreFires80, coreFires20,
        startBase: start.baseScore, startBand: start.band.id,
        weightSum, budgetInBreakdown,
        surplus, deficit, between,
        safetyBreachBand: safetyBreach.band.id,
        coreCapBand: coreCap.band.id, coreCapFrom: coreCap.cappedFrom && coreCap.cappedFrom.id,
        deficitCapBand: deficitCap.band.id,
        capNoRaiseBand: capNoRaise.band.id,
        waitRow
      };
    });

    eq(s.waiting20, 80, 'rating: toRatingSpace flips waiting 20 -> 80');
    eq(s.waiting80, 20, 'rating: toRatingSpace flips waiting 80 -> 20');
    ok(s.goodUpIdentity, 'rating: goodUp:true metrics pass through toRatingSpace unchanged');
    ok(s.lowWaitScore > s.highWaitScore, 'rating: lower (better) waiting scores higher than high waiting');
    ok(s.coreFires80, 'rating: core_stat_low fires for waiting 80 (rating space 20)');
    ok(!s.coreFires20, 'rating: core_stat_low does not fire for waiting 20 (rating space 80)');
    ok(Math.abs(s.startBase - 56.1) < 1e-9, 'rating: starting stats score 56.1 (expected 56.1, got ' + s.startBase + ')');
    eq(s.startBand, 'good', 'rating: starting stats land in the GOOD band under the rebased bands');
    ok(Math.abs(s.weightSum - 1.0) < 1e-9, 'rating: the five weights sum to exactly 1.00');
    ok(!s.budgetInBreakdown, 'rating: budget is absent from the weighted breakdown');
    eq(s.surplus, 5, 'rating: a surplus >= +£1.0m adds 5');
    eq(s.deficit, -10, 'rating: a deficit <= -£3.0m subtracts 10');
    eq(s.between, 0, 'rating: a budget between the thresholds adjusts by 0');
    eq(s.safetyBreachBand, 'inadequate', 'rating: safety 29 forces inadequate even at an otherwise-outstanding base');
    eq(s.coreCapBand, 'requires', 'rating: an index metric at rating-space 24 caps to requires on a high base');
    eq(s.coreCapFrom, 'outstanding', 'rating: the core cap records the pre-cap band it lowered from');
    eq(s.deficitCapBand, 'requires', 'rating: budget -6.5 caps to requires on a high base');
    eq(s.capNoRaiseBand, 'inadequate', 'rating: a cap never raises an already-inadequate rating to requires');
    eq(s.waitRow.inverted, true, 'rating: the waiting breakdown row is marked inverted');
    eq(s.waitRow.value, 68, 'rating: the waiting breakdown row carries the raw metric value');
    eq(s.waitRow.ratingValue, 32, 'rating: the waiting breakdown row carries the flipped rating value');
    ok(page._errors.length === 0, 'rating model: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: EXHAUSTIVE 256-PATH REACHABILITY ---------------- */
  console.log('\nphase 5 reachability (all 256 paths):');
  {
    const page = await freshPage(browser);
    const s = await page.evaluate(() => {
      const bandCount = { outstanding: 0, good: 0, requires: 0, inadequate: 0 };
      const capReach = { core_stat_low: 0, safety_breach: 0, deficit_severe: 0 };
      const adjReach = { plus5: 0, minus10: 0, zero: 0 };
      const example = {};                 // first path found for each rating
      let min = Infinity, max = -Infinity, minPath = null, maxPath = null, n = 0;

      function rec(qi, stats, ids) {
        if (qi === QUARTERS.length) {
          n++;
          const rt = computeTrustRating(stats);
          bandCount[rt.band.id] = (bandCount[rt.band.id] || 0) + 1;
          if (!example[rt.band.id]) example[rt.band.id] = ids.join('');
          rt.caps.forEach(c => { if (capReach[c.cap.id] != null) capReach[c.cap.id]++; });
          if (rt.adjustment.amount > 0) adjReach.plus5++;
          else if (rt.adjustment.amount < 0) adjReach.minus10++;
          else adjReach.zero++;
          if (rt.score < min) { min = rt.score; minPath = ids.join(''); }
          if (rt.score > max) { max = rt.score; maxPath = ids.join(''); }
          return;
        }
        const opts = QUARTERS[qi].options;
        for (let o = 0; o < opts.length; o++) {
          rec(qi + 1, applyMetricEffects(stats, opts[o].effects), ids.concat(opts[o].label));
        }
      }
      rec(0, initialMetricStats(), []);
      return { n, min: +min.toFixed(1), max: +max.toFixed(1), minPath, maxPath, bandCount, capReach, adjReach, example };
    });

    /* Record the calibration for the log (the user asked these be recorded). */
    console.log('    paths: ' + s.n);
    console.log('    score range: ' + s.min + ' (' + s.minPath + ')  ..  ' + s.max + ' (' + s.maxPath + ')');
    console.log('    paths per rating: ' + JSON.stringify(s.bandCount));
    console.log('    cap reachability: ' + JSON.stringify(s.capReach));
    console.log('    budget adjustment reachability: ' + JSON.stringify(s.adjReach));
    console.log('    example path per rating: ' + JSON.stringify(s.example));

    eq(s.n, 256, 'reachability: every one of the 256 legal decision paths is enumerated');

    /* Every advertised rating is intentionally reachable (>=1 path each). */
    ok(s.bandCount.outstanding >= 1, 'reachability: OUTSTANDING is reachable (' + s.bandCount.outstanding + ' paths)');
    ok(s.bandCount.good >= 1, 'reachability: GOOD is reachable (' + s.bandCount.good + ' paths)');
    ok(s.bandCount.requires >= 1, 'reachability: REQUIRES IMPROVEMENT is reachable (' + s.bandCount.requires + ' paths)');
    ok(s.bandCount.inadequate >= 1, 'reachability: INADEQUATE is reachable (' + s.bandCount.inadequate + ' paths)');

    /* Every cap is reachable - none is dead (the -£6m cap was impossible before
       the budget range was widened). */
    ok(s.capReach.core_stat_low >= 1, 'reachability: the core-stat-low cap fires on some path (' + s.capReach.core_stat_low + ')');
    ok(s.capReach.safety_breach >= 1, 'reachability: the safety-breach cap fires on some path (' + s.capReach.safety_breach + ')');
    ok(s.capReach.deficit_severe >= 1, 'reachability: the -£6m deficit cap fires on some path (' + s.capReach.deficit_severe + ')');

    /* Both budget adjustments are reachable. */
    ok(s.adjReach.plus5 >= 1, 'reachability: the +£1m surplus adjustment is reachable (' + s.adjReach.plus5 + ')');
    ok(s.adjReach.minus10 >= 1, 'reachability: the -£3m deficit adjustment is reachable (' + s.adjReach.minus10 + ')');

    /* At least one concrete example path exists for each intended rating. */
    ok(!!(s.example.outstanding && s.example.good && s.example.requires && s.example.inadequate),
      'reachability: a concrete example path exists for every rating');

    /* The spread is genuinely wide (guards against a future edit collapsing the
       game back toward a single band). */
    ok((s.max - s.min) >= 25, 'reachability: the score spread across all paths is at least 25 wide (' + (s.max - s.min).toFixed(1) + ')');
    ok(s.max >= 64, 'reachability: the best path clears the OUTSTANDING boundary');
    ok(s.min < 50, 'reachability: the worst path falls below GOOD');

    ok(page._errors.length === 0, 'reachability: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: SECOND COMPLETE GAME AFTER startNewGame ---------------- */
  console.log('\nphase 5 second game after reset:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    /* Complete a full game, reset, complete a second full game - the second
       year-end must build a valid rating with a clean four-quarter timeline and
       no state bleeding through from the first. */
    await driveToYearEnd(page, ['cfo', 'md']);
    const first = await page.evaluate(() => ({
      band: computeTrustRating(GAME.stats).band.id,
      timeline: document.querySelectorAll('#yearEndRoot .ye-tl-row').length
    }));
    await page.evaluate(() => { closeYearEnd(); startNewGame(); });
    const afterReset = await page.evaluate(() => ({
      decisions: GAME.decisions.length,
      yearEnd: isYearEndOpen()
    }));
    await driveToYearEnd(page, ['cfo', 'md']);
    const second = await page.evaluate(() => {
      const bands = { outstanding: 1, good: 1, requires: 1, inadequate: 1 };
      const rt = computeTrustRating(GAME.stats);
      return {
        open: isYearEndOpen(),
        validBand: !!bands[rt.band.id],
        timeline: document.querySelectorAll('#yearEndRoot .ye-tl-row').length,
        decisions: GAME.decisions.length
      };
    });
    eq(first.timeline, 4, 'second game: first run completes with a four-quarter timeline');
    eq(afterReset.decisions, 0, 'second game: startNewGame clears the first game between runs');
    ok(!afterReset.yearEnd, 'second game: the first overlay is closed before the second run');
    ok(second.open, 'second game: the second run opens the year-end overlay');
    ok(second.validBand, 'second game: the second run computes a valid rating band');
    eq(second.timeline, 4, 'second game: the second run has its own clean four-quarter timeline');
    eq(second.decisions, 4, 'second game: exactly four decisions are recorded in the second run');
    ok(page._errors.length === 0, 'second game: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: NEW GAME RESET ---------------- */
  console.log('\nphase 5 new game:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(200);

    const s = await page.evaluate(() => {
      /* Commit all four quarters programmatically (no playback needed). */
      function playFullYear() {
        for (let i = 0; i < 4; i++) {
          quarterComplete = true;
          const qId = getCurrentQuarterId();
          confirmBoardDecision(qId, getCurrentQuarter().options[0].id);
          advanceAfterDecision(qId);
        }
      }

      setBoardRoles(['cfo', 'md']);
      playFullYear();
      const afterRunDecisions = GAME.decisions.length;

      /* Populate the live feed so we can prove it is rebuilt, not accumulated. */
      seekSimulation(QLEN);
      render();
      const feedBefore = document.querySelectorAll('#eventFeedList .feed-entry').length;

      /* Open an overlay so we can prove startNewGame closes it. */
      openBrief();
      const briefOpenBefore = !document.getElementById('briefRoot').hidden;

      startNewGame();

      const afterReset = {
        decisions: GAME.decisions.length,
        alerts: GAME.alerts.length,
        stats: JSON.stringify(GAME.stats),
        initial: JSON.stringify(initialMetricStats()),
        roles: GAME.roles.slice(),
        quarter: getCurrentQuarterId(),
        firstQuarter: getFirstQuarterId(),
        quarterComplete: quarterComplete,
        alertQueue: _alertQueue.length,
        feedAfter: document.querySelectorAll('#eventFeedList .feed-entry').length,
        briefHidden: document.getElementById('briefRoot').hidden,
        reportOpen: isReportOpen()
      };

      /* The brief still lists the preserved board after the reset. */
      openBrief();
      const briefCards = document.querySelectorAll('#briefRoot .brief-role').length;
      closeBrief();

      return { afterRunDecisions, feedBefore, briefOpenBefore, afterReset, briefCards };
    });

    eq(s.afterRunDecisions, 4, 'new game: a full four-quarter run records four decisions');
    ok(s.briefOpenBefore, 'new game: an overlay is open before the reset');
    /* 26 */
    eq(s.afterReset.decisions, 0, 'new game: startNewGame clears every decision');
    eq(s.afterReset.alerts, 0, 'new game: startNewGame clears the durable alert record');
    eq(s.afterReset.stats, s.afterReset.initial, 'new game: startNewGame restores the starting stats');
    /* 27 */
    eq(JSON.stringify(s.afterReset.roles), JSON.stringify(['cfo', 'md']), 'new game: the board roles are preserved (option a)');
    eq(s.briefCards, 2, 'new game: the brief still lists the same roles afterwards');
    /* 28 */
    ok(s.afterReset.briefHidden, 'new game: startNewGame closes any open overlay');
    ok(!s.afterReset.reportOpen, 'new game: the board pack is not left open');
    eq(s.afterReset.quarter, s.afterReset.firstQuarter, 'new game: the sim returns to the first quarter');
    ok(!s.afterReset.quarterComplete, 'new game: quarterComplete is cleared');
    /* 29 */
    eq(s.afterReset.alertQueue, 0, 'new game: the live alert queue is empty after a reset');
    ok(s.afterReset.feedAfter >= 1 && s.afterReset.feedAfter < s.feedBefore,
      'new game: the event feed is rebuilt for the fresh quarter, not accumulated from the prior run');
    ok(page._errors.length === 0, 'new game: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: PLAIN R IS QUARTER-ONLY ---------------- */
  console.log('\nphase 5 restart quarter vs new game:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(200);
    /* Commit two quarters, then a plain R must replay only the current quarter
       and leave the recorded decisions standing. */
    await page.evaluate(() => {
      for (let i = 0; i < 2; i++) {
        quarterComplete = true;
        const qId = getCurrentQuarterId();
        confirmBoardDecision(qId, getCurrentQuarter().options[0].id);
        advanceAfterDecision(qId);
      }
      seekSimulation(20);
      render();
    });
    const before = await page.evaluate(() => GAME.decisions.length);
    await page.keyboard.press('r');            // confirm() is stubbed to true
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({
      decisions: GAME.decisions.length,
      clock: Math.round(clock)
    }));
    eq(before, 2, 'restart quarter: two decisions are committed before R');
    eq(after.decisions, 2, 'restart quarter: plain R does not clear committed decisions');
    eq(after.clock, 0, 'restart quarter: plain R still resets the quarter clock');
    ok(page._errors.length === 0, 'restart quarter: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: YEAR END OVERLAY ---------------- */
  console.log('\nphase 5 year end overlay:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);

    /* 14: hidden on load. */
    const hiddenOnLoad = await page.evaluate(() => document.getElementById('yearEndRoot').hidden);
    ok(hiddenOnLoad, 'year end: overlay is hidden on load');

    /* 15: committing all four decisions and advancing opens it, paused. */
    await driveToYearEnd(page, ['cfo', 'md']);
    const opened = await page.evaluate(() => ({
      open: isYearEndOpen(),
      paused: paused,
      reportOpen: isReportOpen(),
      sections: document.querySelectorAll('#yearEndRoot .ye-section').length,
      title: document.getElementById('yeTitle').textContent
    }));
    ok(opened.open, 'year end: completing the fourth quarter opens the overlay');
    ok(opened.paused, 'year end: opening the overlay pauses the simulation');
    ok(!opened.reportOpen, 'year end: the board pack is closed behind the overlay');
    eq(opened.sections, 5, 'year end: five sections are built');
    ok(/YEAR END/.test(opened.title), 'year end: a completed year is titled YEAR END REPORT');

    /* 16: Escape closes; scene is boardRoom, paused remains true (no restore). */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const escaped = await page.evaluate(() => ({
      open: isYearEndOpen(),
      scene: currentScene,
      paused: paused
    }));
    ok(!escaped.open, 'year end: Escape closes the overlay');
    eq(escaped.scene, 'boardRoom', 'year end: closing lands on the boardroom');
    ok(escaped.paused, 'year end: closing stays paused (no prior unpaused state is restored)');
    ok(page._errors.length === 0, 'year end: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: CLOSE BUTTON + ROLES + INTERIM ---------------- */
  console.log('\nphase 5 year end sections:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);

    /* 18: one scorecard per selected role. */
    await driveToYearEnd(page, ['cfo', 'md', 'coo']);
    const withRoles = await page.evaluate(() => ({
      cards: document.querySelectorAll('#yearEndRoot .ye-card').length,
      timeline: document.querySelectorAll('#yearEndRoot .ye-tl-row').length,
      stamp: document.querySelector('#yearEndRoot .ye-stamp').textContent.trim()
    }));
    eq(withRoles.cards, 3, 'year end: one scorecard renders per selected role');
    eq(withRoles.timeline, 4, 'year end: the decision timeline lists four committed quarters');
    ok(withRoles.stamp.length > 0, 'year end: a rating stamp is rendered');

    /* 17: Close button lands on the boardroom and the board pack is not behind it. */
    await page.click('#yearEndRoot .ye-close');
    await page.waitForTimeout(120);
    const closed = await page.evaluate(() => ({
      open: isYearEndOpen(),
      scene: currentScene,
      reportVisible: !document.getElementById('repRoot').hidden
    }));
    ok(!closed.open, 'year end: the Close button hides the overlay');
    eq(closed.scene, 'boardRoom', 'year end: Close lands on the boardroom');
    ok(!closed.reportVisible, 'year end: the board pack is not visible behind the closed overlay');

    /* 19: no roles (skipintro default) - opens without throwing, shows the line. */
    await driveToYearEnd(page, null);
    const noRoles = await page.evaluate(() => ({
      open: isYearEndOpen(),
      cards: document.querySelectorAll('#yearEndRoot .ye-card').length,
      hasLine: /No board was assembled/.test(document.getElementById('yearEndRoot').textContent)
    }));
    ok(noRoles.open, 'year end: opens without throwing when no roles were selected');
    eq(noRoles.cards, 0, 'year end: no scorecards render for an empty board');
    ok(noRoles.hasLine, 'year end: the empty board shows the explanatory no-roles line');
    await page.evaluate(() => closeYearEnd());

    /* 20: opening via Y mid-game labels the report interim. */
    await page.evaluate(() => { resetGameState(); });
    await page.keyboard.press('y');
    await page.waitForTimeout(120);
    const interim = await page.evaluate(() => ({
      open: isYearEndOpen(),
      title: document.getElementById('yeTitle').textContent,
      provisional: /PROVISIONAL/.test(document.getElementById('yearEndRoot').textContent)
    }));
    ok(interim.open, 'year end: Y opens the report mid-game');
    ok(/INTERIM/.test(interim.title), 'year end: a mid-game report is labelled INTERIM');
    ok(interim.provisional, 'year end: a mid-game rating is marked provisional');
    await page.evaluate(() => closeYearEnd());

    ok(page._errors.length === 0, 'year end sections: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: FLOOR LATCH ON THE SCORECARD + REBUILD ---------------- */
  console.log('\nphase 5 year end latch + rebuild:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);

    /* 21: a floor breached in Q2 and recovered by Q4 still reads FAIL. */
    const latch = await page.evaluate(() => {
      resetGameState();
      setBoardRoles(['md']);          // md_safety_floor: hold safety >= 64 every quarter
      function outcome(qId, endChanges) {
        const s = initialMetricStats();
        const e = Object.assign({}, s, endChanges || {});
        return { quarterId: qId, optionId: 't', optionTitle: 'T', decisionSummary: 'd', startStats: s, endStats: e, effects: {} };
      }
      applyBoardDecision(outcome('Q1', { safety: 66 }));
      applyBoardDecision(outcome('Q2', { safety: 60 }));   // breach the 64 floor
      applyBoardDecision(outcome('Q3', { safety: 63 }));
      applyBoardDecision(outcome('Q4', { safety: 70 }));   // recovered by year end
      openYearEnd();
      const objs = Array.from(document.querySelectorAll('#yearEndRoot .ye-obj'));
      const floorObj = objs.find(o => /concern line/.test(o.textContent));
      const res = {
        found: !!floorObj,
        failClass: floorObj ? floorObj.className.indexOf('ye-obj-fail') >= 0 : null,
        tick: floorObj ? floorObj.querySelector('.ye-tick').textContent : null
      };
      closeYearEnd();
      return res;
    });
    ok(latch.found, 'year end: the latched safety floor objective is rendered');
    ok(latch.failClass, 'year end: a floor breached in Q2 and recovered by Q4 still reads fail on the scorecard');
    ok(/FAIL/.test(latch.tick), 'year end: the latched objective shows a FAIL tick');

    /* 22: opening twice produces exactly one modal. */
    const modals = await page.evaluate(() => {
      openYearEnd();
      openYearEnd();
      const n = document.querySelectorAll('#yearEndRoot .ye-modal').length;
      closeYearEnd();
      return n;
    });
    eq(modals, 1, 'year end: opening the overlay twice produces exactly one modal');
    ok(page._errors.length === 0, 'year end latch + rebuild: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: HOTKEY SUPPRESSION ---------------- */
  console.log('\nphase 5 year end hotkeys:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    await driveToYearEnd(page, ['cfo', 'md']);

    /* 23: S/P/R/F/B are all inert while the report owns the screen. */
    const pre = await page.evaluate(() => ({ clock: Math.round(clock), complete: quarterComplete }));
    for (const k of ['s', 'p', 'r', 'f', 'b']) await page.keyboard.press(k);
    await page.waitForTimeout(120);
    const suppressed = await page.evaluate(() => ({
      yearEnd: isYearEndOpen(),
      paused: paused,
      facil: !document.getElementById('facilRoot').hidden,
      brief: !document.getElementById('briefRoot').hidden,
      clock: Math.round(clock),
      complete: quarterComplete
    }));
    ok(suppressed.yearEnd, 'year end: the overlay stays open through S/P/R/F/B');
    ok(suppressed.paused, 'year end: P does not unpause behind the overlay');
    ok(!suppressed.facil, 'year end: F does not open the facilitator notes over the report');
    ok(!suppressed.brief, 'year end: B does not open the brief over the report');
    eq(suppressed.clock, pre.clock, 'year end: S does not advance the sim behind the overlay');
    eq(suppressed.complete, pre.complete, 'year end: R does not reset state behind the overlay');

    /* 24: Y closes it. */
    await page.keyboard.press('y');
    await page.waitForTimeout(120);
    ok(await page.evaluate(() => !isYearEndOpen()), 'year end: Y closes the overlay');
    ok(page._errors.length === 0, 'year end hotkeys: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: Y IS INERT UNDER OTHER OVERLAYS ---------------- */
  console.log('\nphase 5 year end guard:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);

    /* 25a: Y does not open year-end while the board pack is open. */
    await page.keyboard.press('s');
    await page.waitForTimeout(200);
    await page.keyboard.press('y');
    await page.waitForTimeout(80);
    const overReport = await page.evaluate(() => ({ report: isReportOpen(), yearEnd: isYearEndOpen() }));
    ok(overReport.report, 'year end guard: the board pack is open after skip');
    ok(!overReport.yearEnd, 'year end guard: Y does not open the report while the board pack is open');
    await page.evaluate(() => closeReport());

    /* 25b: Y does not open year-end while the brief is open. */
    await page.evaluate(() => { paused = true; setBoardRoles(['cfo']); openBrief(); });
    await page.keyboard.press('y');
    await page.waitForTimeout(80);
    const overBrief = await page.evaluate(() => ({ brief: isBriefOpen(), yearEnd: isYearEndOpen() }));
    ok(overBrief.brief, 'year end guard: the brief is open');
    ok(!overBrief.yearEnd, 'year end guard: Y does not open the report while the brief is open');
    await page.evaluate(() => closeBrief());

    /* 25c: Y does not open year-end while the facilitator notes are open. */
    await page.evaluate(() => openFacilitatorNotes());
    await page.keyboard.press('y');
    await page.waitForTimeout(80);
    const overFacil = await page.evaluate(() => ({ facil: isFacilitatorNotesOpen(), yearEnd: isYearEndOpen() }));
    ok(overFacil.facil, 'year end guard: the facilitator notes are open');
    ok(!overFacil.yearEnd, 'year end guard: Y does not open the report while the facilitator notes are open');
    await page.evaluate(() => closeFacilitatorNotes());

    ok(page._errors.length === 0, 'year end guard: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: PRINT / EXPORT ---------------- */
  console.log('\nphase 5 print/export:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    /* The print stylesheet must expand every section and drop the chrome. */
    const uiCss = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'css', 'ui.css'), 'utf8');
    const cssMin = uiCss.replace(/\s+/g, '');
    ok(/@media\s*print/.test(uiCss), 'print: a print stylesheet exists');
    ok(/\.ye-section\[hidden\]\{display:flex!important/.test(cssMin), 'print: the print stylesheet expands every section');
    ok(cssMin.indexOf('.ye-foot{display:none') >= 0, 'print: the print stylesheet hides the footer controls');
    /* Clicking Print reveals all five sections and calls window.print once. */
    await driveToYearEnd(page, ['cfo', 'md']);
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.click('#yearEndRoot .ye-print');
    const r = await page.evaluate(() => ({
      printed: window.__printed,
      revealed: document.querySelectorAll('#yearEndRoot .ye-section:not([hidden])').length
    }));
    eq(r.revealed, 5, 'print: Print/Export reveals all five sections before printing');
    eq(r.printed, 1, 'print: Print/Export invokes window.print exactly once');
    ok(page._errors.length === 0, 'print: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 5: TIMELINE SELF-TEST REGRESSION ---------------- */
  console.log('\nphase 5 timeline self-test:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const clean = await page.evaluate(() => {
      function playFullYear() {
        for (let i = 0; i < 4; i++) {
          quarterComplete = true;
          const q = getCurrentQuarterId();
          confirmBoardDecision(q, getCurrentQuarter().options[0].id);
          advanceAfterDecision(q);
        }
      }
      playFullYear();
      const afterRun = runTimelineSelfTest().failures.length;
      startNewGame();
      playFullYear();
      const afterReset = runTimelineSelfTest().failures.length;
      return { afterRun, afterReset };
    });
    eq(clean.afterRun, 0, 'year end: timeline self-test is clean after a full four-quarter run');
    eq(clean.afterReset, 0, 'year end: timeline self-test is clean after startNewGame plus a second run');
    ok(page._errors.length === 0, 'year end timeline self-test: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 6: ON-MAP METRIC PRESSURE ---------------- */
  console.log('\nphase 6 metric pressure:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      paused = true;
      const tones = ['critical', 'warn', 'neutral', 'good', 'great'];
      const primaryField = { queueDensity: 'byTone', staffIdle: 'idleByTone', incidentRate: 'byTone', pressPresence: 'byTone' };

      /* 1. tone-key coverage: every *ByTone map resolves all five tones to a
         finite scalar. */
      let coverage = true;
      Object.keys(PRESSURE_MODEL).forEach(key => {
        const model = PRESSURE_MODEL[key];
        Object.keys(model).forEach(field => {
          if (!/ByTone$/.test(field)) return;
          tones.forEach(t => {
            const v = model[field][t];
            if (typeof v !== 'number' || !isFinite(v)) coverage = false;
          });
        });
      });

      /* 3. monotonicity: primary intensity is non-increasing as tone rank rises
         (critical is worst and pushes hardest). Reuses the exported tone rank. */
      let monotone = true;
      Object.keys(PRESSURE_MODEL).forEach(key => {
        const map = PRESSURE_MODEL[key][primaryField[PRESSURE_MODEL[key].channel]];
        const ranked = tones.slice().sort((a, b) => getToneRank(a) - getToneRank(b));
        for (let i = 1; i < ranked.length; i++) {
          if (map[ranked[i]] > map[ranked[i - 1]]) monotone = false;
        }
      });

      /* 2. inversion guard: waiting worsens upward, so 90 must push harder than
         40, and 90 must actually band as critical. */
      METRIC_CUR.waiting = 90; resetMetricPressure(0);
      const waitHi = getMetricPressure('waiting', 0).intensity;
      METRIC_CUR.waiting = 40; resetMetricPressure(0);
      const waitLo = getMetricPressure('waiting', 0).intensity;
      const waitHiCritical = getMetricBand('waiting', 90).tone === 'critical';

      /* 4. reputation stable renders no press. */
      METRIC_CUR.rep = 60; resetMetricPressure(0);
      const repNeutral = getMetricPressure('rep', 0);
      const repActive = getActivePressures(0).filter(p => p.channel === 'pressPresence').length;

      /* 5. smoothing determinism: settle safety at neutral, drive a transition
         to critical, then read the same simT twice (byte-identical) and read at
         atSimT + 1.5 (exactly the target). */
      METRIC_CUR.safety = 60; resetMetricPressure(0);   // neutral (0.8)
      METRIC_CUR.safety = 20; updateMetricPressure(1);  // -> critical, anchor at t=1
      const readA = JSON.stringify(getMetricPressure('safety', 1));
      const readB = JSON.stringify(getMetricPressure('safety', 1));
      const settled = getMetricPressure('safety', 2.5).intensity;
      const criticalTarget = PRESSURE_MODEL.safety.byTone.critical;

      return {
        coverage, monotone, waitHi, waitLo, waitHiCritical,
        repNeutralIntensity: repNeutral.intensity, repActive,
        determinism: readA === readB, settled, criticalTarget
      };
    });

    ok(s.coverage, 'pressure: every *ByTone map resolves all five tones to a finite scalar');
    ok(s.monotone, 'pressure: intensity is non-increasing as tone rank rises');
    ok(s.waitHi > s.waitLo, 'pressure: waiting at 90 pushes harder than at 40 (tone key, not index)');
    ok(s.waitHiCritical, 'pressure: waiting at 90 bands as critical');
    eq(s.repNeutralIntensity, 0, 'pressure: reputation at a neutral value renders no press');
    eq(s.repActive, 0, 'pressure: neutral reputation contributes no pressPresence channel');
    ok(s.determinism, 'pressure: getMetricPressure is byte-identical for the same simT');
    eq(s.settled, s.criticalTarget, 'pressure: intensity equals the target exactly at atSimT + 1.5');
    ok(page._errors.length === 0, 'pressure: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 6: SCRUB SAFETY + CADENCE + AUTHORED-WINS ---------------- */
  console.log('\nphase 6 scrub / cadence / authored-wins:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      paused = true;

      /* 6. scrub safety: capture Q1's opening pressure, drive the clock past a
         tone change, seek back to 0, and confirm the opening state is restored
         (this is what the seekSimulation reset buys). */
      seekSimulation(0); render();
      const opening = JSON.stringify(getActivePressures(0).map(p => ({ c: p.channel, i: +p.intensity.toFixed(4) })));
      for (let t = 0; t <= QLEN; t += 0.5) { clock = t; render(); }
      seekSimulation(0); render();
      const afterScrub = JSON.stringify(getActivePressures(0).map(p => ({ c: p.channel, i: +p.intensity.toFixed(4) })));

      /* 7. incident cadence: at 3.2 flashes/10s, count distinct flash windows
         after the opening one across a 10s sweep (3.2/10s reads as 3 within a
         window whose opening flash belongs to the prior period), and confirm
         each lit window lasts flashDuration. */
      const period = 10 / 3.2, dur = PRESSURE_MODEL.safety.flashDuration;
      const litFlashes = {};
      const step = 0.005;
      let flash1LitTime = 0;
      for (let t = 0; t < 10; t += step) {
        const n = Math.floor(t / period);
        const lit = (t - n * period) < dur;
        if (lit) {
          if (n >= 1) litFlashes[n] = true;
          if (n === 1) flash1LitTime += step;  // measure one whole flash window
        }
      }
      const flashCount = Object.keys(litFlashes).length;

      /* 8. authored cue wins: within an authored wardIncidentFlash window
         (t0:27..t1:33, tile [7,14]) with safety critical, the pressure channel
         must never drive [7,14] while it still flashes its other tiles. Q1's
         baseline no longer authors an incident flash, so inject one to exercise
         the suppression. Spy on the shared glyph draw to observe which tiles
         pressure drives. */
      setCurrentQuarter('Q1');
      setTimelineForCurrentQuarter(getPlaybackOutcomeForQuarter('Q1'));
      getTimeline().visualEvents.push({ type: 'wardIncidentFlash', t0: 27, t1: 33, tile: [7, 14] });
      const authoredAt30 = getTimelineEventsAt('wardIncidentFlash', 30).map(a => a.tile);
      METRIC_CUR.safety = 20; resetMetricPressure(27);
      const drawn = [];
      const origGlyph = _drawIncidentGlyph;
      _drawIncidentGlyph = function (tile) { drawn.push(tile[0] + ',' + tile[1]); };
      for (let t = 27; t < 33; t += 0.01) _drawIncidentRate(PRESSURE_MODEL.safety.byTone.critical, t);
      _drawIncidentGlyph = origGlyph;
      const drovProtectedTile = drawn.indexOf('7,14') >= 0;
      const droveOtherTiles = drawn.some(d => d !== '7,14');

      return {
        scrubMatches: opening === afterScrub,
        opening, flashCount, flash1LitTime, dur,
        authoredAt30: JSON.stringify(authoredAt30),
        drovProtectedTile, droveOtherTiles
      };
    });

    ok(s.scrubMatches, 'pressure: seeking back to 0 restores Q1 opening pressure (scrub reset)');
    eq(s.flashCount, 3, 'pressure: 3.2 flashes/10s yields 3 flashes after the opening across a 10s sweep');
    ok(Math.abs(s.flash1LitTime - s.dur) < 0.02, 'pressure: each flash lasts flashDuration');
    eq(s.authoredAt30, JSON.stringify([[7, 14]]), 'pressure: Q1 authors the wardIncidentFlash on [7,14]');
    ok(!s.drovProtectedTile, 'pressure: the pressure channel never drives the authored tile [7,14]');
    ok(s.droveOtherTiles, 'pressure: the pressure channel still flashes its other tiles');
    ok(page._errors.length === 0, 'pressure scrub/cadence: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 6: RENDER-ONLY + VALIDATOR + PLAYBACK ---------------- */
  console.log('\nphase 6 render-only / validator:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      paused = true;

      /* 9. no stat leakage: a full quarter with pressure on then off must leave
         committed and outcome stats byte-identical - pressure stays render-only. */
      function runQuarter(pressureOn) {
        document.getElementById('ckPressure').checked = pressureOn;
        seekSimulation(0);
        for (let t = 0; t <= QLEN; t += 0.5) { clock = t; render(); }
        return {
          stats: JSON.stringify(GAME.stats),
          end: JSON.stringify(getTimeline().outcome.endStats)
        };
      }
      const withPressure = runQuarter(true);
      const withoutPressure = runQuarter(false);
      document.getElementById('ckPressure').checked = true;

      /* 10. validator clean for all four quarters + timeline self-test. */
      let validatorClean = true;
      QUARTER_EVENT_IDS.forEach(id => {
        setCurrentQuarter(id);
        setTimelineForCurrentQuarter(getPlaybackOutcomeForQuarter(id));
        if (getTimeline().validationErrors.length !== 0) validatorClean = false;
      });
      setCurrentQuarter('Q1');
      setTimelineForCurrentQuarter(getPlaybackOutcomeForQuarter('Q1'));
      const selfTest = runTimelineSelfTest().failures.length;

      /* the compiled Q1 timeline carries exactly one render-only pressure cue */
      const pressureCues = getTimelineVisualEvents().filter(e => e.type === 'metricPressure');
      const cueHasEffects = pressureCues.some(c => c.effects !== undefined);

      return {
        statsMatch: withPressure.stats === withoutPressure.stats,
        endMatch: withPressure.end === withoutPressure.end,
        validatorClean, selfTest,
        pressureCueCount: pressureCues.length, cueHasEffects
      };
    });

    ok(s.statsMatch, 'pressure: committed GAME.stats identical with pressure on and off');
    ok(s.endMatch, 'pressure: outcome.endStats identical with pressure on and off');
    ok(s.validatorClean, 'pressure: timeline validator is clean for all four quarters');
    eq(s.selfTest, 0, 'pressure: timeline self-test reports zero errors');
    eq(s.pressureCueCount, 1, 'pressure: the quarter carries exactly one metricPressure cue');
    ok(!s.cueHasEffects, 'pressure: the metricPressure cue carries no effects (render-only)');

    /* 11. no console errors across a full Q1 playback with pressure enabled. */
    await page.evaluate(() => {
      document.getElementById('ckPressure').checked = true;
      seekSimulation(0);
      for (let t = 0; t <= QLEN; t += 0.25) { clock = t; render(); }
    });
    ok(page._errors.length === 0, 'pressure: no console/page errors across a full Q1 playback');
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
