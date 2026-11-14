// Shared modal flows: export dialog (JSON + QR), ingredient card, QR scanner.

import { el, modal, copyText, toast } from './dom.js';
import { generateQr, decodeQrFromFile, startCameraScan } from './qr.js';
import { serializeCatalog } from '../domain/exchange.js';
import { MODE_LABELS, unitLabel } from '../domain/constants.js';

/**
 * Export dialog: JSON text + copy button + QR code of the same text.
 * @param {string} title
 * @param {string} json
 */
export function showExportDialog(title, json) {
  const ta = el('textarea', { class: 'export-json', readonly: true });
  ta.value = json;
  const qrBox = el('div', { class: 'qr-box' }, el('p', { class: 'muted' }, 'Генерация QR-кода…'));

  const m = modal(el('div', {},
    el('h3', {}, title),
    ta,
    el('div', { class: 'btn-row' },
      el('button', {
        class: 'btn btn-primary',
        onclick: async () => toast((await copyText(json)) ? 'Скопировано в буфер обмена' : 'Не удалось скопировать')
      }, 'Копировать'),
      el('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть')
    ),
    qrBox
  ));

  generateQr(json).then(({ dataUrl, warning }) => {
    qrBox.replaceChildren(
      warning ? el('p', { class: 'warn' }, warning) : null,
      el('img', { src: dataUrl, alt: 'QR-код', class: 'qr-img' })
    );
  }).catch((err) => {
    qrBox.replaceChildren(el('p', { class: 'warn' }, err.message));
  });

  return m;
}

/** Ingredient card modal (view / edit / export). Reused by catalog and recipe form "eye". */
export function openIngredientCard(app, ingredient, { onClose } = {}) {
  const body = el('div', {});
  const m = modal(body, { onClose });
  renderView();

  function fmtNutrient(v) { return v === undefined || v === null ? 'не указано' : `${v}`; }

  function renderView() {
    const n = ingredient.n || {};
    body.replaceChildren(
      el('h3', {}, ingredient.name),
      el('table', { class: 'props' },
        row('Тип', MODE_LABELS[ingredient.mode] || 'не указано'),
        row(ingredient.mode === 'perPiece' ? 'Ккал на штуку' : 'Ккал на 100 г/мл',
          ingredient.kcal === undefined || ingredient.kcal === null ? 'не указано' : String(ingredient.kcal)),
        row('Белки', fmtNutrient(n.p)),
        row('Жиры', fmtNutrient(n.f)),
        row('Углеводы', fmtNutrient(n.c))
      ),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn btn-primary', onclick: renderEdit }, 'Редактировать'),
        el('button', {
          class: 'btn',
          onclick: () => showExportDialog(`Экспорт: ${ingredient.name}`, serializeCatalog([ingredient]))
        }, 'Экспорт JSON'),
        el('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть')
      )
    );
  }

  function row(k, v) {
    return el('tr', {}, el('td', { class: 'k' }, k), el('td', {}, v));
  }

  function renderEdit() {
    const fName = el('input', { type: 'text', value: ingredient.name });
    const fMode = el('select', {},
      el('option', { value: 'per100g', selected: ingredient.mode === 'per100g' }, 'на 100 г'),
      el('option', { value: 'perPiece', selected: ingredient.mode === 'perPiece' }, 'на штуку')
    );
    const fKcal = el('input', { type: 'text', inputmode: 'decimal', value: ingredient.kcal ?? '' });
    const fp = el('input', { type: 'text', inputmode: 'decimal', value: ingredient.n?.p ?? '' });
    const ff = el('input', { type: 'text', inputmode: 'decimal', value: ingredient.n?.f ?? '' });
    const fc = el('input', { type: 'text', inputmode: 'decimal', value: ingredient.n?.c ?? '' });

    body.replaceChildren(
      el('h3', {}, 'Редактирование ингредиента'),
      field('Название', fName),
      field('Тип', fMode),
      field(ingredient.mode === 'perPiece' ? 'Ккал за штуку' : 'Ккал за 100 г/мл', fKcal),
      field('Белки (г)', fp),
      field('Жиры (г)', ff),
      field('Углеводы (г)', fc),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn btn-primary', onclick: save }, 'Сохранить'),
        el('button', { class: 'btn', onclick: renderView }, 'Отмена')
      )
    );

    async function save() {
      try {
        await app.saveIngredient({
          id: ingredient.id,
          name: fName.value,
          mode: fMode.value,
          kcal: fKcal.value,
          p: fp.value, f: ff.value, c: fc.value
        });
        // Reflect saved values in this card.
        Object.assign(ingredient, app.lastSavedIngredient);
        toast('Ингредиент сохранён');
        renderView();
      } catch (err) {
        if (err && err.fieldErrors) {
          const msgs = Object.values(err.fieldErrors).join('; ');
          toast(msgs, 'error');
        } else {
          toast(err.message || 'Ошибка сохранения', 'error');
        }
      }
    }
  }
}

function field(label, inputEl) {
  return el('label', { class: 'field' }, el('span', {}, label), inputEl);
}

/**
 * QR scan modal: live camera + file upload fallback.
 * Camera tracks are always released on close.
 * @returns {Promise<string|null>} decoded text or null if cancelled
 */
export function openQrScanner() {
  return new Promise((resolve) => {
    let scanner = null;
    let settled = false;
    const video = el('video', { class: 'qr-video', muted: true, playsinline: true, autoplay: true });
    const status = el('p', { class: 'muted' }, 'Наведите камеру на QR-код…');

    const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
    const m = modal(el('div', {},
      el('h3', {}, 'Сканировать QR-код'),
      video,
      status,
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn btn-primary',
          onclick: () => fileInput.click()
        }, 'Загрузить изображение с QR'),
        el('button', { class: 'btn btn-danger', onclick: () => finish(null) }, 'Отмена')
      ),
      fileInput
    ), { onClose: cleanup });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await decodeQrFromFile(file);
        finish(text);
      } catch (err) {
        status.textContent = err.message;
      }
    });

    // Start camera; on failure keep the file-fallback usable.
    try {
      scanner = startCameraScan(video);
      scanner.promise.then((text) => finish(text)).catch((err) => {
        if (!settled) status.textContent = `${err.message}. Можно загрузить изображение с QR кнопкой ниже.`;
      });
    } catch (err) {
      status.textContent = `${err.message}. Можно загрузить изображение с QR кнопкой ниже.`;
    }

    function cleanup() {
      if (scanner) scanner.stop();
      scanner = null;
    }

    function finish(text) {
      if (settled) return;
      settled = true;
      cleanup();
      m.close();
      resolve(text);
    }
  });
}

export { unitLabel };
