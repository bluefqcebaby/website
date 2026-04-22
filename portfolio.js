// Andrei Iashchuk — portfolio interactions
// Ladder loop, email copy, tweakable theme, dark mode.

/**
 * @typedef {{
 *   accent: string,
 *   paper: string,
 *   handFont: string,
 *   proseFont: string,
 *   theme?: "light" | "dark"
 * }} TweakState
 */

const STORAGE_KEY = "portfolio:tweaks";
const LADDER_HOLD_MS = 2600;        // pause once a line is fully typed
const LADDER_GAP_MS = 450;          // pause once a line is fully erased, before typing the next
const LADDER_TYPE_MS = 70;          // base per-char typing delay
const LADDER_TYPE_JITTER_MS = 45;   // extra 0..N ms per char — keeps the cadence human
const LADDER_ERASE_MS = 35;         // per-char erase delay (snappier than typing)
const COPY_TOAST_MS = 1400;

/** @type {TweakState} */
const DEFAULTS = Object.freeze({
  accent: "#6ba3c7",
  paper: "#ffffff",
  handFont: "Caveat",
  proseFont: "Crimson Pro",
});

// Old defaults by field. If the stored value matches one of these, we
// drop it so the current DEFAULT wins on next load — this lets us roll
// the palette forward without stranding users who never touched the
// tweaks panel. Explicit picks of other values are preserved.
const LEGACY_PROSE_DEFAULTS = new Set(["Instrument Serif", "Spectral"]);
const LEGACY_ACCENT_DEFAULTS = new Set(["#e4572e", "#c1daea"]);
const LEGACY_PAPER_DEFAULTS = new Set(["#fbf8f1"]);

// ── Persistence ────────────────────────────────────────────────────────
/** @returns {TweakState} */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };
    if (LEGACY_PROSE_DEFAULTS.has(parsed.proseFont)) delete parsed.proseFont;
    if (LEGACY_ACCENT_DEFAULTS.has(parsed.accent)) delete parsed.accent;
    if (LEGACY_PAPER_DEFAULTS.has(parsed.paper)) delete parsed.paper;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {TweakState} state */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

// ── Theme application ─────────────────────────────────────────────────
/** @param {string} accent */
function squiggleDataUri(accent) {
  const hex = accent.replace("#", "%23");
  return (
    `url("data:image/svg+xml;utf8,` +
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 6' preserveAspectRatio='none'>` +
    `<path d='M0 3 Q 2.5 0, 5 3 T 10 3 T 15 3 T 20 3' fill='none' stroke='${hex}' stroke-width='1.2'/>` +
    `</svg>")`
  );
}

/** @returns {"light" | "dark"} */
function systemColorMode() {
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** @param {TweakState} state */
function applyTheme(state) {
  const root = document.documentElement;
  root.style.setProperty("--accent", state.accent);
  root.style.setProperty("--font-hand", `"${state.handFont}", cursive`);
  root.style.setProperty(
    "--font-prose",
    `"${state.proseFont}", "EB Garamond", Georgia, serif`
  );
  root.style.setProperty("--squiggle-bg", squiggleDataUri(state.accent));

  // Paper is a light-mode concept — in dark mode the dark-theme tokens win.
  const mode = root.getAttribute("data-theme") || systemColorMode();
  if (mode === "dark") {
    root.style.removeProperty("--paper");
  } else {
    root.style.setProperty("--paper", state.paper);
  }
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
  text.textContent = lines[0];
  host.appendChild(text);

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
      text.textContent = target.slice(0, i);
      await wait(LADDER_TYPE_MS + Math.random() * LADDER_TYPE_JITTER_MS);
    }
    host.classList.remove("is-busy");
  };

  const eraseAll = async () => {
    host.classList.add("is-busy");
    const current = text.textContent ?? "";
    for (let i = current.length - 1; i >= 0; i--) {
      text.textContent = current.slice(0, i);
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

// ── Email copy ────────────────────────────────────────────────────────
/** @param {HTMLButtonElement} btn */
function initEmailCopy(btn) {
  const email = btn.dataset.email ?? "";
  const toast = btn.querySelector(".email-toast");

  /** @type {number | undefined} */
  let toastTimer;

  const showToast = (msg) => {
    if (toast instanceof HTMLElement) toast.textContent = msg;
    btn.classList.add("is-copied");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      btn.classList.remove("is-copied");
    }, COPY_TOAST_MS);
  };

  btn.addEventListener("click", async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(email);
      } else {
        // Fallback for older browsers / non-secure contexts.
        const ta = document.createElement("textarea");
        ta.value = email;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showToast("copied ✓");
    } catch {
      showToast("copy failed");
    }
  });
}

