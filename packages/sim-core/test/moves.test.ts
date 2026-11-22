// Unit tests for rules, moves, picking, triggers and the model's state text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMove, buildQuestions, buildState, createWorld, decisionReason, expectedLevel, isFullTimeBusiness, k, legalMoves,
  BUSINESS, sample, sharpen, spawnSim, stableHash, type Sim, type World,
} from '../src/index.ts';

function setup(over: Partial<Sim> = {}): { w: World; s: Sim } {
  const w = createWorld(21, 10);
  w.month = 400;
  const s = spawnSim(w, 400 - 16 * 12); // 34 years old
  Object.assign(s, { career: 'nurse', employed: true, salary: k(85), cash: k(60), index: k(10), loans: [], assets: [], flows: {}, creditScore: 740, archetype: 'balanced' }, over);
  w.sims = [s];
  return { w, s };
}

test('buy_home creates the home and mortgage, and sells investments when cash is short', () => {
  const { w, s } = setup({ cash: k(15), index: k(60) });
  const mv = legalMoves(s, w).find((m) => m.id === 'buy_home');
  assert.ok(mv, 'buy_home should be legal with investments to sell');
  const { valid } = applyMove(w, s, mv!, 2);
  assert.ok(valid);
  assert.equal(s.assets.filter((a) => a.kind === 'home').length, 1);
  assert.ok(s.loans.some((l) => l.kind === 'mortgage'));
  assert.ok(s.index < k(60), 'some investments were sold for the down payment');
  assert.ok(s.flows.down_payment! < 0 && s.flows.closing_costs! < 0 && s.flows.sell_investments! > 0);
  assert.equal(applyMove(w, s, mv!, 2).valid, false, 'a second home is rejected');
});

test('selling a rental moves the tenant out and pays off the loan', () => {
  const { w, s } = setup({ cash: k(80) });
  const tenant = spawnSim(w, 300);
  w.sims.push(tenant);
  applyMove(w, s, legalMoves(s, w).find((m) => m.id === 'buy_rental')!, 2);
  const unit = s.assets.find((a) => a.kind === 'rental')!;
  unit.tenantId = tenant.id; tenant.rentsUnit = unit.id; tenant.landlordId = s.id; tenant.unitRent = unit.rent;
  const sell = legalMoves(s, w).find((m) => m.id === 'sell_rental')!;
  assert.ok(applyMove(w, s, sell, 2).valid);
  assert.equal(tenant.rentsUnit, undefined);
  assert.ok(!s.loans.some((l) => l.assetId === unit.id));
  assert.ok(!s.assets.some((a) => a.kind === 'rental'));
});

test('pay_debt pays the highest-rate loan first', () => {
  const { w, s } = setup({ cash: k(40) });
  s.loans.push({ id: 'card', kind: 'card', balance: k(5), annualRate: 0.24, payment: 0 });
  s.loans.push({ id: 'student', kind: 'student', balance: k(20), annualRate: 0.05, payment: k(0.2) });
  applyMove(w, s, legalMoves(s, w).find((m) => m.id === 'pay_debt')!, 0); // 10% of spare cash
  const card = s.loans.find((l) => l.id === 'card');
  const student = s.loans.find((l) => l.id === 'student')!;
  assert.ok((card?.balance ?? 0) < k(5), 'card paid first');
  assert.equal(student.balance, k(20), 'student loan untouched until the card is gone');
});

test('a full-time business means quitting the job; a side hustle does not', () => {
  assert.ok(!isFullTimeBusiness(BUSINESS.snack_cart));
  assert.ok(isFullTimeBusiness(BUSINESS.coffee));
  const a = setup({ cash: k(200) });
  applyMove(a.w, a.s, { id: 'start_coffee', kind: 'start_business', businessType: 'coffee', description: '' }, 2);
  assert.equal(a.s.employed, false);
  assert.equal(a.s.selfEmployed, true);
  const b = setup({ cash: k(200) });
  applyMove(b.w, b.s, { id: 'start_snack_cart', kind: 'start_business', businessType: 'snack_cart', description: '' }, 2);
  assert.equal(b.s.employed, true);
});

