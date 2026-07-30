'use strict';
/* Layout measurements. Every block here opens a real viewport and measures
   rendered geometry, so a change that makes the pack overflow fails here rather
   than in a behaviour suite. 1280x720 is the compact baseline BPS-001 §7
   retains; nothing in this file asserts a value, only where it sits. */

module.exports = async (t) => {
  const { browser, ok, eq, freshPage, feedCount, driveToYearEnd, PAGE_URL, IN_PAGE_HELPERS } = t;

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
    await page.addInitScript(IN_PAGE_HELPERS);
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
      const money = el => parseMoney(el);
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
        /* Signs are compared, not just magnitudes. The expenditure block prints
           its figures negative by convention, so the subtotal must parse to
           MINUS totalExpenditure - asserting the convention rather than
           abs()-ing it away, which is the same erasure signedValue exists to
           undo one row above. */
        incomeMatches: Math.abs(money(cellsOf(subtotals[0])[2]) - ie.totalIncome) < 0.06,
        spendMatches: Math.abs(money(cellsOf(subtotals[1])[2]) + ie.totalExpenditure) < 0.06,
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
};
