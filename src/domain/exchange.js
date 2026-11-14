// Exchange format (de)serialization — section 5 of the spec. Pure functions.

import { UNITS, MODES, FORMAT_VERSION, isValidNonNegativeNumber } from './constants.js';

/**
 * Serialize a recipe to the exchange JSON string.
 * @param {object} recipe - internal recipe {name, items:[{ingredient, qty, unit}], portions, weight, text}
 *   where `ingredient` is the full ingredient object {name, mode, kcal, n}.
 */
export function serializeRecipe(recipe) {
  const payload = {
    v: FORMAT_VERSION,
    type: 'recipe',
    name: recipe.name,
    items: (recipe.items || []).map((it) => {
      const ing = it.ingredient;
      const row = [ing.name, it.qty, it.unit, ing.kcal];
      if (ing.n && Object.keys(ing.n).length > 0) row.push(ing.n);
      return row;
    }),
    portions: isValidNonNegativeNumber(recipe.portions) ? recipe.portions : null,
    weight: isValidNonNegativeNumber(recipe.weight) ? recipe.weight : null,
    text: recipe.text || ''
  };
  return JSON.stringify(payload);
}

/** Serialize a catalog payload with one or more ingredients. */
export function serializeCatalog(ingredients) {
  const payload = {
    v: FORMAT_VERSION,
    type: 'catalog',
    ingredients: ingredients.map((ing) => {
      const o = { name: ing.name, mode: ing.mode, kcal: ing.kcal };
      if (ing.n && Object.keys(ing.n).length > 0) o.n = ing.n;
      return o;
    })
  };
  return JSON.stringify(payload);
}

/** Parse any supported payload. Throws Error with a human-readable (RU) message. */
export function parsePayload(text) {
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    throw new Error('Некорректный JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Неизвестный формат данных');
  }
  if (data.v !== FORMAT_VERSION) throw new Error(`Неизвестная версия формата: ${data.v}`);
  if (data.type === 'recipe') return validateRecipePayload(data);
  if (data.type === 'catalog') return validateCatalogPayload(data);
  throw new Error(`Неизвестный тип данных: ${data.type}`);
}

function validateRecipePayload(data) {
  if (typeof data.name !== 'string' || !data.name.trim()) throw new Error('Рецепт: отсутствует название');
  if (!Array.isArray(data.items)) throw new Error('Рецепт: отсутствует список ингредиентов');
  const items = [];
  data.items.forEach((row, i) => {
    if (!Array.isArray(row) || row.length < 4 || row.length > 5) {
      throw new Error(`Позиция ${i + 1}: неверный формат`);
    }
    const [name, qty, unit, kcal, n] = row;
    if (typeof name !== 'string' || !name.trim()) throw new Error(`Позиция ${i + 1}: имя ингредиента отсутствует`);
    if (!isValidNonNegativeNumber(qty)) throw new Error(`Позиция «${name}»: количество должно быть числом ≥ 0`);
    if (![UNITS.G, UNITS.ML, UNITS.PC].includes(unit)) throw new Error(`Позиция «${name}»: неизвестная единица «${unit}»`);
    if (!isValidNonNegativeNumber(kcal)) throw new Error(`Позиция «${name}»: ккал должно быть числом ≥ 0`);
    let nutrients = null;
    if (n !== undefined) {
      if (!n || typeof n !== 'object' || Array.isArray(n)) throw new Error(`Позиция «${name}»: нутриенты должны быть объектом`);
      nutrients = {};
      for (const key of ['p', 'f', 'c']) {
        if (n[key] !== undefined && n[key] !== null) {
          if (!isValidNonNegativeNumber(n[key])) throw new Error(`Позиция «${name}»: нутриент «${key}» должен быть числом ≥ 0`);
          nutrients[key] = n[key];
        }
      }
      // Unknown future nutrient keys are preserved as-is (extensible structure).
      for (const key of Object.keys(n)) {
        if (!(key in nutrients)) {
          if (!isValidNonNegativeNumber(n[key])) throw new Error(`Позиция «${name}»: нутриент «${key}» должен быть числом ≥ 0`);
          nutrients[key] = n[key];
        }
      }
    }
    items.push({ name: name.trim(), qty, unit, kcal, n: nutrients });
  });
  const portions = data.portions === null || data.portions === undefined
    ? null
    : (isValidNonNegativeNumber(data.portions) ? data.portions : (() => { throw new Error('Порции должны быть числом ≥ 0 или null'); })());
  const weight = data.weight === null || data.weight === undefined
    ? null
    : (isValidNonNegativeNumber(data.weight) ? data.weight : (() => { throw new Error('Вес должен быть числом ≥ 0 или null'); })());
  const text = typeof data.text === 'string' ? data.text : '';
  return { v: FORMAT_VERSION, type: 'recipe', name: data.name.trim(), items, portions, weight, text };
}

function validateCatalogPayload(data) {
  if (!Array.isArray(data.ingredients)) throw new Error('Справочник: отсутствует список ингредиентов');
  const ingredients = [];
  data.ingredients.forEach((o, i) => {
    if (!o || typeof o !== 'object') throw new Error(`Ингредиент ${i + 1}: неверный формат`);
    if (typeof o.name !== 'string' || !o.name.trim()) throw new Error(`Ингредиент ${i + 1}: имя отсутствует`);
    if (!Object.values(MODES).includes(o.mode)) throw new Error(`«${o.name}»: неизвестный тип «${o.mode}»`);
    if (!isValidNonNegativeNumber(o.kcal)) throw new Error(`«${o.name}»: ккал должно быть числом ≥ 0`);
    const n = {};
    if (o.n && typeof o.n === 'object') {
      for (const key of Object.keys(o.n)) {
        const val = o.n[key];
        if (val !== null && val !== undefined) {
          if (!isValidNonNegativeNumber(val)) throw new Error(`«${o.name}»: нутриент «${key}» должен быть числом ≥ 0`);
          n[key] = val;
        }
      }
    }
    ingredients.push({ name: o.name.trim(), mode: o.mode, kcal: o.kcal, n: Object.keys(n).length ? n : null });
  });
  return { v: FORMAT_VERSION, type: 'catalog', ingredients };
}
