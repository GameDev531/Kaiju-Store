import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { env } from "../lib/env";
import { sha256, hmacSign, hmacVerify } from "../lib/crypto";
import { AppError, notFound } from "../lib/errors";
import { log } from "../lib/logger";
import { validateImageUpload, samplePalette, type AllowedImageType } from "./validate";
import { enqueue } from "../jobs/queue";

/**
 * Private object storage.
 *
 * Local development writes to a directory outside the web root; production
 * points at an S3-compatible bucket with public access blocked. Either way the
 * contract is the same and the properties that matter hold:
 *
 *  - Nothing is publicly addressable. Reads go through a signed, expiring URL
 *    that the application authorises per request.
 *  - Storage keys are random UUIDs. A user-supplied filename never becomes a
 *    path, so there is no traversal surface at all.
 *  - Files are served with `Content-Disposition: attachment`-style hardening and
 *    a sandboxing CSP so nothing uploaded can execute in the site's origin.
 */

export type FilePurpose =
  | "REFERENCE"
  | "PRODUCT"
  | "PROGRESS_PHOTO"
  | "QC_PHOTO"
  | "VERIFICATION_DOC"
  | "AVATAR";

/** Retention windows per purpose, in days. `null` = keep for the account's life. */
const RETENTION_DAYS: Record<FilePurpose, number | null> = {
  REFERENCE: 730,
  PRODUCT: null,
  PROGRESS_PHOTO: 1095,
  QC_PHOTO: 1825,
  // Identity documents are deleted as soon as a decision is recorded; the
  // verification *outcome* is what we keep, not the document.
  VERIFICATION_DOC: 90,
  AVATAR: null,
};

const storageRoot = (): string => path.resolve(process.cwd(), env.STORAGE_DIR);

function keyToPath(storageKey: string): string {
  // Keys are generated here and always match this shape; the guard makes a
  // corrupted or attacker-supplied key fail loudly rather than escape the root.
  if (!/^[0-9a-f]{2}\/[0-9a-f-]{36}$/.test(storageKey)) {
    throw new AppError("VALIDATION_FAILED", "Referência de arquivo inválida.");
  }
  const resolved = path.resolve(storageRoot(), storageKey);
  if (!resolved.startsWith(`${storageRoot()}${path.sep}`)) {
    throw new AppError("FORBIDDEN", "Caminho de arquivo fora da área permitida.");
  }
  return resolved;
}

export interface StoreImageInput {
  buffer: Buffer;
  declaredName: string;
  purpose: FilePurpose;
  ownerUserId: string;
}

export interface StoredImageResult {
  fileId: string;
  storageKey: string;
  contentType: AllowedImageType;
  width: number;
  height: number;
  byteSize: number;
  palette: { hex: string; share: number }[];
}

export async function storeImage(input: StoreImageInput): Promise<StoredImageResult> {
  const validated = validateImageUpload(input.buffer, input.declaredName, { userId: input.ownerUserId });

  const id = randomUUID();
  const storageKey = `${id.slice(0, 2)}/${id}`;
  const target = keyToPath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, validated.buffer, { mode: 0o600 });

  const digest = sha256(validated.buffer);
  const retention = RETENTION_DAYS[input.purpose];

  const file = await db.storedFile.create({
    data: {
      storageKey,
      bucket: "private",
      contentType: validated.contentType,
      byteSize: validated.byteSize,
      sha256: digest,
      widthPx: validated.width,
      heightPx: validated.height,
      originalName: validated.safeDisplayName,
      // Nothing is served until the scan says so.
      scanStatus: "PENDING",
      ownerUserId: input.ownerUserId,
      purpose: input.purpose,
      retainUntil: retention ? new Date(Date.now() + retention * 86_400_000) : null,
    },
  });

  await enqueue("malware_scan", { fileId: file.id }, { dedupeKey: `scan:${file.id}` });
  await enqueue("image_derivatives", { fileId: file.id }, { dedupeKey: `deriv:${file.id}` });

  return {
    fileId: file.id,
    storageKey,
    contentType: validated.contentType,
    width: validated.width,
    height: validated.height,
    byteSize: validated.byteSize,
    palette: samplePalette(validated.buffer),
  };
}

export async function readFileBytes(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(keyToPath(storageKey));
  } catch (cause) {
    throw notFound("O arquivo");
  }
}

export async function deleteStoredFile(fileId: string, reason: string): Promise<void> {
  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!file) return;
  try {
    await unlink(keyToPath(file.storageKey));
  } catch (error) {
    // Already gone from disk is fine; the row still needs tombstoning.
    log.warn("storage.unlink_failed", { fileId, error });
  }
  await db.storedFile.update({ where: { id: fileId }, data: { deletedAt: new Date(), scanNotes: reason } });
}

// ------------------------------------------------------- signed access -------

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * A signed URL is an *authorisation the server already made*, with a short life.
 * It binds the file id, the viewer, and an expiry, so a leaked URL cannot be
 * reused by someone else or replayed tomorrow.
 */
export function signFileUrl(fileId: string, viewerId: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${fileId}.${viewerId}.${expires}`;
  const signature = hmacSign(payload, env.AUTH_SECRET);
  return `/api/files/${fileId}?v=${encodeURIComponent(viewerId)}&e=${expires}&s=${signature}`;
}

export function verifyFileSignature(
  fileId: string,
  viewerId: string,
  expires: string,
  signature: string,
): boolean {
  const expiresNum = Number(expires);
  if (!Number.isInteger(expiresNum) || expiresNum < Math.floor(Date.now() / 1000)) return false;
  return hmacVerify(`${fileId}.${viewerId}.${expiresNum}`, signature, env.AUTH_SECRET);
}

// ------------------------------------------------------------ retention ------

/**
 * Retention sweep. Runs as a queued job — deleting data on a schedule is a
 * privacy commitment, so it is code, not a promise in a policy page.
 */
export async function sweepExpiredFiles(limit = 200): Promise<number> {
  const due = await db.storedFile.findMany({
    where: { retainUntil: { lte: new Date() }, deletedAt: null },
    take: limit,
    select: { id: true },
  });
  for (const f of due) await deleteStoredFile(f.id, "retention_expired");
  if (due.length > 0) log.info("storage.retention_sweep", { deleted: due.length });
  return due.length;
}

export async function storageStats(): Promise<{ files: number; bytes: number; pendingScans: number }> {
  const [files, pendingScans, agg] = await Promise.all([
    db.storedFile.count({ where: { deletedAt: null } }),
    db.storedFile.count({ where: { scanStatus: "PENDING", deletedAt: null } }),
    db.storedFile.aggregate({ _sum: { byteSize: true }, where: { deletedAt: null } }),
  ]);
  return { files, bytes: agg._sum.byteSize ?? 0, pendingScans };
}

export async function fileExistsOnDisk(storageKey: string): Promise<boolean> {
  try {
    await stat(keyToPath(storageKey));
    return true;
  } catch {
    return false;
  }
}
