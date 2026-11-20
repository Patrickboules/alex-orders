import sharp from "sharp";

export const MAX_EDGE = 1600;

export interface PreparedImage {
  buffer: Buffer; // JPEG
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Normalizes any image sharp can decode (JPEG/PNG/WEBP/GIF/AVIF/TIFF, HEIC where
 * libvips supports it) into a JPEG no larger than 1600px on its long edge,
 * honoring EXIF orientation. Throws if the image cannot be decoded.
 */
export async function prepareImage(input: Buffer | Uint8Array): Promise<PreparedImage> {
  const { data, info } = await sharp(input, { failOn: "none", limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    dataUrl: `data:image/jpeg;base64,${data.toString("base64")}`,
    width: info.width,
    height: info.height,
  };
}

/** Image dimensions without decoding the full image; null if unreadable. */
export async function imageSize(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}
