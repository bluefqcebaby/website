// Andrei Yaschuk — portfolio interactions
// Ladder loop, intro animation, dark mode toggle.

/**
 * @typedef {{ theme?: "light" | "dark" }} PersistedState
 */

const STORAGE_KEY = "portfolio:tweaks";
const LADDER_HOLD_MS = 2600;        // pause once a line is fully typed
const LADDER_GAP_MS = 450;          // pause once a line is fully erased, before typing the next
const LADDER_TYPE_MS = 70;          // base per-char typing delay
const LADDER_TYPE_JITTER_MS = 45;   // extra 0..N ms per char — keeps the cadence human
const LADDER_ERASE_MS = 35;         // per-char erase delay (snappier than typing)
const POSTHOG_DEBUG_PARAM = "ph_debug";

// ── Persistence ────────────────────────────────────────────────────────
// Only the user's explicit light/dark pick is persisted. Accent, paper,
// and font choices live in CSS tokens now — any legacy fields left over
// in the stored object are ignored on read.
/** @returns {PersistedState} */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = /** @type {unknown} */ (JSON.parse(raw));
    if (!parsed || typeof parsed !== "object") return {};
    const theme = /** @type {Record<string, unknown>} */ (parsed).theme;
    return theme === "light" || theme === "dark" ? { theme } : {};
  } catch {
    return {};
  }
}

/** @param {PersistedState} state */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/** @returns {boolean} */
function isPostHogDebugEnabled() {
  return new URLSearchParams(window.location.search).has(POSTHOG_DEBUG_PARAM);
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [properties]
 * @param {{ send_instantly?: boolean }} [options]
 */
function capturePostHogEvent(event, properties = {}, options = {}) {
  if (typeof window.posthog === "undefined") return;

  if (isPostHogDebugEnabled()) {
    console.info("[PostHog]", event, properties, options);
  }

  window.posthog.capture(event, properties, options);
}

// ── Ladder loop (typewriter: erases the current line, types the next) ─
/** @param {HTMLElement} host */
function initLadder(host) {
  const raw = host.dataset.ladderLines ?? "";
  const lines = raw.split("|").filter(Boolean);
  if (lines.length === 0) return;

  host.textContent = "";

  const text = document.createElement("span");
  text.className = "ladder-text";
  // A leading "©" renders high in JetBrains Mono (near the ascender
  // instead of seated on the baseline like the rest of the line). We
  // split it into its own span so CSS can nudge just that glyph down
  // without affecting any other character. The text node carries
  // everything after the "©".
  const copyGlyph = document.createElement("span");
  copyGlyph.className = "copyright-glyph";
  const textNode = document.createTextNode("");
  text.appendChild(copyGlyph);
  text.appendChild(textNode);
  host.appendChild(text);

  /** @param {string} slice */
  const render = (slice) => {
    if (slice.startsWith("©")) {
      copyGlyph.textContent = "©";
      textNode.data = slice.slice(1);
    } else {
      copyGlyph.textContent = "";
      textNode.data = slice;
    }
  };

  render(lines[0]);

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Single line or reduced motion → leave the first line on-screen as
  // static text, skip the caret entirely (nothing to type, nothing to blink).
  if (prefersReducedMotion || lines.length < 2) return;

  const caret = document.createElement("span");
  caret.className = "ladder-caret";
  caret.setAttribute("aria-hidden", "true");
  host.appendChild(caret);

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** @param {string} target */
  const typeIn = async (target) => {
    host.classList.add("is-busy");
    for (let i = 1; i <= target.length; i++) {
      render(target.slice(0, i));
      await wait(LADDER_TYPE_MS + Math.random() * LADDER_TYPE_JITTER_MS);
    }
    host.classList.remove("is-busy");
  };

  const eraseAll = async () => {
    host.classList.add("is-busy");
    const current = (copyGlyph.textContent ?? "") + (textNode.data ?? "");
    for (let i = current.length - 1; i >= 0; i--) {
      render(current.slice(0, i));
      await wait(LADDER_ERASE_MS);
    }
    host.classList.remove("is-busy");
  };

  // The first line is already on-screen from the static assignment above
  // — the loop starts by holding it, then erase-type-hold forever.
  (async () => {
    let index = 0;
    for (;;) {
      await wait(LADDER_HOLD_MS);
      await eraseAll();
      await wait(LADDER_GAP_MS);
      index = (index + 1) % lines.length;
      await typeIn(lines[index]);
    }
  })();
}

// ── Theme toggle (light ↔ dark) ───────────────────────────────────────
/**
 * @param {HTMLButtonElement} btn
 * @param {() => PersistedState} getState
 * @param {(patch: Partial<PersistedState>) => void} commit
 */
function initThemeToggle(btn, getState, commit) {
  const root = document.documentElement;

  const syncAria = () => {
    const isDark = root.getAttribute("data-theme") === "dark";
    btn.setAttribute("aria-pressed", isDark ? "true" : "false");
    btn.setAttribute("title", isDark ? "switch to light" : "switch to dark");
  };

  syncAria();

  btn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    commit({ theme: next });
    syncAria();
    capturePostHogEvent("theme_toggled", { theme: next });
  });

  // Follow OS preference while the user hasn't made an explicit choice.
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  /** @param {MediaQueryListEvent} e */
  const onSystemChange = (e) => {
    if (getState().theme) return; // explicit pick overrides OS
    root.setAttribute("data-theme", e.matches ? "dark" : "light");
    syncAria();
  };
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onSystemChange);
  } else if (typeof mql.addListener === "function") {
    mql.addListener(onSystemChange); // Safari <14
  }
}

