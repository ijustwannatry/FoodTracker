import { describe, it, expect } from 'vitest';
import { validateIngredient, validateRecipe } from '../src/domain/validate.js';
import { parseNonNegative } from '../src/domain/constants.js';
import { planSeed, SEED_INGREDIENTS } from '../src/domain/seed.js';

describe('numeric parsing', () => {
  it('accepts zero and decimals; rejects negatives, garbage, non-finite', () => {
    expect(parseNonNegative('0')).toBe(0);
    expect(parseNonNegative('12.5')).toBe(12.5);
    expect(parseNonNegative('12,5')).toBe(12.5);
    expect(parseNonNegative('')).toBeNull();
    expect(parseNonNegative('-1')).toBeUndefined();
    expect(parseNonNegative('abc')).toBeUndefined();
    expect(parseNonNegative('Infinity')).toBeUndefined();
  });
});

describe('ingredient validation', () => {
  it('name and mode required, everything else optional', () => {
    const r = validateIngredient({ name: ' Вода ', mode: 'per100g' });
    expect(r.ok).toBe(true);
    expect(r.value.name).toBe('Вода');
    expect(r.value.kcal).toBe(0); // missing kcal treated as 0 (DECISIONS.md)
    expect(validateIngredient({ name: '', mode: 'per100g' }).errors.name).toBeTruthy();
    expect(validateIngredient({ name: 'x', mode: 'weird' }).errors.mode).toBeTruthy();
  });

  it('nutrients must be numbers >= 0 when provided', () => {
    expect(validateIngredient({ name: 'x', mode: 'per100g', p: '-2' }).errors.p).toBeTruthy();
    expect(validateIngredient({ name: 'x', mode: 'per100g', p: '0', f: '', c: '' }).ok).toBe(true);
  });
});

describe('recipe validation', () => {
  const ings = new Map([
    ['e1', { id: 'e1', name: 'Яйцо', mode: 'perPiece' }],
    ['m1', { id: 'm1', name: 'Молоко', mode: 'per100g' }]
  ]);

  it('rejects empty name', () => {
    expect(validateRecipe({ name: ' ', items: [] }, ings).errors.name).toBeTruthy();
  });

  it('protects against duplicate ingredient lines', () => {
    const r = validateRecipe(
      { name: 'X', items: [{ ingredientId: 'e1', qty: '1', unit: 'pc' }, { ingredientId: 'e1', qty: '2', unit: 'pc' }] },
      ings
    );
    expect(r.errors.item_1).toMatch(/уже добавлен/);
  });

  it('enforces unit vs ingredient type consistency', () => {
    const bad = validateRecipe({ name: 'X', items: [{ ingredientId: 'e1', qty: '100', unit: 'g' }] }, ings);
    expect(bad.errors.item_0).toBeTruthy();
    const good = validateRecipe({ name: 'X', items: [{ ingredientId: 'm1', qty: '100', unit: 'ml' }] }, ings);
    expect(good.ok).toBe(true);
  });

  it('allows empty quantities and empty portions/weight', () => {
    const r = validateRecipe({ name: 'X', items: [{ ingredientId: 'e1', qty: '', unit: 'pc' }], portions: '', weight: '' }, ings);
    expect(r.ok).toBe(true);
  });

  it('rejects negative portions/weight', () => {
    expect(validateRecipe({ name: 'X', items: [], portions: '-3' }, ings).errors.portions).toBeTruthy();
    expect(validateRecipe({ name: 'X', items: [], weight: '-3' }, ings).errors.weight).toBeTruthy();
  });
});

describe('first-run seeding is idempotent', () => {
  it('plans all seeds on empty catalog, none when all present', () => {
    expect(planSeed([]).length).toBe(SEED_INGREDIENTS.length);
    expect(planSeed(SEED_INGREDIENTS).length).toBe(0);
    const water = SEED_INGREDIENTS.find((i) => i.name === 'Вода');
    const egg = SEED_INGREDIENTS.find((i) => i.mode === 'perPiece');
    expect(water.kcal).toBe(0);
    expect(egg && egg.n && egg.n.p).toBeGreaterThan(0);
  });
});
