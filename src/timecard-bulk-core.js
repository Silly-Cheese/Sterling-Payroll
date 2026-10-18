// Pure policy helpers shared by the bulk approval UI and Node tests.
export const isPendingTimecard = entry => Boolean(entry) && (entry.status || "pending") === "pending";

export function canApproveTimecard(entry, actorUid, {admin = false, owner = false} = {}) {
 return Boolean(admin && actorUid && entry?.id && isPendingTimecard(entry) &&
  (owner || entry.createdBy !== actorUid));
}

export function eligibleTimecards(entries, actorUid, permissions) {
 return entries.filter(entry => canApproveTimecard(entry, actorUid, permissions));
}

export function timecardChunks(entries, size = 8) {
 if (!Number.isInteger(size) || size < 1 || size > 100) throw Error("Invalid approval batch size.");
 const chunks = [];
 for (let i = 0; i < entries.length; i += size) chunks.push(entries.slice(i, i + size));
 return chunks;
}
