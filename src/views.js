'use strict';

// HTML templates. Pure functions of state: no event handling, no storage.
// Visual language: pixel panels, pixel icons, stat bars made of blocks, and
// in-world artefacts (the Gazette, the inspection stamp, the IOU tickets), so
// the numbers are something players read, tap and react to, not a data dump.
Northbrook.views = (() => {
  const { rules, metrics, quarters, roles, skills, questions, facilitator, glossary } = Northbrook.content;
  const E = Northbrook.engine;
  const P = Northbrook.pixel;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const metricById = id => metrics.find(metric => metric.id === id);
  const roleById = id => roles.find(role => role.id === id);
  const care = metrics.filter(metric => metric.id !== 'budget');

  // ---------- pixel icons: 8×8 grids, one colour each, drawn crisp ----------
  const GRIDS = {
    finance: ['..####..', '.#....#.', '#..##..#', '#.#..#.#', '#.#....#', '#..##..#', '.#....#.', '..####..'],
    access: ['..####..', '.#....#.', '#...#..#', '#...#..#', '#...###.', '#......#', '.#....#.', '..####..'],
    safety: ['.######.', '#......#', '#..##..#', '#.####.#', '#..##..#', '.#....#.', '..#..#..', '...##...'],
    staff: ['.##..##.', '#..##..#', '#..##..#', '.##..##.', '........', '.######.', '########', '########'],
    experience: ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...', '........'],
    trust: ['########', '#......#', '#.####.#', '#......#', '#.###..#', '########', '.##.....', '.#......'],
    flag: ['##......', '#####...', '#######.', '#####...', '##......', '#.......', '#.......', '#.......'],
    check: ['........', '.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '........'],
    cross: ['#......#', '##....##', '.##..##.', '..####..', '..####..', '.##..##.', '##....##', '#......#'],
    alert: ['...##...', '..####..', '..#..#..', '.##..##.', '.##..##.', '########', '###..###', '########'],
    arrow: ['........', '....#...', '....##..', '#######.', '########', '#######.', '....##..', '....#...'],
    back: ['........', '...#....', '..##....', '.#######', '########', '.#######', '..##....', '...#....'],
    clock: ['..####..', '.#....#.', '#..#...#', '#..#...#', '#..###.#', '#......#', '.#....#.', '..####..'],
    file: ['#####...', '#...##..', '#....##.', '#.####.#', '#......#', '#.####.#', '#......#', '########'],
    info: ['..####..', '.#.##.#.', '#......#', '#..##..#', '#..##..#', '#..##..#', '.#....#.', '..####..'],
    undo: ['..#.....', '.##.....', '########', '.##....#', '..#....#', '.......#', '..######', '........'],
    print: ['..####..', '..#..#..', '########', '#......#', '#..##..#', '########', '..#..#..', '..####..'],
    news: ['########', '#......#', '#.##.#.#', '#.##...#', '#....#.#', '#.####.#', '#......#', '########'],
    coin: ['..####..', '.#....#.', '#.####.#', '#.#....#', '#.###..#', '#.#....#', '.#.####.', '..####..'],
    star: ['...##...', '...##...', '########', '.######.', '..####..', '.##..##.', '##....##', '........'],
  };
  function icon(key, cls = '') {
    const grid = GRIDS[key];
    if (!grid) return '';
    const cells = grid.flatMap((row, y) => [...row].map((ch, x) => ch === '#' ? `M${x} ${y}h1v1h-1z` : '')).join('');
    return `<svg class="px-icon ${cls}" viewBox="0 0 8 8" aria-hidden="true" shape-rendering="crispEdges"><path d="${cells}" fill="currentColor"/></svg>`;
  }
  const button = (action, label, type = 'primary', extra = '') => `<button type="button" class="btn ${type}" data-action="${action}" ${extra}>${label}</button>`;
  const close = () => '<button type="button" class="close-button" data-action="close" aria-label="Close">×</button>';

  const money = amount => amount === 0 ? '£0' : Math.abs(amount) >= 1000 ? `£${(Math.abs(amount) / 1000).toFixed(1)}m` : `£${Math.abs(amount)}k`;
  const value = (id, amount) => id !== 'budget' ? String(amount) : amount === 0 ? '£0' : `${amount < 0 ? '−' : '+'}${money(amount)}`;
  const delta = (id, amount) => !amount ? '0' : `${amount < 0 ? '−' : '+'}${id === 'budget' ? money(amount) : Math.abs(amount)}`;
  const tone = amount => amount < 0 ? 'bad' : amount > 0 ? 'good' : 'neutral';
  const effectText = effects => Object.entries(effects).filter(([, c]) => c).map(([id, c]) => `${metricById(id).label} ${delta(id, c)}`).join(', ') || 'no change';
  const chips = effects => Object.entries(effects).filter(([, c]) => c).map(([id, c]) => `<span class="chip ${tone(c)}">${icon(metricById(id).icon)}${delta(id, c)}</span>`).join('') || '<span class="chip">No change</span>';
  const stepNames = { decision: 'Your decision', carry: 'Agreed earlier', regulator: 'Regulator', foresight: 'Foresight', headwind: 'Outside pressure', system: 'Knock-on' };
  const statusLabel = { track: 'On track', risk: 'Close to the line', off: 'Below target', met: 'Met', missed: 'Missed' };
  const bandLabel = { strong: 'Strong', stable: 'Stable', watch: 'Watch', concern: 'Concern', critical: 'Critical' };
  const line = id => rules.redLines.find(item => item.metric === id);

  // ---------- stat bars: the game's main infographic ----------
  // Care measures: 20 blocks of 5 points. Money: a reserve of 12 blocks of
  // £0.5m that drains as the deficit grows. A notch marks each red line.
  const BLOCKS = 20, MONEY_BLOCKS = 12, MONEY_STEP = 500;
  function fill(id, amount) { return id === 'budget' ? Math.max(0, Math.min(MONEY_BLOCKS, Math.round(MONEY_BLOCKS + amount / MONEY_STEP))) : Math.max(0, Math.min(BLOCKS, Math.round(amount / 5))); }
  function bar(id, amount, ghost = null) {
    const total = id === 'budget' ? MONEY_BLOCKS : BLOCKS;
    const now = fill(id, amount), after = ghost === null ? now : fill(id, ghost);
    const red = line(id), notch = red ? fill(id, red.min) : -1;
    const band = E.band(id, amount);
    let cells = '';
    for (let i = 0; i < total; i++) {
      const lit = i < now, drain = i < now && i >= after, gain = i >= now && i < after;
      cells += `<i class="${lit ? 'on' : ''}${drain ? ' drain' : ''}${gain ? ' gain' : ''}${i === notch ? ' notch' : ''}"></i>`;
    }
    return `<span class="bar ${band}" style="--n:${total}">${cells}</span>`;
  }
  // Illustrative NHS equivalent for a 0–100 measure (labelled as illustrative wherever shown).
  function realWorld(id, amount) {
    const real = metricById(id).real;
    if (!real) return null;
    const raw = real.base + real.slope * amount, shown = real.unit === '%' ? raw.toFixed(raw < 20 ? 1 : 0) : Math.round(raw);
    return { text: `${shown}${real.unit} ${real.label}`, value: `${shown}${real.unit}`, label: real.label, short: real.short || real.label, standard: real.standard };
  }
  const arrow = c => c > 0 ? '▲' : c < 0 ? '▼' : '';
  // rows: { snapshot, pressure (effects due regardless), change (this step), since (opening snapshot), interactive, picked }
  function hud({ snapshot, pressure = null, change = null, since = null, interactive = false, picked = null, title = 'Hospital status', compact = false }) {
    return `<section class="hud px-panel${compact ? ' compact' : ''}${since ? ' since' : ''}" aria-label="${esc(title)}">
      <header class="px-title">${icon('star')}<h2>${esc(title)}</h2>${pressure ? '<span class="legend"><i class="drain"></i> pressure already coming</span>' : since ? '<span class="legend">change this quarter</span>' : change ? '<span class="legend">this step</span>' : ''}</header>
      ${interactive ? `<p class="px-foot money-note">${icon('coin')} Money is on its own track: tap one of the five care bars.</p>` : ''}
      <ul class="stats">${metrics.map(metric => {
        const amount = snapshot[metric.id], ghost = pressure ? amount + (pressure[metric.id] || 0) : null;
        const step = change ? change[metric.id] : since ? amount - since[metric.id] : 0;
        const red = line(metric.id), band = E.band(metric.id, amount), real = realWorld(metric.id, amount);
        const popText = step ? `${since ? arrow(step) : ''}${delta(metric.id, step)}` : since ? '=' : '';
        const inner = `<span class="stat-icon">${icon(metric.icon)}</span><span class="stat-name">${metric.label}<small class="band-word ${band}">${bandLabel[band]}</small></span>${since && real ? `<span class="bar-cell">${bar(metric.id, amount, ghost)}<small class="real-line">≈ ${real.value} ${esc(real.short)}</small></span>` : bar(metric.id, amount, ghost)}
          <b class="stat-value">${value(metric.id, amount)}</b><em class="pop ${tone(step)}">${popText}</em>
          <span class="sr-only">${bandLabel[band]}${real ? `, about ${real.text}` : ''}${red ? `, red line ${value(metric.id, red.min)}` : ''}${ghost !== null && ghost !== amount ? `, falls to ${value(metric.id, ghost)} if nothing changes` : ''}</span>`;
        const canPick = interactive && metric.id !== 'budget';
        const tip = real ? ` title="${esc(`${metric.label} ${amount} ≈ ${real.text} (illustrative; ${real.standard})`)}"` : '';
        return `<li class="stat${step && change ? ' changed ' + tone(step) : ''}${picked === metric.id ? ' picked' : ''}${metric.id === 'budget' ? ' money' : ''}"${tip}>${canPick
          ? `<button type="button" class="stat-pick" data-action="predict" data-metric="${metric.id}" aria-pressed="${picked === metric.id}">${inner}</button>` : inner}</li>`;
      }).join('')}</ul>
      ${compact ? '' : `<p class="px-foot">${icon('flag')} Red-line notches: safety ${line('safety').min}, access ${line('access').min}, money ${value('budget', line('budget').min)}.</p>`}
    </section>`;
  }

  // ---------- boardroom table ----------
  function mood(results) {
    if (results.some(item => item.status === 'missed')) return 'angry';
    if (results.some(item => item.status === 'off' || item.status === 'risk')) return 'worried';
    return 'happy';
  }
  const faces = { happy: '☺', worried: '~', angry: '!' };
  const goalItem = (item, final) => `<li class="${item.status}"><span class="weight">${'■'.repeat(item.weight)}</span><span>${esc(item.label)}</span><em>${item.metric === 'recurring' ? money(item.value) + '/qtr' : value(item.metric, item.value)}${!final && item.metric === 'budget' ? ' with agreed costs, before outside pressure' : ''} · ${statusLabel[item.status]}</em></li>`;
  function boardTable(seats, rounds, { stances = null, focus = null, final = false } = {}) {
    const cards = seats.map(id => E.scoreRole(id, rounds, final));
    const showAll = focus === 'all' && seats.length > 1;
    const focusId = focus && seats.includes(focus) ? focus : seats[0];
    const stanceOf = id => stances?.find(item => item.role.id === id)?.stance;
    const seat = card => {
      const id = card.role.id, stance = stanceOf(id), feel = mood(card.results);
      return `<div class="seat-wrap">${stance ? `<span class="bubble ${stance}" aria-hidden="true">${stance === 'for' ? 'YES!' : stance === 'against' ? 'NO!' : 'HMM'}</span>` : ''}<button type="button" class="seat${id === focusId ? ' focus' : ''}" data-action="seat" data-role="${id}" aria-pressed="${id === focusId}" style="--accent:${card.role.accent}">
        <canvas data-portrait="${id}" width="24" height="24" aria-hidden="true"></canvas>
        <span class="seat-name">${esc(card.role.short)}</span>
        <span class="face ${feel}" aria-hidden="true">${faces[feel]}</span>
        <span class="pips">${card.results.map(item => `<i class="${item.status}"></i>`).join('')}</span>
        <span class="sr-only">${esc(card.role.label)}: ${card.results.map(item => `${item.label}, ${statusLabel[item.status]}`).join('; ')}${stance ? `. Likely ${stance === 'for' ? 'for' : stance === 'against' ? 'against' : 'undecided'}` : ''}</span></button></div>`;
    };
    const top = cards.slice(0, Math.ceil(cards.length / 2)), bottom = cards.slice(Math.ceil(cards.length / 2));
    const focused = cards.find(card => card.role.id === focusId);
    return `<section class="board px-panel" aria-label="The board">
      <header class="px-title">${icon('staff')}<h2>${seats.length === 1 ? 'Your seat' : 'The board'}</h2><span class="legend">${stances ? 'Reacting to the card' : 'Tap a seat'}</span>${seats.length > 1 ? `<button type="button" class="btn link small" data-action="seat" data-role="${showAll ? seats[0] : 'all'}" aria-pressed="${showAll}">${showAll ? 'One seat' : 'All goals'}</button>` : ''}</header>
      <div class="table-scene"><div class="row">${top.map(seat).join('')}</div><div class="tabletop" aria-hidden="true"><span>NORTHBROOK BOARD</span></div>${bottom.length ? `<div class="row">${bottom.map(seat).join('')}</div>` : ''}</div>
      ${showAll ? `<div class="goals all">${cards.map(card => `<div><b>${esc(card.role.short)}</b><ul>${card.results.map(item => goalItem(item, final)).join('')}</ul></div>`).join('')}</div>`
        : `<div class="goals" id="goals-panel"><b>${esc(focused.role.label)}</b><span class="goal-brief">${esc(focused.role.brief)}</span><ul>${focused.results.map(item => goalItem(item, final)).join('')}</ul></div>`}
    </section>`;
  }

  // ---------- shared pieces ----------
  function progress(index, done) {
    return `<ol class="quarters" aria-label="Year progress">${quarters.map((quarter, i) => {
      const current = i === index, complete = i < done && !current;
      return `<li class="${current ? 'current' : complete ? 'done' : ''}"${current ? ' aria-current="step"' : ''}><span>Q${i + 1}</span><b>${esc(quarter.short)}</b></li>`;
    }).join('')}</ol>`;
  }

  const qpips = index => `<span class="qpips" aria-hidden="true">${quarters.map((_, i) => `<i class="${i < index ? 'done' : i === index ? 'now' : ''}"></i>`).join('')}</span>`;

  function hospitalMap(id, caption, extraClass = '', overlay = '') {
    const labels = P.LABELS.map(([text, x, y, key]) => `<span class="room${key ? ' landmark' : ''}" style="left:${(x / P.COLS * 100).toFixed(2)}%;top:${(y / P.ROWS * 100).toFixed(2)}%${x / P.COLS > .85 ? ';transform:translate(-100%, -50%)' : x / P.COLS < .15 ? ';transform:translate(0, -50%)' : ''}">${esc(text)}</span>`).join('');
    return `<figure class="map ${extraClass}">
      <div class="map-frame"><div class="map-zoom"><canvas data-pixel="hospital" data-map="${id}" width="960" height="544" aria-hidden="true"></canvas>
        <div class="map-overlay" aria-hidden="true">${labels}<span class="map-sign" id="${id}-sign" hidden></span><div class="floaters" id="${id}-floaters"></div></div></div>
        <span class="map-money" id="${id}-money" aria-hidden="true"></span>${overlay}</div>
      <figcaption><span class="sr-only" id="${id}-desc"></span><span id="${id}-caption">${esc(caption)}</span></figcaption></figure>`;
  }
  function mapOverlay({ scene, dressing, snapshot, floaters = [], signText = null, zoom = null, scale = 1.75, card = null }) {
    const zoneOf = key => P.ZONES[key] || P.ZONES.front;
    const signDef = P.SCENES[scene]?.signs?.[0] || P.DRESSING[dressing]?.sign;
    // Keep signs and floaters inside the visible window, even when the map is zoomed:
    // near an edge they anchor to that edge instead of hanging off it.
    const zx = zoom ? (zoom.x + zoom.w / 2) / P.COLS * 100 : 50, lo = zoom ? zx - zx / scale : 0, hi = zoom ? zx + (100 - zx) / scale : 100;
    const place = zone => {
      const x = Math.max(lo + 2, Math.min(hi - 2, (zone.x + zone.w / 2) / P.COLS * 100)), r = (x - lo) / (hi - lo);
      let ax = r > .66 ? '-100%' : r < .34 ? '0%' : '-50%', left = x;
      // On the decision screen the crisis card covers one side: keep the sign on the other.
      if (card === 'right' && x > 30) { left = Math.min(x, 50); ax = '-100%'; } else if (card === 'left' && x < 70) { left = Math.max(x, 50); ax = '0%'; }
      const top = (zone.y < 4 ? zone.y + zone.h + 1.4 : zone.y) / P.ROWS * 100;
      const zy = zoom ? (zoom.y + zoom.h / 2) / P.ROWS * 100 : 50, loY = zoom ? zy - zy / scale : 0, hiY = zoom ? zy + (100 - zy) / scale : 100;
      // In the lower part of the view, floaters stack upwards so the frame bottom never clips them.
      const dir = (top - loY) / (hiY - loY) > .45 ? -1 : 1;
      return `left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;--ax:${ax};--dir:${dir}`;
    };
    const fz = zoneOf(P.SCENES[scene]?.zone || P.DRESSING[dressing]?.zone);
    return {
      sign: signDef ? { text: signText || signDef[0], style: place(zoneOf(signDef[1])) } : null,
      money: `£ ${value('budget', snapshot.budget ?? 0)}`,
      floaters: floaters.map((item, i) => `<span class="floater ${item.good ? 'good' : 'bad'}" style="${place(fz)};--i:${i}">${esc(item.text)}</span>`).join(''),
      description: P.describe(snapshot, scene, dressing),
    };
  }

  const coins = (amount, cls = '') => `<span class="coins ${cls}" aria-hidden="true">${Array.from({ length: Math.min(6, Math.max(1, Math.round(Math.abs(amount) / 400))) }, () => icon('coin')).join('')}</span>`;
  function costLine(index, optionId, short = false) {
    const { now, later, recurring } = E.cost(index, optionId);
    const option = E.optionFor(index, optionId);
    const parts = [now < 0 ? `${short ? '' : 'Costs '}<b>${money(now)}</b> now` : now > 0 ? `Saves <b>${money(now)}</b>` : '<b>No new spend</b>'];
    if (later) parts.push(`${money(later)} next ${option.commitment.quarters > 1 ? `${option.commitment.quarters} qtrs` : 'qtr'}`);
    if (recurring) parts.push(`${money(recurring)}/qtr after this year`);
    return parts.join(' · ');
  }

  // ---------- welcome ----------
  function welcome(saved, storageAvailable, mode = 'group') {
    const resumed = saved ? (['debrief', 'transfer'].includes(saved.phase) ? 'Year-end ready' : `Saved game · ${saved.minutes.length} of 4 quarters`) : '';
    const input = mode === 'solo' ? 'radio' : 'checkbox';
    return `<div class="welcome wrap">
      <section class="title-hero">
        <canvas data-pixel="title" width="960" height="400" aria-hidden="true"></canvas>
        <div class="title-copy"><div class="kicker">NORTHBROOK GENERAL HOSPITAL</div>
          <h1 class="logo">TRUST IN<br>BALANCE</h1>
          <p>You run the hospital. Four crises. One decision each. Every choice helps someone and hurts someone else, and three red lines must never break.</p>
          <div class="facts"><span>4 QUARTERS</span><span>~45 MIN GROUP</span><span>~15 MIN SOLO</span><span>OFFLINE</span></div>
        </div>
      </section>
      <div class="welcome-grid">
        <section class="px-panel setup">
          ${saved ? `<div class="resume"><div><b>${esc(resumed)}</b><span>Pick up where you left off.</span></div>${button('resume', `Continue ${icon('arrow')}`, 'gold')}</div>` : ''}
          <form id="start-form" novalidate>
            <fieldset class="mode-switch"><legend class="px-legend">1 · How are you playing?</legend>
              <label><input type="radio" name="mode" value="group"${mode === 'group' ? ' checked' : ''}><span>${icon('staff')} Group, one screen</span></label>
              <label><input type="radio" name="mode" value="solo"${mode === 'solo' ? ' checked' : ''}><span>${icon('trust')} Just me</span></label>
            </fieldset>
            <fieldset class="role-picker"><legend class="px-legend">2 · ${mode === 'solo' ? 'Pick your seat' : 'Fill the seats (3–6 is best)'}</legend>
              <div class="role-grid">${roles.map(role => `<label class="role-card" style="--accent:${role.accent}">
                <input type="${input}" name="seat" value="${role.id}">
                <canvas data-portrait="${role.id}" width="24" height="24" aria-hidden="true"></canvas>
                <span><b>${esc(role.label)}</b><small>${icon(metricById(role.metric).icon)} ${esc(metricById(role.metric).label)}</small></span></label>`).join('')}</div>
              ${mode === 'group' ? button('all-seats', 'Fill all six seats', 'link') : ''}
            </fieldset>
            <p class="form-error" id="seat-error" role="alert" hidden>Pick at least one seat to start.</p>
            <div class="text-style"><span class="px-legend">3 · Text</span>${button('font-pixel', 'Pixel', 'ghost small', 'aria-pressed="false" data-font="pixel"')}${button('font-plain', 'Plain (easier to read)', 'ghost small', 'aria-pressed="false" data-font="plain"')}</div>
            <label class="checkline"><input name="warmup" type="checkbox"> Warm-up quiz first <small>(+4 min)</small></label>
            <button class="btn gold big start" type="submit">START THE YEAR ${icon('arrow')}</button>
          </form>
          <p class="px-foot">${storageAvailable ? 'Saves on this device.' : 'This browser can’t save: keep the tab open.'} Everything here is fictional.</p>
        </section>
        <section class="px-panel how">
          <header class="px-title">${icon('info')}<h2>How a quarter plays</h2></header>
          <ol class="howto">
            <li><span>1</span><p><b>A crisis hits.</b> Read the board pack and watch the stat bars: the striped blocks are pressure already coming.</p></li>
            <li><span>2</span><p><b>Argue, then pick.</b> Each proposal shows its cost. The board reacts to what the card says.</p></li>
            <li><span>3</span><p><b>Call it.</b> Tap the bar you think takes the biggest hit, and pick who checks on it.</p></li>
            <li><span>4</span><p><b>Watch it play out.</b> The hospital reacts, then the Gazette prints the front page.</p></li></ol>
          <div class="redbox">${icon('flag')}<div><b>Three red lines</b><ul>${rules.redLines.map(item => `<li>${esc(item.plain)}</li>`).join('')}</ul><span>Break one and the regulator steps in.</span></div></div>
          <div class="link-row">${button('guide', 'How to play', 'link')}${button('glossary', 'Word list', 'link')}${button('facilitator-notes', 'Facilitator notes', 'link')}</div>
        </section>
      </div>
    </div>`;
  }

  // ---------- quizzes ----------
  const quizInfo = {
    baseline: ['WARM-UP', 'Before you take the board', 'Answer as you would today.'],
    transfer: ['LEARNING CHECK', 'Try it on new situations', 'Four new cases, one for each idea in the game.'],
    recall: ['PRACTICE', 'What do you remember?', 'Four more cases. Best a day or two later.'],
  };
  function quiz(kind, answers, locked) {
    const items = questions[kind], index = locked ? answers.length - 1 : answers.length, item = items[index];
    const [tag, heading, description] = quizInfo[kind];
    const chosen = locked ? answers[index] : null;
    return `<div class="wrap narrow"><section class="px-panel quiz">
      <div class="kicker">${tag} · ${index + 1} of ${items.length} · ${esc(skills[item.skill])}</div>
      <div class="quiz-track" aria-hidden="true">${items.map((_, i) => `<i class="${i < index || (locked && i === index) ? 'on' : i === index ? 'now' : ''}"></i>`).join('')}</div>
      ${index === 0 && !locked ? `<p class="quiz-intro"><b>${heading}.</b> ${description}</p>` : ''}
      <h1 id="quiz-question" class="quiz-q">${esc(item.prompt)}</h1>
      <form id="quiz-form" novalidate><fieldset${locked ? ' disabled' : ''} aria-labelledby="quiz-question">
        ${E.order(item).map((i, n) => {
          const state = locked ? (i === item.correct ? 'right' : i === chosen ? 'wrong' : '') : '';
          return `<label class="answer ${state}"><input type="radio" name="answer" value="${i}"${i === chosen ? ' checked' : ''}><span class="key">${'ABC'[n]}</span><span>${esc(item.answers[i])}</span>${state === 'right' ? `<em>${icon('check')} RIGHT</em>` : state === 'wrong' ? `<em>${icon('cross')} YOURS</em>` : ''}</label>`;
        }).join('')}
      </fieldset>
      ${locked ? `<div class="feedback ${chosen === item.correct ? 'good' : 'bad'}"><b>${chosen === item.correct ? 'Correct!' : 'Not quite.'}</b> ${esc(item.why)}</div>` : ''}
      <div class="actions">${kind === 'baseline' && !locked ? button('skip-warmup', 'Skip the warm-up', 'link') : ''}
        ${locked ? button('quiz-next', `${index === items.length - 1 ? 'SEE MY SCORE' : 'NEXT'} ${icon('arrow')}`, 'gold') : `<button class="btn gold" type="submit" id="quiz-submit" disabled>CHECK</button>`}</div>
      </form></section></div>`;
  }
  function quizScore(kind, answers, baseline = []) {
    const results = E.assess(kind, answers), right = results.filter(item => item.passed).length;
    const start = baseline.length ? E.assess('baseline', baseline).filter(item => item.passed).length : null;
    return `<div class="score-big"><b>${right}<small>/4</small></b>${start !== null ? `<span>warm-up ${start}/4 ${right > start ? '▲' : right < start ? '▼' : '='}</span>` : ''}</div>
      <ul class="skill-list">${results.map(item => `<li class="${item.passed ? 'good' : 'bad'}">${icon(item.passed ? 'check' : 'cross')}<b>${esc(skills[item.skill])}</b><span>${esc(item.why)}</span></li>`).join('')}</ul>`;
  }
  function warmupDone(answers) {
    const right = E.assess('baseline', answers).filter(item => item.passed).length;
    return `<div class="wrap narrow"><section class="px-panel quiz center"><div class="kicker">WARM-UP DONE</div><div class="score-big"><b>${right}<small>/4</small></b></div>
      <p>Hold on to that. At the end you’ll try four new cases on the same ideas.</p><div class="actions">${button('begin-year', `TAKE THE BOARD ${icon('arrow')}`, 'gold big')}</div></section></div>`;
  }

  // ---------- decision screen ----------
  function reviewCallback(rounds) {
    const last = rounds.at(-1);
    if (!last) return '';
    const metric = metricById(last.minute.prediction), owner = roleById(last.minute.owner), rightful = E.ownerFor(metric.id);
    const before = last.opening[metric.id], now = last.closing[metric.id], red = line(metric.id), band = E.band(metric.id, now);
    const advice = red && now - red.min < 0 ? `Below the red line (${red.min}): the regulator is watching. Fix it now.` : red && now - red.min === 0 ? `Sitting exactly on the red line: one more point and it breaks.` : red && now - red.min < 8 ? `Only ${now - red.min} above the red line: protect it this quarter.` : ['concern', 'critical'].includes(band) ? 'Below where it should be: the board should act.' : now < before ? 'Still falling: keep an eye on it.' : 'Holding up.';
    return `<aside class="memo" aria-label="Since the last board"><span class="memo-tag">MEMO</span><canvas data-portrait="${owner.id}" width="24" height="24" aria-hidden="true"></canvas>
      <div class="memo-body">${previously(rounds, metric.id)}<p><b>${esc(owner.short)} review (agreed Q${last.index + 1}):</b> ${metric.label} went ${before} → ${now}. ${advice}${owner.id === rightful.id ? '' : ` (The ${esc(rightful.short)} owns ${metric.label.toLowerCase()}.)`}</p></div></aside>`;
  }
  function facilCallout(index, startedAt, snapshot = null) {
    const notes = facilitator.quarters[index];
    return `<aside class="facil facil-only" aria-label="Facilitator prompt"><div><b>${icon('info')} FACILITATOR</b><span class="timer">${icon('clock')} Q <span id="quarter-timer" data-start="${startedAt}">0:00</span>/${notes.minutes}:00 · Session <span id="session-timer">0:00</span>/45:00</span></div>
      <p><b>Ask:</b> ${esc(notes.ask)}</p><p><b>Watch for:</b> ${esc(notes.watch)}${snapshot ? ` Right now: ${value('budget', snapshot.budget)}, so ${money(snapshot.budget - line('budget').min)} of room before the red line.` : ''}</p></aside>`;
  }

  // Story continuity: last quarter's front page and the one thing the board should worry about now.
  function previously(rounds, skip = null) {
    const last = rounds.at(-1);
    if (!last) return '';
    const option = E.optionFor(last.index, last.minute.choice), snap = last.closing;
    const worries = rules.knockOns.map(k => ({ k, gap: snap[k.metric] - k.below })).filter(w => w.k.metric !== skip && w.gap >= 0 && w.gap < (w.k.metric === 'budget' ? 1000 : 6)).sort((a, b) => a.gap - b.gap);
    const lines = rules.redLines.map(l => ({ l, gap: snap[l.metric] - l.min })).filter(w => w.gap < 0 || (w.l.metric !== skip && w.gap < (w.l.metric === 'budget' ? 1500 : 8))).sort((a, b) => a.gap - b.gap);
    const owed = last.upcoming.filter(item => item.kind === 'carry');
    const story = quarters[last.index + 1]?.after?.[last.minute.choice] || '';
    const worry = lines[0] ? `${metricById(lines[0].l.metric).label} is ${value(lines[0].l.metric, snap[lines[0].l.metric])}: ${lines[0].gap < 0 ? 'BELOW the red line. The regulator is watching.' : 'close to the red line.'}`
      : knockOnsAhead(last).length ? `${knockOnsAhead(last).map(k => `${k.label} (${effectText(k.effects)})`).join('; ')} unless the board acts.`
      : story ? ''
      : worries[0] ? `${metricById(worries[0].k.metric).label} is ${value(worries[0].k.metric, snap[worries[0].k.metric])}: any lower and ${worries[0].k.label.charAt(0).toLowerCase()}${worries[0].k.label.slice(1)}.`
      : owed.length ? `Still owed from earlier: ${owed.map(item => item.title.toLowerCase()).join(', ')}.` : '';
    return `<p class="previously"><span class="prev-tag">LAST TIME</span>${/[“”"]/.test(option.headline) ? esc(option.headline) : `“${esc(option.headline)}”`} ${esc(story)}${worry ? ` <span class="prev-worry">${esc(worry)}</span>` : ''}</p>`;
  }

  function proposal(index, option, letter, selected) {
    const on = option.id === selected, { now } = E.cost(index, option.id);
    return `<button type="button" class="proposal${on ? ' selected' : ''}" data-action="choose" data-option="${option.id}" aria-pressed="${on}">
      <span class="thumb"><canvas data-thumb="${option.scene}" width="256" height="128" aria-hidden="true"></canvas><span class="letter">${letter}</span><span class="tag">${esc(option.tag)}</span>${on ? '<span class="picked-flag">PICKED</span>' : ''}</span>
      <span class="p-body"><span class="p-title">${esc(option.title)}</span><span class="p-text">${esc(option.description)}</span>
        <span class="p-line gain">${icon('check')}${esc(option.gain)}</span><span class="p-line risk">${icon('alert')}${esc(option.risk)}</span>
        <span class="p-cost ${now > 0 ? 'save' : ''}">${coins(now || 1, now > 0 ? 'save' : now === 0 ? 'free' : '')}<span>${costLine(index, option.id, true)}</span></span></span></button>`;
  }
  const optionsGrid = (index, selected) => `<div class="proposals">${quarters[index].options.map((option, i) => proposal(index, option, 'ABCD'[i], selected)).join('')}</div>`;

  function decision(index, rounds, state, selected, startedAt, focus) {
    const q = quarters[index], snapshot = rounds.at(-1)?.closing ?? E.initial();
    // Striped "pressure already coming": earlier deals, outside pressure and any knock-on that would then fire.
    const before = rounds.at(-1) ?? { index: -1, closing: E.initial(), upcoming: [] }, ahead = E.project(before).snapshot;
    const pressure = Object.fromEntries(metrics.map(m => [m.id, ahead[m.id] - snapshot[m.id]]));
    const zone = P.ZONES[q.zone], side = zone.x + zone.w / 2 < 16 ? ' right' : '';
    const crisis = `<div class="cutscene${side}"><div class="kicker">${qpips(index)} Q${index + 1} OF 4 · ${esc(q.season)}</div><h1>${esc(q.title)}</h1><p>${esc(q.summary)}</p>
      <ul class="intel">${q.evidence.map(item => `<li><b>${esc(item.value)}</b> ${esc(item.label)}</li>`).join('')}</ul>${button('board-pack', `${icon('file')} BOARD PACK`, 'gold small')}</div>`;
    return `<div class="wrap session">
      <div class="decision-grid">
        <div class="decision-main">
          ${hospitalMap('main', `Q${index + 1}: ${q.short}`, 'hero', crisis)}
          ${reviewCallback(rounds)}
          <section class="vote" aria-labelledby="options-heading"><h2 id="options-heading" class="question">${icon('star')} ${esc(q.question)}</h2>${optionsGrid(index, selected)}</section>
        </div>
        <aside class="decision-side">
          ${facilCallout(index, startedAt, index === quarters.length - 1 ? snapshot : null)}
          ${hud({ snapshot, pressure, title: 'Hospital status' })}
          <div id="board-slot">${boardTable(state.seats, rounds, { stances: selected ? E.stances(index, selected) : null, focus })}</div>
        </aside>
      </div>
    </div>`;
  }

  function dock(index, selected) {
    const option = E.optionFor(index, selected);
    return `<div class="dock" role="region" aria-label="Decision"><div class="wrap dock-inner">
      <div><span class="kicker">Q${index + 1} DECISION</span><b>${option ? esc(option.title) : 'Pick a proposal'}</b>${option ? `<small>${costLine(index, option.id)}</small>` : ''}</div>
      <button type="button" class="btn gold big" data-action="lock"${option ? '' : ' disabled'}>LOCK IT IN ${icon('arrow')}</button></div></div>`;
  }

  // Two taps: tap the stat bar that will take the biggest hit, then the reviewer.
  function lockIn(index, selected, draft, seats, snapshot) {
    const option = E.optionFor(index, selected);
    return `${close()}<div class="kicker">Q${index + 1} · LOCK IT IN</div><h2 id="dialog-title">${esc(option.title)}</h2>
      <p class="sub">${costLine(index, option.id)}</p>
      <div class="tap-step"><b class="step-n">1</b><div><b>Call it: which bar takes the biggest hit this quarter?</b><span>Outside pressure counts too. Get it right: +2 confidence next quarter.</span></div></div>
      ${hud({ snapshot, interactive: true, picked: draft.prediction, title: 'Tap a bar', compact: true })}
      <div class="tap-step"><b class="step-n">2</b><div><b>Who checks on it next quarter?</b><span>Whose problem is it?</span></div></div>
      <div class="owner-row">${roles.map(role => `<button type="button" class="owner${draft.owner === role.id ? ' on' : ''}${seats.includes(role.id) ? ' seated' : ''}" data-action="owner" data-role="${role.id}" aria-pressed="${draft.owner === role.id}"><canvas data-portrait="${role.id}" width="24" height="24" aria-hidden="true"></canvas><span>${esc(role.short)}</span></button>`).join('')}</div>
      <p class="px-foot key-hint">Keys: <b>1–5</b> pick a bar · <b>Q W E R T Y</b> pick the reviewer, left to right · <b>Enter</b> lock in · <b>Esc</b> back</p>
      <div class="modal-actions">${button('close', 'Back', 'ghost')}<button type="button" class="btn gold big" data-action="commit"${draft.prediction && draft.owner ? '' : ' disabled'}>LOCK IN AND WATCH ${icon('arrow')}</button></div>`;
  }

  // ---------- report ----------
  function stamps(round) {
    const call = E.prediction(round, round.minute.prediction), metric = metricById(round.minute.prediction), worst = metricById(call.worst.id);
    const owner = roleById(round.minute.owner), rightful = E.ownerFor(metric.id), final = round.index === quarters.length - 1;
    const callText = {
      hit: `${metric.label} took the biggest hit (${call.mine.change}). +2 confidence ${final ? 'for next year' : 'next quarter'}.`,
      close: `${metric.label} fell ${-call.mine.change}, but ${worst.label.toLowerCase()} fell more (${call.worst.change}).`,
      miss: `${metric.label} ${call.mine.change > 0 ? `rose ${call.mine.change}` : 'held'}. ${worst.label} took the hit (${call.worst.change}).`,
      none: round.closing.budget < round.opening.budget ? `No care measure fell this quarter; money fell ${money(round.opening.budget - round.closing.budget)}.` : 'Nothing fell this quarter.',
    }[call.verdict];
    const label = { hit: 'CALLED IT', close: 'CLOSE', miss: 'MISSED IT', none: 'NO HIT' }[call.verdict];
    return `<div class="stamps"><p class="stamp-line ${call.verdict}"><span class="stamp">${label}</span>${esc(callText)}</p>
      <p class="stamp-line ${owner.id === rightful.id ? 'hit' : 'miss'}"><span class="stamp">${owner.id === rightful.id ? 'RIGHT PERSON' : 'WRONG PERSON'}</span>${owner.id === rightful.id ? `The ${esc(owner.short)} looks after ${metric.label.toLowerCase()}.` : `The ${esc(rightful.short)} looks after ${metric.label.toLowerCase()}, not the ${esc(owner.short)}.`}</p></div>`;
  }

  function dialogue(round, beat) {
    const total = round.entries.length, entry = round.entries[beat];
    const who = entry ? stepNames[entry.kind] : 'Quarter end';
    const text = entry ? `${entry.label}${entry.kind === 'carry' ? ` (agreed in Q${entry.source})` : ''}. ${effectText(entry.effects)}.` : 'Every change this quarter has landed. The Gazette goes to print.';
    return `<div class="dialogue" id="dialogue"><div class="dlg-head"><span class="speaker">${qpips(round.index)} Q${round.index + 1} · ${esc(who.toUpperCase())}</span>
        <ol class="beats">${round.entries.map((e, i) => `<li><button type="button" data-action="beat" data-beat="${i}" class="${beat === i ? 'now' : beat > i || beat === -1 ? 'seen' : ''}" aria-label="Step ${i + 1}: ${stepNames[e.kind]}" aria-current="${beat === i ? 'step' : 'false'}"></button></li>`).join('')}<li><button type="button" data-action="beat" data-beat="-1" class="end${beat === -1 ? ' now' : ''}" aria-label="Quarter end" aria-current="${beat === -1 ? 'step' : 'false'}"></button></li></ol></div>
      <p id="narration" aria-live="polite"><span class="sr-only">Step ${entry ? beat + 1 : total + 1} of ${total + 1}. </span>${esc(text)}</p>
      <div class="dlg-controls">${button('step-back', `${icon('back')}`, 'ghost small', `aria-label="Previous step"${beat === 0 ? ' disabled' : ''}`)}
        ${beat === -1 ? `${button('beat-replay', 'REPLAY', 'ghost small')}${button('next', `${round.index === quarters.length - 1 ? 'YEAR-END INSPECTION' : `ON TO Q${round.index + 2}`} ${icon('arrow')}`, 'gold')}` : `${button('step-next', `NEXT ${icon('arrow')}`, 'gold small')}${button('step-end', 'SKIP', 'link')}`}</div></div>`;
  }

  // Money bridge: start → each step → end as horizontal bars, the way a finance
  // report shows a bridge. Rows build with the replay; every row is labelled.
  function waterfall(round, beat) {
    const names = { decision: 'Your decision', carry: 'Agreed earlier', regulator: 'Regulator', foresight: 'Board credit', headwind: 'Outside pressure', system: 'Knock-on' };
    const rows = [{ label: `Start of Q${round.index + 1}`, from: 0, to: round.opening.budget, total: true, shown: true }];
    let running = round.opening.budget;
    round.entries.forEach((entry, i) => {
      const amount = entry.effects.budget || 0;
      if (amount || entry.kind === 'decision') rows.push({ label: names[entry.kind], detail: ['carry', 'regulator', 'system'].includes(entry.kind) ? entry.label : '', from: running, to: running + amount, amount, shown: beat === -1 || i <= beat });
      running += amount;
    });
    rows.push({ label: `End of Q${round.index + 1}`, from: 0, to: running, total: true, shown: beat === -1 });
    const redMin = line('budget').min, values = rows.flatMap(r => [r.from, r.to]);
    const near = Math.min(...values) - redMin < 1500;
    const lo = Math.min(0, ...values, near ? redMin : 0) - 100, hi = Math.max(0, ...values) + 100;
    const pct = v => ((v - lo) / (hi - lo) * 100).toFixed(2);
    const body = rows.map(r => {
      const a = Math.min(r.from, r.to), b = Math.max(r.from, r.to), cls = r.total ? 'total' : r.amount < 0 ? 'bad' : r.amount > 0 ? 'good' : 'zero';
      const amount = r.total ? value('budget', r.to) : r.amount ? delta('budget', r.amount) : '£0';
      return `<li class="${r.shown ? '' : 'pending'}${r.total ? ' is-total' : ''}"><span class="br-label">${esc(r.label)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</span>
        <span class="br-track">${r.shown ? `<i class="${cls}" style="left:${pct(a)}%;width:${Math.max(0.8, pct(b) - pct(a)).toFixed(2)}%"></i>` : ''}</span><b class="${cls}">${r.shown ? amount : '…'}</b></li>`;
    }).join('');
    return `<section class="px-panel water" aria-label="Money this quarter"><header class="px-title">${icon('coin')}<h2>Money this quarter</h2><span class="legend">${beat === -1 ? `ended ${value('budget', running)}` : 'building…'}</span></header>
      <ul class="bridge" style="--zero:${pct(0)}%${near ? `;--redpos:${pct(redMin)}%` : ''}">${body}</ul>
      <p class="px-foot"><span class="key total"></span>position <span class="key bad"></span>cost <span class="key good"></span>saving · ${near ? `<span class="key red"></span>red line ${value('budget', redMin)}` : `red line ${value('budget', redMin)} is ${money(Math.min(...values) - redMin)} away`}</p></section>`;
  }

  // In-world front page: the quarter's result as a newspaper.
  function gazette(round, small = false, wide = false) {
    const option = E.optionFor(round.index, round.minute.choice), q = quarters[round.index];
    const changes = metrics.map(m => ({ m, c: round.closing[m.id] - round.opening[m.id] }));
    const best = [...changes].filter(x => x.m.id !== 'budget').sort((a, b) => b.c - a.c)[0], worst = [...changes].filter(x => x.m.id !== 'budget').sort((a, b) => a.c - b.c)[0];
    const moneyC = changes.find(x => x.m.id === 'budget').c;
    const call = E.prediction(round, round.minute.prediction).verdict;
    return `<article class="gazette${small ? ' small' : ''}${wide ? ' wide' : ''}" aria-label="Northbrook Gazette, Q${round.index + 1}">
      <header><span class="mast">THE NORTHBROOK GAZETTE</span><span class="edition">Q${round.index + 1} · ${esc(q.season)}</span></header>
      <h3 class="headline">${esc(option.headline)}</h3>
      <div class="g-body"><canvas data-thumb="${option.scene}|${q.dressing}" width="256" height="144" aria-hidden="true"></canvas>${call === 'hit' && !small ? '<span class="g-stamp">BOARD SAW IT COMING</span>' : ''}
        ${small ? '' : `<p>${esc(option.outcome)}</p>`}</div>
      <div class="g-stats"><span class="${tone(best.c)}">${icon(best.m.icon)}<b>${delta(best.m.id, best.c)}</b>${best.m.label}</span><span class="${tone(worst.c)}">${icon(worst.m.icon)}<b>${delta(worst.m.id, worst.c)}</b>${worst.m.label}</span><span class="${tone(moneyC)}">${icon('coin')}<b>${delta('budget', moneyC)}</b>Money</span></div>
      ${round.breaches.length ? `<p class="g-banner">REGULATOR CALLED IN: ${round.breaches.map(id => rules.redLines.find(item => item.id === id).title.toUpperCase()).join(' & ')} RED LINE BROKEN</p>` : ''}

    </article>`;
  }

  // Alternate timeline: diverging bars, better or worse than what you chose.
  function compare(rounds, round, id) {
    const choice = E.optionFor(round.index, round.minute.choice);
    const others = quarters[round.index].options.filter(option => option.id !== choice.id);
    const pick = others.map(option => `<button type="button" class="alt${id === option.id ? ' on' : ''}" data-action="compare" data-option="${option.id}" aria-pressed="${id === option.id}"><canvas data-thumb="${option.scene}" width="96" height="48" aria-hidden="true"></canvas><span>${esc(option.title)}</span></button>`).join('');
    let body = '<p class="px-foot">Same start, same earlier deals. Only the decision changes.</p>';
    if (id) {
      const alt = E.counterfactual(rounds, round.index, id);
      body = `<ul class="diverge">${metrics.map(metric => {
        const diff = alt.closing[metric.id] - round.closing[metric.id], scaled = metric.id === 'budget' ? diff / 200 : diff;
        const width = Math.min(50, Math.abs(scaled) * 3);
        return `<li><span class="d-name">${icon(metric.icon)}${metric.label}</span><span class="d-track"><i class="${tone(diff)}" style="width:${width}%;${diff < 0 ? `right:50%` : `left:50%`}"></i></span><b class="${tone(diff)}">${diff ? delta(metric.id, diff) : '='}</b></li>`;
      }).join('')}</ul><p class="px-foot">Bars to the right: that choice would have ended higher than yours.${alt.breaches.length ? ` <b class="bad">It would have broken the ${alt.breaches.map(b => rules.redLines.find(l => l.id === b).title.toLowerCase()).join(' and ')} red line.</b>` : ''}</p>`;
    }
    return `<div class="alts">${pick}</div>${body}`;
  }

  function tickets(round, final) {
    if (!round.upcoming.length) return '<p class="px-foot">Nothing carries over.</p>';
    return `<ul class="tickets">${round.upcoming.map(item => `<li class="${item.kind}"><span class="t-kind">${item.kind === 'carry' ? 'IOU' : item.kind === 'regulator' ? 'REGULATOR' : 'CREDIT'}</span><b>${esc(item.title)}</b><span class="t-when">${item.kind === 'carry' ? `${item.remaining} more qtr${item.remaining > 1 ? 's' : ''}` : 'next qtr'}${final ? ' · next year’s board' : ''}</span><span class="chips">${chips(item.effects)}</span></li>`).join('')}</ul>`;
  }

  function report(rounds, beat, state, compareId, focus) {
    const round = rounds.at(-1), index = round.index, choice = E.optionFor(index, round.minute.choice), final = index === quarters.length - 1;
    const snapshot = beat < 0 ? round.closing : round.entries[beat].snapshot, change = beat < 0 ? null : round.entries[beat].effects;
    const steps = round.entries.length + 1;
    return `<div class="wrap session">
      ${round.breaches.length && beat === -1 ? `<section class="breach" role="alert">${icon('flag')}<div><b>RED LINE BROKEN: ${round.breaches.map(id => rules.redLines.find(item => item.id === id).title.toUpperCase()).join(' & ')}</b> ${round.breaches.map(id => esc(final ? rules.redLines.find(item => item.id === id).consequence.replace(/next quarter/g, 'next year') : rules.redLines.find(item => item.id === id).consequence)).join(' ')}${final ? ' The inspectors cap this year’s rating.' : ''}</div></section>` : ''}
      <div class="report-grid">
        <div class="report-main"><div class="stage">${hospitalMap('main', `Q${index + 1}: ${choice.title}`, 'hero')}${dialogue(round, beat)}</div>${beat === -1 ? gazette(round, false, true) : ''}</div>
        <aside class="report-side">
          <div id="hud-slot">${beat === -1 ? hud({ snapshot, since: round.opening, title: `End of Q${index + 1}`, compact: true }) : hud({ snapshot, change, title: `Step ${beat + 1} of ${steps}` })}</div>
          ${beat === -1 ? `${final || index === 0 ? '' : forecastLine(rounds, state)}${waterfall(round, -1)}${stamps(round)}` : `<div id="water-slot">${waterfall(round, beat)}</div>`}
        </aside>
      </div>
      ${beat === -1 ? `<div class="report-cols two">
        <section class="px-panel"><header class="px-title">${icon('clock')}<h2>What if we’d chosen…</h2></header><div id="compare-body">${compare(rounds, round, compareId)}</div></section>
        <section class="px-panel"><header class="px-title">${icon('coin')}<h2>Carries into ${final ? 'next year' : `Q${index + 2}`}</h2></header>${tickets(round, final)}<div class="lesson">${icon('star')}<p><b>Take to your next board:</b> ${esc(choice.lesson)}</p></div></section>
      </div>
      <aside class="facil facil-only"><b>${icon('info')} FACILITATOR:</b> ask who saw this coming, and whose goals took the hit. Then: ${final ? 'move to the year-end inspection.' : 'use “What if” only if there is time.'}</aside>` : ''}
    </div>`;
  }

  // A running score: what the year-end inspection would say on the current course,
  // counting what is already coming next quarter (earlier deals and outside pressure).
  function forecastLine(rounds, state) {
    const last = rounds.at(-1), next = quarters[last.index + 1], snap = E.project(last).snapshot;
    // Add the projected next quarter (with a choice that adds no running cost), so
    // "left broken two quarters" and knock-ons count just as they will for real.
    const ghost = { index: last.index + 1, opening: last.closing, closing: snap, entries: [], upcoming: [], breaches: [], minute: { choice: next.options.find(o => !o.recurring)?.id ?? next.options[0].id } };
    const v = E.verdict([...rounds, ghost], state.seats), left = quarters.length - rounds.length;
    const atRisk = rules.redLines.filter(l => last.closing[l.metric] >= l.min && snap[l.metric] < l.min);
    const still = rules.redLines.filter(l => last.closing[l.metric] < l.min && snap[l.metric] < l.min);
    const warn = [
      ...still.map(l => `${l.title.toLowerCase()} is still below its red line: Inadequate if it isn’t fixed next quarter`),
      ...(atRisk.length ? [`${atRisk.map(l => l.title.toLowerCase()).join(' and ')} red line goes next quarter unless you act`] : []),
    ];
    return `<p class="stamp-line forecast level-${v.level}"><span class="stamp">ON THIS COURSE</span><span>Inspectors would rate <b>${esc(v.rating.toUpperCase())}</b>${warn.length ? ` · <b class="bad">${esc(warn.join('; '))}</b>` : ''}.<small class="forecast-note">Counts costs and knock-ons already coming · six roles’ goals ${v.average}% met · ${left} quarter${left > 1 ? 's' : ''} left</small></span></p>`;
  }

  // ---------- year-end ----------
  // Start-of-year against year-end for each measure: a dumbbell chart with the
  // numbers printed, red lines marked, and the end dot coloured by status.
  function radar(rounds) {
    const start = E.initial(), end = rounds.at(-1).closing;
    const scale = id => id === 'budget' ? v => Math.max(0, Math.min(100, (v + 6000) / 70)) : v => Math.max(0, Math.min(100, v));
    return `<ul class="dumbbells" aria-label="Start of year compared with year-end">${metrics.map(m => {
      const f = scale(m.id), a = f(start[m.id]), b = f(end[m.id]), red = line(m.id), c = end[m.id] - start[m.id];
      const band = E.band(m.id, end[m.id]);
      return `<li><span class="db-name">${icon(m.icon)}${m.label}</span><span class="db-track">${red ? `<i class="db-red" style="left:${f(red.min).toFixed(1)}%"></i>` : ''}
        <i class="db-span ${tone(c)}" style="left:${Math.min(a, b).toFixed(1)}%;width:${Math.abs(b - a).toFixed(1)}%"></i><i class="db-start" style="left:${a.toFixed(1)}%"></i><i class="db-end ${band}" style="left:${b.toFixed(1)}%"></i></span>
        <span class="db-nums">${value(m.id, start[m.id])} → <b class="${tone(c)}">${value(m.id, end[m.id])}</b></span></li>`;
    }).join('')}</ul>`;
  }
  function journey(rounds) {
    const cols = ['Start', 'Q1', 'Q2', 'Q3', 'Q4'];
    return `<table class="journey"><caption class="sr-only">Each measure from the start of the year to Q4, coloured by status</caption>
      <thead><tr><th scope="col"></th>${cols.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${metrics.map(m => {
        const values = [m.start, ...rounds.map(r => r.closing[m.id])];
        return `<tr><th scope="row">${icon(m.icon)} ${m.label}</th>${values.map((v, i) => `<td class="${E.band(m.id, v)}${rounds[i - 1]?.breaches.some(id => rules.redLines.find(l => l.id === id).metric === m.id) ? ' broke' : ''}">${value(m.id, v)}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table>
      <p class="px-foot"><span class="key strong"></span>strong <span class="key stable"></span>stable <span class="key watch"></span>watch <span class="key concern"></span>concern <span class="key critical"></span>critical · outlined: red line broken</p>`;
  }

  function debrief(rounds, state, focus, tab = 'pages') {
    const result = E.verdict(rounds, state.seats), lines = E.redLines(rounds), last = rounds.at(-1), recurring = E.recurring(rounds);
    const calls = rounds.filter(r => E.prediction(r, r.minute.prediction).verdict === 'hit').length, owners = rounds.filter(r => E.rightOwner(r.minute)).length;
    const transferDone = state.answers.transfer.length === questions.transfer.length;
    return `<div class="wrap session debrief">
      <div class="report-grid">
        ${hospitalMap('final', 'Northbrook at year-end', 'hero', `<div class="cutscene ins right"><div class="kicker">YEAR-END INSPECTION</div>
          <div class="big-stamp level-${result.level}"><span>RATED</span><b>${result.rating.toUpperCase()}</b></div>
          <h1>${esc(result.headline.title)}</h1><p>${esc(result.headline.sentence)}</p></div>`)}
        <aside class="px-panel ins-side"><header class="px-title">${icon('star')}<h2>How balanced was the year?</h2></header>${radar(rounds)}
          <p class="px-foot"><span class="key ring"></span>start of year <span class="key teal"></span>year-end, coloured by status <span class="key red"></span>red line</p>
          <div class="badges">${lines.map(item => `<span class="badge ${item.met ? 'held' : 'broken'}">${icon(item.met ? 'check' : 'flag')}<b>${esc(item.title)}</b>${item.met ? 'held' : `broke Q${item.breachedIn}`}</span>`).join('')}
            <span class="badge grip">${icon('star')}<b>Grip</b>${calls}/4 calls · ${owners}/4 owners</span></div>
          ${result.breached.length ? `<p class="px-foot">${icon('flag')} A broken red line caps the rating at Requires improvement. Two lines, or one left broken for two quarters: Inadequate.</p>` : ''}</aside>
      </div>
      <div class="tabs" role="tablist" aria-label="Year-end report">${[['pages', 'news', 'Front pages'], ['journey', 'clock', 'The journey'], ['board', 'staff', 'The board'], ['invoice', 'coin', 'Next year’s bill'], ['check', 'star', 'Learning check']]
        .map(([id, ic, label]) => `<button type="button" role="tab" class="tab${tab === id ? ' on' : ''}" data-action="tab" data-tab="${id}" aria-selected="${tab === id}" aria-controls="tab-panel">${icon(ic)}${label}${id === 'check' && !transferDone ? ' <span class="dot" aria-label="not done yet">●</span>' : ''}</button>`).join('')}</div>
      <section class="px-panel tab-panel" id="tab-panel" role="tabpanel">${{
        pages: `<div class="front-pages">${rounds.map(r => gazette(r, true)).join('')}</div><p class="px-foot center">Four quarters, four front pages. Which one would you rather not have printed?</p>`,
        journey: journey(rounds),
        board: `${boardTable(state.seats, rounds, { focus, final: true })}<p class="px-foot center">Whole-hospital score ${result.average}% (all six roles; the inspectors judge every seat, filled or not). No year keeps all six happy: which trade-offs did you choose on purpose?</p>`,
        invoice: `<div class="invoice">${rounds.filter(r => E.optionFor(r.index, r.minute.choice).recurring).map(r => `<div class="inv-line"><span>Q${r.index + 1}: ${esc(E.optionFor(r.index, r.minute.choice).title)}</span><b>${money(E.optionFor(r.index, r.minute.choice).recurring)}/qtr</b></div>`).join('')}
          <div class="inv-line total"><span>Ongoing costs handed to next year</span><b class="${recurring > rules.recurringLimit ? 'bad' : ''}">${money(recurring)}/qtr</b></div>
          <div class="inv-line"><span>CFO’s limit</span><b>${money(rules.recurringLimit)}/qtr</b></div>${tickets(last, true)}</div>`,
        check: `<div class="learning" id="learning">${transferDone ? `${quizScore('transfer', state.answers.transfer, state.answers.baseline)}${button('recall', 'Practise four more', 'link')}`
          : `<p>Four new situations, one for each idea in the game. About three minutes.</p>${button('transfer', `START ${icon('arrow')}`, 'gold')}`}</div>`,
      }[tab]}</section>
      <section class="px-panel talk"><header class="px-title">${icon('trust')}<h2>Talk about it</h2></header><p>${esc(facilitator.debrief)}</p>
        <div class="link-row">${button('journal', 'Read the minutes', 'ghost')}${button('download', 'Download the minutes', 'ghost')}</div></section>
      <div class="page-actions">${button('leave', 'Back to the start', 'ghost')}${button('again', `PLAY ANOTHER YEAR ${icon('arrow')}`, 'gold big')}</div>
    </div>`;
  }

  const knockOnsAhead = round => E.project(round ?? { index: -1, closing: E.initial(), upcoming: [] }).steps.filter(step => step.kind === 'system');

  // ---------- dialogs ----------
  function boardPack(index, rounds) {
    const q = quarters[index], previous = rounds.at(-1), position = previous?.closing ?? E.initial();
    const dueAgreed = (previous?.upcoming ?? []).reduce((sum, item) => sum + (item.effects.budget || 0), 0), duePressure = q.headwind.budget || 0;
    const laterAgreed = previous ? E.forecast(previous) - position.budget - dueAgreed : 0;
    return `${close()}<div class="kicker">Q${index + 1} BOARD PACK · CONFIDENTIAL</div><h2 id="dialog-title">${esc(q.short)}</h2><p class="sub">${esc(q.brief)}</p>
      <div class="pack">
        <section><h3>${icon('file')} The evidence</h3>${q.evidence.map(item => `<div class="intel-card"><b>${esc(item.value)}</b><span>${esc(item.label)}</span><p>${esc(item.detail)}</p></div>`).join('')}</section>
        <section><h3>${icon('alert')} Coming anyway: ${esc(q.pressure.toLowerCase())}</h3><div class="chips">${chips(q.headwind)}</div>
          ${knockOnsAhead(previous).map(k => `<h3>${icon('alert')} Knock-on about to fire: ${esc(k.label.toLowerCase())}</h3><div class="chips">${chips(k.effects)}</div>`).join('')}
          ${previous?.upcoming.length ? `<h3>${icon('coin')} Already agreed</h3>${tickets(previous, false)}` : ''}
          <h3>${icon('coin')} The money</h3><div class="inv-line"><span>Plan</span><b>£0 (break even)</b></div><div class="inv-line"><span>Now</span><b>${value('budget', position.budget)}</b></div>
          ${dueAgreed ? `<div class="inv-line"><span>Agreed earlier, due this quarter</span><b class="bad">${delta('budget', dueAgreed)}</b></div>` : ''}
          ${duePressure ? `<div class="inv-line"><span>Outside pressure this quarter</span><b class="bad">${delta('budget', duePressure)}</b></div>` : ''}
          <div class="inv-line total"><span>Before your decision</span><b>${value('budget', position.budget + dueAgreed + duePressure)}</b></div>
          ${laterAgreed ? `<div class="inv-line"><span>Agreed for later quarters</span><b class="bad">${delta('budget', laterAgreed)}</b></div>` : ''}
          <div class="inv-line"><span>Red line</span><b class="bad">${value('budget', line('budget').min)}</b></div></section>
      </div>
      <section class="perf"><h3>${icon('star')} Performance report: what the numbers mean in real life</h3>
        <table class="perf-table"><thead><tr><th scope="col">Measure</th><th scope="col">Score</th><th scope="col">Status</th><th scope="col">Northbrook equivalent</th><th scope="col">For comparison</th></tr></thead><tbody>
        ${metrics.filter(m => m.real).map(m => { const v = position[m.id], r = realWorld(m.id, v), b = E.band(m.id, v);
          return `<tr><th scope="row">${icon(m.icon)} ${m.label}</th><td class="num">${v}</td><td><span class="band-word ${b}">${bandLabel[b]}</span></td><td><b>${r.value}</b> ${esc(r.label)}</td><td class="dim">${esc(r.standard)}</td></tr>`; }).join('')}
        </tbody></table><p class="px-foot">Illustrative: the game turns each 0–100 score into a figure a real board report would show, so you can see what a 5-point drop means.</p></section>`;
  }

  function journal(rounds, seats) {
    return `${close()}<div class="kicker">BOARD MINUTES</div><h2 id="dialog-title">What the board decided</h2><p class="sub">Board: ${seats.map(id => roleById(id).label).join(', ')}</p>
      ${rounds.length ? `<ol class="minutes">${rounds.map(round => {
        const option = E.optionFor(round.index, round.minute.choice), call = E.prediction(round, round.minute.prediction);
        return `<li><span class="kicker">Q${round.index + 1} · ${esc(quarters[round.index].short)}</span><b>${esc(option.title)}</b>
          <p>Expected the biggest hit to ${metricById(round.minute.prediction).label.toLowerCase()} (${call.verdict === 'hit' ? 'correct' : 'it was ' + metricById(call.worst.id).label.toLowerCase()}). Reviewer: ${esc(roleById(round.minute.owner).label)}.</p></li>`;
      }).join('')}</ol><div class="modal-actions">${button('download', 'Download the minutes', 'ghost')}</div>` : '<p>Decisions appear here once locked in.</p>'}`;
  }

  function guide(focus) {
    return `${close()}<div class="kicker">HOW TO PLAY</div><h2 id="dialog-title">Running Northbrook</h2>
      <div class="prose"><p>Each quarter brings a crisis and four proposals. Argue, pick one, then lock it in: tap the stat bar you think will take the biggest hit and pick who checks on it. The hospital then plays out your decision, anything agreed earlier, any regulator response, outside pressure and knock-on effects, in that order. The Gazette prints the result.</p>
      <h3>Stat bars</h3><p>Each block is 5 points (money: £0.5m of headroom before you hit the red line). Striped blocks are pressure already coming before you decide. The notch is the red line.</p>
      <h3>Red lines</h3><ul>${rules.redLines.map(item => `<li><b>${esc(item.plain)}.</b> ${esc(item.consequence)}</li>`).join('')}</ul>
      <h3${focus === 'roles' ? ' id="roles-help" tabindex="-1"' : ''}>The board</h3>
      <p>Each seat has three goals: a big one (■■■), a never-below line (■■) and one that belongs to a colleague (■). A seat is satisfied when it meets its big goal and at least one other. Faces: ☺ on track, ~ worried, ! a goal is lost for good. Money goals count costs already committed.</p>
      <div class="role-help">${roles.map(role => `<div><canvas data-portrait="${role.id}" width="24" height="24" aria-hidden="true"></canvas><p><b>${esc(role.label)}.</b> ${esc(role.prompt)}</p></div>`).join('')}</div>
      <h3>Knock-on effects</h3><ul>${rules.knockOns.map(rule => `<li>${metricById(rule.metric).label} below ${rule.metric === 'budget' ? value('budget', rule.below) : rule.below}: ${esc(rule.label.toLowerCase())} (${effectText(rule.effects)}).</li>`).join('')}</ul>
      <h3>The measures</h3><dl>${metrics.map(m => `<dt>${icon(m.icon)} ${m.label}</dt><dd>${esc(m.plain)}${m.real ? ` In real life: ${esc(m.real.label)} (${esc(m.real.standard)}).` : ''}</dd>`).join('')}</dl>
      <h3>Keyboard shortcuts (for whoever drives)</h3><p><b>A–D</b> pick a proposal · <b>Enter</b> lock it in · in the lock-in, <b>1–5</b> pick the bar and <b>Q–Y</b> the reviewer · <b>→</b> next step · <b>←</b> back · <b>S</b> skip to the quarter end · <b>N</b> or <b>Enter</b> on to the next quarter · <b>F</b> facilitator mode.</p></div>`;
  }
  const glossaryDialog = () => `${close()}<div class="kicker">WORD LIST</div><h2 id="dialog-title">Words you’ll see</h2><dl class="prose">${glossary.map(([t, m]) => `<dt>${esc(t)}</dt><dd>${esc(m)}</dd>`).join('')}</dl>`;

  function facilitatorNotes() {
    return `${close()}<div class="kicker">FACILITATOR</div><h2 id="dialog-title">Running a session</h2>
      <div class="prose"><p>${esc(facilitator.timing)}</p>
      <ol><li><b>Before:</b> project the game, print the role cards, and turn on <b>Facilitator</b> in the top bar: each quarter then shows your prompt and a timer.</li>
        <li><b>Seats:</b> one per student. One person drives; everyone argues. Tap a seat to read its goals aloud.</li>
        ${quarters.map((q, i) => `<li><b>Q${i + 1} · ${esc(q.short)} (${facilitator.quarters[i].minutes} min):</b> ${esc(facilitator.quarters[i].ask)} <em>${esc(facilitator.quarters[i].watch)}</em></li>`).join('')}
        <li><b>Running late?</b> Press SKIP (or S) in the replay and save “What if…” for the year-end.</li>
        <li><b>Keys for the driver:</b> A–D pick · Enter lock in · in the lock-in 1–5 pick the bar, Q–Y the reviewer, Enter confirm · → next step · ← back · S skip · N or Enter on to the next quarter · F facilitator mode.</li>
        <li><b>Year-end (8 min):</b> ${esc(facilitator.debrief)}</li></ol></div>
      <div class="modal-actions">${button('print-cards', `${icon('print')} Print role cards`, 'ghost')}${button('facilitator-toggle', 'TURN ON FACILITATOR MODE', 'gold')}</div>`;
  }

  function roleCards() {
    return roles.map(role => {
      const card = E.scoreRole(role.id, [], false);
      return `<article class="role-print"><header><canvas data-portrait="${role.id}" width="24" height="24"></canvas><h2>${esc(role.label)}</h2></header>
        <p>${esc(role.brief)}</p><h3>Your goals</h3><ol>${card.results.map(item => `<li>${'■'.repeat(item.weight)} ${esc(item.label)}</li>`).join('')}</ol>
        <h3>Ask the board</h3><p>${esc(role.prompt)}</p><p class="small">Red lines for everyone: ${rules.redLines.map(item => item.plain.toLowerCase()).join('; ')}.</p></article>`;
    }).join('');
  }
  const confirmNew = () => `${close()}<div class="kicker">NEW GAME</div><h2 id="dialog-title">Start a new year?</h2><p class="sub">This replaces the saved game on this device.</p>
    <div class="modal-actions">${button('close', 'Keep my saved game', 'ghost')}${button('confirm-start', 'START A NEW YEAR', 'gold')}</div>`;

  return { esc, icon, value, delta, money, welcome, quiz, quizScore, warmupDone, decision, optionsGrid, boardTable, dock, lockIn, report, hud, waterfall, gazette,
    stamps, dialogue, compare, debrief, boardPack, journal, guide, glossaryDialog, facilitatorNotes, roleCards, confirmNew, mapOverlay, stepNames, effectText };
})();
