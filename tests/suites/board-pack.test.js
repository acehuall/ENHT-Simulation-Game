'use strict';
/* Board pack: the overlay itself - paging, tabs, the snapshot accessor and its
   shape, immutability, the health score and radar, page 1, temporal clarity,
   threshold distance, the occupancy gauge renderer and the operations tab.
   Layout MEASUREMENTS live in layout.test.js; this file is about behaviour. */

module.exports = async (t) => {
  const { browser, ok, eq, freshPage, feedCount, driveToYearEnd, PAGE_URL, IN_PAGE_HELPERS } = t;

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
};
