// src/app.js
// UI layer: state, rendering, event handling, action log.

import {
  capProPlusExpiry,
  exclusiveUnlockError,
  fullPhotoError,
  hasDiAutoPay,
  hasDiAccess,
  hasProPlusAutoPay,
  hasProPlusAccess,
  regularUnlockError,
} from "./rules.js";

/* =========================================================
   SMALL HELPERS
   ========================================================= */

const $ = (selector, root = document) => root.querySelector(selector);

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

function localDateTime(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function addMonths(value, months) {
  const date = new Date(value);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(months));
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return localDateTime(date);
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return localDateTime(date);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function money(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function daysRemaining(from, to) {
  return Math.max(0, (new Date(to) - new Date(from)) / 86_400_000);
}

function remainingProration(monthlyPrice, now, end) {
  const cycleStart = addMonths(end, -1);
  const cycleLength = Math.max(1, new Date(end) - new Date(cycleStart));
  const fraction = (daysRemaining(now, end) * 86_400_000) / cycleLength;
  return Math.round(Number(monthlyPrice) * fraction * 100) / 100;
}

/* =========================================================
   STATE
   ========================================================= */

const initialState = () => ({
  now: localDateTime(new Date()),
  screen: "inventory",
  shopTab: "di",
  di: {
    accessActive: false,
    expiresAt: "",
    source: "none",
    autoPayActive: false,
    pendingCancellation: false,
    paidThroughAt: "",
  },
  proPlus: {
    accessActive: false,
    expiresAt: "",
    autoPayActive: false,
    bundledWithDi: false,
    pendingCancellation: false,
  },
  catalog: {
    diAuto: { id: "di-monthly", label: "Owner Monthly", price: 19.99 },
    diOneTime: {
      id: "di-90-day",
      label: "Owner 90-Day Pass",
      price: 49.99,
      durationMonths: 3,
    },
    proAuto: { id: "pro-monthly", label: "Pro Plus Monthly", price: 9.99 },
    proOneTime: {
      id: "pro-90-day",
      label: "Pro Plus 90-Day Pass",
      price: 24.99,
      durationMonths: 3,
    },
    combined: {
      primaryPlanId: "di-monthly",
      addonPlanId: "pro-monthly",
      price: 26.99,
    },
    proAutoAvailable: true,
  },
  listings: { regularUnlocked: false, exclusiveUnlocked: false },
  log: [],
});

let state = initialState();

/* =========================================================
   PRESETS
   ========================================================= */

const presets = {
  new: () => {
    const fresh = initialState();
    state.di = fresh.di;
    state.proPlus = fresh.proPlus;
  },
  midcycle: () => {
    const fresh = initialState();
    state.di = {
      accessActive: true,
      expiresAt: "",
      source: "auto_pay",
      autoPayActive: true,
      pendingCancellation: false,
      paidThroughAt: addDays(state.now, 18),
    };
    state.proPlus = fresh.proPlus;
  },
  oneTime: () => {
    const fresh = initialState();
    state.di = {
      accessActive: true,
      expiresAt: addDays(state.now, 12),
      source: "one_time",
      autoPayActive: false,
      pendingCancellation: false,
      paidThroughAt: "",
    };
    state.proPlus = fresh.proPlus;
  },
  bundled: () => {
    const fresh = initialState();
    state.di = {
      accessActive: true,
      expiresAt: "",
      source: "auto_pay",
      autoPayActive: true,
      pendingCancellation: false,
      paidThroughAt: addDays(state.now, 22),
    };
    state.proPlus = {
      accessActive: true,
      expiresAt: addDays(state.now, 22),
      autoPayActive: true,
      bundledWithDi: true,
      pendingCancellation: false,
    };
  },
  standalonePro: () => {
    const fresh = initialState();
    state.di = {
      accessActive: true,
      expiresAt: "",
      source: "auto_pay",
      autoPayActive: true,
      pendingCancellation: false,
      paidThroughAt: addDays(state.now, 14),
    };
    state.proPlus = {
      accessActive: true,
      expiresAt: addDays(state.now, 14),
      autoPayActive: true,
      bundledWithDi: false,
      pendingCancellation: false,
    };
  },
};

/* =========================================================
   FIELD BINDINGS
   ========================================================= */

const fields = {
  now: ["now"],
  "di.accessActive": ["di", "accessActive"],
  "di.source": ["di", "source"],
  "di.expiresAt": ["di", "expiresAt"],
  "di.autoPayActive": ["di", "autoPayActive"],
  "di.pendingCancellation": ["di", "pendingCancellation"],
  "di.paidThroughAt": ["di", "paidThroughAt"],
  "proPlus.accessActive": ["proPlus", "accessActive"],
  "proPlus.expiresAt": ["proPlus", "expiresAt"],
  "proPlus.autoPayActive": ["proPlus", "autoPayActive"],
  "proPlus.bundledWithDi": ["proPlus", "bundledWithDi"],
  "proPlus.pendingCancellation": ["proPlus", "pendingCancellation"],
  "catalog.proAutoAvailable": ["catalog", "proAutoAvailable"],
  "catalog.diAuto.id": ["catalog", "diAuto", "id"],
  "catalog.diAuto.label": ["catalog", "diAuto", "label"],
  "catalog.diAuto.price": ["catalog", "diAuto", "price"],
  "catalog.diOneTime.id": ["catalog", "diOneTime", "id"],
  "catalog.diOneTime.label": ["catalog", "diOneTime", "label"],
  "catalog.diOneTime.price": ["catalog", "diOneTime", "price"],
  "catalog.diOneTime.durationMonths": ["catalog", "diOneTime", "durationMonths"],
  "catalog.proAuto.id": ["catalog", "proAuto", "id"],
  "catalog.proAuto.label": ["catalog", "proAuto", "label"],
  "catalog.proAuto.price": ["catalog", "proAuto", "price"],
  "catalog.proOneTime.id": ["catalog", "proOneTime", "id"],
  "catalog.proOneTime.label": ["catalog", "proOneTime", "label"],
  "catalog.proOneTime.price": ["catalog", "proOneTime", "price"],
  "catalog.proOneTime.durationMonths": ["catalog", "proOneTime", "durationMonths"],
  "catalog.combined.primaryPlanId": ["catalog", "combined", "primaryPlanId"],
  "catalog.combined.addonPlanId": ["catalog", "combined", "addonPlanId"],
  "catalog.combined.price": ["catalog", "combined", "price"],
};

function readPath(path) {
  return path.reduce((obj, key) => obj[key], state);
}

function writePath(path, value) {
  const parent = path.slice(0, -1).reduce((obj, key) => obj[key], state);
  parent[path.at(-1)] = value;
}

/* =========================================================
   FORM CONTROLS
   ========================================================= */

function control(path, label, type = "text", options = {}) {
  const value = readPath(fields[path]);
  const id = `field-${path.replaceAll(".", "-")}`;

  if (type === "checkbox") {
    return `<label class="toggle-row" for="${id}">
      <span>${label}</span>
      <input id="${id}" type="checkbox" data-path="${path}" ${value ? "checked" : ""}>
      <span class="toggle-ui" aria-hidden="true"></span>
    </label>`;
  }

  if (type === "select") {
    return `<div class="field">
      <label class="field-label" for="${id}">${label}</label>
      <select id="${id}" data-path="${path}">
        ${options
          .map(
            ([key, text]) =>
              `<option value="${key}" ${value === key ? "selected" : ""}>${text}</option>`
          )
          .join("")}
      </select>
    </div>`;
  }

  return `<div class="field">
    <label class="field-label" for="${id}">${label}</label>
    <input id="${id}" data-path="${path}" type="${type}" value="${escapeHtml(
    value
  )}" ${type === "number" ? 'min="0" step="0.01"' : ""}>
  </div>`;
}

/* =========================================================
   SCENARIO PANEL MARKUP
   ========================================================= */

function validationWarnings() {
  const warnings = [];
  if (
    state.di.source === "none" &&
    (state.di.accessActive || state.di.expiresAt || state.di.autoPayActive)
  ) {
    warnings.push("Source is None, but DI access, expiry, or auto-pay is set.");
  }
  if (state.di.source === "auto_pay" && !state.di.autoPayActive) {
    warnings.push("Auto-pay is the access source, but DI auto-pay is inactive.");
  }
  if (state.di.source === "one_time" && state.di.autoPayActive) {
    warnings.push("One-time DI access should not have auto-pay enabled.");
  }
  if (
    state.di.source === "auto_pay" &&
    state.di.paidThroughAt &&
    state.di.expiresAt &&
    state.di.paidThroughAt !== state.di.expiresAt
  ) {
    warnings.push("DI expiry differs from its auto-pay paid-through date.");
  }
  if (state.proPlus.bundledWithDi && !state.di.autoPayActive) {
    warnings.push("Pro Plus is bundled, but DI auto-pay is not active.");
  }
  return warnings.length
    ? `<ul class="validation-warnings">${warnings
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    : "";
}

function scenarioMarkup() {
  const nowDate = new Date(state.now);
  const activeDi = hasDiAccess(state, nowDate);
  const activePro = hasProPlusAccess(state, nowDate);

  return `
    <!-- Presets -->
    <div class="preset-block">
      <span class="group-label">QUICK SCENARIOS</span>
      <div class="preset-list">
        <button class="preset-button" data-preset="new">
          <span class="preset-icon">＋</span>
          <span><strong>New broker</strong><small>No subscriptions yet</small></span>
        </button>
        <button class="preset-button" data-preset="midcycle">
          <span class="preset-icon">↻</span>
          <span><strong>DI auto-pay mid-cycle</strong><small>18 days paid through</small></span>
        </button>
        <button class="preset-button" data-preset="oneTime">
          <span class="preset-icon">◷</span>
          <span><strong>DI one-time, 12 days left</strong><small>Nearly expired</small></span>
        </button>
        <button class="preset-button" data-preset="bundled">
          <span class="preset-icon">✦</span>
          <span><strong>Bundled DI + Pro Plus</strong><small>Combined auto-pay</small></span>
        </button>
        <button class="preset-button" data-preset="standalonePro">
          <span class="preset-icon">◇</span>
          <span><strong>Standalone Pro Plus</strong><small>Separate auto-pay</small></span>
        </button>
      </div>
    </div>

    <!-- Simulated time -->
    <div class="scenario-section">
      <div class="section-title">
        <span class="section-icon">◷</span>
        <h3>Simulated time</h3>
      </div>
      <div class="field-grid">
        <div class="field-full">${control("now", "Current date & time", "datetime-local")}</div>
      </div>
      <div class="advance-row">
        <button class="text-button" data-advance="-1">− 1 day</button>
        <button class="text-button" data-advance="1">+ 1 day</button>
        <button class="text-button" data-advance="7">+ 7 days</button>
        <button class="text-button" data-advance="30">+ 30 days</button>
      </div>
    </div>

    <!-- Owner Subscription -->
    <div class="scenario-section">
      <div class="section-title">
        <span class="section-icon">⌂</span>
        <h3>Owner Subscription</h3>
        <span class="state-pill ${activeDi ? "pill-on" : "pill-off"}">${
    activeDi ? "ACTIVE" : "INACTIVE"
  }</span>
      </div>
      ${control("di.accessActive", "DI access active", "checkbox")}
      <div class="field-grid">
        ${control("di.source", "Access source", "select", [
          ["none", "None"],
          ["one_time", "One-time"],
          ["auto_pay", "Auto-pay"],
          ["admin_grant", "Admin grant"],
        ])}
        ${control("di.expiresAt", "Access expires at", "datetime-local")}
        ${control("di.paidThroughAt", "Paid through (auto-pay)", "datetime-local")}
      </div>
      ${control("di.autoPayActive", "DI auto-pay active", "checkbox")}
      ${control("di.pendingCancellation", "Pending cancellation", "checkbox")}
      ${validationWarnings()}
    </div>

    <!-- Pro Plus -->
    <div class="scenario-section">
      <div class="section-title">
        <span class="section-icon">✦</span>
        <h3>Pro Plus</h3>
        <span class="state-pill ${activePro ? "pill-on" : "pill-off"}">${
    activePro ? "ACTIVE" : "INACTIVE"
  }</span>
      </div>
      ${control("proPlus.accessActive", "Pro Plus access active", "checkbox")}
      <div class="field-grid">
        <div class="field-full">${control("proPlus.expiresAt", "Pro Plus expires at", "datetime-local")}</div>
      </div>
      ${control("proPlus.autoPayActive", "Pro Plus auto-pay active", "checkbox")}
      ${control("proPlus.bundledWithDi", "Bundled with DI auto-pay", "checkbox")}
      ${control("proPlus.pendingCancellation", "Pending cancellation", "checkbox")}
    </div>

    <!-- Catalog -->
    <details class="scenario-section catalog-section">
      <summary>
        <span class="section-icon">▦</span>
        <span>Plan catalog</span>
        <span class="summary-hint">Edit plans &amp; prices</span>
      </summary>
      <div class="catalog-group">
        <h4>Owner Subscription</h4>
        ${catalogFields("catalog.diAuto", "Monthly auto-pay", [
          ["id", "Plan ID"],
          ["label", "Plan label"],
          ["price", "Monthly price", "number"],
        ])}
        ${catalogFields("catalog.diOneTime", "One-time plan", [
          ["id", "Plan ID"],
          ["label", "Plan label"],
          ["price", "Price", "number"],
          ["durationMonths", "Duration (months)", "number"],
        ])}
      </div>
      <div class="catalog-group">
        <h4>Pro Plus</h4>
        ${control("catalog.proAutoAvailable", "Pro Plus auto-pay plans available", "checkbox")}
        ${catalogFields("catalog.proAuto", "Standalone auto-pay", [
          ["id", "Plan ID"],
          ["label", "Plan label"],
          ["price", "Monthly price", "number"],
        ])}
        ${catalogFields("catalog.proOneTime", "One-time plan", [
          ["id", "Plan ID"],
          ["label", "Plan label"],
          ["price", "Price", "number"],
          ["durationMonths", "Duration (months)", "number"],
        ])}
      </div>
      <div class="catalog-group">
        <h4>Combined DI + Pro Plus</h4>
        ${catalogFields("catalog.combined", "Combined auto-pay", [
          ["primaryPlanId", "Primary plan ID"],
          ["addonPlanId", "Add-on plan ID"],
          ["price", "Combined monthly price", "number"],
        ])}
      </div>
    </details>
  `;
}

function catalogFields(prefix, title, config) {
  return `<div class="catalog-plan">
    <h5>${title}</h5>
    <div class="field-grid">
      ${config
        .map(
          ([key, label, type = "text"]) =>
            `<div>${control(`${prefix}.${key}`, label, type)}</div>`
        )
        .join("")}
    </div>
  </div>`;
}

/* =========================================================
   EMULATOR MARKUP
   ========================================================= */

function statusLine(label, active, expiresAt, badge) {
  return `<div class="access-line">
    <span class="access-indicator ${active ? "access-yes" : ""}"></span>
    <span class="access-name">${label}</span>
    <span class="access-detail">${
      active ? `Until ${escapeHtml(formatDate(expiresAt))}` : "Not active"
    }</span>
    ${badge ? `<span class="mini-badge">${badge}</span>` : ""}
  </div>`;
}

function outcomeBadge(active, text) {
  return `<span class="state-pill ${active ? "pill-on" : "pill-off"}">${text}</span>`;
}

function emulatorMarkup() {
  const nowDate = new Date(state.now);
  const diActive = hasDiAccess(state, nowDate);
  const proActive = hasProPlusAccess(state, nowDate);
  const addOnsVisible = diActive && state.catalog.proAutoAvailable;

  const diExpiry =
    state.di.source === "auto_pay" ? state.di.paidThroughAt : state.di.expiresAt;

  return `
    <div class="phone-frame">
      <div class="phone-status">
        <span>9:41</span>
        <span class="phone-status-icons" aria-hidden="true">●●●　◖</span>
      </div>
      <div class="phone-content">
        <div class="app-greeting">
          <div>
            <p class="eyebrow">GOOD MORNING</p>
            <h2>Find your next deal.</h2>
          </div>
          <div class="avatar" aria-hidden="true">AR</div>
        </div>

        <div class="access-summary">
          <div class="summary-heading">
            <span>Your access</span>
            <span class="summary-live"><span></span> LIVE</span>
          </div>
          ${statusLine(
            "Owner Subscription",
            diActive,
            diExpiry,
            hasDiAutoPay(state, nowDate)
              ? state.di.pendingCancellation
                ? "CANCELS AT END"
                : "AUTO-PAY"
              : ""
          )}
          ${statusLine(
            "Pro Plus",
            proActive,
            state.proPlus.expiresAt,
            hasProPlusAutoPay(state, nowDate)
              ? state.proPlus.pendingCancellation
                ? "CANCELS AT END"
                : "AUTO-PAY"
              : ""
          )}
        </div>

        <nav class="app-tabs" aria-label="App navigation">
          <button class="${state.screen === "inventory" ? "selected" : ""}" data-screen="inventory">
            Inventory
          </button>
          <button class="${state.screen === "pricing" ? "selected" : ""}" data-screen="pricing">
            Pricing ${!proActive ? '<span class="tab-dot" aria-hidden="true"></span>' : ""}
          </button>
        </nav>

        ${
          state.screen === "inventory"
            ? inventoryMarkup(diActive, proActive)
            : pricingMarkup(diActive, proActive, addOnsVisible)
        }
      </div>
      <div class="phone-home" aria-hidden="true"><span></span></div>
    </div>

    <section class="action-log" aria-labelledby="log-title">
      <div class="log-heading">
        <div>
          <p class="eyebrow">SESSION TRACE</p>
          <h3 id="log-title">Action log</h3>
        </div>
        <span class="log-count">${state.log.length} ${
    state.log.length === 1 ? "event" : "events"
  }</span>
      </div>
      ${
        state.log.length
          ? `<ol class="log-list">${[...state.log]
              .reverse()
              .map(
                (entry) => `<li class="log-entry">
                  <span class="log-status status-${entry.status}">${entry.status}</span>
                  <div class="log-copy">
                    <strong>${escapeHtml(entry.action)}</strong>
                    <p>
                      <code>${escapeHtml(entry.code)}</code>
                      <span>${escapeHtml(entry.message)}</span>
                    </p>
                  </div>
                  <time datetime="${escapeHtml(entry.at)}">${escapeHtml(
                  formatDate(entry.at)
                )}</time>
                </li>`
              )
              .join("")}</ol>`
          : `<div class="empty-log">
              <span aria-hidden="true">⌁</span>
              <p>Your journey starts here.</p>
              <small>App actions and outcomes will appear in this trace.</small>
            </div>`
      }
    </section>
  `;
}

function inventoryMarkup(diActive, proActive) {
  return `
    <div class="screen-content">
      <div class="screen-title">
        <div>
          <span class="eyebrow">AVAILABLE FOR YOU</span>
          <h3>Featured homes</h3>
        </div>
        <button class="filter-button" aria-label="Filter listings">☷</button>
      </div>

      <article class="listing-card">
        <div class="listing-photo regular-photo">
          <span class="listing-tag">OWNER DIRECT</span>
          <span class="photo-count">▧ 8</span>
        </div>
        <div class="listing-info">
          <div class="listing-location">BANDRA WEST <span>· MUMBAI</span></div>
          <h4>Sunlit 2 BHK with a sea breeze</h4>
          <div class="listing-meta">2 bed <span>·</span> 2 bath <span>·</span> 1,120 sq ft</div>
          <div class="listing-bottom">
            <strong>₹ 2.85 Cr</strong>
            ${outcomeBadge(
              diActive && state.listings.regularUnlocked,
              state.listings.regularUnlocked ? "UNLOCKED" : "OWNER LISTING"
            )}
          </div>
        </div>
        <div class="listing-actions">
          <button class="primary-button compact" data-action="unlock-regular" ${
            state.listings.regularUnlocked ? "disabled" : ""
          }>
            ${state.listings.regularUnlocked ? "Contact unlocked" : "Unlock owner contact"}
          </button>
          <button class="secondary-button compact" data-action="full-photo" ${
            !state.listings.regularUnlocked ? "disabled" : ""
          }>
            Full-res photos
          </button>
        </div>
      </article>

      <article class="listing-card exclusive-card">
        <div class="listing-photo exclusive-photo">
          <span class="listing-tag exclusive-tag">✦ PRO EXCLUSIVE</span>
          <span class="photo-count">▧ 12</span>
        </div>
        <div class="listing-info">
          <div class="listing-location">JUHU <span>· MUMBAI</span></div>
          <h4>Private terrace, quiet city views</h4>
          <div class="listing-meta">3 bed <span>·</span> 3 bath <span>·</span> 1,860 sq ft</div>
          <div class="listing-bottom">
            <strong>₹ 5.40 Cr</strong>
            ${outcomeBadge(
              proActive && state.listings.exclusiveUnlocked,
              state.listings.exclusiveUnlocked ? "UNLOCKED" : "EXCLUSIVE"
            )}
          </div>
        </div>
        <div class="listing-actions">
          <button class="primary-button compact" data-action="unlock-exclusive" ${
            state.listings.exclusiveUnlocked ? "disabled" : ""
          }>
            ${
              state.listings.exclusiveUnlocked
                ? "Contact unlocked"
                : "Unlock exclusive contact"
            }
          </button>
          <button class="secondary-button compact" data-action="full-photo" ${
            !state.listings.exclusiveUnlocked ? "disabled" : ""
          }>
            Full-res photos
          </button>
        </div>
      </article>

      <button class="shop-link" data-screen="pricing">
        Explore plans &amp; unlock more <span aria-hidden="true">→</span>
      </button>
    </div>
  `;
}

function pricingMarkup(diActive, proActive, addOnsVisible) {
  return `
    <div class="screen-content pricing-screen">
      <div class="screen-title">
        <div>
          <span class="eyebrow">YOUR MEMBERSHIP</span>
          <h3>Plans &amp; pricing</h3>
        </div>
      </div>

      <div class="shop-tabs" role="tablist" aria-label="Plan categories">
        <button role="tab" aria-selected="${state.shopTab === "di"}" class="${
    state.shopTab === "di" ? "selected" : ""
  }" data-shop-tab="di">Owner Subscription</button>
        <button role="tab" aria-selected="${state.shopTab === "addons"}" class="${
    state.shopTab === "addons" ? "selected" : ""
  }" data-shop-tab="addons">Add-ons ${
    !proActive ? '<span class="tab-dot" aria-hidden="true"></span>' : ""
  }</button>
      </div>

      ${
        state.shopTab === "di"
          ? ownerPlansMarkup(diActive)
          : addOnsMarkup(diActive, proActive, addOnsVisible)
      }
    </div>
  `;
}

function ownerPlansMarkup(diActive) {
  const nowDate = new Date(state.now);
  const combined = state.catalog.combined;
  const diAutoActive = hasDiAutoPay(state, nowDate);

  return `
    <div class="plan-context">
      <span class="context-icon" aria-hidden="true">⌂</span>
      <span>${
        diActive
          ? "Your Owner Subscription is active."
          : "Unlock owner inventory contacts with Direct Inventory."
      }</span>
    </div>

    <article class="plan-card">
      <div class="plan-card-top">
        <div>
          <span class="plan-kicker">ONE-TIME ACCESS</span>
          <h4>${escapeHtml(state.catalog.diOneTime.label)}</h4>
        </div>
        <span class="plan-icon" aria-hidden="true">◷</span>
      </div>
      <div class="plan-price">${money(state.catalog.diOneTime.price)} <small>/ ${
    state.catalog.diOneTime.durationMonths
  } months</small></div>
      <p>Fixed-duration access to owner-direct inventory.</p>
      <button class="primary-button full-width" data-action="buy-di-onetime">
        ${diActive ? "Extend with one-time pass" : "Get Owner Subscription"}
        <span aria-hidden="true">→</span>
      </button>
    </article>

    <article class="plan-card">
      <div class="plan-card-top">
        <div>
          <span class="plan-kicker">RECURRING · MONTHLY</span>
          <h4>${escapeHtml(state.catalog.diAuto.label)}</h4>
        </div>
        <span class="plan-icon" aria-hidden="true">↻</span>
      </div>
      <div class="plan-price">${money(state.catalog.diAuto.price)} <small>/ month</small></div>
      <p>Flexible monthly access. Cancel any time.</p>
      <button class="secondary-button full-width" data-action="start-di-auto" ${
        diAutoActive ? "disabled" : ""
      }>
        ${diAutoActive ? "Auto-pay is active" : "Start monthly plan"}
        <span aria-hidden="true">→</span>
      </button>
      ${
        diAutoActive
          ? `<button class="inline-action" data-action="cancel-di-auto">${
              state.di.pendingCancellation
                ? "Cancellation scheduled"
                : "Cancel auto-pay"
            }</button>`
          : ""
      }
    </article>

    ${
      !diActive
        ? `<article class="bundle-card">
            <span class="bundle-spark" aria-hidden="true">✦</span>
            <div class="plan-kicker">BEST FOR NEW SUBSCRIBERS</div>
            <h4>Owner + Pro Plus</h4>
            <p>Start with everything in one checkout.</p>
            <div class="plan-price">${money(combined.price)} <small>/ month</small></div>
            <div class="bundle-includes">
              <span>✓ Direct Inventory</span>
              <span>✓ Pro Plus access</span>
              <span>✓ Exclusive listings</span>
            </div>
            <button class="primary-button full-width" data-action="bundle-checkout">
              Confirm bundled checkout <span aria-hidden="true">→</span>
            </button>
          </article>`
        : ""
    }

    ${
      diActive && state.di.source === "auto_pay" && !state.proPlus.bundledWithDi
        ? `<article class="upgrade-card">
            <div class="plan-kicker">ADD PRO PLUS TO YOUR PLAN</div>
            <h4>Bundle upgrade</h4>
            <p>Upgrade your existing DI auto-pay. One combined subscription, no duplicate Pro Plus plan.</p>
            <button class="primary-button full-width" data-action="bundle-upgrade">
              Review upgrade &amp; pricing <span aria-hidden="true">→</span>
            </button>
          </article>`
        : ""
    }

    ${
      diActive && state.di.source === "one_time"
        ? `<article class="upgrade-card">
            <div class="plan-kicker">KEEP ACCESS ALIGNED</div>
            <h4>Align auto-pay</h4>
            <p>Start combined auto-pay after your current DI pass expires.</p>
            <button class="primary-button full-width" data-action="align-auto-pay">
              Align to DI expiry <span aria-hidden="true">→</span>
            </button>
          </article>`
        : ""
    }
  `;
}

function addOnsMarkup(diActive, proActive, visible) {
  if (!diActive) {
    return `<div class="gated-card">
      <span class="gated-icon" aria-hidden="true">⌑</span>
      <h4>Pro Plus is an add-on</h4>
      <p>Start an Owner Subscription first. Then add Pro Plus for exclusive inventory and full-resolution listing photos.</p>
      <button class="secondary-button" data-shop-tab="di">View Owner Subscription plans</button>
    </div>`;
  }

  const nowDate = new Date(state.now);
  const proAutoActive = hasProPlusAutoPay(state, nowDate);

  return `
    <div class="plan-context">
      <span class="context-icon" aria-hidden="true">✦</span>
      <span>${
        proActive
          ? "Pro Plus features are available to you."
          : "Unlock exclusive listings and full-resolution photos."
      }</span>
    </div>

    <article class="pro-feature-card">
      <div class="pro-feature-mark" aria-hidden="true">✦</div>
      <div>
        <span class="plan-kicker">BROKER PRO</span>
        <h4>Pro Plus</h4>
        <p>Exclusive owner inventory, plus full-resolution listing photos.</p>
      </div>
      <div class="feature-chips">
        <span>Exclusive access</span>
        <span>HD photos</span>
      </div>
    </article>

    <article class="plan-card">
      <div class="plan-card-top">
        <div>
          <span class="plan-kicker">ONE-TIME ACCESS</span>
          <h4>${escapeHtml(state.catalog.proOneTime.label)}</h4>
        </div>
        <span class="plan-icon" aria-hidden="true">◷</span>
      </div>
      <div class="plan-price">${money(state.catalog.proOneTime.price)} <small>/ ${
    state.catalog.proOneTime.durationMonths
  } months max</small></div>
      <p>Pro Plus access is capped at your DI expiry when it ends sooner.</p>
      <button class="primary-button full-width" data-action="buy-pro-onetime">
        ${proActive ? "Extend Pro Plus access" : "Get Pro Plus"}
        <span aria-hidden="true">→</span>
      </button>
    </article>

    ${
      state.catalog.proAutoAvailable
        ? `<article class="plan-card">
            <div class="plan-card-top">
              <div>
                <span class="plan-kicker">RECURRING · MONTHLY</span>
                <h4>${escapeHtml(state.catalog.proAuto.label)}</h4>
              </div>
              <span class="plan-icon" aria-hidden="true">↻</span>
            </div>
            <div class="plan-price">${money(state.catalog.proAuto.price)} <small>/ month</small></div>
            <p>Standalone add-on billed monthly.</p>
            <button class="secondary-button full-width" data-action="start-pro-auto" ${
              proAutoActive ? "disabled" : ""
            }>
              ${proAutoActive ? "Pro Plus auto-pay is active" : "Start Pro Plus auto-pay"}
              <span aria-hidden="true">→</span>
            </button>
            ${
              proAutoActive && !state.proPlus.bundledWithDi
                ? `<button class="inline-action" data-action="cancel-pro-auto">${
                    state.proPlus.pendingCancellation
                      ? "Cancellation scheduled"
                      : "Cancel Pro Plus auto-pay"
                  }</button>`
                : ""
            }
            ${
              state.proPlus.bundledWithDi
                ? `<p class="bundled-note">This add-on is bundled. Cancel it through your Owner Subscription.</p>`
                : ""
            }
          </article>`
        : `<div class="gated-card compact-gated">
            <p>No active Pro Plus auto-pay plan is configured. One-time plans are still available.</p>
          </div>`
    }
  `;
}

/* =========================================================
   ACTION LOG
   ========================================================= */

const errorMessages = {
  DI_REQUIRED: ["403", "An active Owner Subscription is required for this feature."],
  PRO_PLUS_REQUIRED: [
    "403",
    "Add Pro Plus to unlock exclusive inventory and full-resolution photos.",
  ],
  CONTACT_NOT_UNLOCKED: [
    "403",
    "Unlock this listing's contact before viewing its full-resolution photos.",
  ],
  DI_AUTO_PAY_REQUIRED: [
    "403",
    "This upgrade is available to brokers with active DI auto-pay.",
  ],
  DI_ONE_TIME_REQUIRED: [
    "403",
    "Align auto-pay is available while you have active one-time DI access.",
  ],
  DI_CANCELLATION_PENDING: [
    "403",
    "Resolve the pending DI cancellation before upgrading your plan.",
  ],
  PRO_PLUS_ALREADY_BUNDLED: [
    "400",
    "Pro Plus is already included in your combined subscription.",
  ],
  PRO_PLUS_BUNDLED_CANCEL_VIA_DI: [
    "400",
    "Pro Plus is part of your bundle. Cancel the combined plan through Owner Subscription.",
  ],
  PRO_PLUS_PLAN_UNAVAILABLE: [
    "400",
    "No active Pro Plus auto-pay plan is configured.",
  ],
  NO_DI_AUTO_PAY: ["400", "There is no active DI auto-pay plan to cancel."],
  NO_PRO_PLUS_AUTO_PAY: [
    "400",
    "There is no standalone Pro Plus auto-pay plan to cancel.",
  ],
  INVALID_PLAN: ["400", "The selected plan has an invalid price or duration."],
  SUBSCRIPTION_ALREADY_ACTIVE: [
    "400",
    "This auto-pay subscription is already active.",
  ],
  DI_AUTO_PAY_ACTIVE: [
    "400",
    "End DI auto-pay before purchasing a one-time Owner Subscription pass.",
  ],
  DI_ONE_TIME_ALIGN_REQUIRED: [
    "400",
    "Use Align auto-pay to keep your current one-time DI access through its expiry.",
  ],
  PRO_PLUS_AUTO_PAY_ACTIVE: [
    "400",
    "End standalone Pro Plus auto-pay before purchasing a one-time pass.",
  ],
};

function record(action, errorCode, messageOverride) {
  const [status, defaultMessage] = errorCode
    ? errorMessages[errorCode]
    : ["200", ""];
  state.log.push({
    at: state.now,
    action,
    status: errorCode ? status : "200",
    code: errorCode || "OK",
    message: messageOverride || defaultMessage,
  });
  render();
}

function fail(action, code) {
  record(action, code);
}

function success(action, message) {
  record(action, null, message);
}

/* =========================================================
   ACTION HANDLERS
   ========================================================= */

function validPlan(price, duration) {
  return (
    Number.isFinite(Number(price)) &&
    Number(price) > 0 &&
    Number.isInteger(Number(duration)) &&
    Number(duration) > 0
  );
}

function doAction(action) {
  const nowDate = new Date(state.now);

  switch (action) {
    case "unlock-regular": {
      const error = regularUnlockError(state, nowDate);
      if (error) return fail("Unlock regular listing", error);
      state.listings.regularUnlocked = true;
      return success(
        "Unlock regular listing",
        "Owner contact unlocked. You can now contact the seller."
      );
    }

    case "unlock-exclusive": {
      const error = exclusiveUnlockError(state, nowDate);
      if (error) {
        state.screen = "pricing";
        state.shopTab = error === "DI_REQUIRED" ? "di" : "addons";
        return fail("Unlock exclusive listing", error);
      }
      state.listings.exclusiveUnlocked = true;
      return success(
        "Unlock exclusive listing",
        "Exclusive owner contact unlocked. Reach out to the seller."
      );
    }

    case "full-photo": {
      const error = fullPhotoError(state, nowDate);
      if (error) {
        if (error === "PRO_PLUS_REQUIRED") {
          state.screen = "pricing";
          state.shopTab = "addons";
        }
        return fail("Open full-resolution photo", error);
      }
      return success(
        "Open full-resolution photo",
        "Full-resolution listing photos are now available."
      );
    }

    case "buy-di-onetime": {
      if (hasDiAutoPay(state, nowDate))
        return fail("Purchase DI one-time", "DI_AUTO_PAY_ACTIVE");
      const plan = state.catalog.diOneTime;
      if (!validPlan(plan.price, plan.durationMonths))
        return fail("Purchase DI one-time", "INVALID_PLAN");

      const base =
        hasDiAccess(state, nowDate) && state.di.source === "one_time"
          ? state.di.expiresAt
          : state.now;

      state.di = {
        accessActive: true,
        expiresAt: addMonths(base, plan.durationMonths),
        source: "one_time",
        autoPayActive: false,
        pendingCancellation: false,
        paidThroughAt: "",
      };
      return success(
        "Purchase DI one-time",
        `${plan.label} purchased. Owner Subscription active until ${formatDate(
          state.di.expiresAt
        )}.`
      );
    }

    case "start-di-auto": {
      if (!validPlan(state.catalog.diAuto.price, 1))
        return fail("Start DI auto-pay", "INVALID_PLAN");
      if (hasDiAutoPay(state, nowDate))
        return fail("Start DI auto-pay", "SUBSCRIPTION_ALREADY_ACTIVE");
      if (hasDiAccess(state, nowDate) && state.di.source === "one_time")
        return fail("Start DI auto-pay", "DI_ONE_TIME_ALIGN_REQUIRED");

      state.di = {
        accessActive: true,
        expiresAt: "",
        source: "auto_pay",
        autoPayActive: true,
        pendingCancellation: false,
        paidThroughAt: addMonths(state.now, 1),
      };
      return success(
        "Start DI auto-pay",
        `Owner Subscription auto-pay started at ${money(
          state.catalog.diAuto.price
        )}/month. Paid through ${formatDate(state.di.paidThroughAt)}.`
      );
    }

    case "cancel-di-auto": {
      if (!hasDiAutoPay(state, nowDate))
        return fail("Cancel DI auto-pay", "NO_DI_AUTO_PAY");
      if (state.di.pendingCancellation)
        return success(
          "Cancel DI auto-pay",
          "Cancellation is already scheduled. Access remains active through the paid period."
        );

      state.di.pendingCancellation = true;
      if (state.proPlus.bundledWithDi && state.proPlus.autoPayActive) {
        state.proPlus.pendingCancellation = true;
      }
      const bundledCopy = state.proPlus.bundledWithDi
        ? " The combined Pro Plus access will end on the same date."
        : "";
      return success(
        "Cancel DI auto-pay",
        `Cancellation scheduled. DI access remains active through ${formatDate(
          state.di.paidThroughAt
        )}.${bundledCopy}`
      );
    }

    case "buy-pro-onetime": {
      if (!hasDiAccess(state, nowDate))
        return fail("Purchase Pro Plus one-time", "DI_REQUIRED");
      if (hasProPlusAutoPay(state, nowDate))
        return fail("Purchase Pro Plus one-time", "PRO_PLUS_AUTO_PAY_ACTIVE");

      const plan = state.catalog.proOneTime;
      if (!validPlan(plan.price, plan.durationMonths))
        return fail("Purchase Pro Plus one-time", "INVALID_PLAN");

      const start =
        hasProPlusAccess(state, nowDate) && !state.proPlus.autoPayActive
          ? state.proPlus.expiresAt
          : state.now;

      const proposed = addMonths(start, plan.durationMonths);
      const diExpiry =
        state.di.source === "one_time" || state.di.source === "admin_grant"
          ? state.di.expiresAt
          : "";
      const capped = capProPlusExpiry(proposed, diExpiry);

      state.proPlus = {
        ...state.proPlus,
        accessActive: true,
        expiresAt: capped.expiresAt,
        autoPayActive: false,
        bundledWithDi: false,
        pendingCancellation: false,
      };

      const capCopy = capped.capped
        ? ` Access is capped at your DI expiry (${formatDate(capped.expiresAt)}).`
        : "";
      return success(
        "Purchase Pro Plus one-time",
        `Pro Plus access is active until ${formatDate(
          capped.expiresAt
        )}.${capCopy}`
      );
    }

    case "start-pro-auto": {
      if (!hasDiAccess(state, nowDate))
        return fail("Start standalone Pro Plus auto-pay", "DI_REQUIRED");
      if (!state.catalog.proAutoAvailable)
        return fail("Start standalone Pro Plus auto-pay", "PRO_PLUS_PLAN_UNAVAILABLE");
      if (hasProPlusAutoPay(state, nowDate))
        return fail("Start standalone Pro Plus auto-pay", "SUBSCRIPTION_ALREADY_ACTIVE");
      if (!validPlan(state.catalog.proAuto.price, 1))
        return fail("Start standalone Pro Plus auto-pay", "INVALID_PLAN");

      state.proPlus = {
        accessActive: true,
        expiresAt: "",
        autoPayActive: true,
        bundledWithDi: false,
        pendingCancellation: false,
      };
      return success(
        "Start standalone Pro Plus auto-pay",
        `Standalone Pro Plus started at ${money(state.catalog.proAuto.price)}/month.`
      );
    }

    case "bundle-upgrade": {
      if (
        !hasDiAccess(state, nowDate) ||
        state.di.source !== "auto_pay" ||
        !state.di.autoPayActive
      )
        return fail("Upgrade to combined auto-pay", "DI_AUTO_PAY_REQUIRED");
      if (state.di.pendingCancellation)
        return fail("Upgrade to combined auto-pay", "DI_CANCELLATION_PENDING");
      if (state.proPlus.bundledWithDi)
        return fail("Upgrade to combined auto-pay", "PRO_PLUS_ALREADY_BUNDLED");
      if (!state.catalog.proAutoAvailable)
        return fail("Upgrade to combined auto-pay", "PRO_PLUS_PLAN_UNAVAILABLE");
      if (
        !validPlan(state.catalog.proAuto.price, 1) ||
        !validPlan(state.catalog.combined.price, 1)
      )
        return fail("Upgrade to combined auto-pay", "INVALID_PLAN");

      const anchor = state.di.paidThroughAt || addMonths(state.now, 1);
      const dueToday = remainingProration(
        state.catalog.proAuto.price,
        state.now,
        anchor
      );

      state.di.paidThroughAt = anchor;
      state.proPlus = {
        accessActive: true,
        expiresAt: anchor,
        autoPayActive: true,
        bundledWithDi: true,
        pendingCancellation: false,
      };

      return success(
        "Upgrade to combined auto-pay",
        `Existing DI auto-pay replaced by the combined plan. Pro Plus due today: ${money(
          dueToday
        )} (prorated). ${money(state.catalog.combined.price)}/month recurring from ${formatDate(
          anchor
        )}.`
      );
    }

    case "align-auto-pay": {
      if (
        !hasDiAccess(state, nowDate) ||
        state.di.source !== "one_time" ||
        !state.di.expiresAt
      )
        return fail("Align DI to combined auto-pay", "DI_ONE_TIME_REQUIRED");
      if (!state.catalog.proAutoAvailable)
        return fail("Align DI to combined auto-pay", "PRO_PLUS_PLAN_UNAVAILABLE");
      if (
        !validPlan(state.catalog.proAuto.price, 1) ||
        !validPlan(state.catalog.combined.price, 1)
      )
        return fail("Align DI to combined auto-pay", "INVALID_PLAN");

      const expiry = state.di.expiresAt;
      const dueToday = remainingProration(
        state.catalog.proAuto.price,
        state.now,
        expiry
      );

      state.di = {
        accessActive: true,
        expiresAt: "",
        source: "auto_pay",
        autoPayActive: true,
        pendingCancellation: false,
        paidThroughAt: expiry,
      };
      state.proPlus = {
        accessActive: true,
        expiresAt: expiry,
        autoPayActive: true,
        bundledWithDi: true,
        pendingCancellation: false,
      };

      return success(
        "Align DI to combined auto-pay",
        `Combined plan aligned to your current DI expiry. Pro Plus due today: ${money(
          dueToday
        )} (prorated). ${money(state.catalog.combined.price)}/month recurring from ${formatDate(
          expiry
        )}.`
      );
    }

    case "bundle-checkout": {
      if (hasDiAccess(state, nowDate))
        return fail("New subscriber bundled checkout", "SUBSCRIPTION_ALREADY_ACTIVE");
      if (!state.catalog.proAutoAvailable)
        return fail("New subscriber bundled checkout", "PRO_PLUS_PLAN_UNAVAILABLE");
      if (
        !validPlan(state.catalog.diAuto.price, 1) ||
        !validPlan(state.catalog.combined.price, 1)
      )
        return fail("New subscriber bundled checkout", "INVALID_PLAN");

      const paidThrough = addMonths(state.now, 1);
      state.di = {
        accessActive: true,
        expiresAt: "",
        source: "auto_pay",
        autoPayActive: true,
        pendingCancellation: false,
        paidThroughAt: paidThrough,
      };
      state.proPlus = {
        accessActive: true,
        expiresAt: paidThrough,
        autoPayActive: true,
        bundledWithDi: true,
        pendingCancellation: false,
      };

      return success(
        "New subscriber bundled checkout",
        `Bundled checkout complete. Direct Inventory + Pro Plus active at ${money(
          state.catalog.combined.price
        )}/month.`
      );
    }

    case "cancel-pro-auto": {
      if (state.proPlus.bundledWithDi)
        return fail("Cancel Pro Plus auto-pay", "PRO_PLUS_BUNDLED_CANCEL_VIA_DI");
      if (!hasProPlusAutoPay(state, nowDate))
        return fail("Cancel Pro Plus auto-pay", "NO_PRO_PLUS_AUTO_PAY");

      state.proPlus.pendingCancellation = true;
      const endDate = state.proPlus.expiresAt
        ? formatDate(state.proPlus.expiresAt)
        : "the end of the current billing cycle";
      return success(
        "Cancel Pro Plus auto-pay",
        `Pro Plus cancellation scheduled. Access remains active through ${endDate}.`
      );
    }

    default:
      return;
  }
}

/* =========================================================
   RENDER + EVENTS
   ========================================================= */

function render() {
  $("#scenario-root").innerHTML = scenarioMarkup();
  $("#emulator-root").innerHTML = emulatorMarkup();
  const clock = $("#clock-label");
  if (clock) clock.textContent = formatDate(state.now);
}

function bindScenarioInputs() {
  const root = $("#scenario-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  root.addEventListener("change", (event) => {
    const input = event.target.closest("[data-path]");
    if (!input) return;
    const path = fields[input.dataset.path];
    if (!path) return;

    const value =
      input.type === "checkbox"
        ? input.checked
        : input.type === "number"
        ? Number(input.value)
        : input.value;

    writePath(path, value);
    render();
  });
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.dataset.preset) {
    presets[target.dataset.preset]?.();
    state.listings = { regularUnlocked: false, exclusiveUnlocked: false };
    render();
    return;
  }

  if (target.dataset.advance) {
    state.now = addDays(state.now, Number(target.dataset.advance));
    render();
    return;
  }

  if (target.dataset.screen) {
    state.screen = target.dataset.screen;
    render();
    return;
  }

  if (target.dataset.shopTab) {
    state.shopTab = target.dataset.shopTab;
    state.screen = "pricing";
    render();
    return;
  }

  if (target.dataset.action) {
    doAction(target.dataset.action);
  }
});

/* =========================================================
   BOOT
   ========================================================= */

bindScenarioInputs();
render();