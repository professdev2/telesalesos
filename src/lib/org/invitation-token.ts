import { createHash, randomBytes } from "node:crypto";

/**
 * Matches `private.hash_invitation_token` in the migration: SHA-256 hex of the
 * UTF-8 token. The database only stores this hash; the raw token lives in the
 * copyable URL for as long as the inviter keeps it.
 */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