// ── Intro animation ───────────────────────────────────────────────────
// First-paint sequence:
//   1. `.name` handwrites in (CSS clip-path reveal, triggered by class)
//   2. `.subtitle` types out char-by-char with a blinking caret
//   3. `.prose` paragraphs, `.stack`, dividers, and `.paragraph-footer`
//      fade + rise,
//      staggered so each lands a beat after the previous one.
// All cadence lives in INTRO so it can be tuned in one place. Elements
// are hidden via `html.js-ready` CSS and revealed as each phase fires;
// `prefers-reduced-motion` users get the end state immediately.

const INTRO = Object.freeze({
  nameDelay: 120,          // let first paint settle before the pen touches down
  subtitleDelay: 900,      // subtitle starts slightly before name finishes
  subtitleCharMs: 34,      // per-character typing cadence
  subtitleCaretHold: 240,  // caret lingers briefly after last char
  proseStart: 2300,        // after subtitle has typed its last character
  proseStagger: 230,       // gap between paragraphs
  footerGap: 200,          // extra breathing room after the last prose beat
  lightGap: 900,           // pause after the footer lands before the accent light warms on
});

/**
 * Type `text` into `el` one char at a time, leaving the caret class in
 * place until the final char lands (plus a small hold for the blink).
 * @param {HTMLElement} el
 * @param {string} text
 * @param {number} perChar
 * @returns {Promise<void>}
 */
function typeText(el, text, perChar) {
  el.textContent = "";
  el.classList.add("is-typing");
  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i < text.length) {
        window.setTimeout(tick, perChar);
      } else {
        window.setTimeout(() => {
          el.classList.remove("is-typing");
          el.classList.add("is-typed");
          resolve();
        }, INTRO.subtitleCaretHold);
      }
    };
    tick();
  });
}

