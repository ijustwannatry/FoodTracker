// QR features: generation (qrcode lib, EC level M) + scanning (jsQR via camera or image file).

import QRCode from 'qrcode';
import jsQR from 'jsqr';

export const QR_WARN_LIMIT = 1500;
export const QR_HARD_LIMIT = 2500;

/**
 * Generate a QR data URL for `text`.
 * Returns {dataUrl, warning} — warning is set when text is long but still encoded.
 * Throws when text exceeds the hard limit (caller must offer plain-text copy instead).
 */
export async function generateQr(text) {
  if (text.length > QR_HARD_LIMIT) {
    throw new Error('Текст слишком длинный для надёжного QR-кода (более 2500 символов). Скопируйте текст вручную.');
  }
  const dataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320
  });
  return {
    dataUrl,
    warning: text.length > QR_WARN_LIMIT
      ? 'Длина текста больше 1500 символов — сканирование может быть ненадёжным.'
      : null
  };
}

/** Decode QR from an ImageData blob using jsQR. Returns string|null. */
export function decodeImageData(imageData) {
  const res = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
  return res ? res.data : null;
}

/** Decode QR from an image File (fallback path without camera). */
export async function decodeQrFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Не удалось загрузить изображение'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const text = decodeImageData(data);
    if (!text) throw new Error('QR-код не найден на изображении');
    return text;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Start camera-based QR scanning into `videoEl`.
 * @returns {{promise: Promise<string>, stop: Function}} promise resolves with decoded text;
 * stop() releases camera tracks (mandatory on close).
 */
export function startCameraScan(videoEl) {
  let stream = null;
  let rafId = 0;
  let stopped = false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const resultPromise = (async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Камера недоступна: требуется защищённое соединение (HTTPS) и разрешение пользователя');
    }
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    videoEl.srcObject = stream;
    await videoEl.play();
    while (!stopped) {
      await new Promise((r) => requestAnimationFrame(() => r()));
      if (stopped) break;
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      if (!w || !h) continue;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(videoEl, 0, 0, w, h);
      const text = decodeImageData(ctx.getImageData(0, 0, w, h));
      if (text) return text;
    }
    throw new Error('Сканирование остановлено');
  })();

  function stop() {
    stopped = true;
    cancelAnimationFrame(rafId);
    if (stream) {
      // IMPORTANT: always release camera tracks.
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
    videoEl.srcObject = null;
  }

  return { promise: resultPromise, stop };
}
