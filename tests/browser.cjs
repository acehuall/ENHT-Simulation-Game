'use strict';

// Browser smoke test: plays real years in Chromium from file://.
//   npm run test:browser                  (uses Playwright's Chromium)
//   PW_EXECUTABLE=/path/to/chrome npm run test:browser
//   QA_SHOTS=./shots npm run test:browser (also saves screenshots)
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const shots = process.env.QA_SHOTS;
const errors = [];
const remote = [];
const shot = async (page, name, fullPage = false) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage }); };
const act = (page, action) => page.locator(`[data-action="${action}"]:visible`).first();

function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
}

async function start(page, seats, { solo = false, warmup = false } = {}) {
  if (solo) await page.locator('input[name="mode"][value="solo"] + span').click();
  for (const seat of seats) await page.locator(`.role-card:has(input[value="${seat}"])`).click();
  if (warmup) await page.locator('input[name="warmup"]').check();
  await page.locator('#start-form button[type="submit"]').click();
}

async function quarter(page, option, prediction = 'staff', owner = 'cpo') {
  await page.locator(`[data-option="${option}"]`).click();
  assert.equal(await page.locator(`[data-option="${option}"]`).getAttribute('aria-pressed'), 'true');
  await act(page, 'lock').click();
  assert.equal(await page.locator('[data-action="commit"]').isDisabled(), true, 'cannot lock in before both taps');
  assert.ok(await page.locator('.money-note').count() === 1, 'lock-in explains money is on its own track');
  await page.locator(`#dialog [data-action="predict"][data-metric="${prediction}"]`).click();
  await page.locator(`#dialog [data-action="owner"][data-role="${owner}"]`).click();
  await page.locator('[data-action="commit"]').click();
  await page.locator('#dialogue').waitFor();
  assert.match(await page.locator('#narration').innerText(), /Step 1 of \d+/);
  assert.equal(await page.locator('.gazette').count(), 0, 'no spoilers: the front page waits for the end of the quarter');
}

async function finishReport(page) {
  while (await page.locator('[data-action="step-next"]').count()) await act(page, 'step-next').click();
  assert.match(await page.locator('#narration').innerText(), /Gazette goes to print/);
  assert.equal(await page.locator('.gazette').count(), 1, 'the front page prints at the end of the quarter');
  await act(page, 'next').click();
}

async function answerAll(page, count) {
  for (let i = 0; i < count; i++) {
    await page.locator('.answer').first().click();
    assert.equal(await page.locator('#quiz-submit').isDisabled(), false);
    await page.locator('#quiz-submit').click();
    assert.equal(await page.locator('.answer.right').count(), 1, 'the right answer is always revealed');
    await act(page, 'quiz-next').click();
  }
}

