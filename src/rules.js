// src/rules.js
// Pure business logic — no DOM, no side effects.
// Every rule from Part C of the spec lives here.

/* ---------- Helpers ---------- */

function isFuture(dateStr, now) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > now.getTime();
}

/* ---------- Access checks ---------- */

/**
 * DI auto-pay is "active" when the flag is on AND either:
 * - no paidThroughAt is set (indefinite / just-started), OR
 * - paidThroughAt is in the future.
 */
export function hasDiAutoPay(state, now = new Date()) {
  if (!state.di.autoPayActive) return false;
  return !state.di.paidThroughAt || isFuture(state.di.paidThroughAt, now);
}

/**
 * Pro Plus auto-pay is "active" when the flag is on AND either:
 * - no expiresAt is set (indefinite), OR
 * - expiresAt is in the future.
 */
export function hasProPlusAutoPay(state, now = new Date()) {
  if (!state.proPlus.autoPayActive) return false;
  return !state.proPlus.expiresAt || isFuture(state.proPlus.expiresAt, now);
}

/**
 * DI access is active when:
 * - source is not "none", AND
 * - accessActive flag is true, AND
 * - (auto-pay source → auto-pay active) OR (expiresAt in future).
 */
export function hasDiAccess(state, now = new Date()) {
  if (state.di.source === "none" || !state.di.accessActive) return false;

  if (state.di.source === "auto_pay") {
    if (hasDiAutoPay(state, now)) return true;
    // Fallback: admin grant / manual override with explicit expiry
    return isFuture(state.di.expiresAt, now);
  }

  return isFuture(state.di.expiresAt, now);
}

/**
 * Pro Plus access is active when:
 * - accessActive flag is true, AND
 * - (auto-pay active) OR (expiresAt in future).
 */
export function hasProPlusAccess(state, now = new Date()) {
  if (!state.proPlus.accessActive) return false;

  if (state.proPlus.autoPayActive) {
    if (hasProPlusAutoPay(state, now)) return true;
    return isFuture(state.proPlus.expiresAt, now);
  }

  return isFuture(state.proPlus.expiresAt, now);
}

/* ---------- Feature error codes ---------- */

export function regularUnlockError(state, now = new Date()) {
  return hasDiAccess(state, now) ? null : "DI_REQUIRED";
}

export function exclusiveUnlockError(state, now = new Date()) {
  if (!hasDiAccess(state, now)) return "DI_REQUIRED";
  if (!hasProPlusAccess(state, now)) return "PRO_PLUS_REQUIRED";
  return null;
}

export function fullPhotoError(state, now = new Date()) {
  const unlocked =
    state.listings.regularUnlocked || state.listings.exclusiveUnlocked;
  if (!unlocked) return "CONTACT_NOT_UNLOCKED";
  if (!hasProPlusAccess(state, now)) return "PRO_PLUS_REQUIRED";
  return null;
}

/* ---------- Expiry caps ---------- */

export function capProPlusExpiry(proposedExpiry, diExpiry) {
  if (!diExpiry) return { expiresAt: proposedExpiry, capped: false };

  const proposed = new Date(proposedExpiry);
  const di = new Date(diExpiry);

  if (Number.isNaN(proposed.getTime()) || Number.isNaN(di.getTime())) {
    throw new RangeError("Expiry dates must be valid dates.");
  }

  return proposed > di
    ? { expiresAt: diExpiry, capped: true }
    : { expiresAt: proposedExpiry, capped: false };
}