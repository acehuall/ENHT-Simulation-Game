'use strict';
/* Reporting model: the derivation layer in src/data/reporting-model.js.
   Reconciliation, determinism, purity, per-driver direction, the two-layer DAG,
   benchmark bands and tone, and the X9/X10 sensitivity enumeration that walks
   all 256 legal paths.

   The calibration blocks assert on the PLAYER-VISIBLE snapshot set and print the
   full set for comparison - see docs/reporting-model-design.md §2. */

const path = require('path');

module.exports = async (t) => {
  const { browser, ok, eq, freshPage, feedCount, driveToYearEnd, PAGE_URL, IN_PAGE_HELPERS } = t;

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
};
