// Ingredients catalog screen: list, add form, card actions (via modals), delete rules.

import { el, clear, toast } from './dom.js';
import { openIngredientCard, showExportDialog } from './modals.js';
import { serializeCatalog } from '../domain/exchange.js';
import { MODE_LABELS, unitLabel } from '../domain/constants.js'; // unitLabel re-export kept for parity

export function renderIngredients(app, root) {
  clear(root);

  // --- Add form ---
  const fName = el('input', { type: 'text', placeholder: 'Название', class: 'inp' });
  const fMode = el('select', { class: 'inp' },
    el('option', { value: 'per100g' }, 'на 100 г'),
    el('option', { value: 'perPiece' }, 'на штуку')
  );
  const fKcal = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'ккал', class: 'inp inp-sm' });
  const fp = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Белки', class: 'inp inp-sm' });
  const ff = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Жиры', class: 'inp inp-sm' });
  const fc = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Углеводы', class: 'inp inp-sm' });
  const errLine = el('div', { class: 'err' });

  const addBtn = el('button', { class: 'btn btn-primary', onclick: submit }, 'Добавить');

  async function submit() {
    errLine.textContent = '';
    try {
      await app.saveIngredient({
        name: fName.value, mode: fMode.value, kcal: fKcal.value, p: fp.value, f: ff.value, c: fc.value
      });
      [fName, fKcal, fp, ff, fc].forEach((i) => { i.value = ''; });
      toast('Ингредиент добавлен');
      renderIngredients(app, root);
    } catch (e) {
      if (e && e.fieldErrors) errLine.textContent = Object.values(e.fieldErrors).join('; ');
      else errLine.textContent = e.message || 'Ошибка сохранения';
    }
  }

  root.appendChild(el('section', { class: 'card' },
    el('h2', {}, 'Новый ингредиент'),
    el('div', { class: 'form-grid' },
      fieldRow('Название', fName),
      fieldRow('Тип', fMode),
      fieldRow('Ккал', fKcal),
      fieldRow('Белки', fp),
      fieldRow('Жиры', ff),
      fieldRow('Углеводы', fc)
    ),
    errLine,
    el('div', { class: 'btn-row' }, addBtn)
  ));

  // --- List ---
  const list = el('div', { class: 'ing-list' });
  root.appendChild(el('section', { class: 'card' },
    el('h2', {}, 'Справочник ингредиентов'),
    list
  ));

  for (const ing of app.ingredients) {
    const unitHint = ing.mode === 'perPiece' ? 'шт' : '100 г';
    const kcalTxt = `${ing.kcal ?? 0} ккал / ${unitHint}`;
    const row = el('div', {
      class: 'row row-btn',
      role: 'button',
      tabindex: '0',
      onclick: () => openIngredientCard(app, ing, { onClose: () => renderIngredients(app, root) }),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIngredientCard(app, ing); } }
    },
      el('span', { class: 'row-name' }, ing.name),
      el('span', { class: 'muted' }, MODE_LABELS[ing.mode]),
      el('span', { class: 'kcal' }, kcalTxt)
    );
    list.appendChild(row);
  }
  if (!app.ingredients.length) list.appendChild(el('p', { class: 'muted' }, 'Список пуст'));
}

function fieldRow(label, inputEl) {
  return el('label', { class: 'field' }, el('span', {}, label), inputEl);
}
