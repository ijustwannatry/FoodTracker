// Minimal DOM helpers: element factory and escaping. No UI framework (see DECISIONS.md).

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  add(node, children);
  return node;
}

export function add(parent, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** Copy text to clipboard with a legacy fallback (non-secure contexts). */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = el('textarea', { style: 'position:fixed;left:-9999px;top:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Lightweight toast message. */
let toastTimer = null;
export function toast(message, kind = 'info') {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div', { id: 'toast' });
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

/**
 * Modal dialog. Returns a handle with close().
 * @param {Node} contentEl
 * @param {{onClose?:Function}} opts
 */
export function modal(contentEl, opts = {}) {
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const box = el('div', { class: 'modal' }, contentEl);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  function close() {
    overlay.remove();
    if (opts.onClose) opts.onClose();
  }
  return { close, box, overlay };
}

/**
 * Confirm-style dialog with two colored buttons.
 * Used by the "remove in-use ingredient" warning (red «Удалить» / blue «Оставить»).
 */
export function confirmDialog({ title, message, dangerLabel, keepLabel, onDanger }) {
  const m = modal(
    el('div', {},
      el('h3', {}, title),
      el('p', { class: 'muted' }, message),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn btn-danger',
          onclick: () => { m.close(); onDanger(); }
        }, dangerLabel),
        el('button', { class: 'btn btn-primary', onclick: () => m.close() }, keepLabel)
      )
    )
  );
  return m;
}
