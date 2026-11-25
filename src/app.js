'use strict';

// Controller: owns state, saving, events and focus. Views are pure templates.
(() => {
  const { quarters, roles, metrics, questions, rules } = Northbrook.content;
  const E = Northbrook.engine;
  const V = Northbrook.views;
  const KEY = 'trust-in-balance-v3';
  const FACIL_KEY = 'trust-in-balance-facilitator';
  const $ = selector => document.querySelector(selector);
  const game = $('#game'), dockHost = $('#action-dock'), dialog = $('#dialog'), dialogBody = $('#dialog-content'), status = $('#announcement');

  let storageOK = true;
  let state = null;          // persisted game
  let saved = load();
  let welcomeMode = 'group';
  let selected = '';         // option highlighted on the decision screen
  let draft = {};            // lock-in taps before committing
  let beat = 0;              // replay step on the report (-1 = quarter end)
  let compareId = '';
  let recall = null;         // practice quiz, not saved
  let maps = new Map();
  let quarterStart = Date.now();
  let timer = 0;
  let focusSeat = null;      // seat whose goals are shown under the board table
  let advanced = false;      // replay has moved past step 1 (undo is then closed)
  let debriefTab = 'pages';

  // ---------- storage ----------
  function load() {
    let raw;
    try { raw = localStorage.getItem(KEY); } catch { storageOK = false; return null; }
    try {
      const data = JSON.parse(raw);
      if (!data || data.version !== 3 || !['group', 'solo'].includes(data.mode)) return null;
      if (!Array.isArray(data.seats) || !data.seats.length || new Set(data.seats).size !== data.seats.length || !data.seats.every(id => roles.some(role => role.id === id))) return null;
      if (!Array.isArray(data.minutes) || data.minutes.length > quarters.length) return null;
      if (!data.minutes.every((minute, i) => E.optionFor(i, minute?.choice) && metrics.some(m => m.id === minute.prediction && m.id !== 'budget') && roles.some(role => role.id === minute.owner))) return null;
      if (!['baseline', 'warmup-done', 'decision', 'report', 'debrief', 'transfer'].includes(data.phase)) return null;
      for (const kind of ['baseline', 'transfer']) {
        const answers = data.answers?.[kind];
        if (!Array.isArray(answers) || answers.length > questions[kind].length || !answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < questions[kind][i].answers.length)) return null;
      }
      const n = data.minutes.length;
      if ((data.phase === 'decision' && n >= quarters.length) || (data.phase === 'report' && !n) || (['debrief', 'transfer'].includes(data.phase) && n !== quarters.length)) return null;
      if (typeof data.quizLocked !== 'boolean') return null;
      return data;
    } catch { return null; }
  }
  function save() {
    saved = structuredClone(state);
    if (!storageOK) return;
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { storageOK = false; status.textContent = 'This browser could not save the game. Keep this tab open.'; }
  }
  let facilitatorOn = false;
  try { facilitatorOn = localStorage.getItem(FACIL_KEY) === 'on'; } catch { /* ignore */ }
  function setFacilitator(on) {
    facilitatorOn = on;
    document.body.classList.toggle('facilitator', on);
    $('#facil-btn').setAttribute('aria-pressed', String(on));
    try { localStorage.setItem(FACIL_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    status.textContent = on ? 'Facilitator mode on.' : 'Facilitator mode off.';
  }

  // ---------- rendering ----------
  const rounds = () => state ? E.history(state.minutes) : [];

  function render(focus = true) {
    const all = rounds();
    const phase = state?.phase;
    dockHost.innerHTML = '';
    document.body.classList.toggle('has-dock', phase === 'decision' && !recall);
    $('#exit-btn').hidden = !(state || recall);
    $('#journal-btn').hidden = !state || !all.length || !!recall;

    if (recall) {
      game.innerHTML = recall.finished
        ? `<div class="wrap narrow"><section class="paper quiz-paper"><div class="eyebrow">PRACTICE DONE</div><h1>Your practice score</h1>${V.quizScore('recall', recall.answers)}<div class="actions"><button type="button" class="button primary" data-action="recall-done">Done</button></div></section></div>`
        : V.quiz('recall', recall.answers, recall.locked);
    } else if (!state) {
      game.innerHTML = V.welcome(saved, storageOK, welcomeMode);
    } else if (phase === 'baseline' || phase === 'transfer') {
      game.innerHTML = V.quiz(phase, state.answers[phase], state.quizLocked);
    } else if (phase === 'warmup-done') {
      game.innerHTML = V.warmupDone(state.answers.baseline);
    } else if (phase === 'decision') {
      game.innerHTML = V.decision(all.length, all, state, selected, quarterStart, focusSeat);
      dockHost.innerHTML = V.dock(all.length, selected);
    } else if (phase === 'report') {
      game.innerHTML = V.report(all, beat, state, compareId, focusSeat);
    } else if (phase === 'debrief') {
      game.innerHTML = V.debrief(all, state, focusSeat, debriefTab);
    }
    maps = Northbrook.pixel.mountAll(game, all.at(-1)?.closing ?? E.initial());
    if (typeof applyFont === 'function') applyFont();
    updateMaps(true);
    tickTimer();

    if (focus) {
      window.scrollTo(0, 0);
      const target = game.querySelector('.feedback') || game.querySelector('h1') || game;
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }

  // Push the current numbers and scene into the hospital map(s) and overlay.
  function updateMaps(restart = false) {
    if (!state) return;
    const all = rounds();
    for (const [id, map] of maps) {
      let view;
      if (state.phase === 'decision') {
        const q = quarters[all.length];
        view = { snapshot: all.at(-1)?.closing ?? E.initial(), zone: q.zone, dressing: q.dressing, scene: null, done: false };
      } else if (state.phase === 'report') {
        const round = all.at(-1), q = quarters[round.index], option = E.optionFor(round.index, round.minute.choice);
        const entry = beat >= 0 ? round.entries[beat] : null;
        const floaters = entry ? Object.entries(entry.effects).filter(([, c]) => c).slice(0, 3).map(([m, c]) => ({ text: `${metrics.find(x => x.id === m).label} ${V.delta(m, c)}`, good: c > 0 })) : [];
        view = { snapshot: entry ? entry.snapshot : round.closing, zone: Northbrook.pixel.SCENES[option.scene]?.zone ?? q.zone, dressing: q.dressing,
          signText: entry && entry.kind !== 'decision' ? V.stepNames[entry.kind].toUpperCase() : null,
          scene: option.scene, done: beat === -1 || (entry && entry.kind !== 'decision'), restart: restart && beat === 0, floaters,
          caption: entry ? `${V.stepNames[entry.kind]}: ${entry.label}` : `End of Q${round.index + 1}` };
      } else {
        const level = all.length === quarters.length ? E.verdict(all, state.seats).level : 1;
        view = { snapshot: all.at(-1)?.closing ?? E.initial(), zone: null, dressing: level >= 2 ? 'celebrate' : 'inspect', scene: null, caption: 'Northbrook at year-end' };
      }
      map.set(view);
      const frame = game.querySelector(`[data-map="${id}"]`)?.closest('.map-frame');
      if (frame) {
        const zone = state.phase === 'report' && beat === 0 ? Northbrook.pixel.ZONES[view.zone] : null;
        frame.classList.toggle('zoomed', !!zone);
        if (zone) frame.style.setProperty('--zx', `${((zone.x + zone.w / 2) / Northbrook.pixel.COLS * 100).toFixed(1)}%`), frame.style.setProperty('--zy', `${((zone.y + zone.h / 2) / Northbrook.pixel.ROWS * 100).toFixed(1)}%`);
      }
      const overlay = V.mapOverlay(view);
      const sign = $(`#${id}-sign`);
      if (sign) { sign.hidden = !overlay.sign; if (overlay.sign) { sign.textContent = overlay.sign.text; sign.setAttribute('style', overlay.sign.style); } }
      const moneyTag = $(`#${id}-money`); if (moneyTag) moneyTag.textContent = overlay.money;
      const floaters = $(`#${id}-floaters`); if (floaters) floaters.innerHTML = overlay.floaters;
      const desc = $(`#${id}-desc`); if (desc) desc.textContent = `Hospital map. ${overlay.description}`;
      const caption = $(`#${id}-caption`); if (caption && view.caption) caption.textContent = view.caption;
    }
  }

  function tickTimer() {
    clearInterval(timer);
    const el = $('#quarter-timer'), session = $('#session-timer');
    if (!el) return;
    const clock = from => { const seconds = Math.max(0, Math.floor((Date.now() - from) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
    const update = () => {
      el.textContent = clock(quarterStart);
      if (session) session.textContent = clock(state?.startedAt ?? quarterStart);
    };
    update();
    timer = setInterval(update, 1000);
  }

  function refreshReport(focusAction) {
    if (beat !== 0) advanced = true;
    // The end of the quarter adds the Gazette and panels, so re-render fully there.
    if (beat === -1) { render(false); const target = game.querySelector('[data-action="beat-replay"]') || game.querySelector('#narration'); target?.focus({ preventScroll: true }); return; }
    const all = rounds(), round = all.at(-1);
    const dlg = game.querySelector('#dialogue');
    if (!dlg) { render(false); return; }
    dlg.outerHTML = V.dialogue(round, beat);
    $('#hud-slot').innerHTML = V.hud({ snapshot: round.entries[beat].snapshot, change: round.entries[beat].effects, title: `Step ${beat + 1} of ${round.entries.length + 1}` });
    $('#water-slot').innerHTML = V.waterfall(round, beat);
    updateMaps(true);
    const target = focusAction ? game.querySelector(`#dialogue [data-action="${focusAction}"]:not([disabled])`) : null;
    (target || game.querySelector('#dialogue [aria-current="step"]'))?.focus({ preventScroll: true });
  }

  function openDialog(markup, focusSelector) {
    dialogBody.innerHTML = markup;
    Northbrook.pixel.portraits(dialogBody);
    if (!dialog.open) dialog.showModal();
    const target = (focusSelector && dialogBody.querySelector(focusSelector)) || dialogBody.querySelector('h2');
    target.tabIndex = -1;
    target.focus();
  }

  function begin(settings) {
    state = { version: 3, startedAt: Date.now(), mode: settings.mode, seats: settings.seats, phase: settings.warmup ? 'baseline' : 'decision', minutes: [], answers: { baseline: [], transfer: [] }, quizLocked: false };
    selected = ''; draft = {}; beat = 0; compareId = ''; quarterStart = Date.now();
    save(); render();
  }
  function go(phase) { state.phase = phase; save(); render(); }

  // ---------- downloads and printing ----------
  function downloadMinutes() {
    const all = rounds();
    if (!all.length) return;
    const lines = ['NORTHBROOK GENERAL HOSPITAL · TRUST IN BALANCE · BOARD MINUTES', 'A fictional training game.', `Board: ${state.seats.map(id => roles.find(r => r.id === id).label).join(', ')}`, ''];
    for (const round of all) {
      const option = E.optionFor(round.index, round.minute.choice), call = E.prediction(round, round.minute.prediction);
      lines.push(`Q${round.index + 1} · ${quarters[round.index].short}`, `Decision: ${option.title} (${V.effectText({ budget: E.cost(round.index, option.id).now })})`,
        `Expected biggest hit: ${metrics.find(m => m.id === round.minute.prediction).label} · actual: ${metrics.find(m => m.id === call.worst.id).label} (${call.verdict})`,
        `Review owner: ${roles.find(r => r.id === round.minute.owner).label}`, `Outcome: ${option.outcome}`,
        'End of quarter: ' + metrics.map(m => `${m.label} ${V.value(m.id, round.closing[m.id])}`).join(' | '));
      if (round.breaches.length) lines.push(`RED LINE BROKEN: ${round.breaches.join(', ')}`);
      lines.push('');
    }
    if (all.length === quarters.length) {
      const result = E.verdict(all, state.seats);
      lines.push(`YEAR-END RATING: ${result.rating}`, `${result.headline.title}. ${result.headline.sentence}`, '');
      for (const card of result.cards) lines.push(`${card.role.label}: ${card.score}%`, ...card.results.map(item => `  ${item.met ? 'Met' : 'Missed'}: ${item.label}`));
      lines.push('', `Ongoing costs handed to next year: ${V.money(E.recurring(all))} a quarter`);
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'trust-in-balance-minutes.txt' });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Minutes downloaded.';
  }
  function printCards() {
    const area = $('#print-area');
    area.innerHTML = V.roleCards();
    Northbrook.pixel.portraits(area);
    document.body.classList.add('printing-cards');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-cards'), 500);
  }

  // ---------- events ----------
  document.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'start-form') {
      const data = new FormData(form);
      const seats = data.getAll('seat').filter(id => roles.some(role => role.id === id));
      const settings = { mode: data.get('mode') === 'solo' ? 'solo' : 'group', seats, warmup: data.has('warmup') };
      if (!seats.length) { const error = $('#seat-error'); error.hidden = false; form.querySelector('input[name="seat"]').focus(); return; }
      if (saved) { pending = settings; openDialog(V.confirmNew()); } else begin(settings);
    } else if (form.id === 'quiz-form') {
      const answer = new FormData(form).get('answer');
      if (answer !== null) answerQuiz(Number(answer));
    }
  });
  let pending = null;

  document.addEventListener('change', event => {
    const input = event.target;
    if (input.name === 'mode' && !state) { welcomeMode = input.value; render(false); game.querySelector(`input[name="mode"][value="${welcomeMode}"]`).focus(); }
    if (input.name === 'seat') $('#seat-error').hidden = true;
    if (input.name === 'answer') { const submit = $('#quiz-submit'); if (submit) submit.disabled = false; }
  });

  function answerQuiz(answer) {
    if (recall && !recall.locked) { recall.answers.push(answer); recall.locked = true; render(); return; }
    if (!state || state.quizLocked || !['baseline', 'transfer'].includes(state.phase)) return;
    state.answers[state.phase].push(answer);
    state.quizLocked = true;
    save(); render();
  }
  function nextQuestion() {
    if (recall?.locked) { recall.locked = false; recall.finished = recall.answers.length === questions.recall.length; render(); return; }
    if (!state?.quizLocked) return;
    state.quizLocked = false;
    const kind = state.phase, done = state.answers[kind].length === questions[kind].length;
    if (kind === 'baseline') go(done ? 'warmup-done' : 'baseline');
    else if (done) { debriefTab = 'check'; go('debrief'); $('#learning')?.scrollIntoView({ block: 'center' }); }
    else go('transfer');
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    const action = control.dataset.action;
    const all = rounds();
    switch (action) {
      case 'close': dialog.close(); break;
      case 'guide': openDialog(V.guide()); break;
      case 'guide-roles': openDialog(V.guide('roles'), '#roles-help'); break;
      case 'glossary': openDialog(V.glossaryDialog()); break;
      case 'facilitator-notes': openDialog(V.facilitatorNotes()); break;
      case 'facilitator-toggle': setFacilitator(!facilitatorOn); if (dialog.open) dialog.close(); tickTimer(); break;
      case 'print-cards': printCards(); break;
      case 'journal': if (state) openDialog(V.journal(all, state.seats)); break;
      case 'download': downloadMinutes(); break;
      case 'board-pack': if (state?.phase === 'decision') openDialog(V.boardPack(all.length, all)); break;
      case 'font-pixel': case 'font-plain': plain = action === 'font-plain'; applyFont(); try { localStorage.setItem(FACIL_KEY + '-font', plain ? 'plain' : 'pixel'); } catch { /* ignore */ } break;
      case 'all-seats': for (const box of game.querySelectorAll('input[name="seat"]')) box.checked = true; $('#seat-error').hidden = true; break;
      case 'resume': state = structuredClone(saved); selected = ''; beat = -1; advanced = true; compareId = ''; quarterStart = Date.now(); render(); break;
      case 'confirm-start': { const settings = pending; pending = null; dialog.close(); if (settings) begin(settings); break; }
      case 'leave': recall = null; state = null; selected = ''; render(); break;
      case 'skip-warmup': if (state?.phase === 'baseline') { state.answers.baseline = []; state.quizLocked = false; quarterStart = Date.now(); go('decision'); } break;
      case 'begin-year': quarterStart = Date.now(); go('decision'); break;
      case 'quiz-next': nextQuestion(); break;
      case 'transfer': if (state?.phase === 'debrief') go('transfer'); break;
      case 'recall': recall = { answers: [], locked: false, finished: false }; render(); break;
      case 'recall-done': recall = null; render(); break;
      case 'again': debriefTab = 'pages'; begin({ mode: state.mode, seats: state.seats, warmup: false }); break;
      case 'choose':
        if (state?.phase !== 'decision') break;
        selected = control.dataset.option;
        game.querySelector('.proposals').outerHTML = V.optionsGrid(all.length, selected);
        $('#board-slot').innerHTML = V.boardTable(state.seats, all, { stances: E.stances(all.length, selected), focus: focusSeat });
        Northbrook.pixel.portraits($('#board-slot'));
        Northbrook.pixel.thumbs(game.querySelector('.proposals'), all.at(-1)?.closing ?? E.initial());
        dockHost.innerHTML = V.dock(all.length, selected);
        game.querySelector(`[data-option="${selected}"]`).focus({ preventScroll: true });
        status.textContent = `${E.optionFor(all.length, selected).title} selected.`;
        break;
      case 'lock': if (selected) { draft = {}; openDialog(V.lockIn(all.length, selected, draft, state.seats, all.at(-1)?.closing ?? E.initial())); } break;
      case 'seat': {
        focusSeat = control.dataset.role;
        const slot = control.closest('#board-slot') || control.closest('.board')?.parentElement;
        const final = state?.phase === 'debrief';
        const stances = state?.phase === 'decision' && selected ? E.stances(all.length, selected) : null;
        if (slot) { slot.innerHTML = V.boardTable(state.seats, all, { stances, focus: focusSeat, final }); Northbrook.pixel.portraits(slot); slot.querySelector(`[data-role="${focusSeat}"]`)?.focus(); }
        break;
      }
      case 'tab': debriefTab = control.dataset.tab; render(false); game.querySelector(`[data-tab="${debriefTab}"]`)?.focus(); break;
      case 'predict': case 'owner':
        draft[action === 'predict' ? 'prediction' : 'owner'] = action === 'predict' ? control.dataset.metric : control.dataset.role;
        openDialog(V.lockIn(all.length, selected, draft, state.seats, all.at(-1)?.closing ?? E.initial()), `[data-action="${action}"][aria-pressed="true"]`);
        break;
      case 'commit':
        if (!(selected && draft.prediction && draft.owner) || state.phase !== 'decision') break;
        state.minutes.push({ choice: selected, prediction: draft.prediction, owner: draft.owner });
        state.peeked = false;
        selected = ''; draft = {}; beat = 0; compareId = ''; advanced = false;
        dialog.close(); go('report');
        break;
      case 'beat': beat = Number(control.dataset.beat); refreshReport(); break;
      case 'step-next': { const n = all.at(-1).entries.length; beat = beat >= 0 && beat < n - 1 ? beat + 1 : -1; refreshReport(beat === -1 ? 'beat-replay' : 'step-next'); break; }
      case 'step-back': beat = beat === -1 ? all.at(-1).entries.length - 1 : Math.max(0, beat - 1); refreshReport('step-back'); break;
      case 'step-end': beat = -1; refreshReport('beat-replay'); break;
      case 'beat-replay': beat = 0; refreshReport('step-next'); break;
      case 'compare': state.peeked = true; save();
        compareId = control.dataset.option; $('#compare-body').innerHTML = V.compare(all, all.at(-1), compareId);
        Northbrook.pixel.thumbs($('#compare-body'), all.at(-1).closing); $(`#compare-body [data-option="${compareId}"]`)?.focus(); break;
      case 'next':
        if (state?.phase !== 'report') break;
        quarterStart = Date.now(); beat = 0; compareId = ''; state.peeked = false;
        go(state.minutes.length === quarters.length ? 'debrief' : 'decision');
        break;
    }
  });

  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { pending = null; });
  $('#facil-btn').addEventListener('click', () => { setFacilitator(!facilitatorOn); tickTimer(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-cards'));

  // Plain-font toggle for readers who find pixel type hard work.
  let plain = false;
  try { plain = localStorage.getItem(FACIL_KEY + '-font') === 'plain'; } catch { /* ignore */ }
  const applyFont = () => {
    document.body.classList.toggle('plain-font', plain);
    $('#font-btn').setAttribute('aria-pressed', String(plain));
    for (const b of document.querySelectorAll('[data-font]')) b.setAttribute('aria-pressed', String((b.dataset.font === 'plain') === plain));
  };
  $('#font-btn').addEventListener('click', () => { plain = !plain; applyFont(); try { localStorage.setItem(FACIL_KEY + '-font', plain ? 'plain' : 'pixel'); } catch { /* ignore */ } status.textContent = plain ? 'Plain font on.' : 'Pixel font on.'; });
  applyFont();
  document.body.classList.toggle('facilitator', facilitatorOn);
  $('#facil-btn').setAttribute('aria-pressed', String(facilitatorOn));
  render(false);
})();
