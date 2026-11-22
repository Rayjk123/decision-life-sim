import type { Decider } from '@dls/sim-core';

/** Uniform over legal moves: the floor any real decider must beat. */
export const randomDecider: Decider = {
  name: 'random',
  async decide(req) {
    const p = 1 / req.moves.length;
    return {
      answers: {
        main: Object.fromEntries(req.moves.map((m) => [m.id, p])),
        investShare: { '0': 0.2, '1': 0.2, '2': 0.2, '3': 0.2, '4': 0.2 },
        retire: req.askRetire ? 0.5 : undefined,
        spendLevel: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 0.1])),
      },
      provider: 'random', latencyMs: 0, tokens: 0,
    };
  },
};
