// IndexedDB wrapper (idb). Stores: ingredients, recipes. Photos live inside recipe records.

import { openDB } from 'idb';

const DB_NAME = 'foodtracker';
const DB_VERSION = 1;

export const STORE_ING = 'ingredients';
export const STORE_REC = 'recipes';

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_ING)) {
          const s = db.createObjectStore(STORE_ING, { keyPath: 'id' });
          s.createIndex('name', 'name', { unique: true });
        }
        if (!db.objectStoreNames.contains(STORE_REC)) {
          db.createObjectStore(STORE_REC, { keyPath: 'id' });
        }
      }
    });
  }
  return dbPromise;
}

/** Collision-safe storage error detection (quota exceeded). */
export function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError' || err.name === 'NotSupportedError' || err.code === 22 || err.code === 1014);
}

export async function listIngredients() {
  const db = await getDb();
  const all = await db.getAll(STORE_ING);
  return all.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export async function getIngredient(id) {
  const db = await getDb();
  return db.get(STORE_ING, id);
}

export async function findIngredientByName(name) {
  const db = await getDb();
  return db.getFromIndex(STORE_ING, 'name', name);
}

export async function putIngredient(ing) {
  const db = await getDb();
  await db.put(STORE_ING, ing);
  return ing;
}

export async function deleteIngredient(id) {
  const db = await getDb();
  await db.delete(STORE_ING, id);
}

export async function listRecipes() {
  const db = await getDb();
  const all = await db.getAll(STORE_REC);
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getRecipe(id) {
  const db = await getDb();
  return db.get(STORE_REC, id);
}

export async function putRecipe(recipe) {
  const db = await getDb();
  try {
    await db.put(STORE_REC, recipe);
    return true;
  } catch (err) {
    if (isQuotaError(err)) return false; // caller shows a warning, app must not crash
    throw err;
  }
}

export async function deleteRecipe(id) {
  const db = await getDb();
  await db.delete(STORE_REC, id);
}

/** True if the ingredient is referenced by at least one recipe. */
export async function ingredientUsed(id) {
  const recipes = await listRecipes();
  return recipes.some((r) => (r.items || []).some((it) => it.ingredientId === id));
}

let counter = 0;
export function uid(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}
