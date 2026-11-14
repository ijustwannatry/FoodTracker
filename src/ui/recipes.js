// Recipes list screen: compact rows, each row is one big button. No per-row action buttons.

import { el, clear } from './dom.js';
import { totalKcal } from '../domain/calc.js';

export function renderRecipeList(app, root) {
  clear(root);

  const list = el('div', { class: 'recipe-list' });

  for (const r of app.recipes) {
    const total = Math.ceil(totalKcal(r.items, (id) => app.ingredientById.get(id)));
    const thumb = r.photoThumb
      ? el('img', { src: r.photoThumb, alt: '', class: 'thumb' })
      : el('span', { class: 'thumb thumb-empty' });
    const row = el('button', {
      class: 'row row-btn recipe-row',
      type: 'button',
      onclick: () => app.navigate(`#/recipe/${r.id}`)
    },
      thumb,
      el('span', { class: 'row-name' }, r.name),
      el('span', { class: 'kcal' }, `${total} ккал`)
    );
    list.appendChild(row);
  }

  if (!app.recipes.length) {
    list.appendChild(el('p', { class: 'muted' }, 'Рецептов пока нет. Создайте новый или импортируйте.'));
  }

  root.appendChild(el('section', { class: 'card' },
    el('h2', {}, 'Мои рецепты'),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn btn-primary', onclick: () => app.navigate('#/recipe/new') }, 'Новый рецепт'),
      el('button', { class: 'btn', onclick: () => app.navigate('#/import') }, 'Импорт')
    ),
    list
  ));
}
