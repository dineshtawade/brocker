import test from "node:test";
import assert from "node:assert/strict";
import {
  capProPlusExpiry,
  exclusiveUnlockError,
  fullPhotoError,
  hasDiAutoPay,
  hasDiAccess,
  hasProPlusAutoPay,
  hasProPlusAccess,
  regularUnlockError,
} from "../src/rules.js";

const now = new Date("2026-10-13T12:00:00");

function scenario(overrides = {}) {
  return {
    di: { source: "none", accessActive: false, autoPayActive: false, expiresAt: "", paidThroughAt: "" },
    proPlus: { accessActive: false, autoPayActive: false, expiresAt: "" },
    listings: { regularUnlocked: false, exclusiveUnlocked: false },
    ...overrides,
  };
}

test("DI access requires an enabled source and a future expiry or active auto-pay", () => {
  assert.equal(hasDiAccess(scenario(), now), false);
  assert.equal(hasDiAccess(scenario({ di: { source: "one_time", accessActive: true, expiresAt: "2026-10-14T00:00" } }), now), true);
  assert.equal(hasDiAccess(scenario({ di: { source: "one_time", accessActive: true, expiresAt: "2026-10-13T11:59" } }), now), false);
  assert.equal(hasDiAccess(scenario({ di: { source: "auto_pay", accessActive: true, autoPayActive: true, paidThroughAt: "" } }), now), true);
  assert.equal(hasDiAccess(scenario({ di: { source: "auto_pay", accessActive: true, autoPayActive: true, paidThroughAt: "2026-10-13T11:59" } }), now), false);
});

test("Pro Plus access observes its active flag and expiry", () => {
  assert.equal(hasProPlusAccess(scenario({ proPlus: { accessActive: true, expiresAt: "2026-10-14T00:00" } }), now), true);
  assert.equal(hasProPlusAccess(scenario({ proPlus: { accessActive: true, expiresAt: "2026-10-13T11:59" } }), now), false);
  assert.equal(hasProPlusAccess(scenario({ proPlus: { accessActive: true, autoPayActive: true, expiresAt: "" } }), now), true);
});

test("scheduled cancellation remains active until the paid-through date", () => {
  const di = scenario({
    di: {
      source: "auto_pay",
      accessActive: true,
      autoPayActive: true,
      pendingCancellation: true,
      paidThroughAt: "2026-10-14T12:00",
    },
  });
  assert.equal(hasDiAutoPay(di, now), true);
  assert.equal(hasDiAccess(di, now), true);
  assert.equal(hasDiAutoPay(di, new Date("2026-10-14T12:00")), false);
  assert.equal(hasDiAccess(di, new Date("2026-10-14T12:00")), false);

  const pro = scenario({
    proPlus: {
      accessActive: true,
      autoPayActive: true,
      pendingCancellation: true,
      expiresAt: "2026-10-14T12:00",
    },
  });
  assert.equal(hasProPlusAutoPay(pro, now), true);
  assert.equal(hasProPlusAccess(pro, now), true);
  assert.equal(hasProPlusAutoPay(pro, new Date("2026-10-14T12:00")), false);
  assert.equal(hasProPlusAccess(pro, new Date("2026-10-14T12:00")), false);
});

test("auto-pay with a paid-through lapse is no longer treated as active", () => {
  const state = scenario({
    di: {
      source: "auto_pay",
      accessActive: true,
      autoPayActive: true,
      paidThroughAt: "2026-10-13T11:59",
    },
    proPlus: {
      accessActive: true,
      autoPayActive: true,
      expiresAt: "2026-10-13T11:59",
    },
  });
  assert.equal(hasDiAutoPay(state, now), false);
  assert.equal(hasDiAccess(state, now), false);
  assert.equal(hasProPlusAutoPay(state, now), false);
  assert.equal(hasProPlusAccess(state, now), false);
});

test("feature access reports the correct prerequisite error", () => {
  const noAccess = scenario();
  assert.equal(regularUnlockError(noAccess, now), "DI_REQUIRED");
  assert.equal(exclusiveUnlockError(noAccess, now), "DI_REQUIRED");

  const diOnly = scenario({
    di: { source: "one_time", accessActive: true, expiresAt: "2026-10-14T00:00" },
  });
  assert.equal(regularUnlockError(diOnly, now), null);
  assert.equal(exclusiveUnlockError(diOnly, now), "PRO_PLUS_REQUIRED");
  assert.equal(fullPhotoError(diOnly, now), "CONTACT_NOT_UNLOCKED");
  diOnly.listings.regularUnlocked = true;
  assert.equal(fullPhotoError(diOnly, now), "PRO_PLUS_REQUIRED");
  diOnly.proPlus = { accessActive: true, expiresAt: "2026-10-14T00:00" };
  assert.equal(exclusiveUnlockError(diOnly, now), null);
  assert.equal(fullPhotoError(diOnly, now), null);
});

test("Pro Plus one-time expiry is capped at DI expiry", () => {
  const capped = capProPlusExpiry("2027-01-13T12:00", "2026-10-25T12:00");
  assert.deepEqual(capped, { expiresAt: "2026-10-25T12:00", capped: true });
  assert.deepEqual(
    capProPlusExpiry("2026-10-20T12:00", "2026-10-25T12:00"),
    { expiresAt: "2026-10-20T12:00", capped: false },
  );
  assert.deepEqual(capProPlusExpiry("2027-01-13T12:00", ""), {
    expiresAt: "2027-01-13T12:00",
    capped: false,
  });
});
