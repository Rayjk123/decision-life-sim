// Credit score model (iteration 8): every factor moves the score the way real scores do, within 300-850.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditScoreFor } from '../src/index.ts';

const clean = { historyPenalty: 0, cardBalance: 0, cardLimit: 2_000_000, nonMortgageDebt: 0, annualIncome: 8_000_000, monthsOfHistory: 300, pastDueNow: false, inBankruptcy: false };
const score = (over: Partial<typeof clean>) => creditScoreFor({ ...clean, ...over });

test('a long, clean, low-debt history scores high; a thin file starts near 700', () => {
  assert.ok(score({}) >= 820);
  assert.ok(score({ monthsOfHistory: 6 }) <= 710 && score({ monthsOfHistory: 6 }) >= 680);
  assert.ok(score({ monthsOfHistory: 6 }) < score({ monthsOfHistory: 60 }) && score({ monthsOfHistory: 60 }) < score({}));
});

test('each factor lowers the score: utilization, debt load, missed payments, past due now', () => {
  assert.ok(score({ cardBalance: 1_800_000 }) < score({ cardBalance: 500_000 }) && score({ cardBalance: 500_000 }) < score({}));
  assert.ok(score({ nonMortgageDebt: 16_000_000 }) < score({ nonMortgageDebt: 2_000_000 }));
  assert.ok(score({ historyPenalty: 180 }) < score({ historyPenalty: 60 }));
  assert.equal(score({ pastDueNow: true }), score({}) - 40);
});

test('bankruptcy caps the score, and the range is 300-850 whatever the inputs', () => {
  assert.ok(score({ inBankruptcy: true }) <= 560);
  assert.equal(score({ historyPenalty: 10_000, cardBalance: 9e9, nonMortgageDebt: 9e9, monthsOfHistory: 0, pastDueNow: true }), 300);
  assert.ok(score({ annualIncome: 0, nonMortgageDebt: 1 }) >= 300);
});
