// Pure calculation rules (section 3 of the spec). No DOM, no storage.

import { UNITS, isValidNonNegativeNumber } from './constants.js';

/**
 * Calories for a single recipe line.
 * - "pc"  -> qty * kcalPerPiece
 * - "g"/"ml" -> qty / 100 * kcalPer100
 * A missing ingredient (undefined/null) counts as 0 kcal and must never crash.
 * @param {{qty:number, unit:string}} item
 * @param {{mode:string, kcal:number}|null|undefined} ingredient
 */
export function itemKcal(item, ingredient) {
  if (!ingredient || !isValidNonNegativeNumber(item.qty)) return 0;
  const kcal = isValidNonNegativeNumber(ingredient.kcal) ? ingredient.kcal : 0;
  if (item.unit === UNITS.PC) return item.qty * kcal;
  return (item.qty / 100) * kcal;
}

/** Total dish calories = sum over items (raw, unrounded). */
export function totalKcal(items, ingredientLookup) {
  let sum = 0;
  for (const it of items || []) {
    const ing = typeof ingredientLookup === 'function' ? ingredientLookup(it.ingredientId) : ingredientLookup[it.ingredientId];
    sum += itemKcal(it, ing || null);
  }
  return sum;
}

/** Kcal per portion = Math.ceil(total / portions), shown only when portions > 0. */
export function kcalPerPortion(total, portions) {
  if (!isValidNonNegativeNumber(portions) || portions <= 0) return null;
  return Math.ceil(total / portions);
}

/** Kcal per 100 g = Math.ceil(total / weight * 100), shown only when weight > 0. */
export function kcalPer100g(total, weight) {
  if (!isValidNonNegativeNumber(weight) || weight <= 0) return null;
  return Math.ceil((total / weight) * 100);
}

/**
 * Full summary for display: raw total is rounded up with Math.ceil for display.
 * Returns { totalDisplay, perPortion, per100 }.
 */
export function summarize(total, portions, weight) {
  return {
    totalDisplay: Math.ceil(total),
    perPortion: kcalPerPortion(total, portions),
    per100: kcalPer100g(total, weight)
  };
}
