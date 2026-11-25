'use strict';
// End-to-end route sweep with real clicks and keys.
// Plays 16 years (every option appears in four of them) at projector size and on a
// phone, checking gameplay and rendering on every screen:
//   - no console errors, no network requests, no sideways scrolling
//   - all four proposals above the dock at 1920×1080 and 1440×900
//   - the money bridge adds up (start + steps = end) and every bar is coloured
//   - status values, map signs and floaters stay inside their frames
//   - no clipped text in the key panels
//   - the year-end rating matches the engine for the same route
// Run: PW_EXECUTABLE=/usr/bin/google-chrome node tests/e2e-routes.cjs   (QA_SHOTS=dir to save screenshots)
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdir } = require('node:fs/promises');
const { chromium } = require('playwright');

require('../src/content.js');
const E = require('../src/engine.js');
const { quarters, roles } = Northbrook.content;

const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const shots = process.env.QA_SHOTS;
const ids = quarters.map(q => q.options.map(o => o.id));
// 16 routes: route r takes option (r + k*q) mod 4 in quarter q, with k = floor(r/4), so each option appears 4 times.
const routes = Array.from({ length: 16 }, (_, r) => ids.map((opts, q) => opts[(r + Math.floor(r / 4) * q) % 4]));
const predicts = ['access', 'safety', 'staff', 'experience', 'trust'];
const owners = { access: 'coo', safety: 'md', staff: 'cpo', experience: 'cno', trust: 'ceo' };
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

async function layoutChecks(page, label, { desktop }) {
  const res = await page.evaluate(desktop => {
    const out = [];
    const doc = document.documentElement;
    if (doc.scrollWidth - doc.clientWidth > 0) out.push('sideways scroll');
    const inside = (el, box, slack = 1) => { const r = el.getBoundingClientRect(); return r.left >= box.left - slack && r.right <= box.right + slack; };
    const hud = document.querySelector('#hud-slot .hud, .decision-side .hud');
    if (hud) { const box = hud.getBoundingClientRect(); for (const el of hud.querySelectorAll('.stat-value, .pop')) if (!inside(el, box)) out.push(`status value outside panel: ${el.textContent}`); }
    const frame = document.querySelector('.map-frame');
    if (frame) {
      const box = frame.getBoundingClientRect();
      for (const el of frame.querySelectorAll('.map-sign:not([hidden]), .floater')) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < box.left - 2 || r.right > box.right + 2 || r.top < box.top - 2 || r.bottom > box.bottom + 2)) out.push(`map overlay clipped: ${el.textContent}`);
      }
    }
    for (const el of document.querySelectorAll('.p-title, .stat-name, .br-label, .db-nums, .bridge b, .stamp-line, .headline, .seat-name')) {
      if (el.scrollWidth - el.clientWidth > 2 && getComputedStyle(el).overflow !== 'hidden') out.push(`text overflows: ${el.className} "${el.textContent.trim().slice(0, 30)}"`);
    }
    for (const el of document.querySelectorAll('.bridge .br-track i')) if (getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') out.push('uncoloured bridge bar');
    if (desktop && document.querySelector('.proposals') && document.querySelector('.dock')) {
      const last = [...document.querySelectorAll('.proposals .proposal')].pop().getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect();
      if (last.bottom > dock.top + 1) out.push(`proposal under the dock (${Math.round(last.bottom)} > ${Math.round(dock.top)})`);
    }
    return out;
  }, desktop);
  for (const r of res) check(false, `${label}: ${r}`);
}

const money = text => { const m = text.replace(/[−–]/g, '-').match(/(-|\+)?£([\d.]+)(m|k)?/); if (!m) return NaN; const v = parseFloat(m[2]) * (m[3] === 'm' ? 1000 : 1); return m[1] === '-' ? -v : v; };

