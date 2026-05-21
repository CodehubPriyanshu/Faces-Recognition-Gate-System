/** Resize + compress an image File/Blob to a JPEG data URL ≤ maxSize. */
export async function compressImage(input: Blob, maxSize = 1024, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(input);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
