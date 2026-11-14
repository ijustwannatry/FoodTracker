// Recipe view + edit form. Editing requires an explicit "Изменить" action;
// after saving the app returns to the recipe list (spec section 4).

import { el, clear, toast, confirmDialog } from './dom.js';
import { openIngredientCard, showExportDialog } from './modals.js';
import { totalKcal, summarize } from '../domain/calc.js';
import { serializeRecipe } from '../domain/exchange.js';
import { UNITS, UNIT_LABELS, MODES, parseNonNegative } from '../domain/constants.js';
import { processPhotoFile } from '../db/photos.js';

export function renderRecipe(app, root, id) {
  clear(root);
  if (id === 'new') return renderForm(app, root, null);
  const recipe = app.recipes.find((r) => r.id === id);
  if (!recipe) {
    root.appendChild(el('p', { class: 'err' }, 'Рецепт не найден'));
    return;
  }
  renderView(app, root, recipe);
}

function renderView(app, root, recipe) {
  const total = totalKcal(recipe.items, (ingId) => app.ingredientById.get(ingId));
  const s = summarize(total, recipe.portions, recipe.weight);

  const rows = recipe.items.map((it) => {
    const ing = app.ingredientById.get(it.ingredientId);
    const name = ing ? ing.name : '⚠ удалённый ингредиент';
    const itemK = ing ? Math.ceil(itemCalories(it, ing)) : 0;
    return el('tr', {},
      el('td', {}, name),
      el('td', { class: 'num' }, `${fmtQty(it.qty)} ${UNIT_LABELS[it.unit] || it.unit}`),
      el('td', { class: 'num kcal' }, `${itemK}`)
    );
  });

  const photoBlock = recipe.photoData
    ? el('img', { src: recipe.photoData, alt: 'Фото блюда', class: 'recipe-photo' })
    : null;

  root.appendChild(el('section', { class: 'card' },
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn', onclick: () => app.navigate('#/recipes') }, '← Назад')
    ),
    el('h2', {}, recipe.name),
    photoBlock,
    el('table', { class: 'items-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Ингредиент'), el('th', { class: 'num' }, 'Кол-во'), el('th', { class: 'num' }, 'ккал'))),
      el('tbody', {}, rows.length ? rows : el('tr', {}, el('td', { colspan: 3, class: 'muted' }, 'Состав пуст')))
    ),
    el('div', { class: 'totals' },
      el('div', { class: 'total-line' }, 'Итого: ', el('b', {}, `${s.totalDisplay} ккал`)),
      s.perPortion !== null ? el('div', {}, `На порцию (${fmtQty(recipe.portions)}): `, el('b', {}, `${s.perPortion} ккал`)) : null,
      s.per100 !== null ? el('div', {}, 'На 100 г: ', el('b', {}, `${s.per100} ккал`)) : null
    ),
    el('h3', {}, 'Приготовление'),
    el('p', { class: 'process-text' }, recipe.text || 'не указано'),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn btn-primary', onclick: () => renderForm(app, root, recipe) }, 'Изменить'),
      el('button', {
        class: 'btn',
        onclick: () => showExportDialog('Поделиться рецептом', exportJson(app, recipe))
      }, 'Поделиться'),
      el('button', {
        class: 'btn btn-danger',
        onclick: () => confirmDialog({
          title: 'Удалить рецепт?',
          message: `«${recipe.name}» будет удалён без возможности восстановления.`,
          dangerLabel: 'Удалить',
          keepLabel: 'Оставить',
          onDanger: async () => { await app.deleteRecipe(recipe.id); app.navigate('#/recipes'); }
        })
      }, 'Удалить')
    )
  ));
}

function exportJson(app, recipe) {
  const items = recipe.items.map((it) => ({
    ingredient: app.ingredientById.get(it.ingredientId) || { name: 'unknown', mode: MODES.PER_100G, kcal: 0, n: null },
    qty: it.qty,
    unit: it.unit
  }));
  return serializeRecipe({ ...recipe, items });
}

function itemCalories(it, ing) {
  if (typeof it.qty !== 'number' || !Number.isFinite(it.qty) || it.qty < 0) return 0;
  const kcal = typeof ing.kcal === 'number' && Number.isFinite(ing.kcal) ? ing.kcal : 0;
  return it.unit === UNITS.PC ? it.qty * kcal : (it.qty / 100) * kcal;
}

function fmtQty(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? String(n) : String(v);
}

// ---------------------------------------------------------------------------
// Edit/create form
// ---------------------------------------------------------------------------

