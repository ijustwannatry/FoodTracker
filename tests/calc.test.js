import { describe, it, expect } from 'vitest';
import { itemKcal, totalKcal, kcalPerPortion, kcalPer100g, summarize } from '../src/domain/calc.js';
import { MODES, UNITS } from '../src/domain/constants.js';

const egg = { mode: MODES.PER_PIECE, kcal: 78 };
const flour = { mode: MODES.PER_100G, kcal: 250 };

describe('control examples from spec section 3', () => {
  it('3 eggs x 78 kcal/pc = 234', () => {
    expect(itemKcal({ qty: 3, unit: UNITS.PC }, egg)).toBe(234);
  });

  it('200 g x 250 kcal/100g = 500', () => {
    expect(itemKcal({ qty: 200, unit: UNITS.G }, flour)).toBe(500);
  });

  it('total 460, 3 portions -> 154 (ceil of 153.33)', () => {
    expect(kcalPerPortion(460, 3)).toBe(154);
  });

  it('total 460, weight 350 g -> 132 per 100 g (ceil of 131.43)', () => {
    expect(kcalPer100g(460, 350)).toBe(132);
  });

  it('omlet-like recipe: eggs + flour totals 734, ceil display', () => {
    const items = [
      { ingredientId: 'egg', qty: 3, unit: UNITS.PC },
      { ingredientId: 'flour', qty: 200, unit: UNITS.G }
    ];
    const lookup = { egg, flour };
    expect(totalKcal(items, lookup)).toBe(734);
  });
});

describe('edge rules', () => {
  it('ml uses per-100 value like g', () => {
    expect(itemKcal({ qty: 50, unit: UNITS.ML }, { mode: MODES.PER_100G, kcal: 52 })).toBe(26);
  });

  it('missing ingredient counts as 0 and does not crash', () => {
    const items = [
      { ingredientId: 'ghost', qty: 100, unit: UNITS.G },
      { ingredientId: 'egg', qty: 2, unit: UNITS.PC }
    ];
    expect(() => totalKcal(items, {})).not.toThrow();
    expect(totalKcal(items, {})).toBe(0);
    expect(totalKcal(items, { egg })).toBe(156);
  });

  it('zero values are allowed everywhere (water 0 kcal, qty 0)', () => {
    expect(itemKcal({ qty: 0, unit: UNITS.G }, { mode: MODES.PER_100G, kcal: 0 })).toBe(0);
    expect(itemKcal({ qty: 250, unit: UNITS.ML }, { mode: MODES.PER_100G, kcal: 0 })).toBe(0);
  });

  it('negative / non-numeric / non-finite qty -> 0, no crash', () => {
    expect(itemKcal({ qty: -5, unit: UNITS.G }, flour)).toBe(0);
    expect(itemKcal({ qty: NaN, unit: UNITS.G }, flour)).toBe(0);
    expect(itemKcal({ qty: Infinity, unit: UNITS.G }, flour)).toBe(0);
    expect(itemKcal({ qty: '100', unit: UNITS.G }, flour)).toBe(0);
  });

  it('portions <= 0 or empty -> no per-portion value; weight likewise', () => {
    expect(kcalPerPortion(460, 0)).toBeNull();
    expect(kcalPerPortion(460, null)).toBeNull();
    expect(kcalPer100g(460, 0)).toBeNull();
    expect(kcalPer100g(460, undefined)).toBeNull();
  });

  it('both portions and weight filled -> both values shown', () => {
    const s = summarize(460, 3, 350);
    expect(s).toEqual({ totalDisplay: 460, perPortion: 154, per100: 132 });
  });

  it('total is displayed rounded up to integer', () => {
    expect(summarize(459.2, null, null).totalDisplay).toBe(460);
    expect(summarize(460, null, null).totalDisplay).toBe(460);
  });

  it('per-portion rounds up (ceil), not nearest', () => {
    expect(kcalPerPortion(100, 3)).toBe(34); // 33.33 -> 34
  });
});
