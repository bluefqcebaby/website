// Andrei Iashchuk — portfolio interactions
// Two views (paragraph, desk), ladder loop, email copy, tweakable theme.

/**
 * @typedef {{
 *   accent: string,
 *   paper: string,
 *   handFont: string,
 *   proseFont: string
 * }} TweakState
 */

const STORAGE_KEY = "portfolio:tweaks";
const LADDER_INTERVAL_MS = 2600;
const LADDER_DURATION_MS = 650;
const COPY_TOAST_MS = 1400;

/** @type {TweakState} */
const DEFAULTS = Object.freeze({
  accent: "#e4572e",
  paper: "#fbf8f1",
  handFont: "Caveat",
  proseFont: "Instrument Serif",
});

// ── Persistence ────────────────────────────────────────────────────────
/** @returns {TweakState} */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };
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

/** @param {TweakState} state */
function applyTheme(state) {
  const root = document.documentElement;
  root.style.setProperty("--accent", state.accent);
  root.style.setProperty("--paper", state.paper);
  root.style.setProperty("--font-hand", `"${state.handFont}", cursive`);
  root.style.setProperty(
    "--font-prose",
    `"${state.proseFont}", "EB Garamond", Georgia, serif`
  );
  root.style.setProperty("--squiggle-bg", squiggleDataUri(state.accent));
}

// ── Ladder loop (infinite vertical text scroller) ─────────────────────
/** @param {HTMLElement} host */
function initLadder(host) {
  const raw = host.dataset.ladderLines ?? "";
  const lines = raw.split("|").filter(Boolean);
  if (lines.length < 2) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  host.textContent = "";

  const track = document.createElement("span");
  track.className = "ladder-track";
  host.appendChild(track);

  let index = 0;
  const currentLine = document.createElement("span");
  currentLine.className = "ladder-line";
  currentLine.textContent = lines[index];
  track.appendChild(currentLine);

  const nextLine = document.createElement("span");
  nextLine.className = "ladder-line";
  nextLine.textContent = lines[(index + 1) % lines.length];
  track.appendChild(nextLine);

  if (prefersReducedMotion) return;

  // Use the Web Animations API — cleaner than toggling CSS transitions,
  // and avoids the "transition + class change in same tick" gotcha that
  // stops the animation from ever being committed.
  setInterval(() => {
    const anim = track.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-1.2em)" },
      ],
      {
        duration: LADDER_DURATION_MS,
        easing: "cubic-bezier(.6, 0, .2, 1)",
      }
    );
    anim.onfinish = () => {
      // Swap text at the exact moment the animation ends. Without
      // `fill: "forwards"`, transform snaps back to 0 — and because the
      // swapped currentLine now shows what `nextLine` was showing at the
      // peak, the return is visually seamless.
      index = (index + 1) % lines.length;
      currentLine.textContent = lines[index];
      nextLine.textContent = lines[(index + 1) % lines.length];
    };
  }, LADDER_INTERVAL_MS);
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

// ── App bootstrap ─────────────────────────────────────────────────────
function init() {
  let state = loadState();
  applyTheme(state);

  // Ladder loops
  document.querySelectorAll(".ladder").forEach((el) => {
    if (el instanceof HTMLElement) initLadder(el);
  });

  // Email pill
  document.querySelectorAll(".email-pill").forEach((el) => {
    if (el instanceof HTMLButtonElement) initEmailCopy(el);
  });

  // Tweaks panel
  const panel = document.querySelector(".tweaks-panel");
  if (panel instanceof HTMLElement) {
    initTweaks(
      panel,
      () => state,
      (patch) => {
        state = { ...state, ...patch };
        saveState(state);
        applyTheme(state);
      }
    );

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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
