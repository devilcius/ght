import { api } from "./common.js";
const adminImageSource = (image) => (image.variants || []).slice().sort((a, b) => a.width - b.width)[0]?.object_key || image.thumbnail_key || image.object_key;
async function generateVariants(file, kind, ownerId, imageId, existing = []) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const done = new Set(existing.map((v) => v.width)), widths = [...new Set([480, 960, 1600].map((target) => Math.min(target, bitmap.width)))];
    for (const width of widths) {
      if (done.has(width)) continue;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
      if (canvas.height > 1e4) throw new Error("La imagen es demasiado alta para optimizarla.");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("El navegador no puede procesar esta imagen.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob;
      for (const quality of [0.8, 0.65, 0.5]) {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (blob && blob.size <= 2 * 1024 * 1024) break;
      }
      if (!blob || blob.type !== "image/webp") throw new Error("El navegador no puede generar imágenes WebP.");
      if (blob.size > 2 * 1024 * 1024) throw new Error("No se pudo reducir el tamaño de la imagen.");
      await api(`/api/admin/${kind}/${ownerId}/images/${imageId}/variants/${width}`, { method: "PUT", headers: { "Content-Type": "image/webp", "X-Image-Height": String(canvas.height) }, body: blob });
    }
  } finally {
    bitmap.close();
  }
}
async function retryVariants(kind, ownerId, image) {
  const response = await fetch(`/media/${encodeURIComponent(image.object_key)}`);
  if (!response.ok) throw new Error("No se pudo cargar la imagen original.");
  await generateVariants(await response.blob(), kind, ownerId, image.id, image.variants || []);
}
async function uploadPhotos(kind, ownerId, files, onProgress = () => {}) {
  const result = {uploaded: 0, failed: [], optimizationFailed: []};
  for (const [index, file] of files.entries()) {
    onProgress(index + 1, files.length);
    const form = new FormData();
    form.append('file', file);
    try {
      const image = await api(`/api/admin/${kind}/${ownerId}/images`, {method: 'POST', body: form});
      result.uploaded++;
      try {
        await generateVariants(file, kind, ownerId, image.id);
      } catch {
        result.optimizationFailed.push(file.name);
      }
    } catch (error) {
      result.failed.push(`${file.name}: ${error.message}`);
    }
  }
  return result;
}
export {
  adminImageSource,
  generateVariants,
  retryVariants,
  uploadPhotos
};
