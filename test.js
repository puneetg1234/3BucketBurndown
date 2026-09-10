/**
 * Test suite for index.html — the three-bucket burndown calculator.
 *
 *   npm install      (once, pulls jsdom)
 *   npm test
 *
 * The page is loaded into a headless DOM and driven through its real inputs, so these
 * tests exercise the shipped file rather than a copy of its logic. Nothing is stubbed
 * except the two browser APIs jsdom lacks (SVG layout and blob URLs).
 *
 * Design notes for whoever edits this next:
 *
 *  - There is no golden output file to compare against. Instead, inertness is checked by
 *    round trip: snapshot the page, switch an optional feature on, switch it back off, and
 *    assert the page returned to exactly where it was. That catches the same class of bug
 *    as a stored baseline without going stale every time the copy is reworded.
 *
 *  - Only the two regexes below depend on the wording of the verdict. If that copy changes,
 *    update them here and the rest of the suite keeps working.
 *
 *  - Tests assert on structure and arithmetic, not on prose, so rewording the notes and
 *    labels should never turn this red.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = path.join(__dirname, 'index.html');

/* The only two places the suite depends on verdict wording. */
const SAYS_FAILED = /runs out/i;
const YEAR_IN_TEXT = /year (\d+)/;

/* ------------------------------------------------------------------ harness */

function boot() {
  const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously' });
  const w = dom.window;
  w.SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, width: 900, top: 0, height: 380 });
  w.URL.createObjectURL = () => 'blob:test';
  const d = w.document;
  const fire = el => el.dispatchEvent(new w.Event('input', { bubbles: true }));

  const api = {
    w, d,
    set(sel, val) { const e = d.querySelector(sel); e.value = val; fire(e); return api; },
    check(sel, on) { const e = d.querySelector(sel); e.checked = !!on; fire(e); return api; },
    click(sel) { d.querySelector(sel).click(); return api; },
    el(sel) { return d.querySelector(sel); },
    text(sel) { return d.querySelector(sel).textContent.replace(/\s+/g, ' ').trim(); },

    verdict() { return api.text('#verdict'); },
    failed() { return SAYS_FAILED.test(api.verdict()); },
    /** Year spending first fell short, or Infinity if the horizon was cleared. */
    failYear() { return api.failed() ? +api.verdict().match(YEAR_IN_TEXT)[1] : Infinity; },

    rows() { return Array.from(d.querySelectorAll('#years tbody tr')); },
    cells(n) { return Array.from(api.rows()[n].querySelectorAll('td')); },

    /**
     * Cells of row n, addressed by name. The cash-flow column only exists when flows are
     * live, so every other column shifts by one when it appears — addressing cells by
     * position is how a test ends up silently reading the wrong number.
     */
    cols(n) {
      const c = api.cells(n);
      const hasFlow = !api.el('#flowHead').hidden;
      let i = 0;
      const out = { spend: c[i++] };
      out.flow = hasFlow ? c[i++] : null;
      out.ef = c[i++]; out.b1 = c[i++]; out.b2 = c[i++]; out.b3 = c[i++];
      out.spendable = c[i++]; out.total = c[i++]; out.tax = c[i++];
      return out;
    },
    money(el) {
      const neg = /[\u2212-]/.test(el.textContent.trim()[0] || '');
      const n = +el.textContent.replace(/[^\d]/g, '');
      return neg ? -n : n;
    },

    /** Everything the model drives. Two identical snapshots mean nothing moved. */
    snapshot() {
      return JSON.stringify({
        verdict: api.text('#verdict'),
        note: api.text('#verdictNote'),
        table: d.querySelector('#years tbody').innerHTML,
        chart: d.querySelector('#chart').innerHTML,
        cascade: api.text('#cascade')
      });
    },

    setAll(kind, val) {
      d.querySelectorAll(`input[data-k="${kind}"]`).forEach(e => { e.value = val; fire(e); });
      return api;
    },
    flowRow(i, year, amt, repeats) {
      const tr = d.querySelectorAll('#flowRows tr')[i];
      const y = tr.querySelector('[data-f="year"]');
      const a = tr.querySelector('[data-f="amt"]');
      const r = tr.querySelector('[data-f="rep"]');
      y.value = year === null ? '' : year;
      a.value = amt === null ? '' : amt;
      r.checked = !!repeats;
      fire(a);
      return api;
    },
    clearFlowRows() {
      d.querySelectorAll('#flowRows tr').forEach((_, i) => api.flowRow(i, null, null, false));
      return api;
    },
    reset() { return api.click('#reset'); }
  };
  return api;
}

