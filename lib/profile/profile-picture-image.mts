export const MAX_PROFILE_PICTURE_BYTES = 256 * 1024;
export const MAX_PROFILE_PICTURE_SIDE = 512;
export const MIN_PROFILE_PICTURE_SIDE = 32;

export type ProfilePictureType = "image/png" | "image/jpeg" | "image/webp";

export interface ValidatedProfilePicture {
  type: ProfilePictureType;
  bytes: Uint8Array;
  width: number;
  height: number;
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value)) return null;
  if (u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") return null;
  return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = u16be(bytes, offset + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (offset + 9 > bytes.length) return null;
      return { height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  }
  if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * Accepts only PNG, JPEG, or WebP of a bounded size and dimensions. The type is
 * taken from the file's own signature, never from the request headers.
 */
export function validateProfilePicture(bytes: Uint8Array): ValidatedProfilePicture | null {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROFILE_PICTURE_BYTES) return null;
  const candidates: Array<[ProfilePictureType, { width: number; height: number } | null]> = [
    ["image/png", pngSize(bytes)],
    ["image/jpeg", jpegSize(bytes)],
    ["image/webp", webpSize(bytes)],
  ];
  const match = candidates.find(([, size]) => size !== null);
  if (!match || !match[1]) return null;
  const [type, size] = match;
  if (
    size.width < MIN_PROFILE_PICTURE_SIDE ||
    size.height < MIN_PROFILE_PICTURE_SIDE ||
    size.width > MAX_PROFILE_PICTURE_SIDE ||
    size.height > MAX_PROFILE_PICTURE_SIDE
  ) {
    return null;
  }
  return { type, bytes, width: size.width, height: size.height };
}
