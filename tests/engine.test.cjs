'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
require('../src/content.js');
const E = require('../src/engine.js');
const { analyse } = require('../tools/balance.cjs');
const { metrics, quarters, roles, rules, questions, skills } = Northbrook.content;

const year = (...steps) => E.history(steps.map(([choice, prediction = 'access', owner = 'coo']) => ({ choice, prediction, owner })));

test('every quarter resolves in ledger order and each step balances', () => {
  const rounds = year(['agency'], ['beds'], ['briefing'], ['wellbeing']);
  for (const round of rounds) {
    const kinds = round.entries.map(entry => entry.kind);
    assert.equal(kinds[0], 'decision');
    assert.ok(kinds.indexOf('headwind') > kinds.lastIndexOf('carry'));
    for (const metric of metrics) {
      const total = round.entries.reduce((sum, entry) => sum + (entry.effects[metric.id] ?? 0), round.opening[metric.id]);
      assert.equal(round.closing[metric.id], total, `${metric.id} balances in Q${round.index + 1}`);
    }
  }
});

test('a commitment lands next quarter, then expires', () => {
  const [q1, q2, q3] = year(['agency'], ['cancel'], ['statement']);
  assert.deepEqual(q1.upcoming.map(item => item.title), ['Agency handover period']);
  const carried = q2.entries.find(entry => entry.label === 'Agency handover period');
  assert.equal(carried.source, 1);
  assert.equal(carried.effects.budget, -500);
  assert.ok(!q3.entries.some(entry => entry.label === 'Agency handover period'));
});

test('breaking a red line brings a regulator penalty next quarter and caps the rating', () => {
  const rounds = year(['agency'], ['beds'], ['plan'], ['wellbeing']);
  const broken = rounds.find(round => round.breaches.includes('budget'));
  assert.ok(broken, 'this expensive route breaks the money line');
  assert.ok(broken.upcoming.some(item => item.kind === 'regulator'));
  const next = rounds[broken.index + 1];
  if (next) assert.ok(next.entries.some(entry => entry.kind === 'regulator'));
  const result = E.verdict(rounds, roles.map(role => role.id));
  assert.ok(result.level <= 1, 'one breach caps the rating at Requires improvement');
  assert.match(result.headline.title, /money red line/);
});

test('a correct prediction earns foresight credit next quarter; a wrong one does not', () => {
  const plain = E.history([{ choice: 'discharge', prediction: 'trust', owner: 'ceo' }, { choice: 'cancel', prediction: 'trust', owner: 'ceo' }]);
  const call = E.prediction(plain[0], 'staff');
  assert.equal(call.verdict, 'hit');
  const credited = E.history([{ choice: 'discharge', prediction: 'staff', owner: 'cpo' }, { choice: 'cancel', prediction: 'trust', owner: 'ceo' }]);
  assert.ok(credited[0].upcoming.some(item => item.kind === 'foresight'));
  assert.equal(credited[1].closing.trust - plain[1].closing.trust, rules.foresight.effects.trust);
  assert.ok(E.rightOwner({ prediction: 'staff', owner: 'cpo' }));
  assert.ok(!E.rightOwner({ prediction: 'staff', owner: 'cfo' }));
});

test('every quarter of every route has something to predict', () => {
  for (const { years: n } of [analyse()]) assert.equal(n, 256);
  const paths = quarters.reduce((prefixes, quarter) => prefixes.flatMap(prefix => quarter.options.map(option => [...prefix, option.id])), [[]]);
  for (const path of paths) for (const round of year(...path.map(id => [id]))) assert.notEqual(E.prediction(round, 'access').verdict, 'none');
});

test('counterfactuals share the opening position and prior commitments, and never mutate history', () => {
  const rounds = year(['agency'], ['partner']);
  const copy = structuredClone(rounds);
  const alt = E.counterfactual(rounds, 1, 'cancel');
  assert.deepEqual(alt.opening, rounds[1].opening);
  assert.equal(alt.entries.find(entry => entry.kind === 'carry').label, 'Agency handover period');
  assert.deepEqual(rounds, copy);
  assert.throws(() => E.resolve(0, E.initial(), [], 'nope'), RangeError);
});

