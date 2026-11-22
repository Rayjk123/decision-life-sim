// Pure helpers for scripts/verify.ts, kept separate so they can be unit-tested.

export interface Leak { file: string; line: number; kind: string; text: string }

// Things that must never land in this public repo. LAN addresses are written as `<ollama-host>` in docs.
const LEAK_PATTERNS: Array<[string, RegExp]> = [
  ['private LAN address', /\b(?:192\.168|10\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['API key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

export function scanForLeaks(files: Record<string, string>): Leak[] {
  const out: Leak[] = [];
  for (const [file, text] of Object.entries(files)) {
    text.split('\n').forEach((line, i) => {
      for (const [kind, re] of LEAK_PATTERNS) if (re.test(line)) out.push({ file, line: i + 1, kind, text: line.trim().slice(0, 120) });
    });
  }
  return out;
}

// node --test prints a TAP summary: "# tests 37", "# pass 37", "# fail 0" ...
export function parseTestSummary(tap: string): { tests: number; pass: number; fail: number } | null {
  const num = (k: string) => { const m = tap.match(new RegExp(`^# ${k} (\\d+)$`, 'm')); return m ? Number(m[1]) : NaN; };
  const r = { tests: num('tests'), pass: num('pass'), fail: num('fail') };
  return Object.values(r).some(Number.isNaN) ? null : r;
}

// A metric regresses when it falls below its recorded baseline by more than the tolerance.
export function regressions(actual: Record<string, number>, baseline: Record<string, number>, tolerance = 0.005): string[] {
  return Object.entries(baseline)
    .filter(([k, b]) => !(k in actual) || actual[k] < b - tolerance)
    .map(([k, b]) => `${k}: ${k in actual ? actual[k].toFixed(3) : 'missing'} < baseline ${b.toFixed(3)}`);
}
