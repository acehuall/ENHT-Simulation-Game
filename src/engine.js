'use strict';

// Pure, deterministic model. No DOM. Every quarter is resolved as an ordered
// ledger: decision → earlier commitments (and any regulator penalty or
// foresight credit) → outside pressure → knock-on effects. Each entry records
// what it changed, so the views can replay and explain every number.
Northbrook.engine = (() => {
  const { rules, metrics, quarters, questions, roles } = Northbrook.content;
  const ids = metrics.map(metric => metric.id);
  const care = ids.filter(id => id !== 'budget');
  const metricById = id => metrics.find(metric => metric.id === id);

  const initial = () => Object.fromEntries(metrics.map(metric => [metric.id, metric.start]));
  const cap = (id, value) => id === 'budget' ? value : Math.max(0, Math.min(100, value));
  const optionFor = (index, id) => quarters[index]?.options.find(option => option.id === id);

  function resolve(index, opening, carried, choiceId, minute = null) {
    const quarter = quarters[index];
    const choice = optionFor(index, choiceId);
    if (!choice) throw new RangeError('Unknown quarter or decision.');
    const closing = { ...opening };
    const entries = [];

    function apply(kind, label, effects, source = index + 1) {
      const applied = {};
      for (const [id, change] of Object.entries(effects)) {
        const before = closing[id];
        closing[id] = cap(id, before + change);
        if (closing[id] !== before) applied[id] = closing[id] - before;
      }
      entries.push({ kind, label, source, effects: applied, snapshot: { ...closing } });
    }

    apply('decision', choice.title, choice.effects);
    for (const item of carried) apply(item.kind ?? 'carry', item.title, item.effects, item.source);
    apply('headwind', quarter.pressure, quarter.headwind);
    for (const rule of rules.knockOns) {
      if (closing[rule.metric] < rule.below) apply('system', rule.label, rule.effects);
    }

    const breaches = rules.redLines.filter(line => closing[line.metric] < line.min).map(line => line.id);
    const upcoming = carried.filter(item => item.remaining > 1).map(item => ({ ...item, remaining: item.remaining - 1 }));
    if (choice.commitment) {
      const { title, effects, quarters: duration } = choice.commitment;
      upcoming.push({ kind: 'carry', title, effects, remaining: duration, source: index + 1 });
    }
    for (const id of breaches) {
      const line = rules.redLines.find(item => item.id === id);
      upcoming.push({ kind: 'regulator', title: `Regulator response: ${line.title.toLowerCase()} red line`, effects: line.penalty, remaining: 1, source: index + 1 });
    }
    const round = { index, opening: { ...opening }, closing, entries, upcoming, breaches };
    if (minute?.prediction && prediction(round, minute.prediction).verdict === 'hit') {
      upcoming.push({ kind: 'foresight', title: rules.foresight.label, effects: rules.foresight.effects, remaining: 1, source: index + 1 });
    }
    return round;
  }

  function history(minutes) {
    const rounds = [];
    for (const [index, minute] of minutes.entries()) {
      const previous = rounds.at(-1);
      rounds.push({ ...resolve(index, previous?.closing ?? initial(), previous?.upcoming ?? [], minute.choice, minute), minute });
    }
    return rounds;
  }

  function counterfactual(rounds, index, choiceId) {
    const previous = rounds[index - 1];
    return resolve(index, previous?.closing ?? initial(), previous?.upcoming ?? [], choiceId);
  }

  // Prediction: which care measure (not money) will take the biggest hit this quarter?
  function prediction(round, predicted) {
    const changes = care.map(id => ({ id, change: round.closing[id] - round.opening[id] })).sort((a, b) => a.change - b.change);
    const worst = changes[0];
    const mine = changes.find(item => item.id === predicted);
    if (!mine) return { verdict: 'none', worst, mine: null };
    if (worst.change >= 0) return { verdict: 'none', worst, mine };
    if (mine.change === worst.change) return { verdict: 'hit', worst, mine };
    return { verdict: mine.change < 0 ? 'close' : 'miss', worst, mine };
  }
  // The right reviewer is the director who owns the measure you expect to suffer.
  const rightOwner = minute => roles.find(role => role.id === minute.owner)?.metric === minute.prediction;
  const ownerFor = metricId => roles.find(role => role.metric === metricId);

  // Money already committed for future quarters, added to today's position.
  function forecast(round) {
    if (!round) return 0;
    const committed = round.upcoming.reduce((sum, item) => sum + (item.effects.budget || 0) * Math.min(item.remaining, quarters.length - 1 - round.index), 0);
    return round.closing.budget + committed;
  }
  // £k per quarter the chosen options keep costing after year-end.
  const recurring = rounds => rounds.reduce((sum, round) => sum + (optionFor(round.index, round.minute.choice).recurring || 0), 0);

  function redLines(rounds) {
    return rules.redLines.map(line => {
      const values = rounds.map(round => round.closing[line.metric]);
      const lowest = values.length ? Math.min(...values) : initial()[line.metric];
      const first = values.findIndex(value => value < line.min);
      return { ...line, lowest, met: first === -1, breachedIn: first === -1 ? null : first + 1 };
    });
  }

  function objectiveValue(objective, rounds, live = false) {
    if (objective.metric === 'recurring') return recurring(rounds);
    const closes = rounds.map(round => round.closing[objective.metric]);
    if (!closes.length) return initial()[objective.metric];
    if (objective.type === 'floor') return Math.min(...closes);
    if (live && objective.metric === 'budget') return forecast(rounds.at(-1));
    return closes.at(-1);
  }

  const money = amount => `£${(Math.abs(amount) / 1000).toFixed(1)}m`;
  function describe(objective, role) {
    const metric = metricById(objective.metric);
    let text;
    if (objective.metric === 'recurring') text = `Ongoing costs into next year ${money(objective.target)} a quarter or less`;
    else if (objective.metric === 'budget') text = `Deficit within ${money(objective.target)} at year-end`;
    else if (objective.type === 'floor') text = `${metric.label} never below ${objective.target}`;
    else text = `${metric.label} ${objective.target}+ at year-end`;
    const owner = ownerFor(objective.metric);
    return owner && owner.id !== role.id ? `${text} (${owner.short}’s line)` : text;
  }
  // Compact form for the round-the-table panel.
  function brief(objective, role) {
    const metric = metricById(objective.metric);
    let text;
    if (objective.metric === 'recurring') text = `Ongoing ≤ ${money(objective.target)}/qtr`;
    else if (objective.metric === 'budget') text = `Deficit ≤ ${money(objective.target)}`;
    else if (objective.type === 'floor') text = `${metric.label} never < ${objective.target}`;
    else text = `${metric.label} ${objective.target}+ at end`;
    const owner = ownerFor(objective.metric);
    return owner && owner.id !== role.id ? `${text} (${owner.short})` : text;
  }

  // Live reading during the year ('track' | 'risk' | 'off' | locked 'missed'),
  // or the final verdict ('met' | 'missed'). Budget objectives use the
  // forecast, so money already committed counts against you straight away.
  function scoreRole(roleId, rounds, final = rounds.length === quarters.length) {
    const role = roles.find(item => item.id === roleId);
    if (!role) return null;
    const results = role.objectives.map(objective => {
      const value = objectiveValue(objective, rounds, !final);
      const met = objective.type === 'max' ? value <= objective.target : value >= objective.target;
      const headroom = objective.type === 'max' ? objective.target - value : value - objective.target;
      const margin = objective.metric === 'budget' ? 500 : objective.metric === 'recurring' ? 150 : 3;
      const locked = !met && rounds.length > 0 && (objective.type === 'floor' || objective.type === 'max');
      const status = final || locked ? (met ? 'met' : 'missed') : !met ? 'off' : headroom < margin ? 'risk' : 'track';
      return { ...objective, label: describe(objective, role), brief: brief(objective, role), value, met, status };
    });
    const total = results.reduce((sum, item) => sum + item.weight, 0);
    const score = Math.round(100 * results.filter(item => item.met).reduce((sum, item) => sum + item.weight, 0) / total);
    return { role, results, score, satisfied: score >= 67 };
  }

  // Inspection-style rating of the whole hospital: all six roles count, even
  // when a seat is empty, because inspectors judge the trust, not the players.
  // Any red-line breach caps it at Requires improvement; two breaches, or one
  // line left broken for two quarters or more, is Inadequate.
  const ratings = ['Inadequate', 'Requires improvement', 'Good', 'Outstanding'];
  function verdict(rounds, seats) {
    const lines = redLines(rounds);
    const breached = lines.filter(line => !line.met);
    const repeated = rules.redLines.some(line => rounds.filter(round => round.closing[line.metric] < line.min).length >= 2);
    const cards = seats.map(id => scoreRole(id, rounds, true));
    const whole = roles.map(role => scoreRole(role.id, rounds, true));
    const average = Math.round(whole.reduce((sum, card) => sum + card.score, 0) / whole.length);
    let level = average >= 75 ? 3 : average >= 55 ? 2 : average >= 35 ? 1 : 0;
    if (breached.length === 1) level = Math.min(level, 1);
    if (breached.length >= 2 || repeated) level = 0;
    return { rating: ratings[level], level, average, breached, repeated, cards, headline: headline(rounds, breached) };
  }

  const phrases = {
    budget: ['the books stay close to plan', 'the deficit deepens'], access: ['waits come down', 'waits get longer'],
    safety: ['care gets safer', 'safety slips'], staff: ['staff hold up', 'staff are exhausted'],
    experience: ['patients feel better cared for', 'patients are unhappy'], trust: ['public trust grows', 'public trust falls'],
  };
  function headline(rounds, breached) {
    const start = initial(), end = rounds.at(-1).closing;
    const change = id => id === 'budget' ? (end.budget - start.budget) / 400 : end[id] - start[id];
    const ranked = ids.map(id => ({ id, change: change(id) })).sort((a, b) => b.change - a.change);
    const best = ranked[0], worst = ranked.at(-1);
    const title = breached.length
      ? `Northbrook breaks its ${breached.map(line => line.title.toLowerCase()).join(' and ')} red line${breached.length > 1 ? 's' : ''}`
      : worst.change >= -2 ? 'Northbrook comes through the year in balance' : 'Northbrook gets through the year';
    const first = best.change > 0 ? phrases[best.id][0] : 'nothing improves much';
    const second = worst.change < 0 ? phrases[worst.id][1] : 'nothing gets much worse';
    const sentence = `${first[0].toUpperCase()}${first.slice(1)}, but ${second}.`;
    return { title, sentence };
  }

  // Each role's reaction to a proposal, from what the card itself says (its
  // gain and risk lines, tagged as helps / hurts). It never leaks hidden effects.
  function stances(index, choiceId) {
    const choice = optionFor(index, choiceId);
    return roles.map(role => ({ role, stance: choice.helps?.includes(role.metric) ? 'for' : choice.hurts?.includes(role.metric) ? 'against' : 'mixed' }));
  }

  // Money shown on an option card before the vote (as a real board paper would).
  function cost(index, choiceId) {
    const choice = optionFor(index, choiceId);
    const later = choice.commitment?.effects.budget ? choice.commitment.effects.budget * choice.commitment.quarters : 0;
    return { now: choice.effects.budget || 0, later, recurring: choice.recurring || 0 };
  }

  // Display-only projection of the next quarter's opening, before any decision:
  // what earlier deals, the next quarter's outside pressure and any knock-on effects
  // that would then fire will do. The game uses it for the striped "pressure already
  // coming" and for the "On this course" rating. It never feeds the scoring model.
  function project(round) {
    const next = quarters[round.index + 1], snap = { ...round.closing }, steps = [];
    const add = (kind, label, effects) => { for (const [id, c] of Object.entries(effects)) snap[id] = cap(id, (snap[id] ?? 0) + c); steps.push({ kind, label, effects }); };
    for (const item of round.upcoming) add(item.kind, item.title, item.effects);
    if (next) add('headwind', next.pressure, next.headwind);
    for (const rule of rules.knockOns) if (snap[rule.metric] < rule.below) add('system', rule.label, rule.effects);
    return { snapshot: snap, steps };
  }

  function band(metricId, amount) {
    const red = rules.redLines.find(line => line.metric === metricId);
    if (red && amount < red.min) return 'critical';
    if (metricId === 'budget') return amount >= 0 ? 'strong' : amount >= -2000 ? 'stable' : amount >= rules.financeWarning ? 'watch' : amount >= rules.redLines[2].min ? 'concern' : 'critical';
    return amount >= 75 ? 'strong' : amount >= 62 ? 'stable' : amount >= 52 ? 'watch' : amount >= 42 ? 'concern' : 'critical';
  }

  // Deterministic answer order per question, so the right answer is not
  // always in the same place but the order is stable across reloads.
  function order(question) {
    if (Array.isArray(question.order)) return [...question.order];
    let seed = [...question.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
    const indexes = question.answers.map((_, i) => i);
    for (let i = indexes.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const j = seed % (i + 1);
      [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    return indexes;
  }

  function assess(kind, answers) {
    return questions[kind].map((question, index) => ({ ...question, answer: answers[index], passed: answers[index] === question.correct }));
  }

  return { initial, resolve, history, counterfactual, prediction, rightOwner, ownerFor, forecast, project, recurring, redLines, objectiveValue,
    scoreRole, describe, verdict, stances, cost, band, order, assess, optionFor, metricById };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Northbrook.engine;