test('money goals use the forecast, so committed costs count straight away', () => {
  const rounds = year(['agency']);
  assert.equal(E.forecast(rounds[0]), rounds[0].closing.budget - 500);
  const live = E.scoreRole('cfo', rounds, false).results[0];
  assert.equal(live.value, E.forecast(rounds[0]));
});

test('never-below goals lock once missed, and nothing is locked before the first decision', () => {
  for (const role of roles) assert.ok(E.scoreRole(role.id, [], false).results.every(item => item.status !== 'missed'), `${role.id} starts unlocked`);
  const rounds = year(['discharge'], ['beds']);
  const md = E.scoreRole('md', rounds, false).results[0];
  if (!md.met) assert.equal(md.status, 'missed');
});

test('objective labels are generated from the numbers', () => {
  for (const role of roles) for (const item of E.scoreRole(role.id, [], false).results) {
    const shown = item.metric === 'budget' || item.metric === 'recurring' ? `£${(Math.abs(item.target) / 1000).toFixed(1)}m` : String(item.target);
    assert.ok(item.label.includes(shown), `${role.id}: "${item.label}" shows ${shown}`);
  }
});

test('the balance design checks all pass', () => {
  const report = analyse();
  for (const [name, ok] of Object.entries(report.checks)) assert.ok(ok, name);
});

test('quiz sets are matched by skill, distinct, and the right answer moves around', () => {
  const prompts = new Set();
  const positions = [];
  for (const [kind, items] of Object.entries(questions)) {
    assert.deepEqual(items.map(item => item.skill), Object.keys(skills), `${kind} covers each skill in order`);
    for (const item of items) {
      assert.ok(!prompts.has(item.prompt)); prompts.add(item.prompt);
      const order = E.order(item);
      assert.deepEqual([...order].sort(), item.answers.map((_, i) => i));
      assert.deepEqual(E.order(item), order, 'order is stable');
      positions.push(order.indexOf(item.correct));
    }
  }
  for (const slot of [0, 1, 2]) assert.ok(positions.filter(p => p === slot).length <= 6, `correct answer is not usually in slot ${slot + 1}`);
  assert.deepEqual(E.assess('transfer', questions.transfer.map(item => item.correct)).map(item => item.passed), [true, true, true, true]);
});

test('projection applies the same earlier deals and outside pressure as the next quarter', () => {
  const ids = quarters.map(q => q.options.map(o => o.id));
  for (const a of ids[0]) for (const b of ids[1]) {
    const rounds = year([a], [b]);
    const proj = E.project(rounds.at(-1));
    assert.ok(proj.steps.every(step => ['carry', 'regulator', 'foresight', 'headwind', 'system'].includes(step.kind)));
    const next = E.resolve(rounds.length, rounds.at(-1).closing, rounds.at(-1).upcoming, ids[rounds.length][0]);
    // Earlier deals and outside pressure in the projection are exactly what the real quarter applies.
    const real = next.entries.filter(e => e.kind !== 'decision' && e.kind !== 'system').map(e => e.label);
    assert.deepEqual(proj.steps.filter(s => s.kind !== 'system').map(s => s.label), real);
  }
  const start = E.project({ index: -1, closing: E.initial(), upcoming: [] });
  assert.equal(start.snapshot.budget, E.initial().budget + (quarters[0].headwind.budget || 0), 'Q1 projection is the opening plus Q1 pressure');
});

test('a measure below its red line is always shown as critical', () => {
  for (const line of rules.redLines) {
    assert.equal(E.band(line.metric, line.min - 1), 'critical');
    assert.notEqual(E.band(line.metric, line.metric === 'budget' ? 0 : 80), 'critical');
  }
});