test('quitting for a business needs six months of runway on top of the startup cash', () => {
  const { w, s } = setup({ cash: k(30), index: 0 });
  const offered = legalMoves(s, w).filter((m) => m.kind === 'start_business').map((m) => m.businessType!);
  for (const key of offered) assert.ok(!isFullTimeBusiness(BUSINESS[key]) || BUSINESS[key].startup < k(5), `${key} offered without runway`);
});

test('car price is capped at half of annual income', () => {
  const { w, s } = setup({ salary: k(30), cash: k(30), archetype: 'status' });
  s.traits.status = 1;
  const car = legalMoves(s, w).find((m) => m.kind === 'buy_car');
  if (car) assert.ok(car.price! <= k(15), `car ${car.price} too expensive for a $30k income`);
});

test('nothing but "nothing" is legal while missing payments or in school', () => {
  const { w, s } = setup();
  s.missedPayments = 1;
  assert.deepEqual(legalMoves(s, w).map((m) => m.id), ['nothing']);
  const student = setup({ career: 'doctor' });
  student.s.birthMonth = student.w.month - 20 * 12;
  student.s.employed = false; student.s.salary = 0;
  assert.deepEqual(legalMoves(student.s, student.w).map((m) => m.id), ['nothing']);
});

test('sharpen concentrates probability as temperature drops; sample is deterministic', () => {
  const p = { a: 0.5, b: 0.3, c: 0.2 };
  const sharp = sharpen(p, 0.4);
  assert.ok(sharp.a > 0.5 && sharp.c < 0.2);
  assert.ok(Math.abs(Object.values(sharp).reduce((x, y) => x + y, 0) - 1) < 1e-9);
  assert.equal(sample(p, 0.49), 'a');
  assert.equal(sample(p, 0.51), 'b');
  assert.equal(sample(p, 0.99), 'c');
  assert.equal(expectedLevel({ '0': 0, '1': 0.5, '2': 0.5 }), 2);
  assert.equal(expectedLevel(undefined, 3), 3);
});

test('quarterly reviews are staggered: about a third of sims each month, never students', () => {
  const w = createWorld(22, 10);
  w.month = 400;
  let due = 0;
  for (let i = 0; i < 300; i++) {
    const s = spawnSim(w, 100);
    s.lastDecisionMonth = 399;
    if (decisionReason(s, w, [], 'events') === 'quarterly review') due++;
  }
  assert.ok(due > 70 && due < 130, `${due} of 300`);
  const student = spawnSim(w, 400);
  student.career = 'doctor';
  assert.equal(decisionReason(student, w, [], 'events'), null);
  assert.equal(typeof stableHash('x'), 'number');
});

test('state styles: words has persona and trait levels, numbers has decimals, terse drops the persona', () => {
  const { w, s } = setup();
  const words = buildState(s, w, 'words');
  const numbers = buildState(s, w, 'numbers');
  const terse = buildState(s, w, 'terse');
  assert.equal(words.personality, s.persona);
  assert.match(String(words.traits), /risk taking (low|medium|high)/);
  assert.match(String(numbers.traits), /risk 0\.\d/);
  assert.equal(terse.personality, undefined);
  assert.match(String(terse.who), /Balanced/);
});

test('questions list every legal move with its description, and only ask retirement when allowed', () => {
  const { w, s } = setup();
  const moves = legalMoves(s, w);
  const q = buildQuestions(s, moves, false) as any;
  assert.deepEqual(Object.keys(q.main.criteria), moves.map((m) => m.id));
  assert.equal(q.main.criteria.nothing, 'Change nothing this month');
  assert.equal(q.retire, undefined);
  assert.equal((buildQuestions(s, moves, true) as any).retire.type, 'noul');
});
