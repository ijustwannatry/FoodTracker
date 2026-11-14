// Client-side photo pipeline: file -> canvas resize -> JPEG dataURLs (main + thumbnail).
// Pure browser APIs, no external deps.

const MAIN_MAX = 640;   // long side of the stored photo, px
const THUMB_MAX = 96;   // list thumbnail, px
const QUALITY = 0.75;   // JPEG quality

/** Read a File into an HTMLImageElement via object URL. */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

/** Draw `img` scaled so its long side <= maxSide, return JPEG dataURL. */
export function resizeToDataUrl(img, maxSide, quality = QUALITY) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Process a picked image file into {data, thumb} dataURLs.
 * @returns {Promise<{data:string, thumb:string}>}
 */
export async function processPhotoFile(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Выберите файл изображения');
  const img = await loadImage(file);
  return { data: resizeToDataUrl(img, MAIN_MAX), thumb: resizeToDataUrl(img, THUMB_MAX) };
}
