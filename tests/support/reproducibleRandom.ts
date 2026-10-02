import { TEXT_COSTLIER_IN_JSON } from "./jsonText";

export function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function reproducibleShapes(seed: number, plainText: string) {
  const next = seededRandom(seed);
  const pick = (max: number) => Math.floor(next() * max);
  const text = (max: number) => {
    const length = pick(max);
    const source = next() < 0.3 ? TEXT_COSTLIER_IN_JSON : plainText;
    return source.repeat(Math.ceil(length / source.length) + 1).slice(0, length);
  };
  return { next, pick, text };
}