function runIntro() {
  const name = document.querySelector(".name");
  const subtitle = document.querySelector(".subtitle");
  // Prose, stack, AND dividers share one document-order stagger. That
  // way each divider lands between the section it closes and the one it
  // opens, instead of firing before any of the content it introduces.
  const items = document.querySelectorAll(".prose, .stack, .divider");
  const footer = document.querySelector(".paragraph-footer");

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReduced) {
    // Snap to final state — no sequence, no delays.
    name?.classList.add("is-written");
    subtitle?.classList.add("is-typed");
    items.forEach((el) => el.classList.add("is-in"));
    footer?.classList.add("is-in");
    document.documentElement.classList.add("is-lit");
    return;
  }

  // Stash subtitle text and clear it synchronously *before* paint, so
  // the user never sees the full string flash before typing starts.
  // The `.subtitle` has `min-height: 1.2em` so the row doesn't collapse.
  const subtitleText =
    subtitle instanceof HTMLElement
      ? (subtitle.textContent ?? "").trim()
      : "";
  if (subtitle instanceof HTMLElement) subtitle.textContent = "";

  // Phase 1: handwrite the name.
  window.setTimeout(() => {
    name?.classList.add("is-written");
  }, INTRO.nameDelay);

  // Phase 2: type the subtitle.
  window.setTimeout(() => {
    if (subtitle instanceof HTMLElement && subtitleText) {
      typeText(subtitle, subtitleText, INTRO.subtitleCharMs);
    }
  }, INTRO.subtitleDelay);

  // Phase 3: fade-rise each item (prose / stack / divider), staggered
  // in document order so dividers fall naturally between sections.
  items.forEach((el, i) => {
    window.setTimeout(() => {
      el.classList.add("is-in");
    }, INTRO.proseStart + i * INTRO.proseStagger);
  });

  // Phase 4: footer after the last item beat has landed.
  const afterItems = INTRO.proseStart + items.length * INTRO.proseStagger;
  const footerAt = afterItems + INTRO.footerGap;
  window.setTimeout(() => footer?.classList.add("is-in"), footerAt);

  // Phase 5: switch the accent light on. A beat after the footer lands
  // so the eye registers "everything's placed, now the room lights up"
  // rather than the glow racing the last fade.
  window.setTimeout(
    () => document.documentElement.classList.add("is-lit"),
    footerAt + INTRO.lightGap
  );
}

// ── Custom cursor (ink dot + trailing ring) ──────────────────────────
// 4px ink dot on the pointer; 28px outlined ring lagging with spring
// easing. Ring fills with --accent over links, scales up on chips &
// squiggles, collapses to an I-beam over prose. Skips touch devices
// so the native OS cursor is left alone there.
/**
 * @typedef {"none" | "link" | "chip" | "squiggle" | "text"} CursorCtx
 */

/**
 * Walk up from the element at (x, y) to the first recognized context.
 * Order matters: .squiggle / .stack-pill must win over the paragraph
 * they technically sit inside.
 * @param {number} x
 * @param {number} y
 * @returns {CursorCtx}
 */
function cursorContextAt(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof Element)) return "none";

  /** @type {Element | null} */
  let cur = hit;
  while (cur && cur !== document.body) {
    const cl = cur.classList;
    if (cl.contains("squiggle")) return "squiggle";
    if (cl.contains("stack-pill")) return "chip";
    const tag = cur.tagName;
    if (tag === "A" || tag === "BUTTON") return "link";
    if (tag === "P" || tag === "LI" || tag === "BLOCKQUOTE") return "text";
    cur = cur.parentElement;
  }
  return "none";
}