(async () => {
  if (shots) await mkdir(shots, { recursive: true });
  const browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});

  // 1. A full group year on a projector.
  const desk = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  watch(desk);
  await desk.goto(url);
  await shot(desk, '01-welcome');
  await desk.locator('#start-form button[type="submit"]').click();
  assert.equal(await desk.locator('#seat-error').isVisible(), true, 'must pick a seat');
  await act(desk, 'all-seats').click();
  await desk.locator('#start-form button[type="submit"]').click();
  await desk.locator('.proposals').waitFor();
  const last = await desk.locator('.proposals .proposal').last().boundingBox();
  const dockTop = (await desk.locator('.dock').boundingBox()).y;
  assert.ok(last.y + last.height <= dockTop, 'all four proposals are visible above the dock at 1920×1080');
  assert.equal(await desk.locator('.board .seat').count(), 6);
  assert.equal(await desk.locator('.stats .stat').count(), 6);
  assert.ok(await desk.locator('.bar i.drain').count() > 0, 'pressure already coming is drawn on the stat bars');
  assert.equal(await desk.locator('canvas[data-thumb]').count(), 4, 'every proposal has a scene preview');
  await desk.locator('[data-option="agency"]').click();
  assert.ok(await desk.locator('.board .bubble').count() > 0, 'the board reacts to the selected proposal');
  await shot(desk, '02-decision');

  // The board can show everyone's goals at once.
  await act(desk, 'seat').filter({ hasText: 'All goals' }).click();
  assert.equal(await desk.locator('.goals.all > div').count(), 6, 'all six seats show their goals');
  // No undo inside the replay: the lock-in Back button is the safety net.
  await quarter(desk, 'pause', 'access', 'coo');
  await shot(desk, '03-replay');
  assert.equal(await desk.locator('[data-action="undo"]').count(), 0, 'no undo in the replay');
  assert.match(await desk.locator('#hud-slot').innerText(), /Step 1 of \d/i);
  await finishReport(desk);
  await quarter(desk, 'beds', 'safety', 'md');
  await act(desk, 'step-end').click();
  await desk.locator('#compare-body [data-action="compare"]').first().click();
  assert.equal(await desk.locator('.diverge li').count(), 6, 'alternate timeline shows all six measures');
  assert.match(await desk.locator('.stamps .stamp-line').first().innerText(), /CALLED IT|CLOSE|MISSED IT|NO HIT/);
  await act(desk, 'next').click();
  await quarter(desk, 'briefing', 'staff', 'cpo'); await finishReport(desk);
  await quarter(desk, 'wellbeing', 'access', 'coo');
  await act(desk, 'step-end').click();
  await shot(desk, '04-q4-report', true);
  await act(desk, 'next').click();

  // Year-end.
  await desk.locator('.big-stamp').waitFor();
  assert.match(await desk.locator('.big-stamp b').innerText(), /OUTSTANDING|GOOD|REQUIRES IMPROVEMENT|INADEQUATE/);
  assert.equal(await desk.locator('.front-pages .gazette').count(), 4, 'four front pages');
  assert.equal(await desk.locator('.badge').count(), 4);
  await shot(desk, '05-year-end', true);
  for (const tab of ['journey', 'board', 'invoice']) {
    await desk.locator(`[data-tab="${tab}"]`).click();
    assert.equal(await desk.locator(`[data-tab="${tab}"]`).getAttribute('aria-selected'), 'true');
  }
  assert.equal(await desk.locator('.board .seat').count(), 0, 'board tab was left');
  await desk.locator('[data-tab="check"]').click();
  await act(desk, 'transfer').click();
  await answerAll(desk, 4);
  await desk.locator('.score-big').waitFor();

  // Save and resume survive a reload.
  await desk.reload();
  assert.match(await desk.locator('.resume').innerText(), /Year-end ready/);
  await act(desk, 'resume').click();
  await desk.locator('.big-stamp').waitFor();

  // Facilitator mode, plain font, board pack.
  await act(desk, 'again').click();
  await desk.locator('#facil-btn').click();
  assert.equal(await desk.locator('.facil').first().isVisible(), true);
  assert.match(await desk.locator('#quarter-timer').innerText(), /^\d+:\d\d$/);
  await desk.locator('#facil-btn').click();
  await desk.locator('#font-btn').click();
  assert.equal(await desk.evaluate(() => document.body.classList.contains('plain-font')), true);
  await desk.locator('#font-btn').click();
  await act(desk, 'board-pack').click();
  assert.equal(await desk.locator('#dialog .intel-card').count(), 3);
  await desk.keyboard.press('Escape');

  // 2. Solo on a phone, with the warm-up.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  watch(phone);
  await phone.goto(url);
  await start(phone, ['cno'], { solo: true, warmup: true });
  await answerAll(phone, 4);
  await act(phone, 'begin-year').click();
  assert.equal(await phone.locator('.board .seat').count(), 1);
  assert.ok(await phone.locator('.cutscene').isVisible(), 'the crisis is visible on a phone');
  assert.ok(await phone.locator('.map canvas').isVisible(), 'hospital visible before deciding');
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, 'no sideways scrolling on a phone');
  await shot(phone, '06-phone-decision');
  const clipped = await phone.evaluate(() => [...document.querySelectorAll('.real-line, .stat-name, .p-title')].filter(el => el.scrollWidth - el.clientWidth > 2).length);
  assert.equal(clipped, 0, 'no clipped text on the phone decision screen');
  for (const option of ['discharge', 'virtual', 'listen', 'lounge']) { await quarter(phone, option, 'staff', 'cpo'); await act(phone, 'step-end').click(); await act(phone, 'next').click(); }
  await phone.locator('.big-stamp').waitFor();
  await shot(phone, '07-phone-year-end', true);

  // 3. Keyboard only, plain font, big spend: hotkeys drive a whole year, and the
  //    money bridge keeps its colours when the deficit nears the red line.
  const keys = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  watch(keys);
  await keys.goto(url);
  await keys.locator('[data-action="font-plain"]').click();
  await act(keys, 'all-seats').click();
  await keys.locator('#start-form button[type="submit"]').click();
  await keys.locator('.proposals').waitFor();
  let q = 0;
  for (const [letter, bar, owner] of [['a', '3', 't'], ['b', '1', 'e'], ['d', '5', 'q'], ['a', '1', 'e']]) {
    if (q === 1) {
      // Tab + Enter selects the focused proposal; it must not lock in the previous pick.
      await keys.keyboard.press('a');
      await keys.keyboard.press('Tab');
      await keys.keyboard.press('Enter');
      assert.equal(await keys.locator('#dialog[open] [data-action="commit"]').count(), 0, 'Enter on an unpicked proposal does not open the lock-in');
      assert.equal(await keys.locator('.proposals .proposal:nth-child(2)').getAttribute('aria-pressed'), 'true', 'Enter on a focused proposal picks it');
    }
    await keys.keyboard.press(letter);
    assert.equal(await keys.locator('.proposal[aria-pressed="true"]').count(), 1, `key ${letter} picks a proposal`);
    await keys.keyboard.press('Enter');
    assert.equal(await keys.locator('#dialog[open] [data-action="commit"]').count(), 1, 'Enter opens the lock-in after a key pick');
    await keys.keyboard.press(bar); await keys.keyboard.press(owner);
    assert.equal(await keys.locator('#dialog [data-action="commit"]').isDisabled(), false, 'number and letter keys fill the lock-in');
    await keys.keyboard.press('Enter');
    await keys.locator('#dialogue').waitFor();
    await keys.keyboard.press('ArrowRight');
    assert.match(await keys.locator('#narration').innerText(), /Step 2 of/);
    await keys.keyboard.press('s');
    await keys.locator('.gazette').waitFor();
    // Money value and change stay inside the status panel in plain font.
    const fits = await keys.evaluate(() => { const panel = document.querySelector('#hud-slot .hud').getBoundingClientRect(); return [...document.querySelectorAll('#hud-slot .stat-value, #hud-slot .pop')].every(el => el.getBoundingClientRect().right <= panel.right + 1); });
    assert.ok(fits, 'status values fit inside the panel in plain font');
    const bars = await keys.evaluate(() => [...document.querySelectorAll('.bridge .br-track i.bad, .bridge .br-track i.total')].map(el => getComputedStyle(el).backgroundColor));
    assert.ok(bars.length && bars.every(colour => colour !== 'rgba(0, 0, 0, 0)'), 'every money bridge bar is coloured');
    if (q === 0) {
      // REPLAY rebuilds the step view cleanly; S returns to the quarter end.
      await act(keys, 'beat-replay').click();
      assert.equal(await keys.locator('#water-slot').count(), 1, 'replay shows the step view');
      assert.equal(await keys.locator('.gazette').count(), 0, 'replay hides the front page again');
      await keys.keyboard.press('s');
      await keys.locator('.gazette').waitFor();
    }
    // Enter at the quarter end goes on to the next quarter (N does the same).
    await keys.keyboard.press(q % 2 ? 'n' : 'Enter');
    if (q < 3) await keys.locator('.proposals').waitFor();
    q++;
  }
  await keys.locator('.big-stamp').waitFor();
  assert.ok(await keys.locator('.dumbbells li').count() === 6, 'year-end shows start → end for all six measures');

  // 4. Reduced motion still renders a still hospital.
  const calm = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  watch(calm);
  await calm.goto(url);
  await start(calm, ['cfo'], { solo: true });
  await quarter(calm, 'divert', 'experience', 'cno');
  const painted = await calm.locator('.map canvas').evaluate(canvas => canvas.getContext('2d').getImageData(480, 272, 1, 1).data[3]);
  assert.equal(painted, 255);

  await browser.close();
  assert.deepEqual(errors, [], 'no console errors');
  assert.deepEqual(remote, [], 'no network requests: the game is fully offline');
  console.log('browser smoke test passed');
})().catch(error => { console.error(error); process.exit(1); });
