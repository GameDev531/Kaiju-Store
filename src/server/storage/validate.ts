import { AppError, type ErrorCode } from "../lib/errors";
import { securityEvent } from "../lib/logger";

/**
 * Upload validation.
 *
 * The client's Content-Type and the filename extension are treated as *claims*,
 * not facts. Everything below is decided from the bytes.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  minBytes: 256,
  maxWidth: 8_000,
  maxHeight: 8_000,
  minWidth: 200,
  minHeight: 200,
  /**
   * Decompression-bomb guard. A 40 000 × 40 000 PNG is a few hundred kB on disk
   * and ~6 GB decoded; the pixel budget stops it before anything tries to decode.
   */
  maxPixels: 40_000_000,
  /** A file whose decoded size dwarfs its stored size is suspicious by itself. */
  maxPixelsPerByte: 800,
} as const;

export interface ImageProbe {
  contentType: AllowedImageType;
  width: number;
  height: number;
}

/** Reads dimensions straight from the container headers. No decoding happens. */
export function probeImage(buffer: Buffer): ImageProbe | null {
  if (buffer.length < 16) return null;

  // PNG: \x89PNG\r\n\x1a\n then IHDR at offset 16.
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
    return { contentType: "image/png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // JPEG: walk the segment chain to the first SOF marker.
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1]!;
      // Standalone markers carry no length field.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) return null;
      // SOF0..SOF15, excluding DHT(c4), JPG(c8) and DAC(cc).
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        if (offset + 9 >= buffer.length) return null;
        return {
          contentType: "image/jpeg",
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
    return null;
  }

  // RIFF container: WEBP.
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      // 24-bit little-endian, stored as (dimension - 1).
      const width = 1 + (buffer[24]! | (buffer[25]! << 8) | (buffer[26]! << 16));
      const height = 1 + (buffer[27]! | (buffer[28]! << 8) | (buffer[29]! << 16));
      return { contentType: "image/webp", width, height };
    }
    if (chunk === "VP8 " && buffer.length >= 30) {
      return {
        contentType: "image/webp",
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return {
        contentType: "image/webp",
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff),
      };
    }
    return null;
  }

  // ISO-BMFF: AVIF. Dimensions live in ispe inside meta; find the box directly.
  if (buffer.length > 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis" || brand === "mif1") {
      const ispe = buffer.indexOf("ispe", 0, "ascii");
      if (ispe > 0 && ispe + 16 <= buffer.length) {
        return {
          contentType: "image/avif",
          width: buffer.readUInt32BE(ispe + 8),
          height: buffer.readUInt32BE(ispe + 12),
        };
      }
    }
    return null;
  }

  return null;
}

/**
 * Detects bytes that a browser might treat as active content regardless of the
 * Content-Type we serve. Belt to the CSP+nosniff braces on the file route.
 */
export function looksLikeActiveContent(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 2048).toString("latin1").toLowerCase();
  return (
    head.includes("<script") ||
    head.includes("<!doctype html") ||
    head.includes("<html") ||
    head.includes("<?php") ||
    head.includes("<svg") ||
    head.startsWith("#!") ||
    // ELF and PE headers.
    (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) ||
    (buffer[0] === 0x4d && buffer[1] === 0x5a)
  );
}

export interface ValidatedUpload {
  buffer: Buffer;
  contentType: AllowedImageType;
  width: number;
  height: number;
  byteSize: number;
  /** Cleaned for display. Never used to build a path. */
  safeDisplayName: string;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "arquivo";
  return (
    base
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\.{2,}/g, ".")
      .replace(/^\.+/, "")
      .slice(0, 120) || "arquivo"
  );
}

