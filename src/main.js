// App bootstrap: data loading, first-run seeding, hash router, global actions.

import {
  listIngredients, listRecipes, putIngredient, putRecipe, deleteRecipe as dbDeleteRecipe,
  findIngredientByName, ingredientUsed, deleteIngredient, uid
} from './db/store.js';
import { planSeed } from './domain/seed.js';
import { validateIngredient, validateRecipe } from './domain/validate.js';
import { parseNonNegative, MODES } from './domain/constants.js';
import { renderIngredients } from './ui/ingredients.js';
import { renderRecipeList } from './ui/recipes.js';
import { renderRecipe } from './ui/recipeForm.js';
import { renderImport } from './ui/importView.js';
import { el, clear, toast } from './ui/dom.js';
import { serializeCatalog } from './domain/exchange.js';
import { showExportDialog } from './ui/modals.js';

// `root` is resolved lazily inside route() (index.html owns the shell markup).
let root = null;

export const app = {
  ingredients: [],
  recipes: [],
  ingredientById: new Map(),

  async reload() {
    this.ingredients = await listIngredients();
    this.recipes = await listRecipes();
    this.ingredientById = new Map(this.ingredients.map((i) => [i.id, i]));
  },

  navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },

  /** Save (create/update) an ingredient from raw form values. Throws with .fieldErrors on bad input. */
  async saveIngredient(raw) {
    const v = validateIngredient(raw);
    if (!v.ok) {
      // Rename conflict check (unique names).
      const err = new Error('Проверьте правильность заполнения полей');
      err.fieldErrors = v.errors;
      throw err;
    }
    const clash = await findIngredientByName(v.value.name);
    if (clash && clash.id !== raw.id) {
      const err = new Error('Ингредиент с таким названием уже есть');
      err.fieldErrors = { name: 'Название уже используется' };
      throw err;
    }
    const existing = raw.id ? this.ingredientById.get(raw.id) : null;
    const record = {
      id: raw.id || uid('ing'),
      ...v.value,
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now()
    };
    await putIngredient(record);
    this.lastSavedIngredient = record;
    await this.reload();
    return record;
  },

  /** Delete an ingredient only if unused in every recipe (spec section 3). */
  async deleteIngredient(id) {
    if (await ingredientUsed(id)) {
      toast('Нельзя удалить: ингредиент используется в рецептах', 'error');
      return false;
    }
    await deleteIngredient(id);
    await this.reload();
    return true;
  },

  /** Build + validate + persist a recipe from the form draft. */
  async buildAndSaveRecipe(draft) {
    const v = validateRecipe(draft, this.ingredientById);
    if (!v.ok) {
      const err = new Error('Проверьте правильность заполнения полей');
      err.fieldErrors = v.errors;
      throw err;
    }
    const existing = draft.id ? this.recipes.find((r) => r.id === draft.id) : null;
    const items = draft.items.map((it) => ({
      ingredientId: it.ingredientId,
      qty: parseNonNegative(it.qty),
      unit: it.unit
    })).filter((it) => it.ingredientId);
    const record = {
      id: draft.id || uid('rec'),
      name: v.name,
      items,
      portions: v.portions,
      weight: v.weight,
      text: (draft.text || '').trim(),
      photoData: draft.photoData || null,
      photoThumb: draft.photoThumb || null,
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now()
    };
    const ok = await putRecipe(record);
    if (!ok) {
      const err = new Error('Недостаточно места в хранилище');
      err.quota = true;
      throw err;
    }
    await this.reload();
    return record;
  },

  async deleteRecipe(id) {
    await dbDeleteRecipe(id);
    await this.reload();
  },

  /** Apply an import plan of type "recipe": create missing ingredients, then a NEW recipe. */
  async importRecipePlan(plan) {
    const items = [];
    for (const m of plan.matched) {
      let ingredientId = m.ingredientId;
      if (m.newIngredient) {
        const src = plan.created.find((c) => c.name === m.name);
        const rec = await putIngredient({
          id: uid('ing'), name: src.name, mode: src.mode, kcal: src.kcal, n: src.n || {},
          createdAt: Date.now(), updatedAt: Date.now()
        });
        ingredientId = rec.id;
      }
      items.push({ ingredientId, qty: m.qty, unit: m.unit });
    }
    const record = {
      id: uid('rec'), // always a new recipe
      name: plan.name,
      items,
      portions: plan.portions,
      weight: plan.weight,
      text: plan.text || '',
      photoData: null,
      photoThumb: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const ok = await putRecipe(record);
    if (!ok) {
      const err = new Error('Недостаточно места в хранилище');
      err.quota = true;
      throw err;
    }
    await this.reload();
    return record;
  },

  /** Apply an import plan of type "catalog". */
  async applyCatalogPlan(plan) {
    for (const c of plan.toCreate) {
      await putIngredient({ id: uid('ing'), name: c.name, mode: c.mode, kcal: c.kcal, n: c.n || {}, createdAt: Date.now(), updatedAt: Date.now() });
    }
    for (const u of plan.toUpdate) {
      const old = this.ingredientById.get(u.id);
      if (!old) continue;
      await putIngredient({ ...old, ...u.patch, updatedAt: Date.now() });
    }
    await this.reload();
  },

  exportCatalog() {
    showExportDialog('Экспорт справочника', serializeCatalog(this.ingredients));
  }
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function route() {
  if (!root) root = document.getElementById('app');
  const h = location.hash || '#/recipes';
  if (h.startsWith('#/ingredients')) renderIngredients(app, root);
  else if (h.startsWith('#/recipe/')) renderRecipe(app, root, h.slice('#/recipe/'.length));
  else if (h.startsWith('#/import')) renderImport(app, root);
  else renderRecipeList(app, root);
}

function renderShell() {
  const header = el('header', { class: 'topbar' },
    el('span', { class: 'brand' }, 'FoodTracker'),
    el('nav', {},
      el('button', { class: 'btn btn-nav', onclick: () => app.navigate('#/recipes') }, 'Рецепты'),
      el('button', { class: 'btn btn-nav', onclick: () => app.navigate('#/ingredients') }, 'Справочник'),
      el('button', { class: 'btn btn-nav', onclick: () => app.exportCatalog() }, 'Экспорт справочника')
    )
  );
  document.body.appendChild(header);
}

async function seedIfNeeded() {
  const missing = planSeed(app.ingredients);
  for (const s of missing) {
    await putIngredient({ id: uid('ing'), ...s, createdAt: Date.now(), updatedAt: Date.now() });
  }
  if (missing.length) await app.reload();
}

async function boot() {
  renderShell();
  window.addEventListener('hashchange', route);
  try {
    await app.reload();
    await seedIfNeeded();
  } catch (e) {
    console.error(e);
    toast('Ошибка загрузки данных: ' + e.message, 'error');
  }
  route();
}

boot();