function initCursor() {
  // Coarse pointers (touch) keep the native cursor — no custom layer.
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const html = document.documentElement;
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  dot.setAttribute("aria-hidden", "true");
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  ring.setAttribute("aria-hidden", "true");
  document.body.append(dot, ring);
  html.classList.add("cursor-ready");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Start off-screen so nothing flashes at the wrong position on load —
  // first real pointermove snaps both dot and ring to the mouse.
  let mx = -100;
  let my = -100;
  let rx = -100;
  let ry = -100;
  let hasMoved = false;

  window.addEventListener(
    "pointermove",
    (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!hasMoved) {
        hasMoved = true;
        rx = mx;
        ry = my;
        html.classList.add("cursor-visible");
      }
    },
    { passive: true }
  );

  // Pointer leaving the document (window edge, devtools, etc.) fades out
  // the custom cursor so it doesn't stick at the last position.
  document.addEventListener("pointerleave", () => {
    html.classList.remove("cursor-visible");
  });
  document.addEventListener("pointerenter", () => {
    if (hasMoved) html.classList.add("cursor-visible");
  });

  /** @type {CursorCtx} */
  let lastCtx = "none";

  const tick = () => {
    // Reduced-motion: ring snaps (no lag). Otherwise spring toward the
    // pointer with a fixed easing factor each frame.
    const t = reduceMotion.matches ? 1 : 0.18;
    rx += (mx - rx) * t;
    ry += (my - ry) * t;

    dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;

    const ctx = cursorContextAt(mx, my);
    if (ctx !== lastCtx) {
      // Only touch class lists when the context actually changes —
      // avoids the browser invalidating style on every frame.
      ring.classList.toggle("is-link", ctx === "link");
      ring.classList.toggle("is-chip", ctx === "chip");
      ring.classList.toggle("is-squiggle", ctx === "squiggle");
      ring.classList.toggle("is-text", ctx === "text");
      dot.classList.toggle("is-text", ctx === "text");
      lastCtx = ctx;
    }

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── App bootstrap ─────────────────────────────────────────────────────
function init() {
  let state = loadState();

  /** @param {Partial<PersistedState>} patch */
  const commit = (patch) => {
    state = { ...state, ...patch };
    saveState(state);
  };

  // Kick off the intro animation before anything else touches the DOM —
  // it captures the subtitle textContent before clearing it to type.
  runIntro();

  // Ladder loops
  document.querySelectorAll(".ladder").forEach((el) => {
    if (el instanceof HTMLElement) initLadder(el);
  });

  // Theme toggle in the footer
  const themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn instanceof HTMLButtonElement) {
    initThemeToggle(themeBtn, () => state, commit);
  }

  // Custom cursor. No-ops on touch devices.
  initCursor();

  // ── PostHog link tracking ─────────────────────────────────────────
  if (typeof window.posthog !== "undefined") {
    capturePostHogEvent(
      "portfolio_loaded",
      {
        path: window.location.pathname,
        theme: document.documentElement.getAttribute("data-theme") ?? "light",
      },
      { send_instantly: true }
    );

    // Contact / profile links
    /** @type {Array<[string, string]>} */
    const contactLinks = [
      [".inline-link-cv", "cv_downloaded"],
      [".inline-link-email", "email_link_clicked"],
      [".inline-link-linkedin", "linkedin_link_clicked"],
      [".inline-link-github", "github_link_clicked"],
    ];
    contactLinks.forEach(([selector, event]) => {
      document.querySelector(selector)?.addEventListener("click", () => {
        capturePostHogEvent(event, {}, { send_instantly: true });
      });
    });

    // Company links in the about section
    /** @type {NodeListOf<HTMLAnchorElement>} */
    const companyLinks = document.querySelectorAll(".sect[data-section='about'] a.u-solid");
    companyLinks.forEach((link) => {
      link.addEventListener("click", () => {
        capturePostHogEvent(
          "company_link_clicked",
          {
            company: link.textContent?.trim() ?? "",
            url: link.href,
          },
          { send_instantly: true }
        );
      });
    });
  }

  // Enable smooth palette transitions only after first paint, so the
  // initial theme (light or dark, resolved by the inline head script)
  // isn't animated into view.
  requestAnimationFrame(() => {
    document.documentElement.classList.add("theme-ready");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ── Section dividers (about → skills → ai → links) ───────────────────
// Each .divider gets a .dv-label span filled from its data-label.
// The reveal (fade-rise) is owned by runIntro(), which walks
// `.prose, .stack, .divider` in document order so dividers land between
// the section they close and the one they open — not ahead of both.
(function () {
  function initDividers() {
    /** @type {NodeListOf<HTMLElement>} */
    const dividers = document.querySelectorAll(".divider");
    if (dividers.length === 0) return;

    dividers.forEach((divider) => {
      // Skip re-appending if this IIFE somehow fires twice (e.g. HMR).
      if (divider.querySelector(".dv-label")) return;
      const label = document.createElement("span");
      label.className = "dv-label";
      label.textContent = divider.getAttribute("data-label") ?? "";
      divider.appendChild(label);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDividers);
  } else {
    initDividers();
  }
})();
