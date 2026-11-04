/** Seeded pseudo-random number generation and masked, weighted index selection. */

/** Deterministic pseudo-random number generator (mulberry32). */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Reseed. */
  seed(value: number | string): void;
  /** Current internal state. */
  state(): number;
}

/**
 * Converts a seed to an unsigned 32-bit value. Numbers use JavaScript's uint32
 * coercion; strings use FNV-1a over their UTF-16 code units.
 */
export function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  // FNV-1a over the string
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Creates a mulberry32 generator with independent state, using the current time
 * when no seed is supplied. Seeds with the same hash produce the same sequence;
 * reseeding resets that sequence, while reading the state does not advance it.
 */
export function createRng(seed: number | string = Date.now()): Rng {
  let a = hashSeed(seed);
  return {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) {
      return Math.floor(this.next() * n);
    },
    seed(value) {
      a = hashSeed(value);
    },
    state() {
      return a >>> 0;
    },
  };
}

/**
 * Pick an index with probability proportional to `weights[i]`, considering only
 * indices where `mask(i)` is true. `r` is a uniform random in [0, 1).
 */
export function weightedPick(weights: ArrayLike<number>, mask: (i: number) => boolean, r: number): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) if (mask(i)) total += weights[i];
  let x = r * total;
  for (let i = 0; i < weights.length; i++) {
    if (!mask(i)) continue;
    x -= weights[i];
    if (x <= 0) return i;
  }
  for (let i = weights.length - 1; i >= 0; i--) if (mask(i)) return i;
  return -1;
}
