'use strict';

// Pixel-art layer (ported from the original Trust in Balance and extended).
// Everything is drawn with fillRect blocks; there are no image assets. The
// hospital shows three things at once:
//   1. the quarter's crisis as set dressing (taped-off bays, trolleys, a news van, snow),
//   2. a short scripted scene for the option the board chose,
//   3. the live numbers: queues, occupied beds, staff on shift, safety alarms.
// Text (room labels, money, floating changes) is drawn as HTML over the canvas
// by the views, so it stays readable on a phone and to screen readers.
Northbrook.pixel = (() => {
  const TILE = 32, COLS = 30, ROWS = 17, W = 960, H = 544;
  const MAP = [
    '##############################',
    '#aaaa#wwww#mmmm#uu#bb#sss#ccc#',
    '#aaaa#wwww#mmmm#uu#bb#sss#ccc#',
    '#aaaa#wwww#mmmm#uu#bb#sss#ccc#',
    '#aaaa#wwww#mmmm#uu#bb#sss#ccc#',
    '#aaaa#wwww#mmmm#uu#bb#sss#ccc#',
    '##a#####w###m###u##b###s###c##',
    '#............................#',
    '#............................#',
    '##v#v##v##o##....##t###i###g##',
    '#vv#vv#vv#oo#....#ttt#iii#ggg#',
    '#vv#vv#vv#oo#....#ttt#iii#ggg#',
    '#vv#vv#vv####....#ttt#iii#ggg#',
    '#vv#vv#vv#vvv....#ttt#iii#ggg#',
    '#vv#vv#vv#vv#....#ttt#iii#ggg#',
    '#vv#vv#vv#vv#....#ttt#iii#ggg#',
    '##############EE##############',
  ];
  const FLOORS = {
    '.': ['#b9c0c9', '#b0b7c1'], E: ['#b9c0c9', '#b0b7c1'], v: ['#b7d4bd', '#adcab3'], w: ['#b7d4bd', '#adcab3'],
    m: ['#dcc6d2', '#d2bcc8'], a: ['#c9b691', '#bfac87'], b: ['#c9b691', '#bfac87'], u: ['#a8a49c', '#9e9a92'],
    s: ['#d9c8a4', '#cfbe9a'], c: ['#e0d6b8', '#d6ccae'], o: ['#c3cade', '#b9c0d4'], t: ['#c7d6e4', '#bdccda'],
    i: ['#a9ccd4', '#9fc2ca'], g: ['#bfe0d2', '#b5d6c8'],
  };
  const WALL = { cap: '#262b3d', face: '#454f76', hi: '#5a6591', seam: '#161a28' };
  const PROPS = [
    ['crate', 1, 1], ['crate', 2, 1], ['crate', 4, 2], ['bed', 6, 1], ['bed', 8, 1], ['bed', 11, 1], ['bed', 13, 1], ['cot', 14, 1],
    ['plant', 9, 4], ['plant', 11, 4], ['boiler', 16, 1], ['crate', 19, 1], ['crate', 20, 1], ['crate', 20, 2], ['vending', 22, 1],
    ['table', 23, 3], ['table', 27, 2], ['table', 27, 4], ['plant', 1, 7], ['plant', 28, 7], ['desk', 13, 8], ['odesk', 10, 11],
    ['plant', 18, 10], ['cabinet', 24, 10], ['mri', 22, 11], ['bed', 24, 14], ['cabinet', 26, 10], ['surg', 27, 12], ['bed', 28, 14],
  ];
  const BEDS = [[1, 14], [2, 14], [4, 14], [5, 14], [7, 14], [8, 14], [10, 14], [11, 14], [6, 1], [8, 1]];
  const CHAIRS = [[18, 11], [18, 12], [18, 13], [18, 14], [20, 11], [20, 12], [20, 13], [20, 14]];
  // Room labels drawn as HTML by the views: [text, tileX, tileY, important].
  const LABELS = [
    ['Ward 1', 8, 3.4], ['Staff room', 23.5, 4.6], ['Canteen', 27.5, 3.4], ['Reception', 14.5, 7.3, true],
    ['Wards 2–4', 5, 9.9, true], ['Discharge', 11.5, 12.6, true], ['A&E', 19.5, 9.9, true], ['Theatres', 27.5, 9.9, true],
    ['Office', 10.9, 9.9], ['Entrance', 15, 15.5, true],
  ];
  const ZONES = {
    ward: { x: 7, y: 10, w: 2, h: 6 }, flow: { x: 10, y: 13, w: 3, h: 3 },
    front: { x: 13, y: 12, w: 4, h: 5 }, arrival: { x: 18, y: 10, w: 3, h: 6 },
    theatres: { x: 26, y: 10, w: 3, h: 6 }, staffroom: { x: 22, y: 1, w: 3, h: 5 }, canteen: { x: 26, y: 1, w: 3, h: 5 }, office: { x: 10, y: 10, w: 2, h: 2 },
  };
  const ROLE = {
    porter: { top: '#7a8a6d', leg: '#4c5844', hair: '#5a4632' }, nurse: { top: '#2f63c7', leg: '#274f9e', hair: '#2e2620' },
    doctor: { top: '#f4f6f8', leg: '#6b7688', hair: '#6f6a63' }, patient: { top: '#a9c4e0', leg: '#7e97ba', hair: '#3c332a' },
    agency: { top: '#17a9a3', leg: '#0f7f7a', hair: '#20242f' }, reception: { top: '#8a5fc0', leg: '#5f4287', hair: '#402f22' },
    visitor: { top: '#d9c78f', leg: '#b3a273', hair: '#57432f' }, press: { top: '#d6ad42', leg: '#273044', hair: '#29221c' },
    partner: { top: '#b0478a', leg: '#6d2b56', hair: '#2a2220' }, exec: { top: '#262b3a', leg: '#1b1f2b', hair: '#5a5348' },
  };
  const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS) ? '#' : MAP[y][x];
  const hash = (x, y) => { let n = x * 374761393 + y * 668265263; n = Math.imul(n ^ (n >> 13), 1274126177); return (n ^ (n >> 16)) >>> 0; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rect = c => (col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };

  function drawProp(c, type, x, y) {
    const P = (col, a, b, w, h) => { c.fillStyle = col; c.fillRect(x + a, y + b, w, h); };
    switch (type) {
      case 'bed': case 'bedocc': case 'bedx':
        P('#4a5266', 3, 1, 26, 60); P('#7c8494', 4, 2, 24, 58); P('#5d6578', 4, 2, 24, 8); P('#f2f4f7', 7, 11, 18, 10);
        P('#3f6fb5', 4, 24, 24, 34); P('#6f97d0', 4, 30, 24, 3);
        if (type === 'bedocc') { P('#e8b48c', 11, 10, 10, 9); P('#5a4632', 11, 10, 10, 3); P('#3f6fb5', 4, 20, 24, 6); }
        if (type === 'bedx') { for (let i = 0; i < 22; i += 2) { P('#e05252', 5 + i, 6 + i * 2.3, 3, 4); P('#e05252', 27 - i, 6 + i * 2.3, 3, 4); } }
        break;
      case 'trolley': P('#20242f', 1, 7, 62, 20); P('#c6ccd8', 2, 8, 60, 16); P('#f2f4f7', 4, 9, 12, 12); P('#e8b48c', 6, 10, 8, 8); P('#3f6fb5', 18, 10, 42, 12); P('#20242f', 6, 25, 4, 5); P('#20242f', 52, 25, 4, 5); break;
      case 'cot': P('#c6ccd8', 4, 5, 24, 22); P('#f5f7fa', 6, 7, 20, 18); P('#e8a7bd', 6, 16, 20, 9); P('#ffffff', 8, 9, 8, 5); break;
      case 'chair': P('#2f3a52', 8, 24, 4, 5); P('#2f3a52', 20, 24, 4, 5); P('#3f66a0', 7, 4, 18, 8); P('#4f7fc0', 7, 11, 18, 14); P('#6a9ad6', 7, 11, 18, 3); break;
      case 'desk':
        for (let i = 0; i < 3; i++) { const o = i * 32; P('#e2e6ec', o, 6, 32, 12); P('#f4f6f9', o, 6, 32, 3); P('#33415e', o, 18, 32, 12); P('#16a3a3', o, 24, 32, 3); }
        P('#20242f', 41, -3, 14, 11); P('#3fd1c4', 43, -1, 10, 7); P('#ffffff', 8, 8, 10, 6); P('#c9505a', 70, 7, 6, 8);
        break;
      case 'odesk': P('#8f6a3a', 2, 8, 60, 20); P('#b58a4f', 2, 8, 60, 14); P('#ffffff', 8, 11, 11, 8); P('#20242f', 40, 10, 10, 8); P('#3fd1c4', 42, 12, 6, 4); break;
      case 'mri':
        P('#c9cfda', 4, 8, 56, 44); P('#eef1f5', 4, 6, 56, 42);
        c.fillStyle = '#2e3650'; c.beginPath(); c.arc(x + 32, y + 27, 20, 0, 7); c.fill();
        c.fillStyle = '#10131c'; c.beginPath(); c.arc(x + 32, y + 27, 11, 0, 7); c.fill();
        P('#c6ccd8', 22, 48, 20, 14);
        break;
      case 'surg': P('#ffd76a', 18, 0, 14, 9); P('#828a9a', 9, 50, 14, 6); P('#9aa2b2', 6, 7, 20, 46); P('#cfd6df', 7, 8, 18, 44); P('#f2f4f7', 9, 10, 14, 8); break;
      case 'boiler':
        P('#6d7788', 14, -8, 8, 12); P('#6d7788', 42, -8, 8, 12); P('#4a6552', 7, 7, 50, 46); P('#5f7f68', 8, 6, 48, 44);
        P('#4a6552', 8, 16, 48, 4); P('#4a6552', 8, 32, 48, 4); P('#d9b23a', 8, 44, 48, 6);
        break;
      case 'crate': P('#8a6236', 4, 6, 24, 22); P('#a97c46', 6, 8, 20, 18); P('#8a6236', 6, 8, 20, 3); P('#8a6236', 6, 23, 20, 3); P('#8a6236', 14, 8, 4, 18); break;
      case 'table': P('#8f6a3a', 3, 8, 26, 20); P('#c89a5e', 4, 9, 24, 15); P('#dcb479', 4, 9, 24, 4); break;
      case 'vending': P('#8a3535', 4, 2, 24, 29); P('#c94f4f', 5, 3, 22, 27); P('#9fd3e8', 8, 6, 12, 15); P('#20242f', 8, 24, 12, 4); break;
      case 'plant':
        P('#7a4328', 10, 21, 12, 9); P('#a5603c', 10, 21, 12, 4);
        c.fillStyle = '#3d7c44'; c.beginPath(); c.arc(x + 16, y + 13, 9, 0, 7); c.fill();
        c.fillStyle = '#66b06c'; c.beginPath(); c.arc(x + 19, y + 9, 5, 0, 7); c.fill();
        break;
      case 'cabinet': P('#c6ccd8', 3, 5, 26, 22); P('#f0f3f6', 4, 6, 24, 20); P('#d64545', 13, 9, 6, 14); P('#d64545', 9, 13, 14, 6); break;
      case 'podium': P('#20242f', 4, 6, 24, 26); P('#33415e', 6, 8, 20, 22); P('#23c4b4', 6, 12, 20, 3); P('#c6ccd8', 14, -2, 3, 9); break;
      case 'board': P('#20242f', 0, 0, 64, 40); P('#f4f6f8', 2, 2, 60, 36); P('#1f9a6e', 8, 24, 8, 10); P('#1f9a6e', 20, 18, 8, 16); P('#d79a1d', 32, 22, 8, 12); P('#1f9a6e', 44, 12, 8, 22); P('#33415e', 6, 6, 40, 3); break;
      case 'notice': P('#20242f', 0, 0, 30, 36); P('#f4f6f8', 2, 2, 26, 32); for (let i = 0; i < 5; i++) P('#8b94ab', 5, 6 + i * 5, 20 - (i % 2) * 6, 2); break;
      case 'van': P('#20242f', 0, 4, 76, 26); P('#e8ecf5', 2, 6, 72, 22); P('#9fc4d8', 58, 9, 12, 8); P('#3b6ea5', 2, 18, 72, 4); P('#10131c', 10, 27, 12, 7); P('#10131c', 52, 27, 12, 7); break;
      case 'newsvan': P('#20242f', 0, 4, 80, 26); P('#d6ad42', 2, 6, 76, 22); P('#9fc4d8', 62, 9, 12, 8); P('#20242f', 6, 10, 40, 8); P('#c6ccd8', 30, -10, 4, 16); P('#c6ccd8', 22, -14, 20, 6); P('#10131c', 10, 27, 12, 7); P('#10131c', 56, 27, 12, 7); break;
      case 'ambulance':
        P('#20242f', 0, 0, 64, 26); P('#e8ecf5', 2, 2, 60, 22); P('#20242f', 62, 8, 16, 18); P('#e8ecf5', 64, 10, 12, 14); P('#9fc4d8', 66, 12, 8, 7);
        P('#23c4b4', 2, 18, 60, 4); P('#e05252', 40, 4, 5, 12); P('#e05252', 36, 7, 13, 5); P('#10131c', 12, 24, 11, 7); P('#10131c', 46, 24, 11, 7);
        break;
      case 'mug': P('#f4f6f8', 0, 0, 8, 8); P('#8a6236', 1, 1, 6, 3); P('#f4f6f8', 8, 2, 2, 4); break;
      case 'tablet': P('#20242f', 0, 0, 12, 9); P('#3fd1c4', 1, 1, 10, 7); break;
      case 'house': P('#e05252', 0, 0, 16, 7); P('#f2dc9e', 2, 7, 12, 10); P('#8a6236', 6, 11, 4, 6); break;
    }
  }

  let base = null;
  function staticLayer() {
    if (base) return base;
    base = document.createElement('canvas');
    base.width = W; base.height = H;
    const c = base.getContext('2d');
    const F = rect(c);
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const ch = at(tx, ty), x = tx * TILE, y = ty * TILE;
      if (ch === '#') {
        F(WALL.cap, x, y, 32, 32);
        if (at(tx, ty + 1) !== '#') { F(WALL.face, x, y + 14, 32, 18); F(WALL.hi, x, y + 14, 32, 2); F(WALL.seam, x, y + 30, 32, 2); }
        if (at(tx, ty - 1) !== '#') F(WALL.seam, x, y, 32, 2);
      } else {
        const f = FLOORS[ch] || FLOORS['.'];
        F(((tx + ty) & 1) ? f[0] : f[1], x, y, 32, 32);
        if (hash(tx, ty) % 7 === 0) F('rgba(0,0,0,0.08)', x + 8 + (hash(tx, ty) % 3) * 6, y + 8 + (hash(ty, tx) % 3) * 6, 3, 3);
        if (at(tx, ty - 1) === '#') { F('rgba(0,0,0,0.16)', x, y, 32, 5); F('rgba(0,0,0,0.07)', x, y + 5, 32, 3); }
        if (at(tx - 1, ty) === '#') F('rgba(0,0,0,0.09)', x, y, 4, 32);
        if (at(tx + 1, ty) === '#') F('rgba(0,0,0,0.09)', x + 28, y, 4, 32);
        if (ch === 'E') { F('#33415e', x + 1, y + 3, 30, 26); F('#8fd7dd', x + 4, y + 6, 10, 20); F('#8fd7dd', x + 18, y + 6, 10, 20); F('#33415e', x + 15, y + 3, 2, 26); }
      }
    }
    for (const [type, x, y] of PROPS) drawProp(c, type, x * TILE, y * TILE);
    for (const [x, y] of CHAIRS) drawProp(c, 'chair', x * TILE, y * TILE);
    return base;
  }

  // Deterministic waypoint paths: position is a pure function of time.
  function path(points, speed = 2.4) {
    const legs = []; let t = 0;
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1], b = points[k], d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
      legs.push({ t0: t, t1: t + d / speed, from: a, to: b }); t += d / speed;
    }
    return { legs, duration: t, end: points.at(-1), start: points[0] };
  }
  function sample(route, time, loop = false) {
    const t = loop ? ((time % route.duration) + route.duration) % route.duration : time;
    if (t <= 0) return { x: route.start[0], y: route.start[1], dx: 0, dy: 1, moving: false };
    for (const leg of route.legs) {
      if (t < leg.t0 || t >= leg.t1) continue;
      const p = (t - leg.t0) / (leg.t1 - leg.t0);
      return { x: leg.from[0] + (leg.to[0] - leg.from[0]) * p, y: leg.from[1] + (leg.to[1] - leg.from[1]) * p, dx: Math.sign(leg.to[0] - leg.from[0]), dy: Math.sign(leg.to[1] - leg.from[1]), moving: true };
    }
    return { x: route.end[0], y: route.end[1], dx: 0, dy: 1, moving: false };
  }
  const loopBack = points => path([...points, ...points.slice(0, -1).reverse()], 2);

  // Background life: staff loops (count follows workforce) and one arriving patient.
  const STAFF = [
    ['nurse', loopBack([[23, 5], [23, 7], [7, 7], [7, 13]])], ['doctor', loopBack([[23, 10], [23, 8], [8, 8], [8, 4]])],
    ['nurse', loopBack([[2, 13], [2, 8], [11, 8], [11, 13]])], ['porter', loopBack([[2, 8], [12, 8], [12, 7], [27, 7]])],
    ['nurse', loopBack([[5, 13], [5, 8], [19, 8], [19, 10]])], ['doctor', loopBack([[27, 13], [27, 8], [16, 8], [16, 12]])],
  ];
  const ARRIVAL = path([[14, 16], [14, 9], [16, 9], [16, 8], [19, 8], [19, 10]], 2);

  // Scripted scene for each option: actors walk a path after a delay; props
  // and signs appear once the scene starts. All tile coordinates.
  const walkIn = (role, points, delay = 0, extra = {}) => ({ role, route: path(points, 2.6), delay, ...extra });
  const SCENES = {
    agency: { zone: 'ward', actors: [0, 0.9, 1.8].map((d, i) => walkIn('agency', [[14, 16], [14, 8], [7 + (i % 2), 8], [7 + (i % 2), 11 + i]], d)), signs: [['£ AGENCY INVOICE', 'office']] },
    pause: { zone: 'theatres', dark: ['theatres'], actors: [0, 1].map(d => walkIn('doctor', [[27, 11], [27, 8], [8, 8], [8, 11 + d]], d)), signs: [['OPERATIONS PAUSED', 'theatres']] },
    cancel: { zone: 'theatres', dark: ['theatres'], actors: [0, 1].map(d => walkIn('nurse', [[27, 11], [27, 8], [19, 8], [19, 11 + d]], d)), signs: [['ADMISSIONS CANCELLED', 'theatres']] },
    redeploy: { zone: 'arrival', dark: ['theatres'], actors: [0, 0.7, 1.4].map((d, i) => walkIn(i ? 'nurse' : 'doctor', [[27, 11], [27, 8], [19, 8], [19, 10 + i]], d)), signs: [['STAFF MOVED TO A&E', 'arrival']] },
    discharge: { zone: 'flow', actors: [0, 1.2, 2.4].map(d => walkIn('visitor', [[8, 12], [8, 8], [14, 8], [14, 16]], d, { leave: true })), signs: [['HOME TODAY', 'flow']] },
    divert: { zone: 'front', ambulance: 'away', signs: [['AMBULANCES DIVERTED', 'front']] },
    beds: { zone: 'flow', extraBeds: true, actors: [walkIn('nurse', [[3, 8], [9, 8], [3, 8], [9, 8]], 0.5)], signs: [['18 EXTRA BEDS', 'flow']] },
    virtual: { zone: 'flow', actors: [0, 1.5].map(d => walkIn('visitor', [[8, 12], [8, 8], [14, 8], [14, 16]], d, { leave: true, tablet: true })), houses: true, signs: [['RECOVERING AT HOME', 'flow']] },
    partner: { zone: 'front', vans: true, actors: [0, 1.4].map(d => walkIn('visitor', [[11, 14], [13, 14], [14, 14], [14, 16]], d, { leave: true })), signs: [['CARE PACKAGES START', 'front']] },
    briefing: { zone: 'front', podium: true, press: 4, actors: [walkIn('exec', [[14, 8], [14, 14]], 0)], signs: [['ON CAMERA', 'front']] },
    plan: { zone: 'office', board: true, actors: [0, 0.8].map((d, i) => walkIn(i ? 'nurse' : 'exec', [[16, 8], [12, 8], [11, 9], [11, 10]], d)), signs: [['WEEKLY SCORECARD', 'office']] },
    listen: { zone: 'canteen', circle: true, signs: [['LISTENING PANEL', 'canteen']] },
    statement: { zone: 'front', notice: true, press: 2, signs: [['STATEMENT ISSUED', 'front']] },
    wellbeing: { zone: 'staffroom', rest: true, actors: [0, 1].map(d => walkIn('nurse', [[8, 12], [8, 8], [23, 8], [23, 6], [23, 3 + d]], d)), signs: [['BREAKS COVERED', 'staffroom']] },
    lounge: { zone: 'flow', evening: true, actors: [0, 1.2, 2.4].map(d => walkIn('visitor', [[11, 14], [13, 14], [14, 14], [14, 16]], d + 0.5, { leave: true })), signs: [['OPEN LATE', 'flow']] },
    aid: { zone: 'arrival', actors: [0, 0.8, 1.6].map((d, i) => walkIn('partner', [[14, 16], [14, 9], [19, 9], [19 + (i - 1), 10]], d)), signs: [['STAFF ON LOAN · 72 HRS', 'arrival']] },
  };
  const DRESSING = {
    outbreak: { zone: 'ward', sign: ['BAYS CLOSED', 'ward'] }, trolleys: { zone: 'arrival', sign: ['NO BEDS', 'arrival'] },
    press: { zone: 'front', sign: ['NEWS CREW OUTSIDE', 'front'] }, winter: { zone: 'arrival', sign: ['WINTER PRESSURE', 'arrival'] },
    celebrate: { zone: 'front', sign: ['WELL DONE, NORTHBROOK', 'front'] }, inspect: { zone: 'front', sign: ['INSPECTORS ON SITE', 'front'] },
  };

  function drawPerson(c, role, px, py, opts = {}) {
    const R = rect(c), r = ROLE[role] || ROLE.visitor;
    const { dx = 0, dy = 1, moving = false, clock = 0, seated = false, mood = 0, tired = false } = opts;
    const fx = px | 0, fy = py | 0, fr = moving ? Math.floor(clock * 7) % 2 : 0, bob = moving ? fr : 0;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(fx, fy + 1, 9, 3, 0, 0, 7); c.fill();
    const O = (x, y, w, h, col) => { R('#20242f', x - 1, y - 1, w + 2, h + 2); R(col, x, y, w, h); };
    const skin = role === 'patient' && mood < 0 ? '#c9c79a' : '#e8b48c';
    let top;
    if (seated) {
      O(fx - 8, fy - 16, 16, 12, r.top); O(fx - 7, fy - 27, 14, 11, skin); R(r.hair, fx - 7, fy - 27, 14, 4);
      R('#20242f', fx - 4, fy - 22, 2, 3); R('#20242f', fx + 2, fy - 22, 2, 3); top = fy - 27;
    } else {
      const ly = fy - 8 - bob;
      O(fx - 6, ly, 5, 8, r.leg); O(fx + 1, ly, 5, 8, r.leg);
      if (moving) { R('#20242f', fx - 6, fr ? ly + 6 : ly - 1, 5, 2); R('#20242f', fx + 1, fr ? ly - 1 : ly + 6, 5, 2); }
      O(fx - 8, fy - 19 - bob, 16, 12, r.top);
      if (role === 'doctor') { R('#c6ccd8', fx - 1, fy - 19 - bob, 2, 12); R('#17a9a3', fx - 5, fy - 17 - bob, 3, 3); }
      if (role === 'nurse' || role === 'agency' || role === 'partner') { R('#f4f6f8', fx - 1, fy - 16 - bob, 4, 2); R('#f4f6f8', fx, fy - 17 - bob, 2, 4); }
      if (role === 'agency') R('#e9b44c', fx + 4, fy - 17 - bob, 3, 4);
      if (role === 'exec') R('#e9b44c', fx - 1, fy - 17 - bob, 2, 8);
      if (role === 'press') { R('#f4f6f8', fx - 2, fy - 18 - bob, 5, 7); O(fx + 8, fy - 22 - bob, 8, 6, '#1d2433'); R('#8fd6e8', fx + 13, fy - 20 - bob, 2, 2); }
      if (role === 'visitor') O(fx + 7, fy - 12 - bob, 6, 7, '#8a6236');
      O(fx - 7, fy - 30 - bob, 14, 12, skin); R(r.hair, fx - 7, fy - 30 - bob, 14, dy < 0 ? 9 : 4);
      if (dy >= 0) { const s = dx < 0 ? -3 : dx > 0 ? 3 : 0; R('#20242f', fx - 4 + s, fy - 25 - bob, 2, 3); R('#20242f', fx + 2 + s, fy - 25 - bob, 2, 3); }
      top = fy - 30 - bob;
    }
    if (tired && Math.floor(clock * 2) % 2 === 0) { R('#8fd6e8', fx + 8, top + 2, 3, 4); R('#8fd6e8', fx + 9, top, 1, 2); }
    if (mood < 0) { R('#20242f', fx - 5, top - 13, 11, 10); R('#e05252', fx - 4, top - 12, 9, 8); R('#fff', fx - 1, top - 11, 3, 4); R('#fff', fx - 1, top - 6, 3, 2); }
    if (mood > 0) { R('#20242f', fx - 5, top - 12, 11, 9); R('#3fd1a4', fx - 4, top - 11, 9, 7); R('#fff', fx - 2, top - 8, 2, 2); R('#fff', fx + 1, top - 8, 2, 2); }
  }

  // What the hospital should look like for a set of numbers. Thresholds are
  // chosen so a change of about five points is visible.
  function state(snapshot) {
    const v = id => snapshot[id] ?? Northbrook.content.metrics.find(m => m.id === id).start;
    const access = v('access'), staff = v('staff'), safety = v('safety'), experience = v('experience'), trust = v('trust');
    const lines = Object.fromEntries(Northbrook.content.rules.redLines.map(line => [line.id, line.min]));
    return {
      waiting: clamp(Math.round((72 - access) / 4), 0, 8),
      corridor: clamp(Math.round((48 - access) / 3), 0, 4),
      occupied: clamp(Math.round(BEDS.length * (1.15 - access / 140)), 3, BEDS.length),
      staff: clamp(Math.round((staff - 30) / 7), 1, STAFF.length),
      tired: staff < 54,
      alarm: safety < lines.safety ? 2 : safety < lines.safety + 6 ? 1 : 0,
      mood: experience < 56 ? -1 : experience >= 66 ? 1 : 0,
      press: clamp(Math.round((60 - trust) / 3), 0, 3),
    };
  }

  // Draws one frame of the hospital. st = seconds since the chosen scene started.
  function drawWorld(c, view, t, st, still) {
      const R = rect(c);
      c.drawImage(staticLayer(), 0, 0);
      const s = state(view.snapshot);
      const scene = SCENES[view.scene];
      const D = (type, x, y) => drawProp(c, type, x * TILE, y * TILE);
      const dark = zone => { const z = ZONES[zone]; c.fillStyle = 'rgba(10,14,30,0.55)'; c.fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE); };

      BEDS.forEach(([x, y], i) => { if (i < s.occupied) D('bedocc', x, y); });
      // Quarter crisis set dressing.
      if (view.dressing === 'outbreak') { D('bedx', 7, 14); D('bedx', 8, 14); R('#e9b44c', 7 * TILE, 9 * TILE + 26, 64, 4); R('#20242f', 7 * TILE + 8, 9 * TILE + 26, 8, 4); R('#20242f', 7 * TILE + 40, 9 * TILE + 26, 8, 4); }
      if (view.dressing === 'trolleys') { D('trolley', 15, 7.4); D('trolley', 17, 7.4); D('trolley', 20.5, 7.4); }
      if (view.dressing === 'press') D('newsvan', 17.5, 15.2);
      if (view.dressing === 'winter') { D('ambulance', 9.5, 15.6); D('ambulance', 4.5, 15.6); }
      if (view.dressing === 'celebrate') {
        for (let i = 0; i < 29; i++) R(['#e05252', '#e9b44c', '#23c4b4', '#6ab0ff'][i % 4], 32 + i * 31, 7 * TILE + 4 + (i % 2) * 6, 14, 10);
        if (!still) for (let i = 0; i < 50; i++) { c.fillStyle = ['#e9b44c', '#23c4b4', '#e05252', '#f4f6f8'][i % 4]; c.fillRect((hash(i, 5) % W + t * 9) % W | 0, (hash(i, 8) % H + t * (24 + i % 5 * 5)) % H | 0, 4, 4); }
      }
      if (view.dressing === 'inspect') {
        [[13.4, 12], [14.6, 11], [19, 9], [8, 9]].forEach(([x, y], i) => { drawPerson(c, 'exec', x * TILE + 16, y * TILE + 26, { clock: t, dx: i % 2 ? 1 : -1 }); R('#c9a06a', x * TILE + 22, y * TILE + 6, 8, 10); R('#f4f6f8', x * TILE + 23, y * TILE + 8, 6, 6); });
      }

      if (scene) {
        for (const zone of scene.dark || []) dark(zone);
        if (scene.evening) { c.fillStyle = 'rgba(12,16,48,0.38)'; c.fillRect(0, 0, W, H); const z = ZONES.flow; c.fillStyle = 'rgba(242,220,158,0.35)'; c.fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE); }
        if (scene.extraBeds) for (let i = 0; i < 4; i++) D('bedocc', 2 + i * 2, 7);
        if (scene.vans && st > 0.2) { D('van', 16.4, 15.3); D('van', 9.2, 15.3); }
        if (scene.houses && st > 2) { for (let i = 0; i < 3; i++) D('house', 17 + i * 0.8, 15.4); }
        if (scene.podium) D('podium', 14.2, 14.2);
        if (scene.board && st > 1) D('board', 10, 10);
        if (scene.notice) D('notice', 15.6, 14.6);
        if (scene.circle) {
          [[26.4, 2.4], [28, 2.4], [26, 3.8], [28.4, 3.8], [27.2, 4.6]].forEach(([x, y], i) => drawPerson(c, i % 2 ? 'patient' : 'nurse', x * TILE + 16, y * TILE + 26, { seated: true, clock: t }));
          if (Math.floor(t * 1.5) % 2 || still) { R('#fff', 27 * TILE + 2, 1 * TILE + 6, 26, 14); R('#20242f', 27 * TILE + 6, 1 * TILE + 11, 18, 3); }
        }
        if (scene.rest) [[22.4, 2.5], [24, 2.5], [23.2, 3.9]].forEach(([x, y]) => { drawPerson(c, 'nurse', x * TILE + 16, y * TILE + 26, { seated: true, clock: t }); D('mug', x + 0.5, y + 0.4); });
        if (scene.ambulance === 'away') { const x = 15.5 - Math.min(st, 6) * 1.6; D('ambulance', x, 15.6); R('#e05252', 13.2 * TILE, 15.1 * TILE, 28, 6); }
        const press = Math.max(scene.press || 0, view.dressing === 'press' ? 2 : 0);
        for (let i = 0; i < press; i++) {
          drawPerson(c, 'press', (12.2 + i * 1.1) * TILE + 16, 15.1 * TILE + 24, { dx: 1, clock: t * 0.4 });
          if (scene.podium && !still && Math.floor(t * 3 + i) % 5 === 0) { c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect((12.2 + i * 1.1) * TILE + 20, 15.1 * TILE - 6, 10, 10); }
        }
      } else if (view.dressing === 'press') {
        for (let i = 0; i < 2; i++) drawPerson(c, 'press', (12.6 + i * 1.2) * TILE + 16, 15.1 * TILE + 24, { dx: 1, clock: t * 0.4 });
      }

      // Live numbers: crowd, staff, mood, alarms.
      CHAIRS.forEach(([x, y], i) => { if (i < s.waiting) drawPerson(c, 'patient', x * TILE + 16, y * TILE + 26, { seated: true, mood: i % 2 ? s.mood : 0, clock: t }); });
      for (let i = 0; i < s.corridor; i++) drawPerson(c, 'patient', (15 + (i % 2)) * TILE + 6, (10 + Math.floor(i / 2) * 1.2) * TILE + 20, { dy: -1, clock: t, mood: s.mood });
      drawPerson(c, 'reception', 14 * TILE + 16, 7 * TILE + 29, { clock: t });
      for (let i = 0; i < s.staff; i++) {
        const [role, route] = STAFF[i];
        const p = sample(route, t + i * 3.1, true);
        drawPerson(c, role, p.x * TILE + 16, p.y * TILE + 29, { ...p, clock: t, tired: s.tired });
      }
      if (!scene?.ambulance) { const a = sample(ARRIVAL, t % (ARRIVAL.duration + 4)); drawPerson(c, 'patient', a.x * TILE + 16, a.y * TILE + 29, { ...a, clock: t, mood: s.mood }); }
      for (const actor of scene?.actors || []) {
        const local = st - actor.delay;
        if (local < 0) continue;
        if (actor.leave && local > actor.route.duration) continue;
        const p = sample(actor.route, local);
        drawPerson(c, actor.role, p.x * TILE + 16, p.y * TILE + 29, { ...p, clock: t });
        if (actor.tablet) drawProp(c, 'tablet', p.x * TILE + 26, p.y * TILE - 6);
      }
      if (s.alarm) {
        const on = still || Math.floor(t * (s.alarm > 1 ? 4 : 2)) % 2 === 0;
        R(on ? '#e05252' : '#7a2b2b', 7 * TILE + 26, 9 * TILE + 4, 12, 10); R('#20242f', 7 * TILE + 30, 9 * TILE + 14, 4, 6);
        if (s.alarm > 1 && on) { c.fillStyle = 'rgba(224,82,82,0.18)'; c.fillRect(1 * TILE, 10 * TILE, 8 * TILE, 6 * TILE); }
      }
      if (view.dressing === 'winter' && !still) {
        c.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 70; i++) { const x = (hash(i, 3) % W + t * (14 + (i % 5) * 4)) % W; const y = (hash(i, 9) % H + t * (30 + (i % 7) * 6)) % H; c.fillRect(x | 0, y | 0, 3, 3); }
      }
      const z = ZONES[view.zone];
      if (z) {
        const pulse = still ? 1 : 0.55 + 0.45 * Math.sin(t * 3);
        c.strokeStyle = `rgba(35,196,180,${pulse})`; c.lineWidth = 4;
        c.strokeRect(z.x * TILE - 2, z.y * TILE - 2, z.w * TILE + 4, z.h * TILE + 4);
      }
    }


  function hospital(canvas) {
    const c = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    c.imageSmoothingEnabled = false;
    let view = { snapshot: {}, zone: null, dressing: null, scene: null, sceneAt: 0, done: false };
    let raf = 0, visible = true, alive = true;
    const still = reduced();
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    function frame() {
      if (!alive) return;
      draw(still ? 30 : now());
      if (!still && visible) raf = requestAnimationFrame(frame);
    }
    function draw(t) { drawWorld(c, view, t, still || view.done ? 99 : t - view.sceneAt, still); }

    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && alive) raf = requestAnimationFrame(frame);
    }) : null;
    io?.observe(canvas);
    raf = requestAnimationFrame(frame);

    return {
      set(next) {
        const restart = next.scene !== undefined && (next.scene !== view.scene || next.restart);
        view = { ...view, ...next };
        if (restart) view.sceneAt = now();
        if (still) draw(30);
      },
      destroy() { alive = false; cancelAnimationFrame(raf); io?.disconnect(); },
    };
  }

  // Static close-up of a scene (or a quarter's crisis) for cards and front pages.
  let scratch = null;
  function thumb(canvas, { scene = null, dressing = null, snapshot = {}, zone = null }) {
    scratch = scratch || Object.assign(document.createElement('canvas'), { width: W, height: H });
    const s = scratch.getContext('2d');
    s.imageSmoothingEnabled = false;
    drawWorld(s, { snapshot, scene, dressing, zone: null }, 30, 99, true);
    const z = ZONES[zone || SCENES[scene]?.zone || DRESSING[dressing]?.zone || 'front'];
    const cw = 10 * TILE, ch = Math.round(cw * canvas.height / canvas.width);
    const x = clamp((z.x + z.w / 2) * TILE - cw / 2, 0, W - cw), y = clamp((z.y + z.h / 2) * TILE - ch / 2, 0, H - ch);
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(scratch, x, y, cw, ch, 0, 0, canvas.width, canvas.height);
  }
  function thumbs(root, snapshot) {
    for (const canvas of root.querySelectorAll('canvas[data-thumb]')) {
      const [scene, dressing] = canvas.dataset.thumb.split('|');
      thumb(canvas, { scene: scene || null, dressing: dressing || null, snapshot });
    }
  }

  // Plain-language description of what the map shows, for screen readers.
  function describe(snapshot, scene, dressing) {
    const s = state(snapshot);
    const parts = [`${s.waiting} of 8 A&E seats taken`, s.corridor ? `${s.corridor} people waiting in the corridor` : '', `${s.occupied} of ${BEDS.length} beds full`,
      `${s.staff} staff on the move`, s.tired ? 'staff look exhausted' : '', s.alarm === 2 ? 'safety alarm flashing on the wards' : s.alarm ? 'safety warning on the wards' : '',
      s.press ? 'reporters at the entrance' : ''];
    const sign = SCENES[scene]?.signs?.[0]?.[0] || DRESSING[dressing]?.sign[0];
    return `${sign ? sign.charAt(0) + sign.slice(1).toLowerCase() + '. ' : ''}${parts.filter(Boolean).join(', ')}.`;
  }

  // Title screen: the hospital at night (drawn at 960×400).
  function titleScene(canvas) {
    const c = canvas.getContext('2d');
    const w = canvas.width = 960, h = canvas.height = 400;
    const R = rect(c);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const stars = Array.from({ length: 70 }, () => ({ x: Math.floor(rnd() * w), y: Math.floor(rnd() * 250), phase: rnd() * 6.28, speed: 0.4 + rnd() * 1.2 }));
    const windows = [];
    function addWindows(bx, by, cols, rows, ox, oy, sx, sy, skip) {
      for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
        const x = bx + ox + col * sx, y = by + oy + r * sy;
        if (skip && x + 16 > skip.x && x < skip.x + skip.w && y + 11 > skip.y && y < skip.y + skip.h) continue;
        const roll = rnd();
        windows.push({ x, y, state: roll < 0.3 ? 'amber' : roll < 0.55 ? 'ward' : 'dark', period: 4 + rnd() * 5, off: rnd() * 9 });
      }
    }
    addWindows(340, 120, 8, 5, 22, 18, 30, 26, { x: 390, y: 210, w: 180, h: 100 });
    addWindows(210, 170, 4, 4, 13, 14, 30, 28);
    addWindows(620, 170, 4, 4, 13, 14, 30, 28);
    const walkers = [
      { seed: 0.05, speed: 16, dir: 1, y: 338, top: '#3b6ea5', leg: '#2a3145', hair: '#5a3a24' },
      { seed: 0.45, speed: 13, dir: -1, y: 330, top: '#e8ecf5', leg: '#8b94ab', hair: '#2e2a26' },
      { seed: 0.8, speed: 19, dir: 1, y: 334, top: '#1f8a7e', leg: '#243138', hair: '#141210' },
    ];
    const O = (x, y, ww, hh, col) => { R('#20242f', x - 1, y - 1, ww + 2, hh + 2); R(col, x, y, ww, hh); };
    function draw(t) {
      ['#05070f', '#070a16', '#0a0e1f', '#0d1228', '#101633'].forEach((col, b) => R(col, 0, b * 60, w, 60));
      for (const s of stars) { c.globalAlpha = 0.2 + 0.8 * Math.max(0, Math.sin(t * s.speed + s.phase)); R('#dfe6f2', s.x, s.y, 2, 2); }
      c.globalAlpha = 1;
      R('#e6e9df', 768, 50, 28, 44); R('#e6e9df', 760, 58, 44, 28); R('#e6e9df', 764, 54, 36, 36); R('#c9cdc0', 772, 62, 6, 6); R('#c9cdc0', 786, 74, 8, 5);
      R('#03050a', 220, 180, 140, 130); R('#03050a', 630, 180, 140, 130); R('#03050a', 350, 130, 290, 180);
      R('#161b2b', 210, 170, 130, 135); R('#242b40', 210, 170, 130, 4); R('#161b2b', 620, 170, 130, 135); R('#242b40', 620, 170, 130, 4);
      R('#1a2033', 340, 120, 280, 185); R('#2a3350', 340, 120, 280, 4); R('#232b40', 362, 110, 16, 10); R('#232b40', 560, 108, 22, 12);
      for (const win of windows) {
        const lit = win.state === 'amber' || (win.state === 'ward' && ((t + win.off) % win.period) < win.period * 0.6);
        if (!lit) { R('#0b0f1c', win.x, win.y, 16, 11); continue; }
        c.fillStyle = win.state === 'amber' ? 'rgba(233,180,76,.16)' : 'rgba(159,232,224,.14)'; c.fillRect(win.x - 3, win.y - 3, 22, 17);
        R(win.state === 'amber' ? '#e9b44c' : '#cfe8e4', win.x, win.y, 16, 11); R('#232b40', win.x + 7, win.y, 2, 11); R('#232b40', win.x, win.y + 5, 16, 1);
      }
      R('#0d1220', 448, 252, 64, 53); R('#f2dc9e', 454, 262, 22, 41); R('#f2dc9e', 484, 262, 22, 41); R('#20242f', 476, 262, 8, 41);
      R('#0a4a44', 438, 252, 84, 4); R('#23c4b4', 436, 244, 88, 8); R('#2a3145', 440, 256, 3, 49); R('#2a3145', 517, 256, 3, 49);
      R('#04060c', 403, 231, 22, 22); R('#23c4b4', 400, 228, 22, 22); R('#062b28', 404, 232, 4, 14); R('#062b28', 414, 232, 4, 14);
      R('#062b28', 408, 234, 3, 4); R('#062b28', 410, 238, 3, 4); R('#062b28', 412, 242, 2, 4);
      R('#04060c', 541, 231, 22, 22); R('#e8ecf5', 538, 228, 22, 22); R('#e05252', 546, 231, 6, 16); R('#e05252', 541, 236, 16, 6);
      R('#2a3145', 476, 110, 6, 10);
      if (t % 1.2 < 0.55) { c.fillStyle = 'rgba(224,82,82,.25)'; c.fillRect(465, 94, 28, 20); R('#e05252', 472, 100, 14, 8); } else R('#5a2a2a', 472, 100, 14, 8);
      R('#242938', 0, 300, w, 45); R('#2e3547', 0, 300, w, 2);
      for (let gx = 0; gx < w; gx += 32) R('#1c2130', gx, 302, 1, 43);
      R('#161a26', 0, 342, w, 3); R('#12151f', 0, 345, w, h - 345);
      const shift = (t * 40) % 52;
      for (let dx = -shift - 52; dx < w; dx += 52) R('#3a415a', dx, 386, 26, 4);
      for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(242,220,158,0.14)'; c.fillRect(452 - i * 6, 305 + i * 7, 56 + i * 12, 7); }
      for (const lx of [130, 610]) {
        for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(233,180,76,0.05)'; c.fillRect(lx - 4 - i * 5, 262 + i * 8, 14 + i * 10, 8); }
        R('#2a3145', lx, 258, 4, 45); R('#2a3145', lx - 4, 254, 12, 4); R('#e9b44c', lx - 4, 258, 8, 5);
      }
      const range = w + 180, x = Math.round((((0.15 * range + t * 38) % range) + range) % range - 120), on = ((t * 2.4) % 1) < 0.5;
      drawProp(c, 'ambulance', x, 356); R(on ? '#6ab0ff' : '#31517a', x + 66, 357, 10, 5);
      for (const p of walkers) {
        const r2 = w + 60, px = (((p.seed * r2 + t * p.speed * p.dir) % r2) + r2) % r2 - 30, fr = Math.floor(t * 6 + p.seed * 10) % 2, ly = p.y - 8 - fr, s = p.dir < 0 ? -3 : 3;
        O(px - 6, ly, 5, 8, p.leg); O(px + 1, ly, 5, 8, p.leg); O(px - 8, p.y - 19 - fr, 16, 12, p.top); O(px - 7, p.y - 30 - fr, 14, 12, '#e8b48c');
        R(p.hair, px - 7, p.y - 30 - fr, 14, 4); R('#20242f', px - 4 + s, p.y - 25 - fr, 2, 3); R('#20242f', px + 2 + s, p.y - 25 - fr, 2, 3);
      }
    }
    const still = reduced();
    let raf = 0, alive = true; const t0 = performance.now();
    const tick = now => { if (!alive) return; draw(still ? 2 : (now - t0) / 1000); if (!still) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return { destroy() { alive = false; cancelAnimationFrame(raf); } };
  }

  function portrait(canvas, spec) {
    const c = canvas.getContext('2d');
    canvas.width = 24; canvas.height = 24;
    const P = rect(c), OUT = '#0a0d16', SKIN = '#e8b48c';
    P('#0d1120', 0, 0, 24, 24); P(OUT, 3, 14, 18, 10); P(spec.uniform, 4, 15, 16, 9); P(OUT, 7, 2, 10, 12); P(SKIN, 8, 3, 8, 10);
    P(spec.hair, 8, 3, 8, 3); P('#141821', 10, 8, 2, 2); P('#141821', 14, 8, 2, 2); P(SKIN, 10, 13, 4, 2);
    const extras = {
      tie: [['#e8ecf5', 10, 15, 4, 3], ['#c9963a', 10, 15, 4, 2], ['#e9b44c', 11, 17, 2, 7]],
      glasses: [['#111624', 9, 7, 4, 4], ['#111624', 13, 7, 4, 4], ['#8fd6e8', 10, 8, 2, 2], ['#8fd6e8', 14, 8, 2, 2]],
      watch: [['#f4f6f8', 10, 15, 4, 2], ['#f4f6f8', 7, 17, 4, 4], ['#20242f', 8, 18, 2, 2]],
      lanyard: [['#23c4b4', 9, 15, 1, 4], ['#23c4b4', 14, 15, 1, 4], [OUT, 9, 18, 6, 6], ['#e8ecf5', 10, 19, 4, 4], ['#3b6ea5', 11, 20, 2, 2]],
      stethoscope: [['#8aa8d8', 11, 15, 2, 9], ['#17a9a3', 9, 14, 2, 5], ['#17a9a3', 13, 14, 2, 3], ['#17a9a3', 8, 20, 3, 3]],
      clipboard: [[OUT, 15, 14, 7, 9], ['#c9a06a', 16, 15, 5, 7], ['#e8ecf5', 17, 16, 3, 5], ['#8b94ab', 17, 15, 3, 1]],
    };
    for (const args of extras[spec.accessory] || []) P(...args);
  }

  const mounted = new Set();
  function portraits(root) {
    for (const canvas of root.querySelectorAll('canvas[data-portrait]')) {
      const role = Northbrook.content.roles.find(item => item.id === canvas.dataset.portrait);
      if (role) portrait(canvas, role.portrait);
    }
  }
  function mountAll(root, snapshot = {}) {
    for (const item of mounted) item.destroy();
    mounted.clear();
    portraits(root);
    thumbs(root, snapshot);
    const title = root.querySelector('canvas[data-pixel="title"]');
    if (title) mounted.add(titleScene(title));
    const maps = new Map();
    for (const canvas of root.querySelectorAll('canvas[data-pixel="hospital"]')) {
      const view = hospital(canvas);
      mounted.add(view);
      maps.set(canvas.dataset.map || 'main', view);
    }
    return maps;
  }

  return { hospital, titleScene, portrait, portraits, thumb, thumbs, mountAll, describe, state, SCENES, DRESSING, ZONES, LABELS, TILE, COLS, ROWS };
})();