// ── Theme toggle (light ↔ dark) ───────────────────────────────────────
/**
 * @param {HTMLButtonElement} btn
 * @param {() => TweakState} getState
 * @param {(patch: Partial<TweakState>) => void} commit
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

// ── Tweaks panel ──────────────────────────────────────────────────────
/**
 * @param {HTMLElement} panel
 * @param {() => TweakState} getState
 * @param {(patch: Partial<TweakState>) => void} commit
 */
function initTweaks(panel, getState, commit) {
  const syncUi = () => {
    const state = getState();
    /** @type {NodeListOf<HTMLElement>} */
    const groups = panel.querySelectorAll("[data-group]");
    groups.forEach((group) => {
      const key = /** @type {keyof TweakState} */ (group.dataset.group);
      const value = state[key];
      /** @type {NodeListOf<HTMLButtonElement>} */
      const options = group.querySelectorAll("[data-value]");
      options.forEach((opt) => {
        opt.classList.toggle("is-active", opt.dataset.value === value);
      });
    });
  };

  syncUi();

  panel.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const group = target.closest("[data-group]");
    const option = target.closest("[data-value]");
    if (!(group instanceof HTMLElement) || !(option instanceof HTMLElement)) {
      return;
    }

    const key = group.dataset.group;
    const value = option.dataset.value;
    if (!key || value === undefined) return;

    commit({ [key]: value });
    syncUi();
  });

  return { syncUi };
}

// ── Intro animation ───────────────────────────────────────────────────
// First-paint sequence:
//   1. `.name` handwrites in (CSS clip-path reveal, triggered by class)
//   2. `.subtitle` types out char-by-char with a blinking caret
//   3. `.prose` paragraphs, `.chips`, `.paragraph-footer` fade + rise,
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
  tailGap: 200,            // extra gap before chips, then footer
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
  const proses = document.querySelectorAll(".prose");
  const chips = document.querySelector(".chips");
  const footer = document.querySelector(".paragraph-footer");

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReduced) {
    // Snap to final state — no sequence, no delays.
    name?.classList.add("is-written");
    subtitle?.classList.add("is-typed");
    proses.forEach((p) => p.classList.add("is-in"));
    chips?.classList.add("is-in");
    footer?.classList.add("is-in");
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

  // Phase 3: fade-rise each prose paragraph, staggered.
  proses.forEach((p, i) => {
    window.setTimeout(() => {
      p.classList.add("is-in");
    }, INTRO.proseStart + i * INTRO.proseStagger);
  });

  // Phase 4: chips row, then footer.
  const afterProse = INTRO.proseStart + proses.length * INTRO.proseStagger;
  window.setTimeout(() => chips?.classList.add("is-in"), afterProse);
  window.setTimeout(
    () => footer?.classList.add("is-in"),
    afterProse + INTRO.tailGap
  );
}

// ── App bootstrap ─────────────────────────────────────────────────────
function init() {
  let state = loadState();
  applyTheme(state);

  // Single commit closure shared by tweaks panel + theme toggle.
  /** @param {Partial<TweakState>} patch */
  const commit = (patch) => {
    state = { ...state, ...patch };
    saveState(state);
    applyTheme(state);
  };

  // Kick off the intro animation before anything else touches the DOM —
  // it captures the subtitle textContent before clearing it to type.
  runIntro();

  // Ladder loops
  document.querySelectorAll(".ladder").forEach((el) => {
    if (el instanceof HTMLElement) initLadder(el);
  });

  // Email pill
  document.querySelectorAll(".email-pill").forEach((el) => {
    if (el instanceof HTMLButtonElement) initEmailCopy(el);
  });

  // Theme toggle in the footer
  const themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn instanceof HTMLButtonElement) {
    initThemeToggle(themeBtn, () => state, commit);
  }

  // Tweaks panel
  const panel = document.querySelector(".tweaks-panel");
  if (panel instanceof HTMLElement) {
    initTweaks(panel, () => state, commit);

    // Toggle with `t` (but not while typing in a field).
    window.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "t" && e.key !== "T") return;

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA")
      ) {
        return;
      }

      panel.toggleAttribute("hidden");
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
