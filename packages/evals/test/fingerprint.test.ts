// Iteration 12: the golden requests are fingerprinted so a change to what the model sees can't silently
// invalidate the published model results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FINGERPRINT_FILE, fingerprintDrift, goldenFingerprint, STYLES } from '../src/fingerprint.ts';

test('fingerprint covers every scenario and pair variant in every style, deterministically', () => {
  const a = goldenFingerprint(), b = goldenFingerprint();
  assert.deepEqual(a, b);
  assert.equal(Object.keys(a).length, 48 * STYLES.length);
});

test('drift lists changed, added and removed requests', () => {
  assert.deepEqual(fingerprintDrift({ x: '1', y: '2' }, { x: '1', y: '2' }), []);
  assert.deepEqual(fingerprintDrift({ x: '1', y: '3', z: '9' }, { x: '1', y: '2', w: '0' }), ['w', 'y', 'z']);
});

test('the recorded fingerprint matches the current golden requests', () => {
  const recorded = JSON.parse(readFileSync(FINGERPRINT_FILE, 'utf8'));
  assert.deepEqual(fingerprintDrift(goldenFingerprint(), recorded), []);
});
