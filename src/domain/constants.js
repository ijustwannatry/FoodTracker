// Domain constants and pure helpers shared across the app.

export const UNITS = { G: 'g', ML: 'ml', PC: 'pc' };

// Human-readable (Russian) unit labels used in the UI.
export const UNIT_LABELS = { g: 'г', ml: 'мл', pc: 'шт' };

// Ingredient "mode": calories/nutrients are per piece or per 100 g (and per 100 ml).
export const MODES = { PER_PIECE: 'perPiece', PER_100G: 'per100g' };

export const MODE_LABELS = { perPiece: 'на штуку', per100g: 'на 100 г' };

// Exchange format version supported by this app.
export const FORMAT_VERSION = 1;

/**
 * True if `v` is a usable numeric value: finite number >= 0.
 * Any numeric value may be zero; only negative / non-numeric / non-finite are rejected.
 */
export function isValidNonNegativeNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Parse user input into a non-negative number or null.
 * Accepts both '.' and ',' as decimal separator (UI convenience, see DECISIONS.md).
 * Returns undefined on invalid input.
 */
export function parseNonNegative(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Unit label for display: 'г' | 'мл' | 'шт'. */
export function unitLabel(unit) {
  return UNIT_LABELS[unit] || unit;
}
