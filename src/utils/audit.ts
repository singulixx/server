// server/src/utils/audit.ts
import prisma from "./prisma";

export type AuditMeta = Record<string, any> | null | undefined;

type LogAuditParams = {
  actorId?: number | null; // disimpan ke userId (relasi)
  actorRole?: "OWNER" | "STAFF" | null; // DITERIMA tapi TIDAK disimpan (schema tidak ada)
  action: string; // DISIMPAN -> action
  method?: string | null; // DITERIMA tapi TIDAK disimpan
  path?: string | null; // DITERIMA tapi TIDAK disimpan
  ip?: string | null; // DITERIMA tapi TIDAK disimpan
  metadata?: AuditMeta; // DISIMPAN -> meta (JSON)
  target?: string | null; // DISIMPAN -> entity
  targetId?: number | null; // DISIMPAN -> entityId
};

/**
 * Logger modern untuk audit trail.
 * Catatan: hanya field yang ada di schema yang disimpan.
 */
export async function logAudit(params: LogAuditParams) {
  const {
    actorId = null,
    action,
    metadata,
    target = "misc",
    targetId = null,
  } = params;

  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity: target || "misc",
        entityId: targetId ?? null,
        meta: (metadata ?? {}) as any,
        ...(actorId != null ? { user: { connect: { id: actorId } } } : {}),
      },
    });
  } catch (e) {
    console.error("logAudit error:", e);
  }
}

/**
 * Compat wrapper untuk kode lama:
 *   audit(userId, action, target, targetId?, metadata?)
 * Misal: audit(1, "CREATE", "Ball", 123, { code: "..." })
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
