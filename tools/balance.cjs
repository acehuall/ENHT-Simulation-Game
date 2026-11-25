'use strict';

// Balance report: plays all 256 possible years and checks the design targets
// from the independent review. Run after editing numbers in src/content.js:
//   node tools/balance.cjs          (report)
//   node tools/balance.cjs --json   (machine-readable, used by the tests)
require('../src/content.js');
const engine = require('../src/engine.js');
const { quarters, metrics, roles, rules } = Northbrook.content;

function analyse() {
  const paths = quarters.reduce((prefixes, quarter) => prefixes.flatMap(prefix =>
    quarter.options.map(option => [...prefix, option.id])), [[]]);
  const years = paths.map(path => {
    const rounds = engine.history(path.map(choice => ({ choice })));
    const cards = roles.map(role => engine.scoreRole(role.id, rounds, true));
    const lines = engine.redLines(rounds);
    const verdict = engine.verdict(rounds, roles.map(role => role.id));
    const total = cards.reduce((sum, card) => sum + card.score, 0);
    // Judge a year the way the game does: rating first (breaches cap it), then role scores.
    return { path, rounds, cards, lines, total, quality: verdict.level * 1000 + total, level: verdict.level, satisfied: cards.filter(card => card.satisfied).length };
  });
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const pct = (values, p) => [...values].sort((a, b) => a - b)[Math.floor(p * (values.length - 1))];

  // Options: average total role score when chosen, and which roles prefer it.
  const options = quarters.map((quarter, q) => {
    const rows = quarter.options.map(option => {
      const picked = years.filter(year => year.path[q] === option.id);
      return { id: option.id, total: mean(picked.map(year => year.total)), level: mean(picked.map(year => year.level)), byRole: roles.map((_, r) => mean(picked.map(year => year.cards[r].score))) };
    });
    const quarterMean = mean(rows.map(row => row.total));
    for (const row of rows) {
      row.gap = (row.total - quarterMean) / quarterMean;
      row.bestFor = roles.filter((_, r) => rows.every(other => row.byRole[r] >= other.byRole[r])).map(role => role.short);
    }
    return rows;
  });

  // Simple strategies must not dominate.
  // Spend-rank strategies: 1st..4th most expensive option every quarter (total cost incl. commitments).
  const spend = (index, option) => { const c = engine.cost(index, option.id); return c.now + c.later - c.recurring * 2; };
  const byRank = rank => quarters.map((quarter, q) => [...quarter.options].sort((a, b) => spend(q, a) - spend(q, b))[rank].id);
  const strategyPaths = {
    'always most expensive': byRank(0), 'always 2nd most expensive': byRank(1), 'always 2nd cheapest': byRank(2), 'always cheapest': byRank(3),
    ...Object.fromEntries([0, 1, 2, 3].map(rank => [`always ${['1st', '2nd', '3rd', '4th'][rank]} by cost now`,
      quarters.map(quarter => [...quarter.options].sort((a, b) => (a.effects.budget || 0) - (b.effects.budget || 0))[rank].id)])),
    ...Object.fromEntries('ABCD'.split('').map((letter, i) => [`always ${letter}`, quarters.map(quarter => quarter.options[i].id)])),
  };
  const strategies = Object.entries(strategyPaths).map(([name, path]) => {
    const year = years.find(item => item.path.join() === path.join());
    return { name, total: year.total, level: year.level, beats: years.filter(other => other.quality < year.quality).length / years.length };
  });

  // "Follow the bubbles": pick the proposal most seated roles say YES! to, for every possible seating.
  const R = roles.map(role => role.id);
  const follow = [];
  for (let mask = 1; mask < 64; mask++) {
    const seats = R.filter((_, i) => mask & (1 << i));
    const path = quarters.map((quarter, q) => quarter.options.map(option => {
      const st = engine.stances(q, option.id).filter(item => seats.includes(item.role.id));
      return { id: option.id, score: st.filter(s => s.stance === 'for').length * 10 - st.filter(s => s.stance === 'against').length };
    }).sort((a, b) => b.score - a.score)[0].id);
    const year = years.find(item => item.path.join() === path.join());
    follow.push({ seats: seats.join(','), beats: years.filter(other => other.quality < year.quality).length / years.length });
  }
  const fullBoard = follow.at(-1);
  const breachYears = years.filter(year => year.lines.some(line => !line.met));
  const causes = new Set(years.flatMap(year => year.lines.filter(line => !line.met).map(line => `${line.id}@Q${line.breachedIn}`)));
  const byLine = Object.fromEntries(rules.redLines.map(line => [line.id, years.filter(year => !year.lines.find(item => item.id === line.id).met).length]));

  // Role conflicts: pairs whose scores move in opposite directions across years.
  const pairs = [];
  for (let a = 0; a < roles.length; a++) for (let b = a + 1; b < roles.length; b++) {
    const xs = years.map(year => year.cards[a].score), ys = years.map(year => year.cards[b].score);
    const mx = mean(xs), my = mean(ys);
    const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
    const sd = Math.sqrt(mean(xs.map(x => (x - mx) ** 2)) * mean(ys.map(y => (y - my) ** 2)));
    pairs.push({ pair: `${roles[a].short}–${roles[b].short}`, r: sd ? cov / sd : 0 });
  }
  const conflicts = pairs.filter(pair => pair.r < -0.1).sort((x, y) => x.r - y.r);

  const spread = metrics.map(metric => {
    const ends = years.map(year => year.rounds.at(-1).closing[metric.id]);
    return { id: metric.id, p25: pct(ends, 0.25), p50: pct(ends, 0.5), p75: pct(ends, 0.75) };
  });
  const roleStats = roles.map((role, r) => ({ id: role.short, passes: role.objectives.map((_, i) => years.filter(year => year.cards[r].results[i].met).length),
    satisfied: years.filter(year => year.cards[r].satisfied).length, mean: Math.round(mean(years.map(year => year.cards[r].score))) }));

  const checks = {
    'every option is best for at least one role': options.every(rows => rows.every(row => row.bestFor.length > 0)),
    'every option within 12% of its quarter mean': options.every(rows => rows.every(row => Math.abs(row.gap) <= 0.12)),
    'no simple strategy beats 60% of years': strategies.every(item => item.beats < 0.6),
    'red lines breached in 20–40% of years': breachYears.length / years.length >= 0.2 && breachYears.length / years.length <= 0.4,
    'breaches come from at least 4 causes': causes.size >= 4,
    'at least 3 role pairs conflict': conflicts.length >= 3,
    'no year satisfies all six roles': years.every(year => year.satisfied < roles.length),
    'every objective can be met and missed': roleStats.every(stat => stat.passes.every(n => n > 0 && n < years.length)),
    'following the YES! bubbles does not win (full board under 60%, at most 1 in 8 seatings over 60%)': fullBoard.beats < 0.6 && follow.filter(item => item.beats > 0.6).length <= 8,
  };
  const levels = {};
  years.forEach(year => { levels[year.level] = (levels[year.level] || 0) + 1; });
  return { years: years.length, levels, follow, fullBoard, options, strategies, breachRate: breachYears.length / years.length, causes: [...causes], byLine, conflicts, pairs, spread, roleStats, checks };
}

