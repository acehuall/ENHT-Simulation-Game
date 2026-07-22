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

  await browser.close();

  console.log('\n' + '-'.repeat(48));
  console.log(passed + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('FAILURES:\n  - ' + failures.join('\n  - '));
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
