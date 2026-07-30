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
    _selectReportOption(0);            // proposes the Q4 option, records nothing
    _confirmSelectedReportOption();    // records the Q4 decision
    goToNextReportQuarter();           // 'year-complete' -> closeReport + openYearEnd
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
        /* `title` is the static default; a descriptor may override it per pack
           through titleFor(data) - page 1 does, because Q1 has no prior quarter
           to report. */
        expectedTitle: descriptor.titleFor ? descriptor.titleFor(REPORT.data) : descriptor.title,
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
    const proposed = await page.evaluate(() => ({
      nextQuarterHidden: document.getElementById('repNextQuarter').hidden,
      locked: REPORT.locked
    }));
    ok(proposed.nextQuarterHidden && !proposed.locked, 'board pack: selecting an option does not record a decision');
    await page.click('#repConfirm');
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
      /* BPS-001 X11: the override covers EVERY derived line in the new eight-line
         schedule, both blocks, so the sweep proves the plug re-solves against an
         authored figure on any of them - not just the two it used to name. */
      REPORTING_OVERRIDES['Q1:hire_temporary_staff'] = { finance: {
        clinicalIncome: 80, privateIncome: 4, otherIncome: 9,
        paySpend: 70, agencySpend: 9, drugsSpend: 15, suppliesSpend: 25
      } };
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
      const opMorale = deriveOperational(moraleLow, null);
      const opBudget = deriveOperational(budgetLow, null);
      const wfBase = deriveWorkforce(base, null);
      const wfMorale = deriveWorkforce(moraleLow, null);
      const wfRep = deriveWorkforce(repLow, null);
      const wfBudget = deriveWorkforce(budgetLow, null);
      const wfWait = deriveWorkforce(waitingHi, null);
      const wfSafety = deriveWorkforce(safetyLow, null);
      const qBase = deriveQuality(base, null);
      const qSafety = deriveQuality(safetyLow, null);
      const qSafetyVery = deriveQuality(safetyVeryLow, null);
      const qPatsat = deriveQuality(patsatLow, null);

      const direction = {
        /* finance */
        payUpOnBudget: lineOf(budgetLow, 'paySpend') > lineOf(base, 'paySpend'),
        /* BPS-001 X11: `nonPaySpend` is split into drugs and clinical supplies.
           Both still rise as the budget falls - the aggregate response is
           unchanged, the coefficients were split 0.09 + 0.16 = the old 0.25 -
           and drugs carries an ACTIVITY term the supplies line does not, which
           is what stops the two being one line printed twice. */
        drugsUpOnBudget: lineOf(budgetLow, 'drugsSpend') > lineOf(base, 'drugsSpend'),
        suppliesUpOnBudget: lineOf(budgetLow, 'suppliesSpend') > lineOf(base, 'suppliesSpend'),
        drugsUpOnActivity: lineOf(waitingHi, 'drugsSpend') > lineOf(base, 'drugsSpend'),
        suppliesFlatOnActivity:
          Math.abs(lineOf(waitingHi, 'suppliesSpend') - lineOf(base, 'suppliesSpend')) < 1e-9,
        nonPayAggregateUnchanged:
          Math.abs((lineOf(budgetLow, 'drugsSpend') + lineOf(budgetLow, 'suppliesSpend')) -
                   (lineOf(base, 'drugsSpend') + lineOf(base, 'suppliesSpend')) - 0.25 * 4) < 1e-9,
        /* the two new derived income lines, each on its own driver */
        privateDownOnRep: lineOf(repLow, 'privateIncome') < lineOf(base, 'privateIncome'),
        otherIncomeDownOnSafety: lineOf(safetyLow, 'otherIncome') < lineOf(base, 'otherIncome'),
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
        /* BPS-001 X9/X10: each figure's DISTINCT second driver. These are the
           assertions that would go quiet again if someone re-collapsed the model
           onto one source metric per tab. */
        losUpOnMorale: opMorale.losPct > opBase.losPct,
        dtocUpOnBudget: opBudget.dtocBeds > opBase.dtocBeds,
        cancelledUpOnMorale: opMorale.cancelledOps > opBase.cancelledOps,
        vacancyUpOnBudget: wfBudget.vacancyRate > wfBase.vacancyRate,
        turnoverUpOnRep: wfRep.turnover > wfBase.turnover,
        sicknessUpOnWaiting: wfWait.sickness > wfBase.sickness,
        surveyDownOnSafety: wfSafety.surveyScore < wfBase.surveyScore,
        /* Bank & agency is derived ONCE, on the finance I&E line - the duplicate
           workforce copy of the same coefficients is gone. Re-pointed here rather
           than dropped so the morale -> agency behaviour stays covered. */
        bankAgencyUp: lineOf(moraleLow, 'agencySpend') > lineOf(base, 'agencySpend'),
        bankAgencyNotInWorkforce: !wfBase.hasOwnProperty('bankAgencySpend'),
        surveyDownOnMorale: wfMorale.surveyScore < wfBase.surveyScore,
        surveyDownOnRep: wfRep.surveyScore < wfBase.surveyScore,
        /* quality */
        incidentsUp: qSafety.incidents > qBase.incidents,
        neverEventsUp: qSafetyVery.neverEvents > qBase.neverEvents,
        harmFreeDown: qSafety.harmFreePct < qBase.harmFreePct,
        complaintsUp: qPatsat.complaints > qBase.complaints,
        fftDown: qPatsat.fftScore < qBase.fftScore
      };

      /* 7.5 overrides - specificity, null ctx, and an authored 0.
         REPORTING_OVERRIDES used to author 'Q2' -> dtocBeds 41 and
         'Q2:discharge_partnership' -> 38, and this block read those two literals.
         BPS-001 X10 retired them: a figure that reads 41 whatever the board did,
         unless it did one specific thing, is the collinearity defect in miniature.
         The MECHANISM is what is under test and is still fully covered - the block
         now installs its own synthetic entries and removes them again, exactly the
         pattern it already used for the authored-zero case. Specificity, null ctx
         and authored-zero coverage are all unchanged. */
      const ovStats = initialMetricStats();
      const nullCtxDtoc = deriveOperational(ovStats, null).dtocBeds;
      REPORTING_OVERRIDES['__OV_Q__'] = { operational: { dtocBeds: 41 } };
      REPORTING_OVERRIDES['__OV_Q__:pick_me'] = { operational: { dtocBeds: 38 } };
      REPORTING_OVERRIDES['__OV_ZERO__'] = { operational: { dtocBeds: 0 } };
      const overrides = {
        quarterOnly: deriveOperational(ovStats, { quarterId: '__OV_Q__', optionId: 'other' }).dtocBeds,
        quarterOption: deriveOperational(ovStats, { quarterId: '__OV_Q__', optionId: 'pick_me' }).dtocBeds,
        nullCtx: nullCtxDtoc,
        authoredZero: deriveOperational(ovStats, { quarterId: '__OV_ZERO__' }).dtocBeds
      };
      delete REPORTING_OVERRIDES['__OV_Q__'];
      delete REPORTING_OVERRIDES['__OV_Q__:pick_me'];
      delete REPORTING_OVERRIDES['__OV_ZERO__'];

      /* 7.5b the retired overrides are really gone, and what replaced them leaves
         the figure responsive: at Q2 the four options must produce four different
         delayed-transfer figures on top of the authored exogenous term. */
      const q2Dtoc = QUARTERS[1].options.map(o =>
        deriveOperational(applyMetricEffects(initialMetricStats(), o.effects),
                          { quarterId: 'Q2', optionId: o.id }).dtocBeds);
      const exogenous = {
        noAuthoredDtocOverride: !Object.keys(REPORTING_OVERRIDES).some(k => {
          const e = REPORTING_OVERRIDES[k];
          return e.operational && e.operational.hasOwnProperty('dtocBeds');
        }),
        q2Distinct: new Set(q2Dtoc.map(v => v.toFixed(2))).size,
        /* the exogenous term is keyed by quarter and additive, so the same stats
           report a higher figure in winter than in the opening quarter */
        opening: deriveOperational(ovStats, { quarterId: 'Q1', optionId: 'x' }).dtocBeds,
        winter: deriveOperational(ovStats, { quarterId: 'Q4', optionId: 'x' }).dtocBeds,
        nullIsBase: deriveOperational(ovStats, null).dtocBeds === REPORTING_COEFFS.operational.dtocBase,
        /* keyed by quarter ONLY: an option key must not add a second helping */
        quarterOnlyKeyed: deriveOperational(ovStats, { quarterId: 'Q4', optionId: 'defer_capital' }).dtocBeds ===
                          deriveOperational(ovStats, { quarterId: 'Q4' }).dtocBeds
      };

      /* 7.9 the two-layer DAG (BPS-001 X9/X10 §4).
         (a) An authored override on the `occupancy` anchor must reach every
             layer-2 figure that reads it, so the pack can never show 97% occupancy
             beside a length of stay derived as though it were 91%. dtocBeds does
             NOT read occupancy, so it must NOT move - that negative is what proves
             the anchor is being read rather than the whole tab being nudged.
         (b) The same for the `vacancyRate` anchor reaching cancelledOps, which is
             the one cross-tab driver.
         (c) deriveOperational() and deriveWorkforce() must return the same values
             whichever order they are called in, and must not recurse. A cycle
             overflows the stack rather than returning a wrong number, so simply
             completing is most of the assertion. */
      REPORTING_OVERRIDES['__ANCHOR_OCC__'] = { operational: { occupancy: 97 } };
      const occAnchorOp = deriveOperational(base, { quarterId: '__ANCHOR_OCC__' });
      const occAnchorWf = deriveWorkforce(base, { quarterId: '__ANCHOR_OCC__' });
      delete REPORTING_OVERRIDES['__ANCHOR_OCC__'];
      REPORTING_OVERRIDES['__ANCHOR_VAC__'] = { workforce: { vacancyRate: 16 } };
      const vacAnchorOp = deriveOperational(base, { quarterId: '__ANCHOR_VAC__' });
      const vacAnchorWf = deriveWorkforce(base, { quarterId: '__ANCHOR_VAC__' });
      delete REPORTING_OVERRIDES['__ANCHOR_VAC__'];

      const dagStats = withD({ waiting: 82, morale: 44, budget: -3, safety: 50, rep: 45 });
      let dagCompleted = true, wfFirstWf = null, wfFirstOp = null, opFirstOp = null, opFirstWf = null;
      try {
        wfFirstWf = deriveWorkforce(dagStats, null);
        wfFirstOp = deriveOperational(dagStats, null);
        opFirstOp = deriveOperational(dagStats, null);
        opFirstWf = deriveWorkforce(dagStats, null);
      } catch (e) { dagCompleted = false; }

      const dag = {
        occAnchorValue: occAnchorOp.occupancy,
        losMoved: occAnchorOp.losPct > opBase.losPct,
        handoverMoved: occAnchorOp.ambulanceHandover > opBase.ambulanceHandover,
        cancelledMoved: occAnchorOp.cancelledOps > opBase.cancelledOps,
        sicknessMoved: occAnchorWf.sickness > wfBase.sickness,
        dtocUnmoved: occAnchorOp.dtocBeds === opBase.dtocBeds,
        vacAnchorValue: vacAnchorWf.vacancyRate,
        vacReachesCancelled: vacAnchorOp.cancelledOps > opBase.cancelledOps,
        vacLeavesLosAlone: vacAnchorOp.losPct === opBase.losPct,
        completed: dagCompleted,
        orderIndependent: dagCompleted &&
          JSON.stringify(wfFirstOp) === JSON.stringify(opFirstOp) &&
          JSON.stringify(wfFirstWf) === JSON.stringify(opFirstWf)
      };

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

      return { maxErr, maxErrOverride, deterministic, noThrow, direction, overrides,
               exogenous, dag, history, unknownSection };
    });

    ok(s.maxErr < 1e-9, 'reporting: I&E surplus reconciles to budget across the range');
    ok(s.maxErrOverride < 1e-9, 'reporting: I&E still reconciles with an authored line override');
    ok(s.deterministic, 'reporting: every derive* is deterministic for identical inputs');
    ok(s.noThrow, 'reporting: derive* never mutate recursively deep-frozen stats or ctx');
    ok(s.direction.payUpOnBudget, 'reporting: lowering budget increases pay spend');
    ok(s.direction.drugsUpOnBudget, 'reporting: lowering budget increases drugs spend');
    ok(s.direction.suppliesUpOnBudget, 'reporting: lowering budget increases clinical supplies spend');
    ok(s.direction.drugsUpOnActivity, 'reporting: raising waiting increases drugs spend (the activity term)');
    ok(s.direction.suppliesFlatOnActivity,
      'reporting: clinical supplies does NOT read activity, so it is not drugs printed twice');
    ok(s.direction.nonPayAggregateUnchanged,
      'reporting: drugs + supplies respond to budget exactly as the single non-pay line did');
    ok(s.direction.privateDownOnRep, 'reporting: lowering reputation decreases private patient income');
    ok(s.direction.otherIncomeDownOnSafety, 'reporting: lowering safety decreases other operating income');
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
    ok(s.direction.bankAgencyUp, 'reporting: lowering morale increases bank & agency spend on the I&E line');
    ok(s.direction.bankAgencyNotInWorkforce,
       'reporting: bank & agency is derived once, under finance, not duplicated in workforce');
    ok(s.direction.surveyDownOnMorale, 'reporting: lowering morale decreases staff survey score');
    ok(s.direction.surveyDownOnRep, 'reporting: lowering reputation decreases staff survey score');
    ok(s.direction.incidentsUp, 'reporting: lowering safety increases moderate-harm incidents');
    ok(s.direction.neverEventsUp, 'reporting: lowering safety increases never events');
    ok(s.direction.harmFreeDown, 'reporting: lowering safety decreases harm-free care');
    ok(s.direction.complaintsUp, 'reporting: lowering patient satisfaction increases complaints');
    ok(s.direction.fftDown, 'reporting: lowering patient satisfaction decreases FFT recommend');
    /* BPS-001 X9/X10 - the distinct second driver on each figure */
    ok(s.direction.losUpOnMorale, 'reporting: lowering morale increases length of stay');
    ok(s.direction.dtocUpOnBudget, 'reporting: lowering budget increases delayed transfers');
    ok(s.direction.cancelledUpOnMorale, 'reporting: lowering morale increases cancelled ops (via vacancy)');
    ok(s.direction.vacancyUpOnBudget, 'reporting: lowering budget increases vacancy rate');
    ok(s.direction.turnoverUpOnRep, 'reporting: lowering reputation increases turnover');
    ok(s.direction.sicknessUpOnWaiting, 'reporting: raising waiting increases sickness absence (via occupancy)');
    ok(s.direction.surveyDownOnSafety, 'reporting: lowering safety decreases the staff survey score');
    eq(s.overrides.quarterOnly, 41, 'reporting: quarter override applies');
    eq(s.overrides.quarterOption, 38, 'reporting: quarter:option override beats quarter override');
    eq(s.overrides.nullCtx, 35, 'reporting: null ctx applies no override');
    eq(s.overrides.authoredZero, 0, 'reporting: an authored 0 override is honoured');
    /* the exogenous DTOC term that replaced the two hard Q2 overrides */
    ok(s.exogenous.noAuthoredDtocOverride,
       'exogenous: no authored override pins delayed transfers any more');
    eq(s.exogenous.q2Distinct, 4,
       'exogenous: all four Q2 options produce a different delayed-transfer figure');
    ok(s.exogenous.winter > s.exogenous.opening,
       'exogenous: the authored winter term lifts delayed transfers above the opening quarter (' +
       s.exogenous.opening.toFixed(1) + ' -> ' + s.exogenous.winter.toFixed(1) + ')');
    ok(s.exogenous.nullIsBase, 'exogenous: a null ctx adds no exogenous pressure, so the figure is its base');
    ok(s.exogenous.quarterOnlyKeyed, 'exogenous: the term is keyed by quarter only, never by quarter:option');
    /* the two-layer DAG */
    eq(s.dag.occAnchorValue, 97, 'DAG: an authored override on the occupancy anchor is what the row reports');
    ok(s.dag.losMoved, 'DAG: an occupancy override reaches length of stay');
    ok(s.dag.handoverMoved, 'DAG: an occupancy override reaches ambulance handovers');
    ok(s.dag.cancelledMoved, 'DAG: an occupancy override reaches cancelled operations');
    ok(s.dag.sicknessMoved, 'DAG: an occupancy override reaches sickness absence across the tab boundary');
    ok(s.dag.dtocUnmoved, 'DAG: an occupancy override leaves delayed transfers alone (it is not a dependant)');
    eq(s.dag.vacAnchorValue, 16, 'DAG: an authored override on the vacancy anchor is what the row reports');
    ok(s.dag.vacReachesCancelled, 'DAG: a vacancy override reaches cancelled operations across the tab boundary');
    ok(s.dag.vacLeavesLosAlone, 'DAG: a vacancy override leaves length of stay alone');
    ok(s.dag.completed, 'DAG: neither derive function recurses into the other');
    ok(s.dag.orderIndependent, 'DAG: the two derive functions give the same values in either call order');
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

    /* Every quarter now emits the canvas with a four-point OPEN/M1/M2/M3
       series; the Q1 pack (no committed decisions) has no year-to-date series
       and never the old insufficient-data note. hasWaitTrendData is gone. */
    const q1Trend = await page.evaluate(() => {
      const series = _drawPerformanceCharts(REPORT.data);
      return {
        hasCanvas: !!document.getElementById('repWaitTrend'),
        anyNote: document.querySelectorAll('.rep-perf-nodata').length,
        seriesCount: series ? series.length : -1,
        firstPoints: series && series[0] ? series[0].points.length : -1,
        hasWaitTrendType: typeof hasWaitTrendData
      };
    });
    ok(q1Trend.hasCanvas, 'performance: Q1 emits the waiting-trend canvas');
    eq(q1Trend.anyNote, 0, 'performance: no rep-perf-nodata element exists anywhere on the Q1 pack');
    eq(q1Trend.seriesCount, 1, 'performance: Q1 renders a single this-quarter series');
    eq(q1Trend.firstPoints, 4, 'performance: the Q1 this-quarter series has four points');
    eq(q1Trend.hasWaitTrendType, 'undefined', 'performance: hasWaitTrendData is gone');

    /* The Q1 trend draws pixels (the solid series plus the tolerance line). */
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

    /* The Q3 pack (Q1+Q2 committed) adds the dashed year-to-date series with
       three points: OPEN, Q1 close, Q2 close. */
    const q3Trend = await page.evaluate(() => {
      resetGameState();
      for (let i = 0; i < 2; i++) {
        quarterComplete = true;
        const q = getCurrentQuarterId();
        confirmBoardDecision(q, getCurrentQuarter().options[0].id);
        advanceAfterDecision(q);
      }
      quarterComplete = true;
      openReport();
      for (let i = 0; i < REPORT_PAGES.length; i++) { if (REPORT_PAGES[i].id === 'performance') { REPORT.page = i; break; } }
      _syncReportPages();
      setPerfTab(1);
      const series = _drawPerformanceCharts(REPORT.data);
      return {
        historyLen: REPORT.data.snapshot.history.length,
        seriesCount: series ? series.length : -1,
        firstPoints: series && series[0] ? series[0].points.length : -1,
        secondPoints: series && series[1] ? series[1].points.length : -1
      };
    });
    eq(q3Trend.historyLen, 2, 'performance: the Q3 pack has two committed quarters in history');
    eq(q3Trend.seriesCount, 2, 'performance: the Q3 pack renders two series');
    eq(q3Trend.firstPoints, 4, 'performance: the Q3 this-quarter series still has four points');
    eq(q3Trend.secondPoints, 3, 'performance: the Q3 year-to-date series has three points (OPEN, Q1, Q2)');

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

  /* ---------------- PHASE 3: SNAPSHOT ACCESSOR ---------------- */
  console.log('\nphase 3 snapshot accessor:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      /* Install a known non-flat outcome so start != end on every key. */
      TIMELINE = compileTimeline({
        quarterId: 'Q1', optionId: 'status_quo', optionTitle: 'Status Quo',
        decisionSummary: '', startStats: initialMetricStats(),
        endStats: Object.assign(initialMetricStats(), { budget: -1.8, waiting: 74, safety: 52 })
      }, getQuarterEventConfig('Q1'));
      const outcome = getTimelineOutcome();
      const keys = METRIC_DEFS.map(d => d.key);

      const at0 = getMetricSnapshotAt(0);
      const atEnd = getMetricSnapshotAt(QLEN);

      const curBefore = JSON.stringify(METRIC_CUR);
      const histBefore = METRIC_HISTORY.length;
      getMetricSnapshotAt(15); getMetricSnapshotAt(30); getMetricSnapshotAt(QLEN);
      const curAfter = JSON.stringify(METRIC_CUR);
      const histAfter = METRIC_HISTORY.length;

      const a = getMetricSnapshotAt(15), b = getMetricSnapshotAt(15);
      return {
        eq0: keys.every(k => at0[k] === outcome.startStats[k]),
        eqEnd: keys.every(k => atEnd[k] === outcome.endStats[k]),
        pureCur: curBefore === curAfter,
        pureHist: histBefore === histAfter,
        deepEqual: JSON.stringify(a) === JSON.stringify(b),
        distinct: a !== b
      };
    });
    ok(s.eq0, 'snapshot accessor: getMetricSnapshotAt(0) equals startStats on all six keys');
    ok(s.eqEnd, 'snapshot accessor: getMetricSnapshotAt(QLEN) equals endStats on all six keys');
    ok(s.pureCur, 'snapshot accessor: calling it leaves METRIC_CUR unchanged');
    ok(s.pureHist, 'snapshot accessor: calling it leaves METRIC_HISTORY.length unchanged');
    ok(s.deepEqual, 'snapshot accessor: two calls with the same t are deep-equal');
    ok(s.distinct, 'snapshot accessor: two calls with the same t return distinct objects');
    ok(page._errors.length === 0, 'snapshot accessor: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 3: SNAPSHOT SHAPE ---------------- */
  console.log('\nphase 3 snapshot shape:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(800);
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => {
      const snap = REPORT.data.snapshot;
      const keys = METRIC_DEFS.map(d => d.key);
      const sig1 = snap.signature;
      closeReport();
      openReport();
      const sig2 = REPORT.data.snapshot.signature;
      return {
        monthEndsLen: snap.monthEnds.length,
        lastEqEnd: keys.every(k => snap.monthEnds[2].stats[k] === snap.endStats[k]),
        sigType: typeof sig1,
        sigNonEmpty: !!sig1 && sig1.length > 0,
        sigStable: sig1 === sig2
      };
    });
    eq(s.monthEndsLen, 3, 'snapshot shape: monthEnds has three entries');
    ok(s.lastEqEnd, 'snapshot shape: monthEnds[2].stats equals endStats on all six keys');
    eq(s.sigType, 'string', 'snapshot shape: signature is a string');
    ok(s.sigNonEmpty, 'snapshot shape: signature is non-empty');
    ok(s.sigStable, 'snapshot shape: signature is identical across two opens of the same pack');
    ok(page._errors.length === 0, 'snapshot shape: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 3: MONEY ON PAGE 1 ---------------- */
  console.log('\nphase 3 money on page 1:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(800);
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.rep-page .rep-metric-row'));
      const budgetRow = rows.find(r => r.querySelector('b') && /Budget/i.test(r.querySelector('b').textContent));
      const valText = budgetRow ? budgetRow.querySelector('span').textContent : '';
      /* metricDeltaText is the sprite-safe path (canvas signage cannot render a
         £ glyph); it must still emit GBP. fmtMoney is left untouched. */
      return {
        valText,
        hasPound: valText.indexOf('£') >= 0,
        hasGBP: valText.indexOf('GBP') >= 0,
        deltaHasGBP: metricDeltaText(getMetricDef('budget'), -1.8).indexOf('GBP') >= 0
      };
    });
    ok(s.hasPound, 'money: the page-1 budget card contains £ (got "' + s.valText + '")');
    ok(!s.hasGBP, 'money: the page-1 budget card contains no GBP');
    ok(s.deltaHasGBP, 'money: metricDeltaText still emits GBP for the sprite-safe canvas path');
    ok(page._errors.length === 0, 'money: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 3: FINANCE TOTALS + NIL VARIANCE ---------------- */
  console.log('\nphase 3 finance totals + nil variance:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const noOverride = deriveIncomeExpenditure(Object.assign(initialMetricStats(), { budget: -2 }), null);
      const withOverride = deriveIncomeExpenditure(
        Object.assign(initialMetricStats(), { budget: -2 }),
        { quarterId: 'Q2', optionId: 'discharge_partnership' });
      return {
        reconNo: Math.abs(noOverride.totalIncome - noOverride.totalExpenditure - (-2)),
        reconOv: Math.abs(withOverride.totalIncome - withOverride.totalExpenditure - (-2)),
        linesArray: Array.isArray(noOverride.lines),
        surplusNumber: typeof noOverride.surplus === 'number',
        surplusMatches: Math.abs(noOverride.surplus - (noOverride.totalIncome - noOverride.totalExpenditure)) < 1e-9,
        nilVariance: _finVariance({ kind: 'income', variance: 0.0 }),
        nilVarianceSpend: _finVariance({ kind: 'expenditure', variance: 0.02 }),
        realVariance: _finVariance({ kind: 'income', variance: 0.6 })
      };
    });
    ok(s.reconNo < 0.001, 'finance: totalIncome - totalExpenditure reconciles to budget (no override)');
    ok(s.reconOv < 0.001, 'finance: totalIncome - totalExpenditure reconciles to budget (quarter with an override)');
    ok(s.linesArray, 'finance: lines is still an array');
    ok(s.surplusNumber, 'finance: surplus is still a number');
    ok(s.surplusMatches, 'finance: surplus still equals totalIncome - totalExpenditure');
    eq(s.nilVariance, '&mdash;', 'finance: a nil income variance renders an em dash, not £0.0m');
    eq(s.nilVarianceSpend, '&mdash;', 'finance: a nil expenditure variance renders an em dash');
    ok(/&pound;0\.6m/.test(s.realVariance) && s.realVariance.indexOf('+') === 0,
      'finance: a real favourable variance still renders a signed £ figure');
    ok(page._errors.length === 0, 'finance totals: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 3: TAB SEMANTICS ---------------- */
  console.log('\nphase 3 tab semantics:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(800);
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    await page.click('#repNext'); // results -> performance
    const s = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.rep-perf-tab'));
      const panels = Array.from(document.querySelectorAll('.rep-perf-panel'));
      return {
        selected: tabs.filter(t => t.getAttribute('aria-selected') === 'true').length,
        unselected: tabs.filter(t => t.getAttribute('aria-selected') === 'false').length,
        tabindexZero: tabs.filter(t => t.getAttribute('tabindex') === '0').length,
        controlsResolve: tabs.every(t => {
          const el = document.getElementById(t.getAttribute('aria-controls'));
          return !!el && el.getAttribute('role') === 'tabpanel';
        }),
        labelledbyResolve: panels.every(p => {
          const tab = document.getElementById(p.getAttribute('aria-labelledby'));
          return !!tab && tab.getAttribute('aria-controls') === p.id;
        }),
        label3: PERF_TABS[3].label,
        id3: PERF_TABS[3].id
      };
    });
    eq(s.selected, 1, 'tabs: exactly one tab is aria-selected=true');
    eq(s.unselected, 3, 'tabs: the other three tabs are aria-selected=false');
    eq(s.tabindexZero, 1, 'tabs: exactly one tab has tabindex 0');
    ok(s.controlsResolve, 'tabs: every aria-controls resolves to a role=tabpanel element');
    ok(s.labelledbyResolve, 'tabs: every panel aria-labelledby resolves back to its own tab');
    eq(s.label3, 'Patient & Safety', 'tabs: the fourth tab label is Patient & Safety');
    eq(s.id3, 'quality', 'tabs: the fourth tab id remains quality');

    /* Right-arrow moves both selection and DOM focus. */
    await page.keyboard.press('ArrowRight');
    const arrow = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        activeIsTab: !!active && active.classList.contains('rep-perf-tab'),
        activeSelected: !!active && active.getAttribute('aria-selected') === 'true',
        activeIndex: active ? parseInt(active.getAttribute('data-perf-tab'), 10) : -1,
        activeTab: getActivePerfTab()
      };
    });
    ok(arrow.activeIsTab, 'tabs: ArrowRight moves focus onto a tab button');
    ok(arrow.activeSelected, 'tabs: the focused tab is the selected one after ArrowRight');
    eq(arrow.activeIndex, arrow.activeTab, 'tabs: focus and selection agree after ArrowRight');

    /* setPerfTab must NOT move focus (it also runs on render/reset). */
    const focusUnchanged = await page.evaluate(() => {
      const before = document.activeElement;
      setPerfTab(2);
      return document.activeElement === before;
    });
    ok(focusUnchanged, 'tabs: setPerfTab(2) does not move document.activeElement');
    ok(page._errors.length === 0, 'tab semantics: no console/page errors');
    await page.close();
  }

  /* ---------------- PHASE 3: BOARD PACK IMMUTABILITY ---------------- */
  console.log('\nphase 3 board pack immutability:');
  {
    async function immutabilityRun(setup) {
      const page = await freshPage(browser);
      await page.waitForTimeout(150);
      const s = await page.evaluate((setupName) => {
        const snapshot = () => JSON.stringify({
          stats: GAME.stats, decisions: GAME.decisions, alerts: GAME.alerts, roles: GAME.roles
        });
        resetGameState();
        setBoardRoles(['cfo', 'md']);
        if (setupName === 'midyear') {
          for (let i = 0; i < 2; i++) {
            quarterComplete = true;
            const q = getCurrentQuarterId();
            confirmBoardDecision(q, getCurrentQuarter().options[0].id);
            advanceAfterDecision(q);
          }
        }
        quarterComplete = true;
        const before = snapshot();
        openReport();
        for (let p = 0; p < REPORT_PAGES.length; p++) {
          REPORT.page = p;
          _syncReportPages();
          if (REPORT_PAGES[p].afterRender) REPORT_PAGES[p].afterRender(REPORT.data);
        }
        for (let t = 0; t < getPerfTabCount(); t++) setPerfTab(t);
        REPORT.page = 0;
        _syncReportPages();
        closeReport();
        return { equal: before === snapshot() };
      }, setup);
      ok(s.equal, 'immutability: GAME is byte-identical after opening/paging/tabbing/closing the ' + setup + ' pack');
      ok(page._errors.length === 0, 'immutability (' + setup + '): no console/page errors');
      await page.close();
    }
    await immutabilityRun('q1');
    await immutabilityRun('midyear');
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

  /* ---------------- OPTIONS PAGE: NO PROJECTED OUTCOMES ----------------
     The redesign strips every forward-looking stat from the decision cards.
     Each card reduces to title, one-line summary, a cost commitment and a
     single qualitative trade-off line - and role pips / impact chips must not
     render even when a board role is selected (which used to drive them). */
  console.log('\noptions page (no projections):');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(200);

    /* Select a role - previously this made per-role projection pips appear. */
    await page.evaluate(() => { paused = true; setBoardRoles(['cfo']); });
    await page.keyboard.press('s');
    await page.waitForTimeout(200);
    await page.click('#repNext'); // results -> performance
    await page.click('#repNext'); // performance -> issue
    await page.click('#repNext'); // issue -> options
    const opts = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.rep-option'));
      return {
        pageId: REPORT_PAGES[REPORT.page].id,
        options: cards.length,
        pips: document.querySelectorAll('.rep-pip').length,
        /* impact chips only exist under the resolved-decision outcome, never on a card */
        cardChips: cards.reduce((n, c) => n + c.querySelectorAll('.rep-chips').length, 0),
        procon: document.querySelectorAll('.rep-procon').length,
        costs: document.querySelectorAll('.rep-option .rep-cost-value').length,
        tradeoffs: Array.from(document.querySelectorAll('.rep-option .rep-option-tradeoff'))
          .filter(t => t.textContent.trim().length > 0).length,
        /* a spend option shows the expenditure minus; the first card is the funded hire */
        firstCostSpend: (document.querySelector('.rep-option .rep-cost-value.spend') || {}).textContent || ''
      };
    });
    eq(opts.pageId, 'options', 'options: paged to the options page');
    ok(opts.options === 4, 'options: four option cards render');
    eq(opts.pips, 0, 'options: no projected role pips render even with a role selected');
    eq(opts.cardChips, 0, 'options: no projected impact chips render on the cards');
    eq(opts.procon, 0, 'options: pros/cons list is gone from the decision cards');
    eq(opts.costs, opts.options, 'options: every card shows a cost commitment figure');
    eq(opts.tradeoffs, opts.options, 'options: every card shows a qualitative trade-off line');
    ok(opts.firstCostSpend.charCodeAt(0) === 0x2212 && opts.firstCostSpend.indexOf('£') > 0,
      'options: a funded option shows expenditure with an explicit minus');

    /* The decision still resolves and applies its effect after all this -
       now through the two-step select-then-confirm path. */
    const resolved = await page.evaluate(() => {
      const before = GAME.stats.budget;
      _selectReportOption(0);
      const afterSelect = GAME.stats.budget;
      _confirmSelectedReportOption();
      return {
        locked: REPORT.locked,
        unchangedBySelect: afterSelect === before,
        changed: GAME.stats.budget !== before
      };
    });
    ok(resolved.unchangedBySelect, 'options: selecting an option leaves the running stats alone');
    ok(resolved.locked, 'options: confirming an option locks in the decision');
    ok(resolved.changed, 'options: the chosen effect still applies to the running stats');

    ok(page._errors.length === 0, 'options page: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD DECISION SAFETY (select -> discuss -> confirm) ----
     Clicking an option card must only propose it. Nothing is committed until
     the separate Confirm Board Decision button is pressed, so a stray click
     during a facilitated session cannot spend the quarter. */
  console.log('\nboard decision safety:');
  {
    /* Force the pack open on the options page. The pack is gated on
       quarterComplete, and confirmBoardDecision() returns null without it. */
    const openOptions = page => page.evaluate(() => {
      /* Pause first so a natural quarter end cannot reopen the pack mid-test. */
      paused = true;
      quarterComplete = true;
      openReport();
      REPORT.page = REPORT_PAGES.map(p => p.id).indexOf('options');
      _syncReportPages();
    });
    const snapshot = page => page.evaluate(() => ({
      decisions: GAME.decisions.length,
      budget: GAME.stats.budget,
      stats: JSON.stringify(GAME.stats),
      selectedOptionId: GAME.selectedOptionId,
      quarterDecision: !!getDecisionForQuarter(getCurrentQuarterId()),
      keys: Object.keys(GAME.decisionByQuarterId).length
    }));
    const cardState = page => page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.rep-option'));
      const confirm = document.getElementById('repConfirm');
      const proposedPanel = document.getElementById('repProposed');
      return {
        proposed: cards.map(c => c.classList.contains('proposed')),
        selected: cards.map(c => c.classList.contains('selected')),
        pressed: cards.map(c => c.getAttribute('aria-pressed')),
        flags: cards.map(c => !c.querySelector('.rep-option-flag').hidden),
        confirmExists: !!confirm,
        confirmHidden: !confirm || confirm.hidden,
        confirmDisabled: !confirm || confirm.disabled,
        panelHidden: proposedPanel.hidden,
        panelText: proposedPanel.textContent,
        panelLive: proposedPanel.getAttribute('aria-live'),
        locked: REPORT.locked,
        selectedIndex: REPORT.selectedOptionIndex
      };
    });

    /* -- Test 1: selecting does not mutate game state -- */
    {
      const page = await freshPage(browser);
      await page.waitForTimeout(200);
      await openOptions(page);
      const before = await snapshot(page);
      const intro = await page.$eval('.rep-options-intro', el => el.textContent.trim());
      const idle = await cardState(page);
      eq(intro, 'Select an option, discuss it as a board, then confirm your decision.',
        'safety: the options page explains select -> discuss -> confirm');
      ok(idle.proposed.every(v => !v) && idle.selected.every(v => !v),
        'safety: no option is preselected when the page opens');
      ok(idle.confirmDisabled, 'safety: confirm starts disabled');
      ok(idle.panelHidden, 'safety: the proposed-decision panel starts hidden');
      eq(idle.panelLive, 'polite', 'safety: the proposed-decision panel is a polite live region');

      await page.click('.rep-option[data-index="0"]');
      const after = await snapshot(page);
      const sel = await cardState(page);
      ok(sel.proposed[0] && sel.proposed.slice(1).every(v => !v), 'safety: the clicked card is marked proposed');
      ok(sel.selected.every(v => !v), 'safety: a proposed card is not marked confirmed');
      eq(sel.pressed[0], 'true', 'safety: the proposed card exposes aria-pressed="true"');
      ok(sel.flags[0], 'safety: the proposed card shows the not-confirmed flag');
      ok(!sel.confirmDisabled && !sel.confirmHidden, 'safety: selecting enables the confirm button');
      eq(after.decisions, before.decisions, 'safety: selecting adds no decision');
      eq(after.stats, before.stats, 'safety: selecting leaves every stat unchanged');
      eq(after.selectedOptionId, before.selectedOptionId, 'safety: selecting does not write GAME.selectedOptionId');
      ok(!after.quarterDecision, 'safety: no decision exists for the quarter after selecting');
      eq(after.keys, before.keys, 'safety: decisionByQuarterId is untouched by selecting');
      ok(!sel.locked, 'safety: the pack is not locked by selecting');
      ok(page._errors.length === 0, 'safety: selection: no console/page errors');
      await page.close();
    }

    /* -- Test 2: the selection can be changed -- */
    {
      const page = await freshPage(browser);
      await page.waitForTimeout(200);
      await openOptions(page);
      await page.click('.rep-option[data-index="0"]');
      await page.click('.rep-option[data-index="1"]');
      const s = await cardState(page);
      const state = await snapshot(page);
      const titleB = await page.evaluate(() => getCurrentQuarter().options[1].title);
      ok(!s.proposed[0] && s.proposed[1], 'safety: re-selecting moves the proposal to the new card');
      eq(s.pressed[0], 'false', 'safety: the abandoned card resets aria-pressed');
      ok(s.flags.filter(Boolean).length === 1, 'safety: exactly one not-confirmed flag is shown');
      eq(s.selectedIndex, 1, 'safety: report-local state tracks the new selection');
      ok(s.panelText.indexOf(titleB) >= 0, 'safety: the proposed panel shows the newly selected option');
      ok(s.panelText.indexOf('Not yet confirmed') >= 0, 'safety: the proposed panel says it is not yet confirmed');
      eq(state.decisions, 0, 'safety: changing the selection records nothing');
      ok(page._errors.length === 0, 'safety: re-selection: no console/page errors');
      await page.close();
    }

    /* -- Test 3: confirming records exactly one decision, through the DOM -- */
    {
      const page = await freshPage(browser);
      await page.waitForTimeout(200);
      await openOptions(page);
      const before = await snapshot(page);
      const expected = await page.evaluate(() => getCurrentQuarter().options[1].id);
      await page.click('.rep-option[data-index="1"]');
      await page.click('#repConfirm');
      const after = await snapshot(page);
      const s = await cardState(page);
      const shown = await page.evaluate(() => ({
        decision: document.getElementById('repDecision').textContent,
        outcomeVisible: !document.getElementById('repOutcome').hidden,
        nextQuarterVisible: !document.getElementById('repNextQuarter').hidden,
        recordedId: getDecisionForQuarter(getCurrentQuarterId()).optionId
      }));
      eq(after.decisions, before.decisions + 1, 'safety: confirming records exactly one decision');
      eq(shown.recordedId, expected, 'safety: the recorded option is the one that was selected');
      ok(after.budget !== before.budget, 'safety: the confirmed effect applies to the running stats');
      ok(s.selected[1] && !s.proposed[1], 'safety: the confirmed card switches to the recorded styling');
      ok(s.locked, 'safety: confirming locks the option cards');
      ok(shown.decision.indexOf('BOARD DECISION:') === 0, 'safety: the recorded-decision text appears');
      ok(shown.outcomeVisible, 'safety: the decision outcome is revealed after confirmation');
      ok(shown.nextQuarterVisible, 'safety: the next-quarter control appears after confirmation');
      ok(s.confirmHidden || s.confirmDisabled, 'safety: the confirm control retires after commitment');
      ok(s.panelText.indexOf('Board decision confirmed') >= 0, 'safety: confirmation is announced in the live region');
      ok(page._errors.length === 0, 'safety: confirmation: no console/page errors');
      await page.close();
    }

    /* -- Test 4: double confirmation is safe -- */
    {
      const page = await freshPage(browser);
      await page.waitForTimeout(200);
      await openOptions(page);
      const before = await snapshot(page);
      /* Two presses in the same task, with no await between them, is the
         closest reproduction of an impatient double click. */
      const after = await page.evaluate(() => {
        _selectReportOption(0);
        const btn = document.getElementById('repConfirm');
        btn.click();
        const afterFirst = GAME.stats.budget;
        btn.click();                       // the impatient second click
        _confirmSelectedReportOption();    // and a direct re-entry for good measure
        return {
          decisions: GAME.decisions.length,
          budget: GAME.stats.budget,
          afterFirst: afterFirst,
          keys: Object.keys(GAME.decisionByQuarterId).length
        };
      });
      eq(after.decisions, 1, 'safety: a double confirm records exactly one decision');
      eq(after.keys, before.keys + 1, 'safety: a double confirm adds one quarter entry');
      ok(after.afterFirst !== before.budget, 'safety: the first confirm applies the effect');
      eq(after.budget, after.afterFirst, 'safety: the second confirm does not re-apply the effect');
      ok(page._errors.length === 0, 'safety: double confirm: no console/page errors');
      await page.close();
    }

    /* -- Test 5: closing discards an unconfirmed selection -- */
    {
      const page = await freshPage(browser);
      await page.waitForTimeout(200);
      await openOptions(page);
      await page.click('.rep-option[data-index="2"]');
      await page.click('#repClose');
      await openOptions(page);
      const s = await cardState(page);
      const state = await snapshot(page);
      ok(s.proposed.every(v => !v) && s.selected.every(v => !v), 'safety: reopening clears the unconfirmed selection');
      eq(s.selectedIndex, null, 'safety: reopening resets the report-local selection');
      ok(s.confirmDisabled || s.confirmHidden, 'safety: reopening leaves confirm unavailable');
      ok(s.panelHidden, 'safety: reopening hides the proposed-decision panel');
      eq(state.decisions, 0, 'safety: selecting then closing records nothing');
      ok(page._errors.length === 0, 'safety: discard: no console/page errors');
      await page.close();
    }

    /* -- Test 6: a recorded decision reopens read-only -- */
    {
      const page = await freshPage(browser);
      await page.waitForTimeout(200);
      await openOptions(page);
      await page.click('.rep-option[data-index="1"]');
      await page.click('#repConfirm');
      const committed = await snapshot(page);
      await page.click('#repClose');
      await openOptions(page);
      const reopened = await cardState(page);
      const decision = await page.$eval('#repDecision', el => el.textContent);
      /* force: a locked card is aria-disabled, which Playwright treats as
         un-actionable - but a real user can still click it, so the click has
         to be delivered and shown to be inert. */
      await page.click('.rep-option[data-index="3"]', { force: true });
      const afterStrayClick = await cardState(page);
      const state = await snapshot(page);
      ok(reopened.selected[1], 'safety: the recorded option reopens selected');
      ok(reopened.confirmHidden || reopened.confirmDisabled, 'safety: a recorded quarter offers no active confirm control');
      ok(decision.indexOf('(RECORDED)') > 0, 'safety: the (RECORDED) suffix survives');
      ok(afterStrayClick.selected[1] && !afterStrayClick.proposed[3],
        'safety: clicking another card on a recorded quarter does nothing');
      eq(state.decisions, committed.decisions, 'safety: a recorded quarter cannot be decided twice');
      eq(state.budget, committed.budget, 'safety: a recorded quarter does not re-apply its effect');
      ok(page._errors.length === 0, 'safety: read-only: no console/page errors');
      await page.close();
    }

    /* -- Test 7: keyboard reaches selection and confirmation -- */
    {
      const page = await freshPage(browser);
      await page.waitForTimeout(200);
      await openOptions(page);
      await page.focus('.rep-option[data-index="0"]');
      await page.keyboard.press('Enter');
      const s = await cardState(page);
      const mid = await snapshot(page);
      ok(s.proposed[0], 'safety: Enter on a focused card selects it');
      eq(s.pressed[0], 'true', 'safety: keyboard selection sets aria-pressed');
      eq(mid.decisions, 0, 'safety: keyboard selection commits nothing');

      /* Tab from the last card to the confirm button, then activate it. */
      await page.focus('.rep-option[data-index="3"]');
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement.id);
      eq(focused, 'repConfirm', 'safety: Tab reaches the confirm button');
      await page.keyboard.press('Enter');
      const after = await snapshot(page);
      eq(after.decisions, 1, 'safety: Enter on the confirm button records exactly one decision');
      ok(page._errors.length === 0, 'safety: keyboard: no console/page errors');
      await page.close();
    }

    /* -- Test 8: a real mouse click at the button centre commits -- */
    {
      const page = await freshPage(browser);
      await page.waitForTimeout(200);
      await openOptions(page);
      await page.click('.rep-option[data-index="0"] .rep-option-summary'); // click a child node
      const proposed = await cardState(page);
      ok(proposed.proposed[0], 'safety: a click on a card child still selects the card');
      await page.click('#repConfirm'); // real mouse click at the element centre
      const after = await snapshot(page);
      eq(after.decisions, 1, 'safety: a real click at the confirm button centre commits the decision');
      ok(page._errors.length === 0, 'safety: hit target: no console/page errors');
      await page.close();
    }
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

  /* ---------------- BOARD PACK PHASE 4: HEALTH SCORE ----------------
     Named "board pack phase 4" because the blocks above already use "phase 4"
     for the role-objective work, which is a different phase 4 in an earlier
     numbering. There is no Node-side module system here, so these "pure"
     assertions run inside the page against the real global. */
  console.log('\nboard pack phase 4 health score:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const before = JSON.stringify(METRIC_DEFS);

      /* Sweep every metric across its whole authored range in small steps.
         "Monotone in the desirable direction" means non-decreasing as the
         metric improves - so for goodUp:false metrics the sweep is read
         backwards. Band boundaries produce small steps; those are intended,
         so this asserts no REVERSAL, never continuity. */
      const sweep = METRIC_DEFS.map(def => {
        const steps = 400, span = def.max - def.min;
        let outOfRange = 0, nonNumber = 0, reversals = 0, prev = null;
        for (let i = 0; i <= steps; i++) {
          /* Walk in the desirable direction: up the value axis for goodUp,
             down it for waiting. */
          const v = def.goodUp ? def.min + span * i / steps : def.max - span * i / steps;
          const score = getMetricHealthScore(def.key, v);
          if (typeof score !== 'number' || isNaN(score)) nonNumber++;
          if (score < -1e-9 || score > 100 + 1e-9) outOfRange++;
          if (prev !== null && score < prev - 1e-9) reversals++;
          prev = score;
        }
        return { key: def.key, outOfRange, nonNumber, reversals,
                 worst: getMetricHealthScore(def.key, def.goodUp ? def.min : def.max),
                 best: getMetricHealthScore(def.key, def.goodUp ? def.max : def.min) };
      });

      const worked = [
        ['waiting', 40, '83.3'], ['waiting', 48, '80.0'],
        ['waiting', 48.1, '79.8'], ['waiting', 90, '13.3'],
        ['budget', 0.0, '60.0'], ['budget', -2.9, '21.3'],
        ['budget', -3.0, '20.0'], ['budget', -4.0, '16.0']
      ].map(([key, value, expected]) => ({
        label: key + ' ' + value,
        got: getMetricHealthScore(key, value).toFixed(1),
        expected
      }));

      return {
        sweep, worked,
        unknownMetric: getMetricHealthScore('not_a_metric', 5),
        mutated: JSON.stringify(METRIC_DEFS) !== before
      };
    });

    ok(s.sweep.every(m => m.nonNumber === 0), 'health score: always returns a number');
    ok(s.sweep.every(m => m.outOfRange === 0), 'health score: stays inside [0,100] across every metric range');
    ok(s.sweep.every(m => m.reversals === 0),
       'health score: monotone non-decreasing in the desirable direction (' +
       s.sweep.filter(m => m.reversals).map(m => m.key).join(',') + ')');
    ok(s.sweep.every(m => Math.abs(m.worst) < 1e-9), 'health score: the worst authored value scores 0');
    ok(s.sweep.every(m => Math.abs(m.best - 100) < 1e-9), 'health score: the best authored value scores 100');
    s.worked.forEach(w => eq(w.got, w.expected, 'health score: ' + w.label));
    eq(s.unknownMetric, 50, 'health score: an unknown metric returns the neutral midpoint');
    ok(!s.mutated, 'health score: calling it does not mutate METRIC_DEFS');
    ok(page._errors.length === 0, 'health score: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK PHASE 4: RADAR ---------------- */
  console.log('\nboard pack phase 4 radar:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);

    /* Canvas screenshot diffing is out of scope, so "did it draw" is asserted
       as: the bitmap is opaque AND carries pixels that are not the flat chart
       background - i.e. there is actual ink, not just a cleared canvas. */
    const s = await page.evaluate(() => {
      const ink = () => {
        const cv = document.getElementById('repBalanceRadar');
        const g = cv.getContext('2d');
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let alpha = 0, nonBg = 0;
        for (let i = 0; i < d.length; i += 16) {
          alpha += d[i + 3];
          /* chart background is #fbfcfe */
          if (d[i] !== 251 || d[i + 1] !== 252 || d[i + 2] !== 254) nonBg++;
        }
        return { alpha, nonBg, w: cv.width, h: cv.height };
      };

      resetGameState();
      /* A committed midyear pack, so month 2 and month 3 are real closes
         rather than the flat opening quarter. */
      for (let i = 0; i < 2; i++) {
        quarterComplete = true;
        const q = getCurrentQuarterId();
        confirmBoardDecision(q, getCurrentQuarter().options[0].id);
        advanceAfterDecision(q);
      }
      quarterComplete = true;

      openReport();
      const cv = document.getElementById('repBalanceRadar');
      const first = ink();
      const label = cv.getAttribute('aria-label') || '';
      const fallback = (cv.textContent || '').trim();
      const role = cv.getAttribute('role');

      /* The pack rebuilds its pages on every open. An unguarded ctx.scale()
         would compound on the second draw, so both the backing store and the
         rendered ink must come back identical. */
      closeReport();
      openReport();
      const second = ink();

      return {
        role, label, fallback,
        firstW: first.w, secondW: second.w,
        firstH: first.h, secondH: second.h,
        opaque: first.alpha > 0,
        inked: first.nonBg > 0,
        inkStable: first.nonBg === second.nonBg,
        geometry: (function () {
          /* renderRadarChart returns its resolved geometry so placement can be
             asserted without pixel diffing: first axis straight up, six spokes,
             two series. */
          const g = _drawBoardBalanceRadar(REPORT.data);
          return {
            seriesCount: g.points.length,
            axisCount: g.points[0].length,
            firstAxisIsUp: Math.abs(g.points[1][0].x - 180) < 0.001 && g.points[1][0].y < 142
          };
        })()
      };
    });

    eq(s.role, 'img', 'radar: the canvas is role="img"');
    ok(s.label.length > 0, 'radar: the canvas has a non-empty aria-label');
    ok(/higher is better/i.test(s.label), 'radar: the aria-label states the normalisation direction');
    ok(s.fallback.length > 0, 'radar: the canvas carries text fallback content');
    ok(s.opaque, 'radar: the canvas renders non-transparent pixels');
    ok(s.inked, 'radar: the canvas renders pixels that are not the flat background');
    eq(s.secondW, s.firstW, 'radar: canvas.width is identical after close and reopen');
    eq(s.secondH, s.firstH, 'radar: canvas.height is identical after close and reopen');
    ok(s.inkStable, 'radar: reopening redraws identically (the transform does not compound)');
    eq(s.geometry.seriesCount, 2, 'radar: two series are plotted (quarter open and quarter close)');
    eq(s.geometry.axisCount, 6, 'radar: one axis per metric');
    ok(s.geometry.firstAxisIsUp, 'radar: the first axis points straight up');
    ok(page._errors.length === 0, 'radar: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK PHASE 4: PAGE 1 ---------------- */
  console.log('\nboard pack phase 4 page 1:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const snapshot = () => JSON.stringify({
        stats: GAME.stats, decisions: GAME.decisions, alerts: GAME.alerts, roles: GAME.roles
      });
      const page1 = () => document.querySelector('[data-page="0"]');

      resetGameState();
      quarterComplete = true;

      /* Q1 records no alerts by construction - they are only written when a
         decision is committed - so this is the empty-state pack. */
      const before = snapshot();
      openReport();
      const q1 = {
        emptyLine: (page1().querySelector('.rep-alert-empty') || {}).textContent || '',
        items: page1().querySelectorAll('.rep-alert-item').length,
        cards: page1().querySelectorAll('.rep-metric-grid .rep-metric-row').length,
        posture: (page1().querySelector('.rep-posture') || {}).textContent || '',
        postureToned: /band-(critical|warn|neutral|good|great)/
          .test((page1().querySelector('.rep-posture') || {}).className || ''),
        movement: (page1().querySelector('.rep-movement') || {}).textContent || '',
        /* the phase 3 card contract: <b> name plus <span> value */
        contract: Array.from(page1().querySelectorAll('.rep-metric-row'))
          .every(r => r.querySelector('b') && r.querySelector('span'))
      };
      /* Page every page and tab, then close without selecting an option. */
      for (let p = 0; p < REPORT_PAGES.length; p++) { REPORT.page = p; _syncReportPages(); }
      for (let t = 0; t < getPerfTabCount(); t++) setPerfTab(t);
      REPORT.page = 0; _syncReportPages();
      closeReport();
      const unchanged = before === snapshot();

      /* Overflow case: more alerts on the quarter than page 1 will show.
         Injected directly (this page is not reused by any other block) because
         no authored quarter records four in one go. */
      const qid = getCurrentQuarterId();
      for (let i = 0; i < 5; i++) {
        GAME.alerts.push({
          decisionQuarterId: qid, key: 'safety', at: 55, direction: 'below',
          severity: i === 4 ? 'critical' : (i < 2 ? 'praise' : 'warn'),
          title: 'INJECTED ' + i, line: 'synthetic', value: 50
        });
      }
      const html = document.createElement('div');
      html.innerHTML = _reportAlertList({ quarterId: qid });
      const capped = {
        items: html.querySelectorAll('.rep-alert-item').length,
        more: (html.querySelector('.rep-alert-more') || {}).textContent || '',
        /* critical -> warn -> praise, the same ordering the live queue uses */
        firstIsCritical: html.querySelector('.rep-alert-item').className.indexOf('sev-critical') >= 0
      };

      return {
        q1, unchanged, capped,
        pageCount: REPORT_PAGES.length,
        titles: REPORT_PAGES.map(p => p.title).join('|'),
        resultsHasAfterRender: typeof REPORT_PAGES[0].afterRender === 'function'
      };
    });

    eq(s.pageCount, 4, 'page 1: REPORT_PAGES still has exactly four pages');
    eq(s.titles, 'Prior Quarter Results|Performance Analysis|Issue At Hand|Options For Decision',
       'page 1: the page titles are unchanged');
    ok(s.resultsHasAfterRender, 'page 1: the results descriptor has an afterRender hook');
    eq(s.q1.cards, 6, 'page 1: six metric cards in the grid');
    ok(s.q1.contract, 'page 1: every card keeps the <b> name + <span> value contract');
    ok(/BOARD:/.test(s.q1.posture), 'page 1: the posture strip shows the board position label');
    ok(/main pressure/i.test(s.q1.posture), 'page 1: the posture strip names the main pressure metric');
    ok(s.q1.postureToned, 'page 1: the posture strip carries a band-{tone} class');
    eq(s.q1.items, 0, 'page 1: a Q1 pack shows no alert items');
    eq(s.q1.emptyLine, 'No threshold breaches recorded during this period.',
       'page 1: a Q1 pack shows the empty-state line');
    ok(/No metric moved materially/.test(s.q1.movement),
       'page 1: a flat Q1 suppresses both movement lines rather than printing noise');
    eq(s.capped.items, 3, 'page 1: at most three alert items are shown');
    eq(s.capped.more, '+2 further events', 'page 1: the remaining alerts are counted, not dropped');
    ok(s.capped.firstIsCritical, 'page 1: alerts are ordered critical first');
    ok(s.unchanged, 'page 1: GAME is byte-identical after opening, paging, tabbing and closing');
    ok(page._errors.length === 0, 'page 1: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK PHASE 4: PAGE 1 LAYOUT AT 1280x720 ---------------- */
  console.log('\nboard pack phase 4 page 1 layout:');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(PAGE_URL);
    await page.waitForFunction(() => window.simulationStarted === true, { timeout: 5000 });
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => {
      quarterComplete = true;
      openReport();
      const doc = document.documentElement;
      const pages = document.querySelector('.rep-pages');
      const modal = document.querySelector('.rep-modal').getBoundingClientRect();
      const radar = document.getElementById('repBalanceRadar').getBoundingClientRect();
      const foot = document.getElementById('repClose').getBoundingClientRect();
      return {
        docOverflowX: doc.scrollWidth - doc.clientWidth,
        pagesOverflowX: pages.scrollWidth - pages.clientWidth,
        radarW: radar.width, radarH: radar.height,
        radarInsideModal: radar.left >= modal.left && radar.right <= modal.right,
        radarInViewport: radar.top >= 0 && radar.bottom <= window.innerHeight,
        footInViewport: foot.top >= 0 && foot.bottom <= window.innerHeight
      };
    });
    ok(s.docOverflowX <= 0, 'layout 1280x720: the document does not scroll horizontally');
    ok(s.pagesOverflowX <= 0, 'layout 1280x720: page 1 does not scroll horizontally');
    ok(s.radarW > 0 && s.radarH > 0, 'layout 1280x720: the radar has a rendered size');
    ok(s.radarInsideModal, 'layout 1280x720: the radar sits inside the modal horizontally');
    ok(s.radarInViewport, 'layout 1280x720: the whole radar is on screen without scrolling');
    ok(s.footInViewport, 'layout 1280x720: the pack footer is reachable');
    ok(errors.length === 0, 'layout 1280x720: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK PHASE 5: BENCHMARK BANDS ----------------
     There is no module system and no Node-side unit harness, so these "pure
     model" assertions run inside page.evaluate() against the real globals. */
  console.log('\nboard pack phase 5 benchmark bands:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const bands = REPORTING_BENCHMARKS.operational.occupancyBands;
      const before = JSON.stringify({
        coeffs: REPORTING_COEFFS.operational,
        benchmarks: REPORTING_BENCHMARKS.operational
      });

      /* Literal boundary values, deliberately NOT fed through
         deriveOperational() - its float arithmetic will not land exactly on a
         boundary, which is precisely what makes the `<` / `<=` decision
         invisible in normal play and easy to revert by accident. */
      const boundaries = [
        [88.9, 'good'], [89, 'good'], [89.1, 'neutral'],
        [91.9, 'neutral'], [92, 'neutral'], [92.1, 'warn'],
        [94.9, 'warn'], [95, 'warn'], [95.1, 'critical'],
        [82, 'good'], [99, 'critical']
      ].map(([value, expected]) => ({
        value, expected, got: getBenchmarkTone(bands, value)
      }));

      /* Severity is monotone non-decreasing across the whole arc range. */
      const rank = ['good', 'neutral', 'warn', 'critical'];
      let reversals = 0, prev = -1;
      for (let v = 82; v <= 99.00001; v += 0.5) {
        const idx = rank.indexOf(getBenchmarkTone(bands, v));
        if (idx < prev) reversals++;
        prev = idx;
      }

      let emptyList = 'threw', nullList = 'threw';
      try { emptyList = getBenchmarkTone([], 92); } catch (e) { /* leaves 'threw' */ }
      try { nullList = getBenchmarkTone(null, 92); } catch (e) { /* leaves 'threw' */ }

      /* The gauge model: range from the model's own clamp, value straight off
         deriveOperational(), and an authored override reaching it. */
      const base = initialMetricStats();
      const gaugeBase = getOccupancyGauge(base, null);

      REPORTING_OVERRIDES['__PHASE5__'] = { operational: { occupancy: 97 } };
      const overridden = getOccupancyGauge(base, { quarterId: '__PHASE5__' });
      delete REPORTING_OVERRIDES['__PHASE5__'];

      /* Frozen stats must not throw: the gauge derives, it never writes back. */
      let noMutate = true;
      try { getOccupancyGauge(Object.freeze(Object.assign({}, base)), null); }
      catch (e) { noMutate = false; }

      return {
        boundaries, reversals, emptyList, nullList,
        min: gaugeBase.min, max: gaugeBase.max,
        clampLo: REPORTING_COEFFS.operational.occClamp[0],
        clampHi: REPORTING_COEFFS.operational.occClamp[1],
        valueMatchesDerivation: gaugeBase.value === deriveOperational(base, null).occupancy,
        normEqualsBase: REPORTING_BENCHMARKS.operational.occupancyNorm ===
                        REPORTING_COEFFS.operational.occBase,
        openingValue: gaugeBase.value,
        openingTone: gaugeBase.tone,
        openingDelta: gaugeBase.delta,
        openingStatus: _occupancyStatusText(gaugeBase),
        overriddenValue: overridden.value,
        overriddenTone: overridden.tone,
        noMutate,
        modelUnchanged: JSON.stringify({
          coeffs: REPORTING_COEFFS.operational,
          benchmarks: REPORTING_BENCHMARKS.operational
        }) === before
      };
    });

    s.boundaries.forEach(b =>
      eq(b.got, b.expected, 'benchmark bands: occupancy ' + b.value + ' is ' + b.expected));
    eq(s.reversals, 0, 'benchmark bands: severity never decreases as occupancy rises');
    eq(s.emptyList, 'neutral', 'benchmark bands: an empty band list returns neutral without throwing');
    eq(s.nullList, 'neutral', 'benchmark bands: an absent band list returns neutral without throwing');
    eq(s.min, s.clampLo, 'gauge model: the arc minimum is the model clamp low bound');
    eq(s.max, s.clampHi, 'gauge model: the arc maximum is the model clamp high bound');
    ok(s.valueMatchesDerivation, 'gauge model: the value is exactly deriveOperational().occupancy');
    ok(s.normEqualsBase, 'gauge model: the operating norm equals occBase, so Q1 sits on the norm');
    eq(s.openingValue, 92, 'gauge model: the opening board position derives to 92');
    eq(s.openingTone, 'neutral', 'gauge model: 92 is "at norm", not "elevated"');
    eq(s.openingDelta, 0, 'gauge model: the opening delta from the norm is zero');
    ok(/Exactly at/.test(s.openingStatus),
       'gauge model: the opening status line reads "Exactly at the trust operating norm"');
    eq(s.overriddenValue, 97, 'gauge model: an authored occupancy override reaches the gauge');
    eq(s.overriddenTone, 'critical', 'gauge model: an overridden value is banded on its own merits');
    ok(s.noMutate, 'gauge model: deriving from frozen stats does not throw');
    ok(s.modelUnchanged, 'gauge model: calling it mutates neither the coefficients nor the benchmarks');
    ok(page._errors.length === 0, 'benchmark bands: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK PHASE 5: ROW / GAUGE AGREEMENT ---------------- */
  console.log('\nboard pack phase 5 row agreement:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const rowOf = (section, id) => section.rows.filter(r => r.id === id)[0];

      /* Sweeping `waiting` across its whole authored range walks occupancy over
         every band boundary from both sides, so this covers the "one either
         side of each boundary" requirement without hand-picking values. */
      let toneMismatch = 0, valueMismatch = 0, commentaryMismatch = 0, otherRowMismatch = 0;
      for (let w = 0; w <= 100.0001; w += 0.5) {
        const stats = Object.assign(initialMetricStats(), { waiting: w });
        const section = getReportSection('operations', stats, null);
        const gauge = getOccupancyGauge(stats, null);
        const occ = rowOf(section, 'occupancy');
        if (occ.tone !== gauge.tone) toneMismatch++;
        if (occ.value !== gauge.value) valueMismatch++;
        if (occ.commentary !== _commentary('waiting', w)) commentaryMismatch++;
        /* Every row now takes its tone from its OWN figure against its own
           authored bands, not from `waiting`. Before X3 this loop asserted the
           opposite - that the other four rows inherited waiting's tone - which
           is the defect: the colour said nothing about the figure it sat on. */
        section.rows.forEach(r => {
          const expected = getBenchmarkTone(REPORTING_BENCHMARKS.operational[r.id + 'Bands'], r.value);
          if (r.tone !== expected) otherRowMismatch++;
        });
      }

      /* A position where the two tone sources genuinely disagree, so the test
         would fail if the override were dropped and both fell back to
         `waiting`. Occupancy 82 (good) while waiting 0 is `great`. */
      const low = Object.assign(initialMetricStats(), { waiting: 0 });
      const disagreement = {
        rowTone: rowOf(getReportSection('operations', low, null), 'occupancy').tone,
        gaugeTone: getOccupancyGauge(low, null).tone,
        waitingTone: getMetricBand('waiting', 0).tone
      };

      /* The rendered panel: the occupancy row's value cell carries the gauge's
         tone through the band-{tone} contract. */
      resetGameState();
      quarterComplete = true;
      openReport();
      REPORT.page = 1; _syncReportPages(); setPerfTab(1);
      const rows = document.querySelectorAll('#perfPanelOperations .rep-perf-row');
      const occRow = rows[0];
      const rendered = {
        label: occRow.querySelector('.lbl').textContent,
        cellClass: occRow.querySelector('.val').className,
        expected: 'band-' + getOccupancyGauge(REPORT.data.snapshot.endStats,
                                              _snapshotCtx(REPORT.data.snapshot)).tone
      };
      closeReport();

      return { toneMismatch, valueMismatch, commentaryMismatch, otherRowMismatch,
               disagreement, rendered };
    });

    eq(s.toneMismatch, 0, 'row agreement: the occupancy row tone equals the gauge tone at every position');
    eq(s.valueMismatch, 0, 'row agreement: the occupancy row value equals the gauge value');
    eq(s.commentaryMismatch, 0, 'row agreement: the occupancy commentary is still keyed to waiting');
    eq(s.otherRowMismatch, 0, 'row agreement: every operational row takes its tone from its own benchmark bands');
    eq(s.disagreement.rowTone, s.disagreement.gaugeTone,
       'row agreement: the row follows the benchmark where the two tone sources disagree');
    ok(s.disagreement.rowTone !== s.disagreement.waitingTone,
       'row agreement: that position really is a disagreement (benchmark ' +
       s.disagreement.rowTone + ' vs waiting ' + s.disagreement.waitingTone + ')');
    eq(s.rendered.label, 'Bed occupancy', 'row agreement: the first operations row is Bed occupancy');
    ok(s.rendered.cellClass.indexOf(s.rendered.expected) >= 0,
       'row agreement: the rendered occupancy cell carries ' + s.rendered.expected);
    ok(page._errors.length === 0, 'row agreement: no console/page errors');
    await page.close();
  }

  /* ---------------- BPS-001 X5/X6/X7/X8: TEMPORAL CLARITY ---------------- */
  console.log('\nBPS-001 X5-X8 temporal clarity:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);

    /* Read the four page heads plus the page-3 bridge out of a pack opened at
       whatever quarter the game currently sits on. */
    const readPack = () => page.evaluate(() => {
      quarterComplete = true;
      openReport();
      const strips = Array.from(document.querySelectorAll('.rep-page .rep-period'))
        .map(el => el.textContent.replace(/\s+/g, ' ').trim());
      const out = {
        quarter: getCurrentQuarterId(),
        page1Title: document.querySelector('[data-page="0"] .rep-page-head h3').textContent,
        strips,
        stripCount: strips.length,
        bridge: (document.querySelector('[data-page="2"] .rep-bridge') || {}).textContent || '',
        subtitle: document.querySelector('.rep-sub').textContent,
        radarLegend: document.querySelector('.rep-radar-legend').textContent,
        radarLabel: document.getElementById('repBalanceRadar').getAttribute('aria-label'),
        /* The whole rendered pack, for the Q0 sentinel check. */
        allHtml: document.getElementById('repRoot').innerHTML
      };
      closeReport();
      return out;
    });

    await page.evaluate(() => resetGameState());
    const q1 = await readPack();

    /* Commit Q1 option A (Hire Temporary Staff) and read the Q2 pack, then commit
       Q2 option B (Expand Virtual Ward) and read the Q3 pack - the exact example
       BPS-001 gives for the page 1-2 strip. */
    const commitAndAdvance = optionIndex => page.evaluate(i => {
      quarterComplete = true;
      const q = getCurrentQuarterId();
      confirmBoardDecision(q, getCurrentQuarter().options[i].id);
      advanceAfterDecision(q);
    }, optionIndex);

    await commitAndAdvance(0);
    const q2 = await readPack();
    await commitAndAdvance(1);
    const q3 = await readPack();

    /* --- X5: every page names its period --- */
    eq(q3.stripCount, 4, 'period strip: all four pages carry a period strip');
    ok(/OUTCOME REPORTED/.test(q3.strips[0]) && /OUTCOME REPORTED/.test(q3.strips[1]),
       'period strip: pages 1-2 are labelled OUTCOME REPORTED');
    ok(/DECISION REQUIRED/.test(q3.strips[2]) && /DECISION REQUIRED/.test(q3.strips[3]),
       'period strip: pages 3-4 are labelled DECISION REQUIRED');
    ok(/Q2 - EXPAND VIRTUAL WARD/.test(q3.strips[0]),
       'period strip: the Q3 pack names the prior quarter and its decision (' + q3.strips[0] + ')');
    ok(/Q3 - MEDIA PRESSURE/.test(q3.strips[2]),
       'period strip: the Q3 pack names the current decision quarter (' + q3.strips[2] + ')');
    ok(/Q1 - HIRE TEMPORARY STAFF/.test(q2.strips[0]),
       'period strip: the Q2 pack names the Q1 decision (' + q2.strips[0] + ')');
    ok(/Q2 - CAPACITY STRAIN/.test(q2.strips[2]),
       'period strip: the Q2 pack names Q2 as the decision quarter (' + q2.strips[2] + ')');

    /* --- X7: the Q1 pack does not claim a prior quarter --- */
    eq(q1.page1Title, 'Opening Board Position', 'page title: Q1 reads "Opening Board Position"');
    eq(q2.page1Title, 'Prior Quarter Results', 'page title: Q2 reads "Prior Quarter Results"');
    ok(/BASELINE POSITION/.test(q1.strips[0]) && /NO PRIOR DECISION/.test(q1.strips[0]),
       'period strip: the Q1 pack states the absence of a prior decision (' + q1.strips[0] + ')');
    ok(q1.allHtml.indexOf('Q0') < 0, 'period strip: the rendered Q1 pack never contains the Q0 sentinel');
    /* _warnQuarterFallback only warns, so the error channel would not catch a
       getQuarterById('Q0') slip - the assertion above is the real guard. This
       confirms nothing else broke while opening a Q1 pack. */
    ok(page._errors.length === 0, 'period strip: no console/page errors opening a Q1 pack');

    /* --- X5 point 6: the masthead no longer contradicts pages 1-2 --- */
    eq(q3.subtitle, 'QUARTERLY BOARD PACK', 'masthead: the subtitle no longer claims DECISION REQUIRED over all four pages');

    /* --- X6: the radar and the cards share one window --- */
    ok(/Quarter open/.test(q3.radarLegend) && /Quarter close/.test(q3.radarLegend),
       'radar window: the legend names the quarter, not the months (' + q3.radarLegend + ')');
    ok(/higher is better/i.test(q3.radarLabel), 'radar window: the aria-label still states the direction');
    ok(/quarter close/i.test(q3.radarLabel), 'radar window: the aria-label names the quarter close');

    const window6 = await page.evaluate(() => {
      quarterComplete = true;
      openReport();
      const snap = REPORT.data.snapshot;
      const pair = _radarStatsPair(snap);
      /* Same window as the cards, by identity of the stats objects the cards read. */
      const sameWindow = pair.prior === snap.startStats && pair.latest === snap.endStats;
      /* Sign agreement per metric. Magnitude is NOT comparable: the radar plots
         getMetricHealthScore(), which is deliberately band-quantised and
         non-linear in the raw value. Metrics that did not move, or whose health
         score did not change band-position, are skipped rather than asserted. */
      const signs = _reportMetricValues().map(m => {
        const cardDelta = m.cur - m.last;
        const radarDelta = getMetricHealthScore(m.key, pair.latest[m.key]) -
                           getMetricHealthScore(m.key, pair.prior[m.key]);
        return {
          key: m.key, cardDelta, radarDelta,
          /* the radar is normalised so higher is always better; a card delta is
             raw, so an inverted metric flips */
          agrees: Math.abs(cardDelta) < 0.05 || Math.abs(radarDelta) < 1e-9 ||
                  ((cardDelta > 0) === m.goodUp) === (radarDelta > 0)
        };
      });
      closeReport();
      return { sameWindow, signs, moved: signs.filter(x => Math.abs(x.cardDelta) >= 0.05).length };
    });
    ok(window6.sameWindow, 'radar window: the radar reads the same start/end stats as the metric cards');
    ok(window6.moved >= 3, 'radar window: the test quarter moved enough metrics to be worth asserting (' + window6.moved + ')');
    window6.signs.forEach(x =>
      ok(x.agrees, 'radar window: ' + x.key + ' card and radar deltas agree in direction'));

    /* --- X8: the page-3 bridge --- */
    ok(/NEW QUARTER DEVELOPMENT/.test(q3.bridge), 'bridge: page 3 carries the new-quarter bridge line at Q3');
    ok(/occurs after the outcome reported on pages 1–2\./.test(q3.bridge),
       'bridge: the fixed line resolves its entities (' + q3.bridge + ')');
    ok(/regional outlet/i.test(q3.bridge), 'bridge: the Q3 authored sentence renders');
    ok(/tightened after the last board/i.test(q2.bridge), 'bridge: the Q2 authored sentence renders');
    eq(q1.bridge, '', 'bridge: the bridge is suppressed at the baseline Q1 pack');

    /* An authored sentence containing an ampersand and an apostrophe must be
       escaped, not break the markup. */
    const escaped = await page.evaluate(() => {
      const q = getQuarterById('Q3');
      const original = q.issue.bridge;
      q.issue.bridge = 'Trust & partners\' <b>position</b> changed.';
      const host = document.createElement('div');
      host.innerHTML = _reportIssueBridge({
        issue: q.issue,
        snapshot: { outcome: { quarterId: 'Q2', optionTitle: 'X' } }
      });
      const el = host.querySelector('.rep-bridge');
      const out = { text: el.textContent, boldCount: el.querySelectorAll('b').length };
      q.issue.bridge = original;
      return out;
    });
    ok(escaped.text.indexOf("Trust & partners' <b>position</b> changed.") >= 0,
       'bridge: an authored sentence with & \' < > renders as text (' + escaped.text + ')');
    eq(escaped.boldCount, 1, 'bridge: authored markup does not inject an element (only the fixed label is bold)');

    ok(page._errors.length === 0, 'temporal clarity: no console/page errors');
    await page.close();
  }

  /* ---------------- BPS-001 X5: PAGE 1 HEIGHT AT 1280x720 ----------------
     .rep-pages is a scroll container and page 1 already overflows it by ~143px
     at 1280x720 on a committed midyear pack - measured at e2c060f, before this
     work, where the movement summary was likewise already below the fold. That
     overflow is not X5's to fix (page 1's layout is untouched here), so what is
     asserted is that the period strip costs ONE LINE and nothing else: it must
     not trigger a reflow, and the two elements the existing layout test guards
     (the radar and the footer) must stay on screen. */
  console.log('\nBPS-001 X5 page 1 height with the period strip:');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(PAGE_URL);
    await page.waitForFunction(() => window.simulationStarted === true, { timeout: 5000 });
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => {
      resetGameState();
      for (let i = 0; i < 2; i++) {
        quarterComplete = true;
        const q = getCurrentQuarterId();
        confirmBoardDecision(q, getCurrentQuarter().options[0].id);
        advanceAfterDecision(q);
      }
      quarterComplete = true;
      openReport();
      const pages = document.querySelector('.rep-pages');
      const strip = document.querySelector('[data-page="0"] .rep-period');
      const radar = document.getElementById('repBalanceRadar');
      const foot = document.getElementById('repClose');
      const withStrip = pages.scrollHeight - pages.clientHeight;
      const stripH = strip ? strip.getBoundingClientRect().height : 0;
      /* Hide every strip and re-measure: the difference is the strip's true cost
         to the page, including any flex gap or margin it brings with it. */
      const strips = document.querySelectorAll('.rep-page .rep-period');
      for (let i = 0; i < strips.length; i++) strips[i].style.display = 'none';
      const withoutStrip = pages.scrollHeight - pages.clientHeight;
      for (let i = 0; i < strips.length; i++) strips[i].style.display = '';
      const out = {
        stripH,
        added: withStrip - withoutStrip,
        hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        radarOnScreen: radar.getBoundingClientRect().bottom <= window.innerHeight,
        footOnScreen: foot.getBoundingClientRect().bottom <= window.innerHeight
      };
      closeReport();
      return out;
    });
    ok(s.stripH > 0, 'page 1 height: the period strip has a rendered height');
    ok(s.stripH <= 16, 'page 1 height: the period strip is one short line (' + s.stripH + 'px)');
    eq(s.added, s.stripH,
       'page 1 height: the strip costs exactly its own line and brings no gap of its own');
    ok(s.hScroll <= 0, 'page 1 height: the document does not scroll horizontally');
    ok(s.radarOnScreen, 'page 1 height: the radar is still on screen with the strip added');
    ok(s.footOnScreen, 'page 1 height: the pack footer is still reachable');
    ok(errors.length === 0, 'page 1 height: no console/page errors');
    await page.close();
  }

  /* ---------------- BPS-001 X3: PER-FIGURE BENCHMARK TONE ---------------- */
  console.log('\nBPS-001 X3 per-figure benchmark tone:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      /* --- band contract guard, over every authored list ---
         `to` strictly ascending, final entry open-ended, and the tone sequence
         strictly monotonic in TONE_RANK. The monotonicity check is what catches
         a HIGHER-is-better list authored in the lower-is-better order, which
         getBenchmarkTone() is direction-agnostic about and would happily serve. */
      const lists = [];
      Object.keys(REPORTING_BENCHMARKS).forEach(ns => {
        Object.keys(REPORTING_BENCHMARKS[ns]).forEach(key => {
          const v = REPORTING_BENCHMARKS[ns][key];
          if (Array.isArray(v)) lists.push({ name: ns + '.' + key, bands: v });
        });
      });
      const contract = lists.map(l => {
        let ascends = true, monotonic = true, up = null;
        for (let i = 1; i < l.bands.length; i++) {
          if (!(l.bands[i].to > l.bands[i - 1].to)) ascends = false;
          const d = getToneRank(l.bands[i].tone) - getToneRank(l.bands[i - 1].tone);
          if (d === 0) { monotonic = false; continue; }
          const thisUp = d > 0;
          if (up === null) up = thisUp;
          else if (up !== thisUp) monotonic = false;
        }
        return {
          name: l.name,
          ascends,
          monotonic,
          openEnded: l.bands[l.bands.length - 1].to === Infinity,
          length: l.bands.length
        };
      });

      /* --- never events at zero --- */
      const zeroSafety = Object.assign(initialMetricStats(), { safety: 50 });
      const zeroRow = getReportSection('quality', zeroSafety, null).rows
        .filter(r => r.id === 'neverEvents')[0];

      /* --- per-row tone independence, asserted per figure on the rendered
         cells. safety 50 / patsat 55 straddles four different band boundaries
         across the five Quality figures, so a tab that still took one tone from
         one source metric cannot pass this. --- */
      const stats = Object.assign(initialMetricStats(), { safety: 50, patsat: 55 });
      const snapshot = { quarterId: 'Q1', optionId: 'x', outcome: {}, history: [], endStats: stats };
      const host = document.createElement('div');
      host.innerHTML = _perfQualityPanel({ snapshot });
      const rendered = Array.from(host.querySelectorAll('.rep-perf-row')).map(row => ({
        label: row.querySelector('.lbl').textContent,
        cls: row.querySelector('.val').className
      }));
      const section = getReportSection('quality', stats, null);
      const expectedPerRow = section.rows.map(r => ({
        id: r.id,
        expected: getBenchmarkTone(REPORTING_BENCHMARKS.quality[r.id + 'Bands'], r.value),
        got: r.tone
      }));

      return {
        contract,
        listCount: lists.length,
        zeroValue: zeroRow.value,
        zeroTone: zeroRow.tone,
        renderedClasses: rendered.map(r => r.cls),
        distinctTones: new Set(rendered.map(r => r.cls.replace(/^.*band-/, ''))).size,
        allSameTone: new Set(rendered.map(r => r.cls.replace(/^.*band-/, ''))).size === 1,
        perRow: expectedPerRow,
        /* Commentary is deliberately untouched by X3: still keyed to the source
           metric, still de-duplicated across a run of rows sharing a source. */
        commentaryStillBySource:
          section.rows.filter(r => r.source === 'safety').every(r => r.commentary === _commentary('safety', 50)) &&
          section.rows.filter(r => r.source === 'patsat').every(r => r.commentary === _commentary('patsat', 55))
      };
    });

    ok(s.listCount >= 13, 'benchmark contract: every derived figure has an authored band list (' + s.listCount + ')');
    s.contract.forEach(c => {
      ok(c.ascends, 'benchmark contract: ' + c.name + ' has strictly ascending `to`');
      ok(c.openEnded, 'benchmark contract: ' + c.name + ' ends open (to: Infinity)');
      ok(c.monotonic, 'benchmark contract: ' + c.name + ' tone sequence is monotonic in TONE_RANK');
    });
    eq(s.zeroValue, 0, 'never events: safety 50 derives to zero never events');
    eq(s.zeroTone, 'good', 'never events: zero never events reads good, not warn');
    ok(!s.allSameTone, 'row tone: the Quality rows do not all share one tone');
    ok(s.distinctTones >= 3, 'row tone: the Quality rows carry at least three distinct tones (' + s.distinctTones + ')');
    s.perRow.forEach(r =>
      eq(r.got, r.expected, 'row tone: ' + r.id + ' is banded on its own figure (' + r.expected + ')'));
    ok(s.renderedClasses.every(c => /band-(good|neutral|warn|critical|great)/.test(c)),
       'row tone: every rendered value cell carries a band-{tone} class');
    ok(s.commentaryStillBySource, 'row tone: commentary is still keyed to the source metric, unchanged');
    ok(page._errors.length === 0, 'row tone: no console/page errors');
    await page.close();
  }

  /* ---------------- BPS-001 X2: THRESHOLD DISTANCE DIRECTION ---------------- */
  console.log('\nBPS-001 X2 threshold distance:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const at = v => {
        const d = describeThresholdDistance('budget', v);
        return d ? { title: d.threshold.title, state: d.state, mag: Number(d.magnitude.toFixed(3)) } : null;
      };
      /* Both sides of all three authored budget thresholds. The surplus one is
         dir:'above', where the sign of `distance` is inverted - the case that
         catches an implementation that read the sign instead of `dir`. */
      const cases = {
        notifiableApproach: at(-1.4),
        notifiableCrossed:  at(-1.6),
        breachApproach:     at(-2.9),
        breachCrossed:      at(-3.1),
        surplusApproach:    at(0.9),
        surplusCrossed:     at(1.1),
        /* exact boundary at each threshold, plus one inside the 0.05 epsilon */
        notifiableExact:    at(-1.5),
        breachExact:        at(-3.0),
        surplusExact:       at(1.0),
        breachInsideEps:    at(-3.02),
        breachOutsideEps:   at(-3.06),
        /* nearest-threshold selection is unchanged: -4.0 still reports the
           -3.0 breach, crossed by 1.0 */
        farBeyondBreach:    at(-4.0),
        noThresholds:       describeThresholdDistance('nope', 0)
      };

      const textAt = v => {
        const host = document.createElement('div');
        host.innerHTML = _perfFinancePanel({
          snapshot: {
            quarterId: 'Q1', optionId: 'x', outcome: {}, history: [],
            endStats: Object.assign(initialMetricStats(), { budget: v })
          }
        });
        return host.querySelector('.rep-perf-band').textContent;
      };
      return {
        cases,
        rendered: { crossed: textAt(-3.1), approaching: textAt(-2.9), reached: textAt(-3.0) },
        /* getNearestThreshold still answers its own contract after delegating. */
        nearestStillWorks: (() => {
          const n = getNearestThreshold('budget', -3.1);
          return n && n.threshold.title === 'DEFICIT BREACH' && Math.abs(n.distance - 0.1) < 1e-9;
        })()
      };
    });

    const c = s.cases;
    eq(c.notifiableApproach.state, 'approaching', 'threshold: budget -1.4 is approaching DEFICIT NOTIFIABLE');
    eq(c.notifiableApproach.title, 'DEFICIT NOTIFIABLE', 'threshold: budget -1.4 selects DEFICIT NOTIFIABLE');
    eq(c.notifiableCrossed.state, 'crossed', 'threshold: budget -1.6 has crossed DEFICIT NOTIFIABLE');
    eq(c.breachApproach.state, 'approaching', 'threshold: budget -2.9 is approaching DEFICIT BREACH');
    eq(c.breachCrossed.state, 'crossed', 'threshold: budget -3.1 has crossed DEFICIT BREACH');
    eq(c.surplusApproach.state, 'approaching', 'threshold: budget 0.9 is approaching SURPLUS DELIVERED');
    eq(c.surplusCrossed.state, 'crossed', 'threshold: budget 1.1 has crossed SURPLUS DELIVERED');
    eq(c.notifiableExact.state, 'reached', 'threshold: budget exactly -1.5 reads as reached');
    eq(c.breachExact.state, 'reached', 'threshold: budget exactly -3.0 reads as reached');
    eq(c.surplusExact.state, 'reached', 'threshold: budget exactly 1.0 reads as reached');
    eq(c.breachInsideEps.state, 'reached', 'threshold: 0.02 away rounds to nothing and reads as reached');
    eq(c.breachOutsideEps.state, 'crossed', 'threshold: 0.06 away is outside the epsilon and reads as crossed');
    eq(c.farBeyondBreach.title, 'DEFICIT BREACH', 'threshold: budget -4.0 still selects the nearest threshold');
    eq(c.farBeyondBreach.mag, 1, 'threshold: budget -4.0 is 1.0 beyond DEFICIT BREACH');
    eq(c.noThresholds, null, 'threshold: a metric with no thresholds returns null');
    ok(s.nearestStillWorks, 'threshold: getNearestThreshold keeps its {threshold, distance} contract');
    /* Rendered, not just the pure function: the view can double-escape a correct
       result, which is how the missing currency symbol survived in the first place. */
    ok(s.rendered.crossed.indexOf('£0.1m beyond DEFICIT BREACH') >= 0,
       'threshold: the rendered band line reads "£0.1m beyond DEFICIT BREACH" (' + s.rendered.crossed + ')');
    ok(s.rendered.approaching.indexOf('£0.1m to DEFICIT BREACH') >= 0,
       'threshold: the rendered band line reads "£0.1m to DEFICIT BREACH" (' + s.rendered.approaching + ')');
    ok(s.rendered.reached.indexOf('DEFICIT BREACH threshold reached') >= 0,
       'threshold: the rendered band line reads "DEFICIT BREACH threshold reached" (' + s.rendered.reached + ')');
    ok(s.rendered.crossed.indexOf('&pound;') < 0,
       'threshold: the currency entity is resolved, not printed literally');
    ok(page._errors.length === 0, 'threshold: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK COMMIT 4: WHICH SNAPSHOTS A PLAYER EVER SEES ----
     The model sensitivity block below calibrates on a specific set of snapshots,
     and this test is what establishes which set that is. A pack reports the
     outcome of the quarter BEFORE the one it is asking about, so across a complete
     game the derived Operations and Workforce figures a player actually reads are
     the Q0 baseline and the Q1, Q2 and Q3 closes. The Q4 close is derivable but
     never rendered: confirming the Q4 decision opens the Year End overlay instead
     of a fifth pack, and the Year End overlay carries no derived operational or
     workforce figures.

     That matters because calibrating on all four closes flatters the model. It
     credits spread that comes from a fourth quarter of compounding the player is
     never shown, and it would let an authored Q4 term (the winter delayed-transfer
     pressure, say) carry a clamp-utilisation figure while being invisible in play.

     If a later commit adds the Q4 pack or puts an operational summary on the Year
     End overlay, this test fails - which is the point. It is the tripwire that
     says the sensitivity calibration basis has changed and should be re-measured,
     not a claim that the current gap is desirable. */
  console.log('\nBPS-001 X9/X10 player-visible snapshots:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      resetGameState();
      const packed = [];
      /* the real completion path, opening the pack every quarter */
      for (let i = 0; i < QUARTERS.length; i++) {
        quarterComplete = true;
        openReport();
        packed.push(REPORT.data.snapshot.quarterId);
        _selectReportOption(0);
        _confirmSelectedReportOption();
        goToNextReportQuarter();
      }
      const after = { reportOpen: isReportOpen(), yearEndOpen: isYearEndOpen() };
      /* Does anything on the Year End overlay report a derived figure? Checked
         against the real rendered text rather than by reading year-end.js, so
         adding one trips this wherever it is added from. */
      const yeText = (document.getElementById('yearEndRoot') || {}).textContent || '';
      const derivedLabels = ['Bed occupancy', 'Length of stay', 'Delayed transfers',
                             'Ambulance handovers', 'Cancelled operations',
                             'Vacancy rate', 'Staff turnover', 'Sickness absence',
                             'Staff survey'];
      const yeDerived = derivedLabels.filter(l => yeText.indexOf(l) >= 0);
      closeYearEnd && closeYearEnd();
      resetGameState();
      return { packed, after, yeDerived };
    });

    console.log('    quarters whose outcome a pack ever reports: ' + JSON.stringify(s.packed));
    eq(s.packed.length, 4, 'visible: a complete game opens exactly four board packs');
    eq(s.packed[0], 'Q0', 'visible: the first pack reports the opening baseline, not a decision');
    eq(s.packed.slice(1).join(','), 'Q1,Q2,Q3',
       'visible: the later packs report the Q1, Q2 and Q3 outcomes');
    ok(s.packed.indexOf('Q4') < 0,
       'visible: no pack ever reports the Q4 outcome, so its derived figures are unseen');
    ok(!s.after.reportOpen, 'visible: confirming the Q4 decision leaves no pack open');
    ok(s.after.yearEndOpen, 'visible: confirming the Q4 decision opens the Year End overlay instead');
    eq(s.yeDerived.length, 0,
       'visible: the Year End overlay reports no derived operational or workforce figure' +
       (s.yeDerived.length ? ' (found ' + s.yeDerived.join(', ') + ')' : ''));
    ok(page._errors.length === 0, 'visible: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK COMMIT 4: SEMANTIC RANKING ----------------
     Statistical health is not correctness. A model can spread its figures nicely
     across every band and still say something absurd about a specific decision,
     and a board game is played one decision at a time - the group argues about
     Rapid Discharge against Slow Non-Essential Care, not about the correlation
     matrix. Every case here failed before REPORTING_MECHANISMS existed:

       - Accelerating discharge planning reported a LONGER length of stay than
         doing nothing (102.5 against 100.0), because the option costs morale and
         length of stay reads morale.
       - Funding the discharge partnership beat expanding the virtual ward on
         delayed transfers by 0.02 beds.
       - Deferring capital reported FEWER delayed transfers than extending the
         discharge lounge, because deferring capital improves the budget.

     Each case is measured as a SINGLE quarter applied to the opening position, so
     the comparison isolates the option instead of a whole path. */
  console.log('\nBPS-001 X9/X10 semantic ranking:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const figuresAt = (stats, ctx) =>
        Object.assign({}, deriveOperational(stats, ctx), deriveWorkforce(stats, ctx));
      /* one quarter, one option, from the opening board position */
      function only(quarterId, optionId) {
        const opt = getQuarterOption(getQuarterById(quarterId), optionId);
        return figuresAt(applyMetricEffects(initialMetricStats(), opt.effects),
                         { quarterId: quarterId, optionId: optionId });
      }
      const open = figuresAt(initialMetricStats(), null);
      const f = {
        rapidDischarge:   only('Q1', 'rapid_discharge'),
        slowNonEssential: only('Q1', 'slow_non_essential_care'),
        divert:           only('Q1', 'divert_to_other_trusts'),
        escalationWard:   only('Q2', 'open_escalation_ward'),
        virtualWard:      only('Q2', 'virtual_ward'),
        cancelElectives:  only('Q2', 'cancel_electives'),
        partnership:      only('Q2', 'discharge_partnership'),
        dischargeLounge:  only('Q4', 'expand_discharge_lounge'),
        deferCapital:     only('Q4', 'defer_capital')
      };

      /* --- the mechanism table's own contract --- */
      const quarterIds = QUARTERS.map(q => q.id);
      const optionIds = {};
      QUARTERS.forEach(q => { optionIds[q.id] = q.options.map(o => o.id); });
      const derivedFields = {
        operational: ['occupancy', 'losPct', 'dtocBeds', 'ambulanceHandover', 'cancelledOps'],
        workforce: ['vacancyRate', 'turnover', 'sickness', 'surveyScore']
      };
      function auditKeys(table, wantOption) {
        const bad = [];
        Object.keys(table).forEach(key => {
          const parts = key.split(':');
          if (wantOption && parts.length !== 2) { bad.push(key + ' (needs quarter:option)'); return; }
          if (!wantOption && parts.length !== 1) { bad.push(key + ' (must be quarter only)'); return; }
          if (quarterIds.indexOf(parts[0]) < 0) { bad.push(key + ' (unknown quarter)'); return; }
          if (wantOption && optionIds[parts[0]].indexOf(parts[1]) < 0) {
            bad.push(key + ' (unknown option)'); return;
          }
          Object.keys(table[key]).forEach(section => {
            if (!derivedFields[section]) { bad.push(key + ' (unknown section ' + section + ')'); return; }
            Object.keys(table[key][section]).forEach(field => {
              if (derivedFields[section].indexOf(field) < 0) bad.push(key + ' (unknown field ' + field + ')');
              else if (typeof table[key][section][field] !== 'number') bad.push(key + '.' + field + ' (not a number)');
            });
          });
        });
        return bad;
      }

      /* A mechanism must SHIFT the figure, not pin it: with the Q2 partnership
         mechanism in play, worsening the position must still move the figure. */
      const pStats = applyMetricEffects(initialMetricStats(),
        getQuarterOption(getQuarterById('Q2'), 'discharge_partnership').effects);
      const pCtx = { quarterId: 'Q2', optionId: 'discharge_partnership' };
      const worse = Object.assign({}, pStats, { waiting: pStats.waiting + 12, budget: pStats.budget - 2 });

      return {
        openLos: open.losPct, openDtoc: open.dtocBeds, openHand: open.ambulanceHandover,
        openOcc: open.occupancy, openCanc: open.cancelledOps,
        rdLos: f.rapidDischarge.losPct, rdDtoc: f.rapidDischarge.dtocBeds,
        dpDtoc: f.partnership.dtocBeds, vwDtoc: f.virtualWard.dtocBeds,
        dlDtoc: f.dischargeLounge.dtocBeds, dcDtoc: f.deferCapital.dtocBeds,
        ewOcc: f.escalationWard.occupancy, ewDtoc: f.escalationWard.dtocBeds,
        ceCanc: f.cancelElectives.cancelledOps, snCanc: f.slowNonEssential.cancelledOps,
        dvHand: f.divert.ambulanceHandover,
        /* the virtual ward shortens the acute stay; the escalation ward does not */
        vwLos: f.virtualWard.losPct, ewLos: f.escalationWard.losPct,
        mechBad: auditKeys(REPORTING_MECHANISMS, true),
        exogBad: auditKeys(REPORTING_EXOGENOUS, false),
        mechCount: Object.keys(REPORTING_MECHANISMS).length,
        q3HasNoMechanism: !Object.keys(REPORTING_MECHANISMS).some(k => k.indexOf('Q3:') === 0),
        /* quarter-only ctx must pick up no mechanism at all */
        quarterOnlyCtx: deriveOperational(pStats, { quarterId: 'Q2' }).dtocBeds,
        withOption: deriveOperational(pStats, pCtx).dtocBeds,
        stillResponsive: deriveOperational(worse, pCtx).dtocBeds > deriveOperational(pStats, pCtx).dtocBeds
      };
    });

    console.log('    opening: LOS ' + s.openLos.toFixed(1) + '  DTOC ' + s.openDtoc.toFixed(1) +
      '  handover ' + s.openHand.toFixed(1) + '  occupancy ' + s.openOcc.toFixed(1) +
      '  cancelled ' + s.openCanc.toFixed(1));
    console.log('    Q1 rapid discharge:  LOS ' + s.rdLos.toFixed(1) + '  DTOC ' + s.rdDtoc.toFixed(1));
    console.log('    Q2 partnership ' + s.dpDtoc.toFixed(1) + ' vs virtual ward ' + s.vwDtoc.toFixed(1) +
      ' DTOC beds (margin ' + (s.vwDtoc - s.dpDtoc).toFixed(1) + ')');
    console.log('    Q4 discharge lounge ' + s.dlDtoc.toFixed(1) + ' vs defer capital ' + s.dcDtoc.toFixed(1) +
      ' DTOC beds (margin ' + (s.dcDtoc - s.dlDtoc).toFixed(1) + ')');

    ok(s.rdLos < s.openLos,
       'semantic: accelerating discharge does not report a longer length of stay than doing nothing (' +
       s.rdLos.toFixed(1) + ' vs ' + s.openLos.toFixed(1) + ')');
    ok(s.rdDtoc < s.openDtoc,
       'semantic: accelerating discharge reports fewer delayed transfers than doing nothing (' +
       s.rdDtoc.toFixed(1) + ' vs ' + s.openDtoc.toFixed(1) + ')');
    ok(s.vwDtoc - s.dpDtoc >= 3,
       'semantic: funding the discharge partnership beats the virtual ward on delayed transfers by at least 3 beds (' +
       (s.vwDtoc - s.dpDtoc).toFixed(1) + ')');
    ok(s.dcDtoc - s.dlDtoc >= 3,
       'semantic: extending the discharge lounge beats deferring capital on delayed transfers by at least 3 beds (' +
       (s.dcDtoc - s.dlDtoc).toFixed(1) + ')');
    ok(s.vwLos < s.ewLos,
       'semantic: the virtual ward shortens the acute stay more than opening an escalation ward does');
    ok(s.ewOcc < s.openOcc,
       'semantic: opening 18 escalation beds reduces bed occupancy');
    ok(s.ewDtoc > s.openDtoc,
       'semantic: opening an escalation ward reports MORE delayed transfers, where they accumulate');
    ok(s.ceCanc > s.openCanc,
       'semantic: cancelling electives reports more cancelled operations');
    ok(s.snCanc > s.openCanc,
       'semantic: pausing non-essential activity reports more cancelled operations');
    ok(s.dvHand < s.openHand,
       'semantic: diverting ambulances reduces handover delays');
    eq(s.mechBad.length, 0, 'mechanism table: every key names a real quarter, option, section and field' +
       (s.mechBad.length ? ' (' + s.mechBad.join('; ') + ')' : ''));
    eq(s.exogBad.length, 0, 'exogenous table: every key names a real quarter, section and field' +
       (s.exogBad.length ? ' (' + s.exogBad.join('; ') + ')' : ''));
    ok(s.mechCount >= 10, 'mechanism table: direct mechanisms are authored for most options (' + s.mechCount + ')');
    ok(s.q3HasNoMechanism,
       'mechanism table: the four Q3 communications options author no operational mechanism');
    ok(s.withOption < s.quarterOnlyCtx,
       'mechanism table: a mechanism needs the option id - a quarter-only ctx picks up none of it');
    ok(s.stillResponsive,
       'mechanism table: a mechanism shifts the figure without pinning it - worsening the position still moves it');
    ok(page._errors.length === 0, 'semantic: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK COMMIT 4: MODEL SENSITIVITY ----------------
     BPS-001 X9 (workforce insensitivity) and X10 (operations collinearity),
     measured rather than argued. Walks all 256 legal decision paths and records
     every derived Operations and Workforce figure at all four quarter closes
     (1024 snapshots), then checks four things:

       1. BAND REACHABILITY - X3 gave every figure its own bands; half of them
          used to be dead. Before this commit vacancy and turnover reached 2 of 4,
          and length of stay, delayed transfers, sickness and the staff survey
          could not reach their fourth band at all.
       2. CLAMP UTILISATION AND SATURATION - the clamps record a design intent the
          old coefficients never delivered (vacancy traversed 27% of its authored
          range, the staff survey 26%).
       3. PAIRWISE CORRELATION within each tab. 0.90 is a deliberate, statable
          line: above it, two rows are telling the board the same thing in
          different units, which is the defect. Vacancy, turnover and sickness used
          to correlate at exactly 1.0000 - identical up to an affine transform.
       4. Q1 SPREAD - the sharpest test, because it is the first pack a player ever
          opens. Four fundamentally different decisions used to produce a Workforce
          tab that was the same colour and nearly the same numbers in all four
          worlds.

     WHICH SNAPSHOTS ARE ASSERTED ON. Everything here is asserted on the
     PLAYER-VISIBLE set: the Q1, Q2 and Q3 closes, three per path, 768 in all. The
     preceding block establishes that those are the only derived figures a pack
     ever renders. The Q4 close is enumerated and REPORTED, never asserted on -
     calibrating on it flatters the model with a fourth quarter of compounding
     nobody is shown, and it would let an authored Q4 term carry a clamp-utilisation
     figure while being invisible in play. The gap between the two sets is printed
     precisely so it stays visible.

     Correlation is reported on the Q3 close alone (a single cross-section, which is
     the shape BPS-001 §1.1 measured at year end) and on the whole visible set, and
     the assertion takes the worse of the two. The calibration numbers are printed
     even when everything passes: that is the only reason this tuning will still be
     reviewable in a year. */
  console.log('\nBPS-001 X9/X10 model sensitivity (256 paths, player-visible closes):');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const OPS = ['occupancy', 'losPct', 'dtocBeds', 'ambulanceHandover', 'cancelledOps'];
      const WF = ['vacancyRate', 'turnover', 'sickness', 'surveyScore'];
      const ALL = OPS.concat(WF);
      const nsOf = f => (OPS.indexOf(f) >= 0 ? 'operational' : 'workforce');
      const CLAMP = {
        occupancy: 'occClamp', losPct: 'losClamp', dtocBeds: 'dtocClamp',
        ambulanceHandover: 'handClamp', cancelledOps: 'cancClamp',
        vacancyRate: 'vacClamp', turnover: 'turnClamp', sickness: 'sickClamp',
        surveyScore: 'survClamp'
      };
      const BASE = {
        occupancy: 'occBase', losPct: 'losBase', dtocBeds: 'dtocBase',
        ambulanceHandover: 'handBase', cancelledOps: 'cancBase', vacancyRate: 'vacBase',
        turnover: 'turnBase', sickness: 'sickBase', surveyScore: 'survBase'
      };
      const clampOf = f => REPORTING_COEFFS[nsOf(f)][CLAMP[f]];
      const bandsOf = f => REPORTING_BENCHMARKS[nsOf(f)][f + 'Bands'];
      const figuresAt = (stats, ctx) =>
        Object.assign({}, deriveOperational(stats, ctx), deriveWorkforce(stats, ctx));

      /* Same rec() walk over QUARTERS as the phase 5 reachability block.
         `all` holds 256 x 4 snapshots so each full path is weighted equally;
         `snaps` is the player-visible subset (the Q1-Q3 closes, 3 per path);
         `q4` the 256 unseen Q4 closes; `q3` the 256 Q3 closes, the last
         cross-section a player actually reads; `q1` the four distinct Q1 closes. */
      const all = [], snaps = [], q4 = [], q3 = [], q1 = [];
      let n = 0;
      function rec(qi, stats, trail) {
        if (qi === QUARTERS.length) {
          n++;
          trail.forEach(t => all.push(t));
          /* a pack reports the PREVIOUS quarter's outcome, so the last close a
             player ever sees derived is Q3's */
          trail.slice(0, QUARTERS.length - 1).forEach(t => snaps.push(t));
          q3.push(trail[QUARTERS.length - 2]);
          q4.push(trail[QUARTERS.length - 1]);
          return;
        }
        const opts = QUARTERS[qi].options;
        for (let o = 0; o < opts.length; o++) {
          const next = applyMetricEffects(stats, opts[o].effects);
          const snap = figuresAt(next, { quarterId: QUARTERS[qi].id, optionId: opts[o].id });
          if (qi === 0) q1.push(snap);
          rec(qi + 1, next, trail.concat([snap]));
        }
      }
      rec(0, initialMetricStats(), []);

      function pearson(rows, a, b) {
        const N = rows.length;
        let ma = 0, mb = 0;
        for (let i = 0; i < N; i++) { ma += rows[i][a]; mb += rows[i][b]; }
        ma /= N; mb /= N;
        let sab = 0, saa = 0, sbb = 0;
        for (let i = 0; i < N; i++) {
          const da = rows[i][a] - ma, db = rows[i][b] - mb;
          sab += da * db; saa += da * da; sbb += db * db;
        }
        return (saa && sbb) ? sab / Math.sqrt(saa * sbb) : 0;
      }

      function profile(rows) {
        const out = { reach: {}, reachTones: {}, used: {}, satLo: {}, satHi: {}, range: {} };
        ALL.forEach(f => {
          const c = clampOf(f);
          let lo = Infinity, hi = -Infinity, sl = 0, sh = 0;
          const tones = {};
          for (let i = 0; i < rows.length; i++) {
            const v = rows[i][f];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
            if (Math.abs(v - c[0]) < 1e-9) sl++;
            if (isFinite(c[1]) && Math.abs(v - c[1]) < 1e-9) sh++;
            tones[getBenchmarkTone(bandsOf(f), v)] = (tones[getBenchmarkTone(bandsOf(f), v)] || 0) + 1;
          }
          out.reach[f] = Object.keys(tones).length;
          out.reachTones[f] = tones;
          out.range[f] = [lo, hi];
          out.used[f] = isFinite(c[1]) ? (hi - lo) / (c[1] - c[0]) : null;
          out.satLo[f] = sl / rows.length;
          out.satHi[f] = isFinite(c[1]) ? sh / rows.length : 0;
        });
        return out;
      }
      /* asserted on; reported for comparison only */
      const visible = profile(snaps);
      const everything = profile(all);
      const reach = visible.reach, reachTones = visible.reachTones, range = visible.range;
      const used = visible.used, satLo = visible.satLo, satHi = visible.satHi;

      /* worst pair within each tab, on the worse of the two visible measures: the
         Q3 close as a single cross-section, and the whole visible set */
      const corr = {}, worst = {};
      [['ops', OPS], ['wf', WF]].forEach(([tag, g]) => {
        let mx = 0, pair = '';
        for (let i = 0; i < g.length; i++) {
          for (let j = i + 1; j < g.length; j++) {
            const cy = Math.abs(pearson(q3, g[i], g[j]));
            const ca = Math.abs(pearson(snaps, g[i], g[j]));
            corr[g[i] + '/' + g[j]] = {
              q3: +cy.toFixed(4), visible: +ca.toFixed(4),
              unseenQ4: +Math.abs(pearson(q4, g[i], g[j])).toFixed(4)
            };
            if (Math.max(cy, ca) > mx) { mx = Math.max(cy, ca); pair = g[i] + '/' + g[j]; }
          }
        }
        worst[tag] = { value: mx, pair };
      });

      const q1Spread = {}, q1Tones = {}, q1Values = {}, q1Distinct1dp = {};
      ALL.forEach(f => {
        const vs = q1.map(x => x[f]);
        q1Values[f] = vs;
        q1Spread[f] = Math.max.apply(null, vs) - Math.min.apply(null, vs);
        q1Tones[f] = Object.keys(vs.reduce((a, v) => (a[getBenchmarkTone(bandsOf(f), v)] = 1, a), {})).length;
        q1Distinct1dp[f] = Object.keys(vs.reduce((a, v) => (a[v.toFixed(1)] = 1, a), {})).length;
      });

      /* WITHIN-QUARTER DECISION SPREAD. Clamp traversal is a proxy for "this row
         says something", and it is a proxy that can be gamed: an authored
         per-quarter shift widens the range without making any single decision more
         legible. This is the statistic that cannot be gamed - at each of the 21
         decision points a player can reach in the visible tree (Q1, then each of
         the 4 Q2 positions, then each of the 16 Q3 positions), how far apart are
         the four options actually on offer on this row? That is exactly what the
         group is trying to read when they argue. */
      const points = [];
      (function walk(qi, stats) {
        if (qi > QUARTERS.length - 2) return;          /* Q1..Q3 only: see above */
        const sibs = QUARTERS[qi].options.map(o => {
          const next = applyMetricEffects(stats, o.effects);
          return { fig: figuresAt(next, { quarterId: QUARTERS[qi].id, optionId: o.id }), next: next };
        });
        points.push({ qi: qi, figs: sibs.map(x => x.fig) });
        sibs.forEach(x => walk(qi + 1, x.next));
      })(0, initialMetricStats());
      const spread = {};
      ALL.forEach(f => {
        const rs = points.map(p => {
          const vs = p.figs.map(x => x[f]);
          return Math.max.apply(null, vs) - Math.min.apply(null, vs);
        }).sort(function (a, b) { return a - b; });
        spread[f] = {
          min: rs[0], median: rs[Math.floor(rs.length / 2)], max: rs[rs.length - 1],
          allFourDistinct: points.filter(p =>
            Object.keys(p.figs.reduce((a, x) => (a[x[f].toFixed(1)] = 1, a), {})).length === 4).length
        };
      });

      /* Invariant: at the opening board position with ctx = null, every derived
         figure equals its authored base EXACTLY. Every driver term is a delta from
         a source metric's authored start, so this is what guarantees the Q1 pack
         is unshifted and that occupancy still lands on 92 = occupancyNorm. */
      const opening = figuresAt(initialMetricStats(), null);
      const openingExact = {};
      ALL.forEach(f => { openingExact[f] = opening[f] === REPORTING_COEFFS[nsOf(f)][BASE[f]]; });

      return { n, snapshots: snaps.length, allSnapshots: all.length,
               reach, reachTones, range, used, satLo, satHi,
               unseen: { reach: everything.reach, used: everything.used, range: everything.range },
               corr, worst, q1Spread, q1Tones, q1Values, q1Distinct1dp, openingExact,
               spread, decisionPoints: points.length,
               losFloor: REPORTING_COEFFS.operational.losClamp[0] };
    });

    /* ---- calibration, printed pass or fail ---- */
    console.log('    paths: ' + s.n + '   asserted on ' + s.snapshots +
      ' player-visible closes (Q1-Q3); ' + s.allSnapshots + ' exist including the unseen Q4');
    console.log('    band reachability / clamp utilisation (visible, then all four closes):');
    Object.keys(s.reach).forEach(f => {
      const u = s.used[f] == null ? 'open' : (s.used[f] * 100).toFixed(0) + '%';
      const ua = s.unseen.used[f] == null ? 'open' : (s.unseen.used[f] * 100).toFixed(0) + '%';
      console.log('      ' + f.padEnd(18) + s.reach[f] + ' bands  ' +
        s.range[f][0].toFixed(2) + '..' + s.range[f][1].toFixed(2) +
        '  clamp used ' + u +
        '  saturation lo ' + (s.satLo[f] * 100).toFixed(1) + '% hi ' + (s.satHi[f] * 100).toFixed(1) + '%' +
        '   [all closes: ' + s.unseen.reach[f] + ' bands, ' + ua + ']' +
        '  ' + JSON.stringify(s.reachTones[f]));
    });
    console.log('    pairwise correlation (Q3 close / all visible / unseen Q4 close):');
    Object.keys(s.corr).forEach(k =>
      console.log('      ' + k.padEnd(38) + s.corr[k].q3.toFixed(4) + ' / ' +
        s.corr[k].visible.toFixed(4) + ' / ' + s.corr[k].unseenQ4.toFixed(4)));
    console.log('    worst operations pair: ' + s.worst.ops.value.toFixed(4) + ' (' + s.worst.ops.pair + ')');
    console.log('    worst workforce pair:  ' + s.worst.wf.value.toFixed(4) + ' (' + s.worst.wf.pair + ')');
    console.log('    Q1 spread across the four options (the first pack a player opens):');
    Object.keys(s.q1Spread).forEach(f =>
      console.log('      ' + f.padEnd(18) + s.q1Values[f].map(v => v.toFixed(2)).join('  ') +
        '   spread ' + s.q1Spread[f].toFixed(2) +
        '   distinct at 1dp ' + s.q1Distinct1dp[f] + '/4   tones ' + s.q1Tones[f]));
    console.log('    within-quarter spread over all ' + s.decisionPoints +
      ' visible decision points (min / median / max, and how many separate all four at 1dp):');
    Object.keys(s.spread).forEach(f =>
      console.log('      ' + f.padEnd(18) + s.spread[f].min.toFixed(2).padStart(6) + ' / ' +
        s.spread[f].median.toFixed(2).padStart(6) + ' / ' + s.spread[f].max.toFixed(2).padStart(6) +
        '   all four at 1dp: ' + s.spread[f].allFourDistinct + '/' + s.decisionPoints));

    eq(s.n, 256, 'sensitivity: every one of the 256 legal decision paths is enumerated');
    eq(s.allSnapshots, 1024, 'sensitivity: every path contributes all four of its quarter closes');
    eq(s.snapshots, 768,
       'sensitivity: calibration is asserted on the three closes per path a player can actually read');

    /* 1. at least three of four authored bands per figure (all four is better) */
    Object.keys(s.reach).forEach(f =>
      ok(s.reach[f] >= 3, 'sensitivity: ' + f + ' reaches at least 3 of its 4 authored bands (' + s.reach[f] + ')'));

    /* 2. no pair of figures within a tab moves in lockstep */
    ok(s.worst.ops.value < 0.90, 'sensitivity: no two operations figures move in lockstep (worst ' +
      s.worst.ops.value.toFixed(4) + ', ' + s.worst.ops.pair + ')');
    ok(s.worst.wf.value < 0.90, 'sensitivity: no two workforce figures move in lockstep (worst ' +
      s.worst.wf.value.toFixed(4) + ', ' + s.worst.wf.pair + ')');

    /* 3. the first pack a player opens can be told apart, row by row */
    ['vacancyRate', 'turnover', 'sickness', 'surveyScore'].forEach(f =>
      eq(s.q1Distinct1dp[f], 4,
        'sensitivity: the four Q1 options produce four different ' + f + ' figures at 1 dp'));
    ok(['vacancyRate', 'turnover', 'sickness', 'surveyScore'].filter(f => s.q1Tones[f] >= 2).length >= 2,
      'sensitivity: at least two Workforce rows change tone across the four Q1 options');

    /* 4/5. the clamps are traversed rather than recorded, and nothing sits on a
       bound. The open-ended handover / cancelled-ops clamps are excluded (a 0 floor
       there is a real best outcome, not saturation), and so is occupancy, which is
       at 100% utilisation by design.

       dtocBeds is asserted at a LOWER bar than the other five, and the number is
       not a rounding of 55%. Its authored clamp is [0, 80], the widest in the
       model, and three quarters of authored effects cannot span it: the only lever
       that reaches 55% is the waiting coefficient, and pushing it that far takes
       the occupancy correlation to 0.96, i.e. it buys the clamp figure by
       re-creating the defect this commit exists to remove. The trade-off is
       measured, recorded in the coefficient comment, and the figure passes the
       statistic that actually matters (within-quarter spread, below) more strongly
       than any other row. If someone widens it later, raise this. */
    ['losPct', 'vacancyRate', 'turnover', 'sickness', 'surveyScore'].forEach(f => {
      ok(s.used[f] >= 0.55, 'sensitivity: ' + f + ' traverses at least 55% of its authored clamp (' +
        (s.used[f] * 100).toFixed(0) + '%)');
    });
    ok(s.used.dtocBeds >= 0.45,
      'sensitivity: dtocBeds traverses at least 45% of its very wide authored clamp (' +
      (s.used.dtocBeds * 100).toFixed(0) + '%, capped by the correlation bar - see the coefficient comment)');
    ['losPct', 'dtocBeds', 'vacancyRate', 'turnover', 'sickness', 'surveyScore'].forEach(f => {
      ok(s.satLo[f] <= 0.10, 'sensitivity: ' + f + ' does not sit on its clamp floor (' +
        (s.satLo[f] * 100).toFixed(1) + '%)');
      ok(s.satHi[f] <= 0.10, 'sensitivity: ' + f + ' does not sit on its clamp ceiling (' +
        (s.satHi[f] * 100).toFixed(1) + '%)');
    });

    /* 4b. within-quarter decision spread - the ungameable version of criterion 4.
       At every decision point a player can reach, the four options on offer must be
       distinguishable on every row. */
    eq(s.decisionPoints, 21, 'sensitivity: every decision point in the visible tree is measured (Q1 + 4 Q2 + 16 Q3)');
    Object.keys(s.spread).forEach(f => {
      if (f === 'occupancy') return;
      ok(s.spread[f].min > 0,
        'sensitivity: ' + f + ' is never flat across the four options on offer (worst spread ' +
        s.spread[f].min.toFixed(2) + ')');
      ok(s.spread[f].median >= 1.0,
        'sensitivity: ' + f + ' separates the options by at least 1.0 at the median decision point (' +
        s.spread[f].median.toFixed(2) + ')');
    });
    /* Occupancy is the exception and it is the clamp, not the model: it is the one
       figure at full clamp utilisation by design, so at the most extreme Q3
       positions all four options land on 99. Asserted explicitly rather than
       skipped, so a future edit that makes it worse is visible. */
    ok(s.spread.occupancy.min === 0 && s.spread.occupancy.median >= 1.0,
      'sensitivity: occupancy separates the options at the median decision point but flattens where its clamp saturates (min ' +
      s.spread.occupancy.min.toFixed(2) + ', median ' + s.spread.occupancy.median.toFixed(2) + ')');
    Object.keys(s.q1Distinct1dp).forEach(f =>
      eq(s.q1Distinct1dp[f], 4,
        'sensitivity: at the first decision a player ever faces, ' + f + ' tells all four options apart at 1 dp'));
    /* The one clamp BPS-001 permits moving, stated here so the change is visible
       in the log rather than only in the diff. */
    eq(s.losFloor, 85, 'sensitivity: the length of stay floor is 85 (lowered from 90, the one permitted clamp change)');

    /* 6. the opening board position is unshifted */
    Object.keys(s.openingExact).forEach(f =>
      ok(s.openingExact[f], 'sensitivity: at the opening position ' + f + ' equals its authored base exactly'));

    ok(page._errors.length === 0, 'sensitivity: no console/page errors');
    await page.close();
  }

  /* ---------------- BPS-001 X11: I&E LINES, SUBTOTALS AND THE BALANCING PLUG ----
     The defect: `Other operating income` was the balancing plug, so the one line
     with no narrative behind it absorbed every other line's error and reported
     the total back as the largest FAVOURABLE variance on the page - favourable
     precisely because everything else had gone wrong. The plug is now an explicit
     reserves drawdown, authored goodWhen:'down' so a bigger one reads adverse. */
  console.log('\nBPS-001 X11 finance lines, subtotals and the balancing plug:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const c = REPORTING_COEFFS.finance;
      const lineById = (ie, id) => ie.lines.find(l => l.id === id);

      /* --- C.3 plan balance: the bases themselves reconcile to zero --- */
      const planIncome = c.clinicalIncomeBase + c.privateIncomeBase +
                         c.otherIncomeBase + c.drawdownBase;
      const planSpend = c.payBase + c.agencyBase + c.drugsBase + c.suppliesBase;

      /* --- C.6.2 opening board position: every line on its plan, surplus 0 --- */
      const opening = deriveIncomeExpenditure(initialMetricStats(), null);
      const openingOnPlan = {};
      opening.lines.forEach(l => { openingOnPlan[l.id] = Math.abs(l.actual - l.budget) < 1e-9; });

      /* --- C.1 grouping and favourability are separate concepts --- */
      const goodWhenOf = {};
      opening.lines.forEach(l => { goodWhenOf[l.id] = l.kind + '/' + l.goodWhen; });

      /* --- C.6.5 a drawdown larger than plan is warn, never good --- */
      const strained = Object.assign(initialMetricStats(),
        { budget: -2, morale: 48, waiting: 78, safety: 50, rep: 50 });
      const strainedIe = deriveIncomeExpenditure(strained, null);
      const plug = lineById(strainedIe, 'drawdown');
      /* and the reverse: a strong position transfers BACK to reserves and reads good */
      const strongIe = deriveIncomeExpenditure(
        Object.assign(initialMetricStats(), { budget: 1.5, morale: 70, waiting: 55, safety: 78, rep: 72 }), null);
      const plugStrong = lineById(strongIe, 'drawdown');

      /* --- C.6.4 the plug ignores overrides; derived lines still re-balance --- */
      REPORTING_OVERRIDES['Q1:hire_temporary_staff'] = { finance: { drawdown: 99, otherIncome: 4 } };
      const ovCtx = { quarterId: 'Q1', optionId: 'hire_temporary_staff' };
      const ovIe = deriveIncomeExpenditure(strained, ovCtx);
      const plugIgnoresOverride = lineById(ovIe, 'drawdown').actual !== 99;
      const otherHonoursOverride = Math.abs(lineById(ovIe, 'otherIncome').actual - 4) < 1e-9;
      const stillReconciles = Math.abs(ovIe.surplus - strained.budget) < 1e-9;
      delete REPORTING_OVERRIDES['Q1:hire_temporary_staff'];

      /* --- C.6.3 across the reachable node set, the plug is never the largest
         favourable variance on a page where every operational line is adverse.
         Same rec() walk as the sensitivity block, and the same player-visible
         basis: a pack reports the PREVIOUS quarter's close, so Q4 is excluded. */
      const OPERATIONAL = ['clinicalIncome', 'privateIncome', 'otherIncome',
                           'paySpend', 'agencySpend', 'drugsSpend', 'suppliesSpend'];
      let nodes = 0, plugTopFavourableOnAdversePage = 0, allAdversePages = 0, worstReconErr = 0;
      (function rec(qi, stats, depth) {
        if (qi === QUARTERS.length) return;
        const opts = QUARTERS[qi].options;
        for (let o = 0; o < opts.length; o++) {
          const next = applyMetricEffects(stats, opts[o].effects);
          const ctx = { quarterId: QUARTERS[qi].id, optionId: opts[o].id };
          /* Q4's close is derivable but never rendered in a pack */
          if (qi < QUARTERS.length - 1) {
            const ie = deriveIncomeExpenditure(next, ctx);
            nodes++;
            worstReconErr = Math.max(worstReconErr, Math.abs(ie.surplus - next.budget));
            /* favourability in the figure's own direction */
            const fav = l => l.goodWhen === 'up' ? l.variance : -l.variance;
            const everyOperationalAdverse =
              OPERATIONAL.every(id => fav(lineById(ie, id)) < -1e-9);
            if (everyOperationalAdverse) {
              allAdversePages++;
              const plugFav = fav(lineById(ie, 'drawdown'));
              const bestOperational = Math.max.apply(null, OPERATIONAL.map(id => fav(lineById(ie, id))));
              if (plugFav > 0 && plugFav > bestOperational) plugTopFavourableOnAdversePage++;
            }
          }
          rec(qi + 1, next, depth + 1);
        }
      })(0, initialMetricStats(), 0);

      /* --- B.2 mutual exclusion: no figure may be authored in BOTH the override
         map (which REPLACES a derived value) and either additive map. The rule is
         stated in reporting-model.js; this is what enforces it. Synthetic entries
         prove the assertion can actually fail. */
      function clashes() {
        const out = [];
        Object.keys(REPORTING_OVERRIDES).forEach(k => {
          const quarter = k.split(':')[0];
          [[REPORTING_EXOGENOUS, quarter], [REPORTING_MECHANISMS, k]].forEach(pair => {
            const other = pair[0][pair[1]];
            if (!other) return;
            Object.keys(REPORTING_OVERRIDES[k]).forEach(section => {
              if (!other[section]) return;
              Object.keys(REPORTING_OVERRIDES[k][section]).forEach(field => {
                if (Object.prototype.hasOwnProperty.call(other[section], field)) {
                  out.push(k + ' ' + section + '.' + field);
                }
              });
            });
          });
        });
        return out;
      }
      const authoredClashes = clashes();
      REPORTING_OVERRIDES['Q2'] = { operational: { dtocBeds: 41 } };
      const detectsClash = clashes().length === 1;
      delete REPORTING_OVERRIDES['Q2'];

      return {
        planIncome, planSpend, planBalance: Math.abs(planIncome - planSpend),
        lineCount: opening.lines.length,
        openingOnPlan, openingSurplus: opening.surplus, goodWhenOf,
        plugTone: plug.tone, plugVariance: plug.variance,
        plugStrongTone: plugStrong.tone, plugStrongVariance: plugStrong.variance,
        plugIgnoresOverride, otherHonoursOverride, stillReconciles,
        nodes, allAdversePages, plugTopFavourableOnAdversePage, worstReconErr,
        authoredClashes, detectsClash
      };
    });

    /* C.3 - the invariant that makes the opening pack readable */
    eq(s.lineCount, 8, 'X11: the I&E has eight lines (was five)');
    ok(s.planBalance < 1e-9,
      'X11: the plan balances - income ' + s.planIncome.toFixed(1) +
      ' equals expenditure ' + s.planSpend.toFixed(1));

    /* C.6.2 */
    Object.keys(s.openingOnPlan).forEach(id =>
      ok(s.openingOnPlan[id], 'X11: at the opening board position ' + id + ' derives exactly to its plan'));
    ok(Math.abs(s.openingSurplus) < 1e-9, 'X11: at the opening board position the surplus is exactly 0');

    /* C.1 - the split that C.6.5 depends on */
    eq(s.goodWhenOf.clinicalIncome, 'income/up', 'X11: clinical income is an income line that is better when larger');
    eq(s.goodWhenOf.paySpend, 'expenditure/down', 'X11: pay is an expenditure line that is better when smaller');
    eq(s.goodWhenOf.drawdown, 'income/down',
      'X11: the reserves drawdown sits in the INCOME block but is better when SMALLER - the case kind alone cannot express');

    /* C.6.5 - the assertion that fails if C.1 was skipped */
    ok(s.plugVariance > 0.05 && s.plugTone === 'warn',
      'X11: a drawdown larger than plan renders warn, never good (variance +' +
      s.plugVariance.toFixed(2) + 'm, tone ' + s.plugTone + ')');
    ok(s.plugStrongVariance < -0.05 && s.plugStrongTone === 'good',
      'X11: a transfer back to reserves renders good (variance ' +
      s.plugStrongVariance.toFixed(2) + 'm, tone ' + s.plugStrongTone + ')');

    /* C.6.4 */
    ok(s.plugIgnoresOverride, 'X11: the balancing plug ignores an authored override');
    ok(s.otherHonoursOverride, 'X11: other operating income is now a normal derived line and honours an override');
    ok(s.stillReconciles, 'X11: the I&E still reconciles with an override on a derived line');

    /* C.6.1 / C.6.3 */
    ok(s.worstReconErr < 1e-9,
      'X11: income - expenditure equals budget on every player-visible node (worst error ' +
      s.worstReconErr.toExponential(1) + ' over ' + s.nodes + ' nodes)');
    eq(s.plugTopFavourableOnAdversePage, 0,
      'X11: on the ' + s.allAdversePages + ' nodes where every operational line is adverse, the plug is never the largest favourable variance');

    /* B.2 - the rule enforced rather than merely documented */
    eq(s.authoredClashes.length, 0,
      'X11/B2: no figure is authored in both REPORTING_OVERRIDES and an additive map' +
      (s.authoredClashes.length ? ' (' + s.authoredClashes.join(', ') + ')' : ''));
    ok(s.detectsClash, 'X11/B2: the mutual-exclusion check actually detects a planted clash');

    ok(page._errors.length === 0, 'X11: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK PHASE 5: GAUGE GEOMETRY + RENDERER ---------------- */
  console.log('\nboard pack phase 5 gauge renderer:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      /* --- angle --- */
      let angleReversals = 0, prevAngle = -Infinity;
      for (let v = 82; v <= 99.0001; v += 0.25) {
        const a = gaugeAngle(v, 82, 99);
        if (a < prevAngle - 1e-9) angleReversals++;
        prevAngle = a;
      }
      const angles = {
        atMin: gaugeAngle(82, 82, 99),
        atMax: gaugeAngle(99, 82, 99),
        belowMin: gaugeAngle(50, 82, 99),
        aboveMax: gaugeAngle(140, 82, 99),
        zeroSpan: gaugeAngle(7, 5, 5),
        reversals: angleReversals
      };

      /* --- renderer robustness --- */
      const cv = document.createElement('canvas');
      cv.width = 300; cv.height = 180;
      const bands = [
        { to: 89, color: '#1e8f4e' }, { to: 92, color: '#1a2236' },
        { to: 95, color: '#b07d10' }, { to: Infinity, color: '#e05252' }
      ];
      const cfg = extra => Object.assign({
        value: 92, min: 82, max: 99, bands: bands, norm: 92,
        markerColor: '#1a2236', valueText: '92.0%', bandText: 'AT NORM',
        minText: '82%', maxText: '99%'
      }, extra || {});

      const cases = [
        ['value at min', { value: 82 }], ['value at max', { value: 99 }],
        ['value below min', { value: 40 }], ['value above max', { value: 140 }],
        ['norm at min', { norm: 82 }], ['norm at max', { norm: 99 }],
        ['norm equal to value', { value: 94.2, norm: 94.2 }],
        ['norm absent', { norm: undefined }], ['norm out of range', { norm: 140 }],
        ['bands empty', { bands: [] }], ['bands absent', { bands: undefined }],
        ['bands short of max', { bands: [{ to: 85, color: '#1e8f4e' }] }],
        ['min equals max', { min: 90, max: 90 }],
        ['fractional value', { value: 93.47 }]
      ].map(([name, extra]) => {
        try {
          const g = renderSemicircleGauge(cv, cfg(extra));
          return { name, threw: false, geometry: !!(g && g.markers && g.markers.value) };
        } catch (e) { return { name, threw: true, geometry: false, message: e.message }; }
      });

      /* --- null / canvas-less --- */
      const nullCanvas = renderSemicircleGauge(null, cfg());
      const notACanvas = renderSemicircleGauge(document.createElement('div'), cfg());

      /* --- markers are disjoint at the same-angle case --- */
      const same = renderSemicircleGauge(cv, cfg({ value: 92, norm: 92 }));
      const noNorm = renderSemicircleGauge(cv, cfg({ norm: undefined }));

      /* --- ink, and that the transform does not compound on redraw --- */
      const ink = () => {
        const g = cv.getContext('2d');
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let alpha = 0, nonBg = 0, track = 0;
        for (let i = 0; i < d.length; i += 16) {
          alpha += d[i + 3];
          if (d[i] !== 251 || d[i + 1] !== 252 || d[i + 2] !== 254) nonBg++;
          /* GAUGE_DEFAULTS.colors.track #d4dae7 */
          if (d[i] === 212 && d[i + 1] === 218 && d[i + 2] === 231) track++;
        }
        return { alpha, nonBg, track, w: cv.width, h: cv.height };
      };
      renderSemicircleGauge(cv, cfg());
      const first = ink();
      renderSemicircleGauge(cv, cfg());
      const second = ink();

      /* A band list stopping at 85 leaves 85->99 uncovered; that arc must be
         the inert track grey, not the chart background. */
      renderSemicircleGauge(cv, cfg({ bands: [{ to: 85, color: '#1e8f4e' }] }));
      const partial = ink();

      return {
        angles, cases,
        nullCanvas, notACanvas,
        sameAngle: same.angle === same.normAngle,
        disjoint: same.markers.norm.r1 < same.markers.value.r0,
        normNullWhenAbsent: noNorm.markers.norm === null,
        first, second,
        partialTrack: partial.track
      };
    });

    eq(s.angles.atMin, Math.PI, 'gauge angle: the minimum is the arc start');
    eq(s.angles.atMax, Math.PI * 2, 'gauge angle: the maximum is the arc end');
    eq(s.angles.belowMin, Math.PI, 'gauge angle: below the minimum pins to the arc start');
    eq(s.angles.aboveMax, Math.PI * 2, 'gauge angle: above the maximum pins to the arc end');
    eq(s.angles.zeroSpan, Math.PI, 'gauge angle: a zero span returns the arc start, not NaN');
    eq(s.angles.reversals, 0, 'gauge angle: monotone non-decreasing across the range');
    s.cases.forEach(c => {
      ok(!c.threw, 'gauge renderer: does not throw for ' + c.name + (c.threw ? ' (' + c.message + ')' : ''));
      ok(c.geometry, 'gauge renderer: returns resolved geometry for ' + c.name);
    });
    ok(s.nullCanvas === null, 'gauge renderer: returns null for a null canvas');
    ok(s.notACanvas === null, 'gauge renderer: returns null for an element with no getContext');
    ok(s.sameAngle, 'gauge renderer: value and norm share an angle when they share a value');
    ok(s.disjoint, 'gauge renderer: the value marker and the norm tick never overlap radially');
    ok(s.normNullWhenAbsent, 'gauge renderer: markers.norm is null when no norm is given');
    ok(s.first.alpha > 0, 'gauge renderer: the canvas renders non-transparent pixels');
    ok(s.first.nonBg > 0, 'gauge renderer: the canvas renders pixels that are not the flat background');
    eq(s.second.w, s.first.w, 'gauge renderer: canvas.width is unchanged on redraw');
    eq(s.second.h, s.first.h, 'gauge renderer: canvas.height is unchanged on redraw');
    eq(s.second.nonBg, s.first.nonBg, 'gauge renderer: redrawing is identical (the transform does not compound)');
    ok(s.partialTrack > 0, 'gauge renderer: an arc range no band covers is drawn in the inert track grey');
    ok(page._errors.length === 0, 'gauge renderer: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK PHASE 5: OPERATIONS TAB INTEGRATION ---------------- */
  console.log('\nboard pack phase 5 operations tab:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const snapshot = () => JSON.stringify({
        stats: GAME.stats, decisions: GAME.decisions, alerts: GAME.alerts, roles: GAME.roles
      });

      resetGameState();
      quarterComplete = true;
      const before = snapshot();
      openReport();

      const cv = document.getElementById('repOccGauge');
      const panel = document.getElementById('perfPanelOperations');
      const occRow = panel.querySelectorAll('.rep-perf-row')[0];
      const status = panel.querySelector('.rep-gauge-status');
      /* Captured while the pack is open: REPORT.data is the frozen snapshot the
         panel was built from, and the gauge must print exactly the row's figure. */
      const gaugeValueText = _perfFixed(
        getOccupancyGauge(REPORT.data.snapshot.endStats,
                          _snapshotCtx(REPORT.data.snapshot)).value, 1) + '%';

      /* Every page and every tab, collecting the whole pack's markup so the
         terminology guard cannot be dodged by a string that only appears on a
         page the test never visited. */
      let allHtml = '';
      for (let p = 0; p < REPORT_PAGES.length; p++) {
        REPORT.page = p; _syncReportPages();
        for (let t = 0; t < getPerfTabCount(); t++) { setPerfTab(t); allHtml += $('repRoot').innerHTML; }
      }
      REPORT.page = 0; _syncReportPages(); setPerfTab(0);
      closeReport();

      return {
        hasGauge: !!cv,
        label: cv ? (cv.getAttribute('aria-label') || '') : '',
        fallback: cv ? (cv.textContent || '').trim() : '',
        role: cv ? cv.getAttribute('role') : '',
        gaugeValueText: gaugeValueText,
        rowValueText: occRow.querySelector('.val').textContent,
        statusText: status ? status.textContent : '',
        statusToned: /band-(critical|warn|neutral|good|great)/.test(status ? status.className : ''),
        /* the gauge block leads the panel, above the trend */
        gaugeBeforeTrend: panel.innerHTML.indexOf('repOccGauge') <
                          panel.innerHTML.indexOf('repWaitTrend'),
        terminology: {
          national:  /national standard/i.test(allHtml),
          nhsTarget: /nhs target/i.test(allHtml),
          statutory: /statutory standard/i.test(allHtml),
          legal:     /safe legal limit/i.test(allHtml)
        },
        pageCount: REPORT_PAGES.length,
        tabCount: getPerfTabCount(),
        unchanged: before === snapshot()
      };
    });

    ok(s.hasGauge, 'operations tab: the panel contains the occupancy gauge canvas');
    eq(s.role, 'img', 'operations tab: the gauge canvas is role="img"');
    ok(s.label.length > 0, 'operations tab: the gauge canvas has a non-empty aria-label');
    ok(s.fallback.length > 0, 'operations tab: the gauge canvas carries text fallback content');
    eq(s.rowValueText, s.gaugeValueText,
       'operations tab: the printed gauge value matches the row value to one decimal place');
    ok(/percentage points/.test(s.statusText) ? /above|below/.test(s.statusText)
                                              : /Exactly at/.test(s.statusText),
       'operations tab: the status line states the distance from the norm in plain language');
    ok(s.statusToned, 'operations tab: the status line carries a band-{tone} class');
    ok(s.gaugeBeforeTrend, 'operations tab: the gauge sits above the waiting-pressure trend');
    ok(!s.terminology.national,  'terminology: the pack never claims a national standard');
    ok(!s.terminology.nhsTarget, 'terminology: the pack never claims an NHS target');
    ok(!s.terminology.statutory, 'terminology: the pack never claims a statutory standard');
    ok(!s.terminology.legal,     'terminology: the pack never claims a safe legal limit');
    eq(s.pageCount, 4, 'operations tab: REPORT_PAGES still has exactly four pages');
    eq(s.tabCount, 4, 'operations tab: there are still exactly four performance tabs');
    ok(s.unchanged, 'operations tab: GAME is byte-identical after opening, paging, tabbing and closing');
    ok(page._errors.length === 0, 'operations tab: no console/page errors');
    await page.close();
  }

  /* ---------------- BOARD PACK PHASE 5: OPERATIONS LAYOUT AT 1280x720 ---------------- */
  console.log('\nboard pack phase 5 operations layout:');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(PAGE_URL);
    await page.waitForFunction(() => window.simulationStarted === true, { timeout: 5000 });
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => {
      quarterComplete = true;
      openReport();
      REPORT.page = 1; _syncReportPages(); setPerfTab(1);
      const doc = document.documentElement;
      const pages = document.querySelector('.rep-pages');
      const modal = document.querySelector('.rep-modal').getBoundingClientRect();
      const gauge = document.getElementById('repOccGauge').getBoundingClientRect();
      const trend = document.getElementById('repWaitTrend').getBoundingClientRect();
      const foot = document.getElementById('repClose').getBoundingClientRect();
      return {
        docOverflowX: doc.scrollWidth - doc.clientWidth,
        pagesOverflowX: pages.scrollWidth - pages.clientWidth,
        gaugeW: gauge.width, gaugeH: gauge.height,
        gaugeInsideModal: gauge.left >= modal.left && gauge.right <= modal.right,
        gaugeInViewport: gauge.top >= 0 && gauge.bottom <= window.innerHeight,
        trendInViewport: trend.top >= 0 && trend.bottom <= window.innerHeight,
        /* side by side at this width, not stacked */
        sideBySide: gauge.right <= trend.left + 1,
        footInViewport: foot.top >= 0 && foot.bottom <= window.innerHeight
      };
    });
    ok(s.docOverflowX <= 0, 'operations layout 1280x720: the document does not scroll horizontally');
    ok(s.pagesOverflowX <= 0, 'operations layout 1280x720: the performance page does not scroll horizontally');
    ok(s.gaugeW > 0 && s.gaugeH > 0, 'operations layout 1280x720: the gauge has a rendered size');
    ok(s.gaugeInsideModal, 'operations layout 1280x720: the gauge sits inside the modal horizontally');
    ok(s.gaugeInViewport, 'operations layout 1280x720: the whole gauge is on screen without scrolling');
    ok(s.trendInViewport, 'operations layout 1280x720: the whole trend is on screen without scrolling');
    ok(s.sideBySide, 'operations layout 1280x720: the gauge and the trend sit side by side');
    ok(s.footInViewport, 'operations layout 1280x720: the pack footer is reachable');
    ok(errors.length === 0, 'operations layout 1280x720: no console/page errors');
    await page.close();
  }

  /* ---------------- BPS-001 X11: FINANCE LAYOUT + SUBTOTALS AT 1280x720 --------
     X11 takes the table from eight rows to thirteen (three new lines, two
     subtotals). BPS-001 §7 keeps 1280x720 as the compact baseline and X12's
     projector breakpoint is explicitly NOT in this stage, so the taller table
     has to fit at the small size with no help from a wide layout. The net
     position is now the furthest-down number on the page and it is the one a
     board acts on, so it is asserted on screen specifically. */
  console.log('\nBPS-001 X11 finance layout + subtotals at 1280x720:');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(PAGE_URL);
    await page.waitForFunction(() => window.simulationStarted === true, { timeout: 5000 });
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => {
      quarterComplete = true;
      openReport();
      REPORT.page = 1; _syncReportPages(); setPerfTab(0);
      const doc = document.documentElement;
      const pages = document.querySelector('.rep-pages');
      const modal = document.querySelector('.rep-modal').getBoundingClientRect();
      const table = document.querySelector('.rep-fin-table').getBoundingClientRect();
      const netEl = document.querySelector('.rep-fin-net');
      const net = netEl.getBoundingClientRect();
      const foot = document.getElementById('repClose').getBoundingClientRect();

      /* the model's own totals, for the same snapshot the panel rendered */
      const ie = deriveIncomeExpenditure(REPORT.data.snapshot.endStats,
                                         _snapshotCtx(REPORT.data.snapshot));
      const subtotals = Array.from(document.querySelectorAll('.rep-fin-subtotal'));
      const money = td => parseFloat(td.textContent.replace(/[^0-9.]/g, ''));
      const cellsOf = tr => Array.from(tr.querySelectorAll('td'));

      return {
        docOverflowX: doc.scrollWidth - doc.clientWidth,
        pagesOverflowX: pages.scrollWidth - pages.clientWidth,
        tableInViewport: table.top >= 0 && table.bottom <= window.innerHeight,
        tableInsideModal: table.left >= modal.left && table.right <= modal.right,
        netInViewport: net.top >= 0 && net.bottom <= window.innerHeight,
        footInViewport: foot.top >= 0 && foot.bottom <= window.innerHeight,
        lineRows: document.querySelectorAll('.rep-fin-table .rep-fin-line').length,
        subtotalCount: subtotals.length,
        subtotalLabels: subtotals.map(tr => cellsOf(tr)[0].textContent),
        /* the rendered subtotals against the model's totals, at the 1 dp the
           view prints - a subtotal that disagrees with the block above it is
           worse than no subtotal at all */
        incomeMatches: Math.abs(money(cellsOf(subtotals[0])[2]) - ie.totalIncome) < 0.05,
        spendMatches: Math.abs(money(cellsOf(subtotals[1])[2]) - ie.totalExpenditure) < 0.05,
        /* and the subtotal's variance cell is deliberately empty - see
           _finSubtotal() on why a mixed-direction block must not be coloured */
        incomeVarianceBlank: cellsOf(subtotals[0])[3].textContent.trim() === '',
        spendVarianceBlank: cellsOf(subtotals[1])[3].textContent.trim() === '',
        noToneClass: subtotals.every(tr => !/band-/.test(tr.className + ' ' + tr.innerHTML))
      };
    });
    ok(s.docOverflowX <= 0, 'X11 layout 1280x720: the document does not scroll horizontally');
    ok(s.pagesOverflowX <= 0, 'X11 layout 1280x720: the finance page does not scroll horizontally');
    ok(s.tableInsideModal, 'X11 layout 1280x720: the finance table sits inside the modal horizontally');
    ok(s.tableInViewport, 'X11 layout 1280x720: the whole finance table is on screen without scrolling');
    ok(s.netInViewport, 'X11 layout 1280x720: the net position row is on screen without scrolling');
    ok(s.footInViewport, 'X11 layout 1280x720: the pack footer is still reachable');
    eq(s.lineRows, 8, 'X11 layout: eight I&E line rows render');
    eq(s.subtotalCount, 2, 'X11 layout: both block subtotals render');
    eq(JSON.stringify(s.subtotalLabels), JSON.stringify(['Total income', 'Total expenditure']),
      'X11 layout: the subtotals are labelled for their blocks');
    ok(s.incomeMatches, 'X11 layout: the rendered income subtotal matches totalIncome');
    ok(s.spendMatches, 'X11 layout: the rendered expenditure subtotal matches totalExpenditure');
    ok(s.incomeVarianceBlank && s.spendVarianceBlank,
      'X11 layout: a subtotal carries no variance figure (its block has mixed directions of good)');
    ok(s.noToneClass, 'X11 layout: a subtotal carries no band-{tone} class, so it asserts no favourability');
    ok(errors.length === 0, 'X11 layout 1280x720: no console/page errors');
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
