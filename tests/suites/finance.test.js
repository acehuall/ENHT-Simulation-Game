'use strict';
/* Finance reporting: the I&E schedule, reconciliation to the budget, the
   plan-balance invariant, the goodWhen/signedValue split and the reserves
   movement's rendered sign. See docs/reporting-model-design.md §6. */

module.exports = async (t) => {
  const { browser, ok, eq, freshPage, feedCount, driveToYearEnd, PAGE_URL, IN_PAGE_HELPERS } = t;

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

  /* ---------------- BPS-001 X11: RESERVES MOVEMENT RENDERS ITS TRUE SIGN -------
     The line runs both ways, so the label names neither direction and the Actual
     column opts out of the income block's "always positive" sign convention via
     signedValue. Both directions are driven through the REAL panel - a model-only
     assertion would not have caught _finMoney()'s Math.abs(). */
  console.log('\nBPS-001 X11 reserves movement sign:');
  {
    const page = await freshPage(browser);
    await page.waitForTimeout(150);
    /* openReport() rebuilds REPORT.data from live state, so the injected stats
       go in AFTER it and page 1 is rebuilt explicitly - setPerfTab() only
       toggles visibility and would leave the panel's HTML a render behind. */
    const render = async stats => page.evaluate(injected => {
      quarterComplete = true;
      openReport();
      Object.assign(REPORT.data.snapshot.endStats, injected);
      REPORT.page = 1;
      const sec = document.querySelector('[data-page="1"]');
      sec.innerHTML = REPORT_PAGES[1].build(REPORT.data);
      if (REPORT_PAGES[1].afterRender) REPORT_PAGES[1].afterRender(REPORT.data);
      _syncReportPages();
      setPerfTab(0);
      const tr = document.querySelector('.rep-fin-line[data-fin-line="drawdown"]');
      const tds = Array.from(tr.querySelectorAll('td'));
      const ie = deriveIncomeExpenditure(REPORT.data.snapshot.endStats,
                                         _snapshotCtx(REPORT.data.snapshot));
      const line = ie.lines.find(l => l.id === 'drawdown');
      const note = document.querySelector('.rep-fin-reserves-note');
      return {
        label: tds[0].textContent,
        actualText: tds[2].textContent,
        actualParsed: parseMoney(tds[2]),
        modelValue: line.actual,
        signedValue: line.signedValue,
        tone: line.tone,
        hasMinusGlyph: /−/.test(tds[2].textContent),
        note: note ? note.textContent : ''
      };
    }, stats);

    /* A strong position: operating income comfortably covers spend, so the
       balancing figure is a transfer BACK into reserves - a negative movement. */
    const back = await render({ budget: -0.6, waiting: 40, morale: 70, safety: 78, rep: 74 });
    /* A strained position: the deficit is covered by drawing ON reserves. */
    const drawn = await render({ budget: -2, waiting: 78, morale: 48, safety: 50, rep: 50 });

    eq(back.label, 'Reserves movement',
      'X11 sign: the line is labelled for both directions, not just drawdowns');
    ok(back.signedValue === true, 'X11 sign: the reserves line is flagged signedValue');

    /* negative movement - money returned to reserves */
    ok(back.modelValue < -0.05,
      'X11 sign: the strong position produces a negative reserves movement (' +
      back.modelValue.toFixed(2) + ')');
    ok(back.hasMinusGlyph,
      'X11 sign: a negative reserves movement renders a visible minus sign (got "' + back.actualText + '")');
    ok(back.actualParsed < 0 && Math.abs(back.actualParsed - back.modelValue) < 0.06,
      'X11 sign: the rendered negative figure parses back to the model value (' +
      back.actualParsed + ' vs ' + back.modelValue.toFixed(2) + ')');
    eq(back.tone, 'good', 'X11 sign: a transfer back into reserves still reads good');
    ok(/returned to reserves/.test(back.note),
      'X11 sign: the note explains a negative movement as money returned to reserves');

    /* positive movement - money drawn from reserves */
    ok(drawn.modelValue > 0.05,
      'X11 sign: the strained position produces a positive reserves drawdown (' +
      drawn.modelValue.toFixed(2) + ')');
    ok(!drawn.hasMinusGlyph,
      'X11 sign: a positive drawdown renders with no minus sign (got "' + drawn.actualText + '")');
    ok(drawn.actualParsed > 0 && Math.abs(drawn.actualParsed - drawn.modelValue) < 0.06,
      'X11 sign: the rendered positive figure parses back to the model value (' +
      drawn.actualParsed + ' vs ' + drawn.modelValue.toFixed(2) + ')');
    eq(drawn.tone, 'warn', 'X11 sign: a drawdown still reads warn');
    ok(/drawn from reserves/.test(drawn.note),
      'X11 sign: the note explains a positive movement as money drawn from reserves');
    ok(/balancing figure/.test(drawn.note),
      'X11 sign: the note tells the player the line is the balancing figure, not a ninth operational line');

    /* the two directions must not render identically - the defect being fixed */
    ok(back.actualText !== drawn.actualText,
      'X11 sign: the two directions render differently (was identical under Math.abs)');

    /* the sign convention still governs every OTHER line */
    const others = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.rep-fin-line'));
      return rows.filter(tr => tr.getAttribute('data-fin-line') !== 'drawdown')
        .map(tr => ({ id: tr.getAttribute('data-fin-line'),
                      text: tr.querySelectorAll('td')[2].textContent,
                      income: /fin-income/.test(tr.className) }));
    });
    ok(others.every(r => r.income ? !/−/.test(r.text) : /−/.test(r.text)),
      'X11 sign: every other line still follows the block sign convention (income plain, expenditure minus)');

    ok(page._errors.length === 0, 'X11 sign: no console/page errors');
    await page.close();
  }
};