if (require.main === module) {
  const report = analyse();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); return; }
  const money = n => `£${(n / 1000).toFixed(1)}m`;
  console.log(`\n${report.years} possible years\n\nYear-end spread (25th / median / 75th):`);
  for (const row of report.spread) console.log(`  ${row.id.padEnd(11)} ${[row.p25, row.p50, row.p75].map(n => (row.id === 'budget' ? money(n) : String(n)).padStart(7)).join(' ')}`);
  console.log('\nOptions (gap from quarter mean, roles that prefer it):');
  report.options.forEach((rows, q) => console.log(`  Q${q + 1} ` + rows.map(row => `${row.id} ${(row.gap * 100).toFixed(0).padStart(3)}% [${row.bestFor.join(',')}]`).join('  ')));
  console.log('\nSimple strategies (share of years they beat):');
  for (const item of report.strategies) console.log(`  ${item.name.padEnd(22)} ${(item.beats * 100).toFixed(0)}%  (rating level ${item.level}, role total ${item.total})`);
  const levels = [0, 1, 2, 3].map(level => report.levels[level] || 0);
  console.log(`\nRatings across all years (whole board seated): Inadequate ${levels[0]}, Requires improvement ${levels[1]}, Good ${levels[2]}, Outstanding ${levels[3]}`);
  console.log(`\nFollowing the YES! bubbles: full board beats ${(report.fullBoard.beats * 100).toFixed(0)}%; ${report.follow.filter(f => f.beats > 0.6).length} of 63 seatings beat 60%`);
  console.log(`\nRed lines: breached in ${(report.breachRate * 100).toFixed(0)}% of years`, report.byLine, `\n  causes: ${report.causes.join(', ')}`);
  console.log(`\nRole conflicts (r < −0.1): ${report.conflicts.map(pair => `${pair.pair} ${pair.r.toFixed(2)}`).join(', ') || 'none'}`);
  console.log('\nRole objectives met (of 256) · mean score · years satisfied:');
  for (const stat of report.roleStats) console.log(`  ${stat.id.padEnd(4)} ${stat.passes.map(n => String(n).padStart(3)).join(' ')}   ${stat.mean}%   ${stat.satisfied}`);
  console.log('\nDesign checks:');
  for (const [name, ok] of Object.entries(report.checks)) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

module.exports = { analyse };
