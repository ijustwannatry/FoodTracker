// Import mapping rules (section 5). Pure: existing data in, plan out; no storage access.

import { MODES, UNITS } from './constants.js';

const WEIGHT_UNITS = [UNITS.G, UNITS.ML];

/**
 * Map a parsed payload against the current database snapshot.
 * @param {object} payload - result of parsePayload()
 * @param {{ingredients: Array<{name:string}>}} db - current catalog (by name)
 * @returns {{type:'recipe'|'catalog', plan: object}}
 */
export function buildImportPlan(payload, db) {
  const byName = new Map();
  for (const ing of db.ingredients || []) byName.set(ing.name, ing); // exact match after trim, case-sensitive

  if (payload.type === 'recipe') return mapRecipe(payload, byName);
  return mapCatalog(payload, byName);
}

function mapRecipe(payload, byName) {
  const matched = [];
  const created = [];
  const warnings = [];
  const errors = [];
  const seenNames = new Set();

  for (const row of payload.items) {
    if (seenNames.has(row.name)) {
      errors.push(`«${row.name}»: дубликат ингредиента в рецепте — позиция пропущена`);
      continue;
    }
    seenNames.add(row.name);
    const existing = byName.get(row.name);
    if (existing) {
      let unit = row.unit;
      // Reconcile unit with the stored ingredient type.
      if (existing.mode === MODES.PER_PIECE && unit !== UNITS.PC) {
        warnings.push(`«${row.name}»: штучный ингредиент, единица «${unit}» заменена на «шт»`);
        unit = UNITS.PC;
      } else if (existing.mode === MODES.PER_100G && unit === UNITS.PC) {
        warnings.push(`«${row.name}»: весовой ингредиент, единица «шт» заменена на «г»`);
        unit = UNITS.G;
      }
      matched.push({ name: row.name, qty: row.qty, unit, ingredientId: existing.id });
    } else {
      // kcal is required by payload validation already; missing => error & skip (defensive check).
      if (typeof row.kcal !== 'number' || !Number.isFinite(row.kcal)) {
        errors.push(`«${row.name}»: нет значения ккал — позиция пропущена`);
        continue;
      }
      const mode = row.unit === UNITS.PC ? MODES.PER_PIECE : MODES.PER_100G;
      created.push({ name: row.name, mode, kcal: row.kcal, n: row.n || null });
      // Unit stays as given (already consistent with derived mode).
      matched.push({ name: row.name, qty: row.qty, unit: row.unit, newIngredient: true });
    }
  }

  return {
    type: 'recipe',
    plan: {
      name: payload.name,
      items: matched,
      portions: payload.portions,
      weight: payload.weight,
      text: payload.text,
      matched,
      created,
      warnings,
      errors
    }
  };
}

function mapCatalog(payload, byName) {
  const toCreate = [];
  const toUpdate = [];
  const unchanged = [];

  for (const ing of payload.ingredients) {
    const existing = byName.get(ing.name);
    if (!existing) {
      toCreate.push(ing);
    } else {
      const patch = {};
      // Only include values that actually differ from the stored record.
      if (typeof ing.kcal === 'number' && ing.kcal !== existing.kcal) patch.kcal = ing.kcal;
      if (ing.n && JSON.stringify(ing.n) !== JSON.stringify(existing.n || null)) patch.n = ing.n;
      if (Object.keys(patch).length > 0) toUpdate.push({ id: existing.id, name: ing.name, patch });
      else unchanged.push(ing.name);
    }
  }

  return { type: 'catalog', plan: { toCreate, toUpdate, unchanged, warnings: [], errors: [] } };
}
