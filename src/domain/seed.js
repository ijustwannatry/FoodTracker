// Seed data for the first launch (idempotent: matched by exact name).

export const SEED_INGREDIENTS = [
  { name: 'Вода', mode: 'per100g', kcal: 0, n: { p: 0, f: 0, c: 0 } },
  { name: 'Яйцо куриное', mode: 'perPiece', kcal: 78, n: { p: 12.7, f: 10.6, c: 0.7 } },
  { name: 'Молоко 2,5%', mode: 'per100g', kcal: 52, n: { p: 2.9, f: 3.3, c: 4.7 } },
  { name: 'Мука пшеничная', mode: 'per100g', kcal: 342, n: { p: 10.7, f: 1.3, c: 70.9 } },
  { name: 'Сахар-песок', mode: 'per100g', kcal: 387, n: { p: 0, f: 0, c: 99.7 } },
  { name: 'Масло сливочное', mode: 'per100g', kcal: 748, n: { p: 0.5, f: 82.5, c: 0.8 } }
];

/**
 * Merge seed list into an existing catalog (by exact trimmed name).
 * Returns only ingredients that are missing and should be added. Pure function.
 */
export function planSeed(existingIngredients) {
  const have = new Set((existingIngredients || []).map((i) => i.name));
  return SEED_INGREDIENTS.filter((s) => !have.has(s.name)).map((s) => ({ ...s, n: { ...s.n } }));
}
