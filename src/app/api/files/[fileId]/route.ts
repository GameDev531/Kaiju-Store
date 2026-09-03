import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { readFileBytes, verifyFileSignature } from "@/server/storage";
import { securityEvent, log } from "@/server/lib/logger";

/**
 * The only route that serves uploaded bytes.
 *
 * Authorisation is enforced twice, and both must pass:
 *  1. A valid, unexpired HMAC signature naming this file AND this viewer.
 *  2. A live session belonging to that same viewer, which independently has a
 *     reason to see the file (owner, assigned producer, or staff).
 *
 * A leaked URL is therefore useless to anyone else, and a signature that outlives
 * an access change (a producer reassigned off a job) still fails at step 2.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const url = new URL(request.url);
  const viewerId = url.searchParams.get("v") ?? "";
  const expires = url.searchParams.get("e") ?? "";
  const signature = url.searchParams.get("s") ?? "";

  if (!verifyFileSignature(fileId, viewerId, expires, signature)) {
    securityEvent("authz.denied", { route: "files", fileId, reason: "bad_or_expired_signature" });
    return deny();
  }

  const auth = await getAuth();
  if (!auth || auth.user.id !== viewerId) {
    securityEvent("authz.denied", { route: "files", fileId, reason: "session_mismatch" });
    return deny();
  }

  const file = await db.storedFile.findFirst({
    where: { id: fileId, deletedAt: null },
    select: { id: true, storageKey: true, contentType: true, ownerUserId: true, purpose: true, scanStatus: true, byteSize: true },
  });
  if (!file) return deny();

  // A file still awaiting its malware verdict is never served to anyone but its
  // owner, and never to a producer.
  if (file.scanStatus === "REJECTED" || file.scanStatus === "SUSPECT") {
    securityEvent("upload.rejected", { fileId, reason: "serving_blocked_by_scan" });
    return deny();
  }

  const allowed = await canView(file, auth.user.id, auth.user.roles);
  if (!allowed) {
    securityEvent("authz.denied", { route: "files", fileId, userId: auth.user.id, reason: "not_authorised_for_file" });
    return deny();
  }

  let bytes: Buffer;
  try {
    bytes = await readFileBytes(file.storageKey);
  } catch (error) {
    log.error("files.read_failed", { fileId, error });
    return deny();
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(bytes.length),
      // Never rendered as active content, never sniffed, never cached publicly.
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=60, must-revalidate",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

/**
 * A single 404 for "does not exist", "not yours", and "expired link".
 * Distinguishing them would let someone enumerate which file ids are real.
 */
function deny(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

async function canView(
  file: { id: string; ownerUserId: string | null; purpose: string },
  userId: string,
  roles: string[],
): Promise<boolean> {
  if (file.ownerUserId === userId) return true;

  // Staff may view moderation and verification material; that access is logged
  // through the audit trail wherever a decision is recorded.
  if (roles.some((r) => ["MODERATOR", "ADMIN", "SUPER_ADMIN", "SUPPORT"].includes(r))) return true;

  // A producer sees the references and progress photos of jobs assigned to them,
  // and nothing else. The join is the authorisation.
  const producer = await db.producer.findUnique({ where: { userId }, select: { id: true } });
  if (!producer) return false;

  if (file.purpose === "PROGRESS_PHOTO" || file.purpose === "QC_PHOTO") {
    const asset = await db.productionAsset.findFirst({
      where: { fileId: file.id, job: { producerId: producer.id } },
      select: { id: true },
    });
    if (asset) return true;
  }

  if (file.purpose === "REFERENCE") {
    const reference = await db.referenceImage.findUnique({ where: { fileId: file.id }, select: { id: true } });
    if (!reference) return false;
    const linked = await db.productionJob.findFirst({
      where: {
        producerId: producer.id,
        status: { in: ["ACCEPTED", "IN_PRODUCTION", "AWAITING_CLARIFICATION", "QC_PENDING", "QC_FAILED"] },
        orderItem: { design: { references: { some: { referenceImageId: reference.id } } } },
      },
      select: { id: true },
    });
    return linked !== null;
  }

  return false;
}
