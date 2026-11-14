// Import screen: JSON textarea + "Разобрать" preview + QR scan/upload. Catalog payloads supported too.

import { el, clear, toast } from './dom.js';
import { openQrScanner } from './modals.js';
import { parsePayload } from '../domain/exchange.js';
import { buildImportPlan } from '../domain/importMap.js';
import { IMPORT_INSTRUCTION, PROMPT_TEXT } from './promptText.js';
import { copyText } from './dom.js';
import { UNIT_LABELS } from '../domain/constants.js';

let lastPlan = null; // parsed plan awaiting confirmation

export function renderImport(app, root) {
  clear(root);
  lastPlan = null;

  const ta = el('textarea', { class: 'inp import-ta', rows: 10, placeholder: 'Вставьте JSON сюда или отсканируйте QR' });
  const errLine = el('div', { class: 'err' });
  const preview = el('div', { class: 'preview' });

  const analyzeBtn = el('button', { class: 'btn btn-primary', onclick: analyze }, 'Разобрать');

  function analyze() {
    errLine.textContent = '';
    clear(preview);
    lastPlan = null;
    let payload;
    try {
      payload = parsePayload(ta.value);
    } catch (e) {
      errLine.textContent = e.message || 'Не удалось разобрать данные';
      return;
    }
    const { type, plan } = buildImportPlan(payload, { ingredients: app.ingredients });
    lastPlan = { type, plan };
    renderPreview(type, plan);
  }

  function renderPreview(type, plan) {
    if (type === 'recipe') {
      preview.appendChild(el('h3', {}, `Предпросмотр рецепта «${plan.name}»`));
      if (plan.matched.length) {
        preview.appendChild(section('Совпало со справочником:', plan.matched.map((m) =>
          `• ${m.name} — ${m.qty} ${UNIT_LABELS[m.unit] || m.unit}${m.newIngredient ? ' (будет создан)' : ''}`)));
      }
      if (plan.created.length) {
        preview.appendChild(section('Будут созданы новые ингредиенты:', plan.created.map((c) =>
          `• ${c.name} — ${c.kcal} ккал/${c.mode === 'perPiece' ? 'шт' : '100 г'}`)));
      }
      if (plan.warnings.length) {
        preview.appendChild(el('div', { class: 'warn' }, ...plan.warnings.flatMap((w) => [`⚠ ${w}`, el('br')])));
      }
      if (plan.errors.length) {
        preview.appendChild(el('div', { class: 'err' }, ...plan.errors.flatMap((er) => [`✖ ${er}`, el('br')])));
      }
      preview.appendChild(el('div', { class: 'btn-row' },
        el('button', { class: 'btn btn-primary', onclick: () => doCreateRecipe(plan) }, 'Создать рецепт')
      ));
    } else {
      preview.appendChild(el('h3', {}, 'Предпросмотр справочника'));
      preview.appendChild(section('Будут добавлены:', plan.toCreate.map((c) => `• ${c.name} — ${c.kcal} ккал`)));
      preview.appendChild(section('Будут обновлены:', plan.toUpdate.map((u) => `• ${u.name}`)));
      if (plan.unchanged.length) preview.appendChild(section('Без изменений:', plan.unchanged.map((n) => `• ${n}`)));
      preview.appendChild(el('div', { class: 'btn-row' },
        el('button', { class: 'btn btn-primary', onclick: () => doApplyCatalog(plan) }, 'Применить справочник')
      ));
    }
  }

  async function doCreateRecipe(plan) {
    try {
      await app.importRecipePlan(plan);
      toast('Рецепт импортирован');
      app.navigate('#/recipes');
    } catch (e) {
      errLine.textContent = e.message || 'Ошибка импорта';
    }
  }

  async function doApplyCatalog(plan) {
    try {
      await app.applyCatalogPlan(plan);
      toast('Справочник обновлён');
      app.navigate('#/ingredients');
    } catch (e) {
      errLine.textContent = e.message || 'Ошибка импорта справочника';
    }
  }

  async function scanQr() {
    const text = await openQrScanner();
    if (text) {
      ta.value = text;
      analyze();
    }
  }

  const qrFile = el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  qrFile.addEventListener('change', async () => {
    const file = qrFile.files && qrFile.files[0];
    qrFile.value = '';
    if (!file) return;
    try {
      const { decodeQrFromFile } = await import('./qr.js');
      const text = await decodeQrFromFile(file);
      ta.value = text;
      analyze();
    } catch (e) {
      errLine.textContent = e.message;
    }
  });

  root.appendChild(el('section', { class: 'card' },
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn', onclick: () => app.navigate('#/recipes') }, '← Назад')
    ),
    el('h2', {}, 'Импорт рецепта'),
    el('div', { class: 'instruction' },
      el('p', {}, IMPORT_INSTRUCTION),
      el('button', {
        class: 'btn',
        onclick: async () => toast((await copyText(PROMPT_TEXT)) ? 'Промпт скопирован' : 'Не удалось скопировать')
      }, 'Копировать промпт')
    ),
    ta,
    el('div', { class: 'btn-row' },
      analyzeBtn,
      el('button', { class: 'btn', onclick: scanQr }, 'Сканировать QR (камера)'),
      el('button', { class: 'btn', onclick: () => qrFile.click() }, 'Загрузить QR-изображение')
    ),
    qrFile,
    errLine,
    preview
  ));
}

function section(title, lines) {
  if (!lines.length) return null;
  return el('div', { class: 'preview-block' },
    el('p', { class: 'preview-title' }, title),
    ...lines.map((l) => el('div', { class: 'preview-line' }, l))
  );
}
