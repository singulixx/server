// server/src/utils/audit.ts
import prisma from "./prisma.js";

export type AuditMeta = Record<string, any> | null | undefined;

export type LogAuditParams = {
  actorId?: number | null; // disimpan via relation user (jika ada)
  actorRole?: "OWNER" | "STAFF" | string | null; // diterima tapi tidak disimpan sebagai kolom tersendiri
  action: string; // DISIMPAN -> action
  method?: string | null; // dimasukkan ke meta (tidak disimpan sebagai kolom terpisah)
  path?: string | null; // dimasukkan ke meta
  ip?: string | null; // dimasukkan ke meta
  status?: number | null; // dimasukkan ke meta
  success?: boolean | null; // dimasukkan ke meta
  metadata?: AuditMeta; // DISIMPAN -> meta (digabung dengan fields di atas)
  target?: string | null; // DISIMPAN -> entity
  targetId?: number | null; // DISIMPAN -> entityId
  // fleksibel: izinkan properti ekstra
  [k: string]: any;
};

/**
 * logAudit
 * - Menyimpan audit ke DB lewat prisma.auditLog.create (sesuai model Anda).
 * - Hanya field yang ada di schema yang disimpan sebagai kolom; fields lain
 *   (status, path, method, ip, success, metadata) digabung menjadi `meta`.
 * - Fungsi ini tidak akan melempar error ke caller; semua error ditangani internal.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  const {
    actorId = null,
    action,
    metadata = null,
    target = "misc",
    targetId = null,
    method = null,
    path = null,
    ip = null,
    status = null,
    success = null,
  } = params;

  // prepare meta: gabungkan metadata yang diberikan dengan fields tambahan
  const metaToStore: Record<string, any> = {
    ...(metadata ?? {}),
  };

  // only include additional fields when defined (keep meta small)
  if (typeof method !== "undefined" && method !== null) metaToStore.method = method;
  if (typeof path !== "undefined" && path !== null) metaToStore.path = path;
  if (typeof ip !== "undefined" && ip !== null) metaToStore.ip = ip;
  if (typeof status !== "undefined" && status !== null) metaToStore.status = status;
  if (typeof success !== "undefined" && success !== null) metaToStore.success = success;

  // include actorRole in metadata for observability (even if not stored in dedicated col)
  if (typeof params.actorRole !== "undefined" && params.actorRole !== null) {
    metaToStore.actorRole = params.actorRole;
  }

  // add timestamp for easier debugging in raw meta
  metaToStore._loggedAt = new Date().toISOString();

  // console log for dev / immediate visibility
  try {
    console.info("[audit] action=%s user=%s entity=%s entityId=%s meta=%s",
      action,
      actorId ?? "anon",
      target ?? "misc",
      targetId ?? "null",
      JSON.stringify(metaToStore)
    );
  } catch (e) {
    // ignore logging issues
  }

  // Persist to DB (if prisma client and model exist). swallow DB errors.
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity: target ?? "misc",
        entityId: targetId ?? null,
        // store meta as JSON (Prisma JSON field), cast to any to avoid TS issues
        meta: metaToStore as any,
        // connect user if actorId provided and relation exists in schema
        ...(actorId != null ? { user: { connect: { id: actorId } } } : {}),
      },
    });
  } catch (e) {
    // Do not throw — audit should not break main flow.
    // Log the error for debugging.
    console.warn("[audit] persistence failed (ignored):", (e as Error).message || e);
  }
}

/**
 * Compat wrapper for legacy calls:
 * audit(userId, action, target, targetId?, metadata?)
 */
export async function audit(
  userId: number | null,
  action: string,
  target: string,
  targetId?: number | null,
  metadata?: AuditMeta
) {
  await logAudit({
    actorId: userId ?? null,
    action,
    target,
    targetId: targetId ?? null,
    metadata: metadata ?? {},
  });
}

export default { logAudit, audit };