function renderForm(app, root, existing) {
  clear(root);
  const isNew = !existing;

  // Working draft (deep-copied so cancel works).
  const draft = {
    name: existing ? existing.name : '',
    items: existing ? existing.items.map((it) => ({ ...it })) : [],
    portions: existing && existing.portions != null ? String(existing.portions) : '',
    weight: existing && existing.weight != null ? String(existing.weight) : '',
    text: existing ? existing.text : '',
    photoData: existing ? existing.photoData || null : null,
    photoThumb: existing ? existing.photoThumb || null : null
  };

  const fName = el('input', { type: 'text', class: 'inp', value: draft.name, placeholder: 'Название' });
  const fPortions = el('input', { type: 'text', inputmode: 'decimal', class: 'inp inp-right', value: draft.portions, placeholder: 'напр. 3' });
  const fWeight = el('input', { type: 'text', inputmode: 'decimal', class: 'inp inp-right', value: draft.weight, placeholder: 'граммов, напр. 350' });
  const fText = el('textarea', { class: 'inp inp-process', rows: 8, placeholder: 'Описание процесса приготовления' });
  fText.value = draft.text;
  const errLine = el('div', { class: 'err' });

  const itemsTable = el('tbody', {});
  const pickerList = el('div', { class: 'picker' });

  function addedIds() { return new Set(draft.items.map((i) => i.ingredientId)); }

  function toggleItem(ing, wantAdd) {
    const pos = draft.items.findIndex((i) => i.ingredientId === ing.id);
    if (wantAdd) {
      if (pos >= 0) return; // no duplicates ever
      draft.items.push({ ingredientId: ing.id, qty: '', unit: ing.mode === MODES.PER_PIECE ? UNITS.PC : UNITS.G });
    } else {
      if (pos < 0) return;
      const cur = draft.items[pos];
      const hasQty = String(cur.qty ?? '').trim() !== '' && parseNonNegative(cur.qty) !== null;
      if (hasQty) {
        confirmDialog({
          title: 'Внимание',
          message: 'Вы пытаетесь удалить используемый продукт',
          dangerLabel: 'Удалить',
          keepLabel: 'Оставить',
          onDanger: () => { draft.items.splice(pos, 1); refresh(); }
        });
        return;
      }
      draft.items.splice(pos, 1);
    }
    refresh();
  }

  function buildPicker() {
    clear(pickerList);
    const added = addedIds();
    for (const ing of app.ingredients) {
      const isAdded = added.has(ing.id);
      const plusBtn = el('button', {
        class: `btn btn-toggle ${isAdded ? 'active minus' : 'plus'}`,
        title: isAdded ? 'Убрать из рецепта' : 'Добавить в рецепт',
        onclick: () => toggleItem(ing, !isAdded)
      }, isAdded ? '−' : '+');
      const eyeBtn = el('button', {
        class: 'btn btn-eye',
        title: 'Карточка ингредиента',
        onclick: () => openIngredientCard(app, ing)
      }, '👁');
      pickerList.appendChild(el('div', { class: `picker-row ${isAdded ? 'highlight' : ''}` },
        el('span', { class: 'row-name' }, ing.name),
        el('span', { class: 'muted' }, `${ing.kcal ?? 0} ккал/${ing.mode === MODES.PER_PIECE ? 'шт' : '100 г'}`),
        plusBtn,
        eyeBtn
      ));
    }
  }

  function buildItems() {
    clear(itemsTable);
    if (!draft.items.length) {
      itemsTable.appendChild(el('tr', {}, el('td', { colspan: 3, class: 'muted' }, 'Добавьте ингредиенты справа')));
      return;
    }
    draft.items.forEach((it, idx) => {
      const ing = app.ingredientById.get(it.ingredientId);
      const qtyInput = el('input', {
        type: 'text', inputmode: 'decimal', class: 'inp inp-right inp-qty',
        value: it.qty === '' || it.qty === null || it.qty === undefined ? '' : String(it.qty),
        placeholder: 'кол-во',
        oninput: (e) => { it.qty = e.target.value; updateTotal(); }
      });
      let unitSel;
      if (ing && ing.mode === MODES.PER_PIECE) {
        unitSel = el('span', { class: 'unit-fixed' }, UNIT_LABELS.pc);
      } else {
        unitSel = el('select', {
          class: 'inp inp-unit',
          onchange: (e) => { it.unit = e.target.value; updateTotal(); }
        },
          el('option', { value: 'g', selected: it.unit === 'g' }, 'г'),
          el('option', { value: 'ml', selected: it.unit === 'ml' }, 'мл')
        );
      }
      itemsTable.appendChild(el('tr', {},
        el('td', {}, ing ? ing.name : '⚠ отсутствует'),
        el('td', { class: 'cell-input' }, qtyInput, unitSel),
        el('td', { class: 'num', dataset: { row: String(idx) } }, '')
      ));
    });
    updateTotal();
  }

  function currentTotal() {
    let sum = 0;
    for (const it of draft.items) {
      const ing = app.ingredientById.get(it.ingredientId);
      if (!ing) continue;
      const q = parseNonNegative(it.qty);
      if (q === null || q === undefined) continue;
      sum += it.unit === UNITS.PC ? q * (ing.kcal || 0) : (q / 100) * (ing.kcal || 0);
    }
    return sum;
  }

  function updateTotal() {
    const t = document.getElementById('draft-total');
    if (t) t.textContent = `Итого сейчас: ${Math.ceil(currentTotal())} ккал`;
  }

  function refresh() {
    buildPicker();
    buildItems();
  }

  // --- Photo controls ---
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  const photoPreview = el('div', { class: 'photo-preview' });

  function renderPhoto() {
    clear(photoPreview);
    if (draft.photoData) {
      photoPreview.appendChild(el('img', { src: draft.photoData, alt: 'Фото блюда', class: 'recipe-photo' }));
      photoPreview.appendChild(el('div', { class: 'btn-row' },
        el('button', { class: 'btn', onclick: () => fileInput.click() }, 'Заменить'),
        el('button', { class: 'btn btn-danger', onclick: () => { draft.photoData = null; draft.photoThumb = null; renderPhoto(); } }, 'Удалить')
      ));
    } else {
      photoPreview.appendChild(el('button', { class: 'btn', onclick: () => fileInput.click() }, 'Добавить фото'));
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { data, thumb } = await processPhotoFile(file);
      draft.photoData = data;
      draft.photoThumb = thumb;
      renderPhoto();
    } catch (e) {
      toast(e.message || 'Ошибка обработки фото', 'error');
    }
  });

  // --- Save / cancel ---
  async function save() {
    errLine.textContent = '';
    const result = app.buildAndSaveRecipe({
      id: existing ? existing.id : null,
      name: fName.value,
      items: draft.items,
      portions: fPortions.value,
      weight: fWeight.value,
      text: fText.value,
      photoData: draft.photoData,
      photoThumb: draft.photoThumb
    });
    try {
      await result;
      toast(isNew ? 'Рецепт создан' : 'Рецепт сохранён');
      app.navigate('#/recipes'); // after save — back to the list (spec)
    } catch (e) {
      if (e && e.fieldErrors) errLine.textContent = Object.values(e.fieldErrors).join('; ');
      else if (e && e.quota) errLine.textContent = 'Хранилище устройства переполнено — удалите старые рецепты или фото.';
      else errLine.textContent = e.message || 'Ошибка сохранения';
    }
  }

  const totalHint = el('div', { class: 'muted', id: 'draft-total' }, '');

  root.appendChild(el('section', { class: 'card' },
    el('div', { class: 'btn-row' },
      el('button', {
        class: 'btn',
        onclick: () => app.navigate(isNew ? '#/recipes' : `#/recipe/${existing.id}`)
      }, '← Отмена')
    ),
    el('h2', {}, isNew ? 'Новый рецепт' : `Редактирование: ${existing.name}`),
    el('label', { class: 'field field-right' }, el('span', {}, 'Название'), fName),
    el('h3', {}, 'Состав'),
    el('table', { class: 'items-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Ингредиент'), el('th', {}, 'Количество'), el('th', { class: 'num' }, 'ккал'))),
      itemsTable
    ),
    totalHint,
    el('h3', {}, 'Ингредиенты'),
    el('p', { class: 'muted' }, '«+» добавить, «−» убрать, 👁 карточка'),
    pickerList,
    el('label', { class: 'field field-right' }, el('span', {}, 'Порции'), fPortions),
    el('label', { class: 'field field-right' }, el('span', {}, 'Вес готового блюда, г'), fWeight),
    el('label', { class: 'field field-right' }, el('span', {}, 'Процесс приготовления'), fText),
    el('h3', {}, 'Фото'),
    photoPreview,
    fileInput,
    errLine,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn btn-primary', onclick: save }, 'Сохранить')
    )
  ));

  refresh();
  renderPhoto();
}
