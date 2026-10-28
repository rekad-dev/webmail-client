/** Largest centered square inside a width x height image. */
export function centeredSquare(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side };
}

export const PROFILE_PICTURE_OUTPUT_SIDE = 256;
export const PROFILE_PICTURE_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/**
 * Crops the file to a centered square and scales it to 256 x 256, so the server
 * only ever receives a small, metadata-free image.
 */
export async function prepareProfilePicture(file: File): Promise<Blob> {
  if (file.size > PROFILE_PICTURE_MAX_SOURCE_BYTES) throw new Error("too_large");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("unreadable");
  }
  try {
    const { x, y, side } = centeredSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_PICTURE_OUTPUT_SIDE;
    canvas.height = PROFILE_PICTURE_OUTPUT_SIDE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("unreadable");
    context.drawImage(bitmap, x, y, side, side, 0, 0, canvas.width, canvas.height);
    for (const type of ["image/webp", "image/png"]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.88));
      if (blob && blob.type === type) return blob;
    }
    throw new Error("unreadable");
  } finally {
    bitmap.close();
  }
}