export function validateImageUpload(
  buffer: Buffer,
  declaredName: string,
  context: { userId?: string } = {},
): ValidatedUpload {
  const reject = (code: ErrorCode, message: string, action: string, detail: string): never => {
    securityEvent("upload.rejected", { ...context, detail, byteSize: buffer.length });
    throw new AppError(code, message, { action });
  };

  if (buffer.length > LIMITS.maxBytes) {
    reject(
      "UPLOAD_TOO_LARGE",
      `Esta imagem tem ${(buffer.length / 1024 / 1024).toFixed(1)} MB. O limite é ${LIMITS.maxBytes / 1024 / 1024} MB.`,
      "Reduza a imagem ou envie uma versão comprimida — 2 a 4 MB já dá ótimo detalhe.",
      "size_over_limit",
    );
  }
  if (buffer.length < LIMITS.minBytes) {
    reject("UPLOAD_CORRUPT", "Este arquivo está vazio ou incompleto.", "Tente enviar novamente.", "size_under_min");
  }
  if (looksLikeActiveContent(buffer)) {
    reject(
      "UPLOAD_TYPE_REJECTED",
      "Este arquivo não é uma imagem que possamos aceitar.",
      "Envie um JPG, PNG, WebP ou AVIF.",
      "active_content_signature",
    );
  }

  const probe = probeImage(buffer);
  if (!probe) {
    return reject(
      "UPLOAD_TYPE_REJECTED",
      "Não reconhecemos este arquivo como uma imagem válida.",
      "Aceitamos JPG, PNG, WebP e AVIF. Se renomeou a extensão, o conteúdo precisa bater.",
      "magic_bytes_unrecognized",
    );
  }

  const { width, height, contentType } = probe;
  if (width <= 0 || height <= 0) {
    reject("UPLOAD_CORRUPT", "As dimensões desta imagem não puderam ser lidas.", "Reexporte a imagem e tente de novo.", "bad_dimensions");
  }
  if (width > LIMITS.maxWidth || height > LIMITS.maxHeight) {
    reject(
      "UPLOAD_DIMENSIONS_REJECTED",
      `Esta imagem tem ${width}×${height}px. O máximo é ${LIMITS.maxWidth}×${LIMITS.maxHeight}px.`,
      "Redimensione antes de enviar.",
      "dimensions_over_limit",
    );
  }
  if (width < LIMITS.minWidth || height < LIMITS.minHeight) {
    reject(
      "UPLOAD_DIMENSIONS_REJECTED",
      `Esta imagem tem ${width}×${height}px — pequena demais para ler detalhes de costura.`,
      `Envie uma imagem com pelo menos ${LIMITS.minWidth}×${LIMITS.minHeight}px.`,
      "dimensions_under_min",
    );
  }

  const pixels = width * height;
  if (pixels > LIMITS.maxPixels || pixels / buffer.length > LIMITS.maxPixelsPerByte) {
    reject(
      "UPLOAD_DIMENSIONS_REJECTED",
      "Este arquivo tem uma proporção de compressão fora do normal e não será processado.",
      "Reexporte a imagem a partir do original e envie de novo.",
      "decompression_bomb_suspected",
    );
  }

  return {
    buffer,
    contentType,
    width,
    height,
    byteSize: buffer.length,
    safeDisplayName: sanitizeFilename(declaredName),
  };
}

/**
 * Coarse palette from the raw container bytes.
 *
 * Deliberately crude: it samples byte triplets rather than decoding pixels, so
 * it costs nothing and cannot be turned into a decode-side attack. The result is
 * only ever labelled INFERRED in a spec, never presented as a measured colour.
 */
export function samplePalette(buffer: Buffer, maxColors = 3): { hex: string; share: number }[] {
  const buckets = new Map<string, number>();
  const stride = Math.max(3, Math.floor(buffer.length / 20_000) * 3);
  let sampled = 0;
  for (let i = buffer.length > 4096 ? 4096 : 0; i + 2 < buffer.length; i += stride) {
    const r = buffer[i]! & 0xf0;
    const g = buffer[i + 1]! & 0xf0;
    const b = buffer[i + 2]! & 0xf0;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    sampled += 1;
  }
  if (sampled === 0) return [];
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([key, count]) => {
      const [r, g, b] = key.split(",").map(Number) as [number, number, number];
      const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      return { hex, share: count / sampled };
    });
}