async function playYear(browser, route, n, viewport) {
  const desktop = viewport.width >= 1200;
  const page = await browser.newPage({ viewport, isMobile: !desktop, hasTouch: !desktop });
  const errors = [], remote = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  await page.goto(url);
  if (desktop) await page.locator('[data-action="all-seats"]').click();
  else { await page.locator('input[name="mode"][value="solo"] + span').click(); await page.locator('.role-card:has(input[value="cfo"])').click(); }
  await page.locator('#start-form button[type="submit"]').click();
  const tag = `${viewport.width >= 1800 ? 'desk' : desktop ? 'laptop' : 'phone'} route ${n} (${route.join('>')})`;
  for (let q = 0; q < 4; q++) {
    await page.locator('.proposals').waitFor();
    await page.locator(`[data-option="${route[q]}"]`).click();
    await layoutChecks(page, `${tag} Q${q + 1} decision`, { desktop });
    if (shots && n === 0) await page.screenshot({ path: path.join(shots, `${desktop ? 'd' : 'p'}-q${q + 1}-decision.png`) });
    await page.locator('[data-action="lock"]').click();
    const p = predicts[(n + q) % 5];
    await page.locator(`#dialog [data-action="predict"][data-metric="${p}"]`).click();
    await page.locator(`#dialog [data-action="owner"][data-role="${owners[p]}"]`).click();
    await page.locator('#dialog [data-action="commit"]').click();
    await page.locator('#dialogue').waitFor();
    // Step through every beat, checking the layout at each one.
    let steps = 0;
    while (await page.locator('[data-action="step-next"]').count()) {
      await layoutChecks(page, `${tag} Q${q + 1} step ${steps + 1}`, { desktop });
      await page.locator('[data-action="step-next"]').click(); steps++;
      if (steps > 9) { check(false, `${tag}: replay never ends`); break; }
    }
    await page.locator('.gazette').waitFor();
    await layoutChecks(page, `${tag} Q${q + 1} end`, { desktop });
    // Money bridge adds up.
    const rows = await page.locator('.report-main .bridge li, .report-grid .bridge li').evaluateAll(lis => lis.map(li => li.querySelector('b').textContent));
    if (rows.length >= 2) {
      const vals = rows.map(money);
      const sum = vals.slice(0, -1).reduce((a, b) => a + b, 0);
      check(Math.abs(sum - vals.at(-1)) <= 110, `${tag} Q${q + 1}: bridge does not add up (${rows.join(' ')})`);
    } else check(false, `${tag} Q${q + 1}: no money bridge`);
    if (shots && n === 0) await page.screenshot({ path: path.join(shots, `${desktop ? 'd' : 'p'}-q${q + 1}-end.png`), fullPage: true });
    await page.locator('[data-action="next"]').click();
  }
  await page.locator('.big-stamp').waitFor();
  await layoutChecks(page, `${tag} year-end`, { desktop });
  const shown = (await page.locator('.big-stamp b').innerText()).trim().toLowerCase();
  const seats = desktop ? roles.map(r => r.id) : ['cfo'];
  const expected = E.verdict(E.history(route.map((choice, q) => { const p = predicts[(n + q) % 5]; return { choice, prediction: p, owner: owners[p] }; })), seats).rating.toLowerCase();
  check(shown === expected, `${tag}: year-end shows ${shown}, engine says ${expected}`);
  if (shots && n === 0) await page.screenshot({ path: path.join(shots, `${desktop ? 'd' : 'p'}-year-end.png`), fullPage: true });
  check(errors.length === 0, `${tag}: console errors ${errors.join(' | ')}`);
  check(remote.length === 0, `${tag}: network requests ${remote.join(' ')}`);
  await page.close();
}

(async () => {
  if (shots) await mkdir(shots, { recursive: true });
  const browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});
  const only = process.env.ROUTES ? process.env.ROUTES.split(',').map(Number) : null;
  if (!process.env.PHONE_ONLY) for (const [i, route] of routes.entries()) if (!only || only.includes(i)) await playYear(browser, route, i, { width: 1920, height: 1080 });
  if (!process.env.PHONE_ONLY) for (const i of [1, 6, 11, 12]) if (!only || only.includes(i)) await playYear(browser, routes[i], i, { width: 1440, height: 900 });
  for (const i of [0, 5, 10, 15]) if (!only || only.includes(i)) await playYear(browser, routes[i], i, { width: 390, height: 844 });
  await browser.close();
  const seen = new Set(routes.flat());
  assert.equal(seen.size, 16, 'every option played');
  if (failures.length) { console.error(`${failures.length} problem(s):\n- ` + [...new Set(failures)].join('\n- ')); process.exit(1); }
  console.log(`e2e route sweep passed${process.env.ROUTES || process.env.PHONE_ONLY ? ' (subset)' : ': 16 projector years + 4 laptop years + 4 phone years, every option played'}`);
})().catch(error => { console.error(error); process.exit(1); });
