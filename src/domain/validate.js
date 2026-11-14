// Validation helpers for ingredient / recipe forms (pure functions).

import { MODES, UNITS, parseNonNegative, isValidNonNegativeNumber } from './constants.js';

/**
 * Validate ingredient form input (raw strings from the UI).
 * @returns {{ok:boolean, errors:Object, value?:object}}
 */
export function validateIngredient({ name, mode, kcal, p, f, c }) {
  const errors = {};
  const nm = (name || '').trim();
  if (!nm) errors.name = 'Укажите название';
  if (!Object.values(MODES).includes(mode)) errors.mode = 'Выберите тип';

  const kcalNum = parseNonNegative(kcal);
  if (kcalNum === undefined) errors.kcal = 'Калорийность — число ≥ 0';
  // kcal is optional in the form; missing => treated as 0 on save (see DECISIONS.md)

  const nutrients = {};
  for (const [key, raw] of [['p', p], ['f', f], ['c', c]]) {
    const n = parseNonNegative(raw);
    if (n === undefined) {
      nutrients[key] = errors[key] = 'Значение — число ≥ 0';
    } else if (n !== null) {
      nutrients[key] = n;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    errors,
    value: { name: nm, mode, kcal: kcalNum === null ? 0 : kcalNum, n: nutrients }
  };
}

/**
 * Validate a full recipe draft.
 * @param {object} draft - {name, items:[{ingredientId, qty, unit}], portions, weight, text}
 * @param {Map|object} ingredientsById
 */
export function validateRecipe(draft, ingredientsById) {
  const errors = {};
  const name = (draft.name || '').trim();
  if (!name) errors.name = 'Укажите название рецепта';

  const getIng = (id) => (ingredientsById instanceof Map ? ingredientsById.get(id) : ingredientsById[id]);

  const seen = new Set();
  (draft.items || []).forEach((it, i) => {
    const ing = getIng(it.ingredientId);
    if (!ing) {
      errors[`item_${i}`] = 'Ингредиент не найден';
      return;
    }
    if (seen.has(it.ingredientId)) {
      errors[`item_${i}`] = `«${ing.name}» уже добавлен`;
      return;
    }
    seen.add(it.ingredientId);

    const qty = parseNonNegative(it.qty);
    if (qty === undefined) {
      errors[`item_${i}`] = 'Количество — число ≥ 0';
    } else if (qty !== null && it.unit === UNITS.PC && ing.mode !== MODES.PER_PIECE) {
      errors[`item_${i}`] = 'Штучная единица для весового ингредиента';
    } else if (qty !== null && it.unit !== UNITS.PC && ing.mode === MODES.PER_PIECE) {
      errors[`item_${i}`] = 'Для штучного ингредиента используйте «шт»';
    }
  });

  const portions = parseNonNegative(draft.portions);
  if (portions === undefined) errors.portions = 'Порции — число ≥ 0 или пусто';
  const weight = parseNonNegative(draft.weight);
  if (weight === undefined) errors.weight = 'Вес — число ≥ 0 или пусто';

  return { ok: Object.keys(errors).length === 0, errors, name, portions, weight };
}

export { isValidNonNegativeNumber };