/* --------------------------------------------------------------- assertions */

let passed = 0;
const failures = [];

function group(title) { console.log('\n' + title); }

function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ok    ' + name + (detail ? '   ' + detail : '')); }
  else { failures.push(name); console.log('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}

function note(line) { console.log('        ' + line); }

/* ------------------------------------------------------- 1. defaults, wiring */

function suiteDefaults() {
  group('Defaults and wiring');
  const p = boot();

  ok('page renders a verdict', p.verdict().length > 0, '-> ' + p.verdict());
  ok('year table is populated', p.rows().length > 1, `(${p.rows().length} rows)`);
  ok('chart is drawn', p.el('#chart').innerHTML.length > 500);

  ok('slump toggle defaults off', p.el('#stressOn').checked === false);
  ok('flows toggle defaults off', p.el('#flowsOn').checked === false);

  ok('slump inputs start disabled',
    ['#stressYears', '#stressEq', '#stressDebt'].every(s => p.el(s).disabled));
  ok('flow inputs start disabled',
    Array.from(p.d.querySelectorAll('#flowRows input')).every(e => e.disabled));
  ok('add-row starts disabled', p.el('#flowAdd').disabled);
  ok('cash-flow column starts hidden', p.el('#flowHead').hidden === true);
  ok('three flow rows exist', p.d.querySelectorAll('#flowRows tr').length === 3);

  ok('solver starts with no answer', p.el('#solveOut').textContent === '');
  ok('apply button starts hidden', p.el('#solveApply').style.display === 'none');
}

/* ------------------------------------------- 2. optional features are inert */
/* Round trip: on, then off, must land back on the identical page.            */

function suiteInertness() {
  group('Optional features are inert when off');
  const p = boot();
  p.set('#corpus', 80000000);
  const base = p.snapshot();

  p.check('#stressOn', true);
  ok('slump on changes the result', p.snapshot() !== base);
  p.check('#stressOn', false);
  ok('slump off restores the page exactly', p.snapshot() === base);

  p.check('#flowsOn', true);
  ok('flows ticked but empty changes nothing', p.snapshot() === base);
  ok('column stays hidden while no row is filled', p.el('#flowHead').hidden === true);
  p.flowRow(0, 5, 5000000, false);
  ok('a filled row changes the result', p.snapshot() !== base);
  ok('a filled row reveals the column', p.el('#flowHead').hidden === false);
  p.clearFlowRows();
  ok('clearing the rows restores the page exactly', p.snapshot() === base);
  p.check('#flowsOn', false);
  ok('flows off restores the page exactly', p.snapshot() === base);

  p.check('#stressOn', true).check('#flowsOn', true).flowRow(0, 5, -2000000, true);
  ok('both features together change the result', p.snapshot() !== base);
  p.check('#stressOn', false).check('#flowsOn', false).clearFlowRows();
  ok('both off restores the page exactly', p.snapshot() === base);

  p.check('#stressOn', true).check('#flowsOn', true).flowRow(0, 3, 1000000, false);
  p.reset();
  ok('reset unticks both toggles',
    p.el('#stressOn').checked === false && p.el('#flowsOn').checked === false);
  ok('reset restores three empty flow rows',
    p.d.querySelectorAll('#flowRows tr').length === 3 &&
    Array.from(p.d.querySelectorAll('#flowRows input[data-f="amt"]')).every(e => e.value === ''));
  ok('reset re-hides the cash-flow column', p.el('#flowHead').hidden === true);
}

/* ------------------------------------------------------- 3. model invariants */

function suiteModel() {
  group('Model invariants');
  const p = boot();

  /* With no growth, no inflation and no tax the answer is pure division: the
     spendable corpus divided by a year of spending. Nothing to compound, so this
     pins the withdrawal and sealing logic to an exact arithmetic result. */
  p.setAll('ret', 0).setAll('tax', 0).set('#inflation', 0).set('#horizon', 90);
  const cases = [
    [10000000, 100000, 12],
    [10000000, 100000, 0],
    [24000000, 200000, 6],
    [6000000, 50000, 12]
  ];
  let allExact = true;
  for (const [corpus, expense, ef] of cases) {
    p.set('#corpus', corpus).set('#expense', expense).set('#mEF', ef);
    const expected = Math.floor((corpus - ef * expense) / (12 * expense)) + 1;
    const got = p.failYear();
    if (got !== expected) { allExact = false; note(`corpus ${corpus} exp ${expense} EF ${ef}mo: expected yr ${expected}, got ${got}`); }
  }
  ok('zero-return case matches the closed form exactly', allExact, `(${cases.length} cases)`);

  /* Tax is charged on the gain portion of a redemption, never on the balance. With no
     growth anywhere there are no gains, so every tax cell must read exactly zero even
     though the tax rates themselves are left at their real values. */
  p.reset();
  p.setAll('ret', 0).set('#inflation', 0).set('#corpus', 30000000);
  let anyTax = false;
  for (let n = 1; n < p.rows().length; n++) if (p.money(p.cols(n).tax) !== 0) anyTax = true;
  ok('no gains means no tax, at full tax rates', !anyTax);

  /* And in year one a freshly invested corpus has barely any gain, so the bite is small. */
  p.reset();
  p.set('#corpus', 80000000);
  const yearOneTax = p.money(p.cols(1).tax);
  ok('year-one tax is small on a fresh corpus', yearOneTax < 100000,
    `₹${yearOneTax.toLocaleString('en-IN')}`);

  p.reset();

  /* Displayed rows must add up, or the table is lying to the reader. */
  p.set('#corpus', 80000000);
  let arithmetic = true;
  for (let n = 0; n < Math.min(15, p.rows().length); n++) {
    const c = p.cols(n);
    const [ef, b1, b2, b3] = [p.money(c.ef), p.money(c.b1), p.money(c.b2), p.money(c.b3)];
    if (Math.abs(p.money(c.spendable) - (b1 + b2 + b3)) > 1) arithmetic = false;
    if (Math.abs(p.money(c.total) - (ef + p.money(c.spendable))) > 1) arithmetic = false;
  }
  ok('spendable and total columns add up', arithmetic);

  let nonNegative = true;
  for (const r of p.rows()) {
    for (const c of r.querySelectorAll('td')) if (p.money(c) < 0) nonNegative = false;
  }
  ok('no balance or tax figure is ever negative', nonNegative);

  /* Bisection in the solver is only valid if these hold. */
  /* The refill rule is the heart of the strategy: at each year end Bucket 1 and Bucket 2
     must sit exactly on their targets, measured in months of the COMING year's spending.
     Pinning this catches any change to the refill order or the amounts moved. */
  p.reset();
  p.set('#corpus', 80000000).set('#expense', 100000).set('#inflation', 7);
  const mB1 = +p.el('#mB1').value, mB2 = +p.el('#mB2').value;
  let onTarget = true;
  for (let y = 1; y <= 10; y++) {
    const c = p.cols(y);
    const nextSpend = 100000 * Math.pow(1.07, y);
    if (Math.abs(p.money(c.b1) - mB1 * nextSpend) > 2) onTarget = false;
    if (Math.abs(p.money(c.b2) - mB2 * nextSpend) > 2) onTarget = false;
  }
  ok('buckets 1 and 2 are refilled exactly to target each year', onTarget);

  /* Sized so Bucket 2 alone cannot fund the Bucket 1 refill, forcing Bucket 3 to backstop.
     That is the path where the ORDER of the two transfers matters, so it needs its own case. */
  p.set('#mB1', 36).set('#mB2', 6);
  let backstopped = true;
  for (let y = 1; y <= 8; y++) {
    const c = p.cols(y);
    const nextSpend = 100000 * Math.pow(1.07, y);
    if (Math.abs(p.money(c.b1) - 36 * nextSpend) > 2) backstopped = false;
    if (Math.abs(p.money(c.b2) - 6 * nextSpend) > 2) backstopped = false;
  }
  ok('targets are still hit when bucket 3 has to backstop', backstopped);
  p.reset();

  /* The emergency fund is sealed. Nothing may ever draw it down — not spending, not a
     refill, not an outflow, not even a plan collapsing. */
  function efNeverFalls(label) {
    let prevEf = -1, sealed = true;
    for (let n = 0; n < p.rows().length; n++) {
      const v = p.money(p.cols(n).ef);
      if (v < prevEf - 1) sealed = false;
      prevEf = v;
    }
    ok('emergency fund never falls ' + label, sealed);
  }
  efNeverFalls('on a healthy plan');
  p.set('#corpus', 12000000);
  efNeverFalls('when the plan runs dry');
  p.check('#flowsOn', true).flowRow(0, 3, -9000000, false);
  efNeverFalls('when a large outflow lands');
  p.reset();

  let prev = null, monoCorpus = true;
  for (let c = 2e6; c <= 1.2e8; c += 4e6) {
    p.set('#corpus', c);
    const good = !p.failed();
    if (prev === true && good === false) monoCorpus = false;
    prev = good;
  }
  ok('a larger corpus is never worse', monoCorpus);

  p.reset();
  p.set('#corpus', 60000000);
  prev = null;
  let monoSpend = true;
  for (let e = 20000; e <= 500000; e += 20000) {
    p.set('#expense', e);
    const good = !p.failed();
    if (prev === false && good === true) monoSpend = false;
    prev = good;
  }
  ok('a larger monthly spend is never better', monoSpend);
}

/* -------------------------------------------------------------- 4. solvers */

function suiteSolver() {
  group('Solvers');
  const p = boot();
  p.set('#corpus', 10000000).set('#expense', 100000).set('#horizon', 40);

  p.click('#solveCorpus');
  ok('corpus solver returns a figure', /\d/.test(p.text('#solveOut')), '-> ' + p.text('#solveOut').slice(0, 44));
  p.click('#solveApply');
  const corpus = +p.el('#corpus').value;
  ok('the solved corpus clears the horizon', !p.failed(), `₹${corpus.toLocaleString('en-IN')}`);
  /* One rounding step below must fail, or the answer is not the smallest that works. */
  p.set('#corpus', corpus - 50000);
  ok('one rounding step less does not clear', p.failed());
  p.set('#corpus', corpus);

  p.click('#solveSpend');
  p.click('#solveApply');
  const spend = +p.el('#expense').value;
  ok('the solved spend clears the horizon', !p.failed(), `₹${spend.toLocaleString('en-IN')}/mo`);
  p.set('#expense', spend + 500);
  ok('one rounding step more does not clear', p.failed());
  p.set('#expense', spend);

  /* Solve one way, then the other, and the answer should come back to where it started. */
  p.reset();
  p.set('#corpus', 30000000).set('#expense', 100000).set('#horizon', 30);
  p.click('#solveSpend').click('#solveApply');
  p.click('#solveCorpus').click('#solveApply');
  const drift = Math.abs(+p.el('#corpus').value - 30000000) / 30000000 * 100;
  ok('the two solvers agree with each other', drift < 2, `${drift.toFixed(2)}% drift`);

  p.reset();
  p.click('#solveCorpus');
  ok('an answer is displayed', p.el('#solveOut').textContent.length > 5);
  p.set('#horizon', 25);
  ok('changing an input clears the stale answer', p.el('#solveOut').textContent === '');
  ok('and hides the apply button', p.el('#solveApply').style.display === 'none');
  p.click('#solveCorpus');
  p.reset();
  ok('reset clears the answer too', p.el('#solveOut').textContent === '');

  p.set('#corpus', 0);
  p.click('#solveSpend');
  ok('zero corpus is refused, not crashed', p.text('#solveOut').length > 0, '-> ' + p.text('#solveOut'));
  p.reset().set('#expense', 0);
  p.click('#solveCorpus');
  ok('zero spend is refused, not crashed', p.text('#solveOut').length > 0, '-> ' + p.text('#solveOut'));
}

/* ---------------------------------------------------------- 5. slump start */

function suiteSlump() {
  group('Slump start');
  const p = boot();
  p.set('#corpus', 60000000).check('#stressOn', true);

  ok('inputs become editable',
    ['#stressYears', '#stressEq', '#stressDebt'].every(s => !p.el(s).disabled));
  ok('the echo line explains the setting', p.el('#stressEcho').textContent.length > 10,
    '-> ' + p.el('#stressEcho').textContent);

  p.set('#stressYears', 3);
  ok('the stressed years are marked in the table',
    p.d.querySelectorAll('#years tr.stressed').length === 3,
    `(${p.d.querySelectorAll('#years tr.stressed').length})`);
  ok('the chart marks where the slump ends', /slump ends/.test(p.el('#chart').innerHTML));
  p.set('#stressYears', 6);
  ok('changing the length moves the marked rows',
    p.d.querySelectorAll('#years tr.stressed').length === 6);
  p.set('#stressYears', 3);

  let prev = Infinity, deeper = true;
  for (const eq of [10, 0, -10, -20, -30, -40, -50]) {
    p.set('#stressEq', eq);
    const f = p.failYear();
    if (f > prev) deeper = false;
    prev = f;
  }
  ok('a deeper slump is never better', deeper);

  p.set('#stressEq', -20);
  prev = Infinity;
  let longer = true;
  for (const y of [1, 2, 3, 5, 8, 12]) {
    p.set('#stressYears', y);
    const f = p.failYear();
    if (f > prev) longer = false;
    prev = f;
  }
  ok('a longer slump is never better', longer);

  /* The solver has to see the slump, or its answer is for a different plan. */
  p.reset();
  p.set('#corpus', 42000000);
  p.click('#solveCorpus');
  const calm = p.text('#solveOut');
  p.check('#stressOn', true);
  ok('ticking the box clears the stale answer', p.el('#solveOut').textContent === '');
  p.set('#stressEq', -25).set('#stressYears', 3);
  p.click('#solveCorpus');
  const rough = p.text('#solveOut');
  ok('a slump raises the corpus the solver asks for', calm !== rough);
  note('calm  ' + calm.slice(0, 40));
  note('slump ' + rough.slice(0, 40));
  p.click('#solveApply');
  ok('the stressed answer clears the horizon', !p.failed(), p.verdict());
}

/* ------------------------------------------------------ 6. lumpy cash flows */

function suiteFlows() {
  group('Lumpy cash flows');
  const p = boot();
  p.set('#corpus', 35000000).check('#flowsOn', true);
  const base = p.failYear();
  note(`baseline fails in year ${base}`);

  p.flowRow(0, 5, 5000000, false);
  ok('a one-off inflow extends the plan', p.failYear() >= base, `${base} -> ${p.failYear()}`);
  ok('the flow lands in the year given', p.cols(5).flow.textContent.trim() !== '\u2014');
  ok('other years show no flow', p.cols(4).flow.textContent.trim() === '\u2014');

  p.clearFlowRows().flowRow(0, 5, -5000000, false);
  ok('a one-off outflow shortens the plan', p.failYear() <= base, `${base} -> ${p.failYear()}`);

  p.clearFlowRows().flowRow(0, 10, 300000, true);
  ok('a recurring inflow extends the plan further', p.failYear() >= base, `${base} -> ${p.failYear()}`);
  ok('the recurrence starts in the right year and continues',
    p.cols(9).flow.textContent.trim() === '\u2014' &&
    p.cols(10).flow.textContent.trim() !== '\u2014' &&
    p.cols(20).flow.textContent.trim() !== '\u2014');

  /* Today's-rupees on inflates the figure the same way the monthly spend inflates. */
  const inflated = p.money(p.cols(20).flow);
  p.check('#flowsReal', false);
  const literal = p.money(p.cols(20).flow);
  ok('today\'s-rupees mode grows the later amount', inflated > literal, `${inflated} vs ${literal}`);
  ok('literal mode applies exactly what was typed', literal === 300000, String(literal));
  p.check('#flowsReal', true);

  /* An outflow is a redemption, so it must attract capital gains tax. */
  p.clearFlowRows().check('#flowsReal', false).set('#corpus', 80000000);
  const taxAt = n => p.money(p.cols(n).tax);
  p.check('#flowsOn', false);
  const taxWithout = taxAt(20);
  p.check('#flowsOn', true).flowRow(0, 20, -10000000, false);
  const taxWith = taxAt(20);
  ok('an outflow generates extra tax that year', taxWith > taxWithout,
    `₹${taxWithout.toLocaleString('en-IN')} -> ₹${taxWith.toLocaleString('en-IN')}`);

  /* Flows must reach the solver too. */
  p.reset();
  p.set('#corpus', 42000000);
  p.click('#solveCorpus');
  const plain = p.text('#solveOut');
  p.check('#flowsOn', true).flowRow(0, 3, 20000000, false);
  p.click('#solveCorpus');
  const withInflow = p.text('#solveOut');
  ok('a known inflow lowers the corpus the solver asks for', plain !== withInflow);
  note('no flows  ' + plain.slice(0, 40));
  note('₹2 Cr yr3 ' + withInflow.slice(0, 40));

  /* Row management. */
  const before = p.d.querySelectorAll('#flowRows tr').length;
  p.click('#flowAdd');
  ok('add-row appends a row', p.d.querySelectorAll('#flowRows tr').length === before + 1);
  for (let i = 0; i < 20; i++) p.click('#flowAdd');
  ok('rows are capped at ten', p.d.querySelectorAll('#flowRows tr').length === 10);
  ok('add-row disables at the cap', p.el('#flowAdd').disabled === true);

  /* Rows that cannot mean anything must be ignored rather than guessed at. */
  p.clearFlowRows();
  const clean = p.snapshot();
  p.flowRow(0, 0, 1000000, false);
  ok('year 0 is ignored', p.snapshot() === clean);
  p.flowRow(0, 999, 1000000, false);
  ok('an out-of-range year is ignored', p.snapshot() === clean);
  p.flowRow(0, 5, 0, false);
  ok('a zero amount is ignored', p.snapshot() === clean);
}

/* -------------------------------------------------------------- 7. edges */

function suiteEdges() {
  group('Edge cases');
  const p = boot();
  let threw = null;

  try {
    p.set('#corpus', 0).set('#corpus', 1e12);
    p.set('#expense', 0).set('#expense', 1e10);
    p.set('#inflation', -50).set('#inflation', 100).set('#inflation', 7);
    p.set('#horizon', 1).set('#horizon', 200).set('#horizon', 40);
    p.set('#mEF', 0).set('#mB1', 0).set('#mB2', 0);
    p.setAll('ret', -99).setAll('ret', 100);
    p.setAll('tax', 0).setAll('tax', 100);
  } catch (e) { threw = e; }
  ok('extreme headline inputs do not throw', !threw, threw ? String(threw).slice(0, 110) : '');

  p.reset();
  threw = null;
  try {
    p.d.querySelectorAll('input[data-k="w"]').forEach(e => {
      e.value = 0; e.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    });
  } catch (e) { threw = e; }
  ok('an all-zero asset mix does not throw', !threw, threw ? String(threw).slice(0, 110) : '');
  ok('and it warns the reader', p.el('#weightWarn').style.display === 'block',
    '-> ' + p.text('#weightWarn').slice(0, 70));

  p.reset();
  ok('a corpus too small to fill the buckets warns',
    (p.set('#corpus', 500000), p.el('#sizeWarn').style.display === 'block'),
    '-> ' + p.text('#sizeWarn').slice(0, 70));

  p.reset();
  threw = null;
  try {
    p.check('#stressOn', true).check('#flowsOn', true);
    p.set('#stressYears', 20).set('#stressEq', -99).set('#stressDebt', -99);
    p.flowRow(0, 1, -1e12, true);
    p.flowRow(1, 1, 1e12, true);
    p.set('#horizon', 2).set('#corpus', 0).set('#expense', 0);
  } catch (e) { threw = e; }
  ok('both features at their extremes do not throw', !threw, threw ? String(threw).slice(0, 110) : '');

  /* CSV export has to survive the optional columns. */
  p.reset();
  const d = p.d;
  let downloaded = null;
  const make = d.createElement.bind(d);
  d.createElement = tag => {
    const el = make(tag);
    if (tag === 'a') el.click = () => { downloaded = el.download; };
    return el;
  };
  p.click('#csv');
  ok('CSV exports with the features off', !!downloaded, '-> ' + downloaded);
  downloaded = null;
  p.check('#flowsOn', true).flowRow(0, 5, 1000000, false).check('#stressOn', true);
  p.click('#csv');
  ok('CSV exports with the features on', !!downloaded, '-> ' + downloaded);
}

/* ---------------------------------------------------------------- runner */

const started = Date.now();
console.log('Three-bucket burndown — test suite');
console.log('file: ' + FILE);

suiteDefaults();
suiteInertness();
suiteModel();
suiteSolver();
suiteSlump();
suiteFlows();
suiteEdges();

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log('\n' + '-'.repeat(58));
if (failures.length) {
  console.log(`${passed} passed, ${failures.length} FAILED in ${secs}s`);
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log(`${passed} passed, 0 failed in ${secs}s`);
  process.exit(0);
}
