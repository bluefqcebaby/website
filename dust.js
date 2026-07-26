/* Dust — cosmic. The name is a cloud of matter; seven space behaviours can be
 * toggled independently (keys 1-7 or the chips at the bottom):
 *
 *   1 starfield   second, far layer of points, drifting on its own clock
 *   2 starlight   per-grain colour temperature (cool blue ↔ warm amber)
 *   3 accretion   grains spiral into their slots instead of arriving straight
 *   4 spin        slow galactic rotation, faster near the core
 *   5 supernova   central flash + shockwave ring on the blast
 *   6 comet       a rare streak crossing the field
 *   7 lensing     pointer bends the dust around a mass instead of pushing it
 *
 * Idle behaviour is the shedding ("sifting") pass: each grain holds its glyph
 * slot for 16-42s, then detaches, falls and fades. three.js draws the field,
 * GSAP owns every timing.
 */
/* Self-hosted and imported by path: no importmap, so this also runs on the
 * browsers that never shipped one (Safari before 16.4). */
import * as THREE from "./vendor/three.module.js";

const gsap = window.gsap;
const html = document.documentElement;
const NAME = "andrei yaschuk";
const glHost = document.querySelector(".gl");
const gate = document.querySelector(".gate");
const page = document.querySelector(".page");
const rows = [...document.querySelectorAll(".r")];
const h1 = document.querySelector("h1");
const dim = document.querySelector(".dim");
const foot = document.querySelector(".foot");
const closeBtn = document.querySelector(".collapse");
const comet = document.querySelector(".comet");

/* Give up on the effect and leave the readable page alone. Removing the class
 * is also the signal to any later stage that it must not touch the DOM. */
const bail = () => {
  html.classList.remove("dust-mode");
  /* gsap.set(rows, {y:12}) has usually landed by now; left inline it offsets
   * every paragraph in the static page. */
  if (window.gsap) window.gsap.set([...rows, h1, dim, foot].filter(Boolean), { clearProps: "all" });
};
const live = () => html.classList.contains("dust-mode");

/* The head probe already vetoed reduced-motion and missing WebGL. If it never
 * opted in — or the 2.5s watchdog gave up on us while three.js was still on the
 * wire — the copy is on screen and stays there. */
if (!live()) throw new Error("dust: not wanted");
if (!gsap) { bail(); throw new Error("dust: no gsap"); }

const inkColor = () => new THREE.Color(getComputedStyle(html).getPropertyValue("--ink").trim() || "#eee");

/* ── Sample the name's glyph pixels ────────────────────────────────────── */
async function sampleName(maxPts) {
  /* Race the font, never wait on it. A throttled fonts.gstatic.com leaves
   * document.fonts.ready pending for minutes — and everything the visitor can
   * see or click hangs off this promise. Fall back to ui-monospace instead. */
  const settled = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
  try {
    await settled(document.fonts.load('500 100px "JetBrains Mono"'), 1200);
    await settled(document.fonts.ready, 400);
  } catch (e) {}
  const fs = Math.max(42, Math.min(innerWidth * 0.082, 122));
  const probe = document.createElement("canvas").getContext("2d");
  const font = `500 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  probe.font = font;
  const w = Math.ceil(probe.measureText(NAME).width) + 24;
  const h = Math.ceil(fs * 1.6);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.font = font; g.textBaseline = "middle"; g.fillStyle = "#fff";
  g.fillText(NAME, 12, h / 2);
  const data = g.getImageData(0, 0, w, h).data;
  const hits = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 130) hits.push(x - w / 2, -(y - h / 2));
  }
  const n = hits.length / 2;
  const take = Math.min(n, maxPts);
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  const out = new Float32Array(take * 2);
  for (let i = 0; i < take; i++) { out[i * 2] = hits[idx[i] * 2]; out[i * 2 + 1] = hits[idx[i] * 2 + 1]; }
  return { pts: out, count: take, width: w };
}

/* ── Main field ────────────────────────────────────────────────────────── */
const VERT = `
attribute vec3 aDust; attribute vec3 aText; attribute vec3 aRand; attribute float aDelay;
uniform float uForm, uBlast, uTime, uSize, uDist, uFade, uMouseK, uDrift, uGlint, uJitter, uHalf;
uniform float uSpin, uLens;
uniform vec2 uMouse;
uniform vec3 uColor;
varying float vAlpha;
varying vec3 vCol;

vec2 rot(vec2 v, float a){ float s = sin(a), c = cos(a); return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }

void main(){
  /* pre-formation drift of the loose cloud */
  vec3 d = aDust;
  float sp = 0.16 + aRand.z * 0.26;
  d.x += sin(uTime * sp + aRand.x * 6.283) * (16.0 + uDrift * 42.0);
  d.y += cos(uTime * sp * 0.82 + aRand.y * 6.283) * (12.0 + uDrift * 34.0);
  d.z += sin(uTime * sp * 0.6 + aRand.z * 6.283) * 40.0;

  float t = clamp((uForm - aDelay * 0.42) / 0.58, 0.0, 1.0);
  float e = t * t * (3.0 - 2.0 * t);
  vec3 p = mix(d, aText, e);

  /* SPIN: slow rotation, faster near the core (differential, like a disk) */
  float r0 = length(p.xy);
  /* ±30° pendulum (period ~24s), differential by radius so the disk shears */
  float ang = radians(30.0) * sin(uTime * 0.262) * uSpin * (1.0 - clamp(r0 / 1100.0, 0.0, 0.62));
  p.xy = rot(p.xy, ang);

  /* pointer: LENSING — tangential bend around a mass, with a slight pull */
  vec2 md = p.xy - uMouse;
  float ml = length(md);
  float k = uMouseK * smoothstep(185.0, 0.0, ml) * e;
  vec2 rad = normalize(md + vec2(0.001));
  vec2 tan2 = vec2(-rad.y, rad.x);
  p.xy += rad * k * 52.0 * (1.0 - uLens);
  p.xy += (tan2 * 62.0 - rad * 16.0) * k * uLens;
  p.z += k * 60.0 * (1.0 - uLens * 0.7);

  /* blast: outward from the centre, scattered through depth */
  vec3 dir = normalize(aText + vec3(aRand.xy - 0.5, 0.6) * 40.0 + vec3(0.001));
  p += dir * uBlast * (200.0 + aRand.x * 620.0);
  p.z += uBlast * (aRand.y - 0.5) * 520.0;
  p.y += uBlast * (aRand.z - 0.35) * 180.0;

  /* ambient dust once dispersed */
  float sp2 = 0.10 + aRand.z * 0.24;
  float amp = 1.1 + uDrift * 30.0;
  p.x += sin(uTime * sp2 + aRand.x * 21.0) * amp;
  p.y += cos(uTime * sp2 * 0.78 + aRand.y * 17.0) * amp * 0.85;
  p.y += uDrift * sin(uTime * 0.11 + aRand.x * 6.283) * 32.0;
  p.z += sin(uTime * sp2 * 0.6 + aRand.z * 13.0) * (8.0 + uDrift * 120.0);

  /* ── idle: shedding, only while the glyphs are assembled ───────────── */
  float hold = e * (1.0 - uBlast) * uJitter;
  float aBoost = 0.0;
  float h1v = fract(sin(dot(aText.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float h2v = fract(sin(dot(aText.xy, vec2(39.3468, 11.135))) * 24634.6345);
  float cyc3 = 46.0 + h1v * 54.0;                 /* 46-100s per grain */
  float ph3 = fract(uTime / cyc3 + h2v + aRand.x * 0.37);
  float win = 0.05 + h1v * 0.035;                 /* only ~5% of it falls */
  float shed = smoothstep(1.0 - win, 1.0, ph3);
  float g3 = shed * shed;
  vec3 idle = vec3(0.0);
  idle.y = -g3 * (9.0 + aRand.y * 9.0);
  float dir3 = h2v > 0.5 ? 1.0 : -1.0;
  idle.x = dir3 * g3 * (0.6 + aRand.z * 1.8);
  idle.z = g3 * (aRand.z - 0.5) * 6.0;
  aBoost = -1.0 * smoothstep(1.0 - win * 0.6, 1.0, ph3);
  p += idle * hold;

  /* rare glint */
  float cycG = 11.0 + aRand.y * 17.0;
  float phG = fract(uTime / cycG + aRand.x * 7.31 + aRand.z * 3.17);
  float glint = pow(max(0.0, sin(phG * 3.14159265)), 78.0);

  vCol = uColor;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (uDist / max(0.001, -mv.z)) * (1.0 + glint * uGlint * 1.7);
  float base = mix(0.34, 1.0, e) + aBoost * hold;
  float tw = 0.70 + 0.30 * sin(uTime * (0.5 + aRand.z * 1.6) + aRand.x * 24.0);
  vAlpha = max(0.0, base) * mix(1.0, 0.19 * tw, uBlast) * uFade + glint * uGlint * 0.85 * uFade;
}`;

const FRAG = `
precision mediump float; varying float vAlpha; varying vec3 vCol;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vCol, vAlpha * smoothstep(0.5, 0.12, d));
}`;

/* ── 1 — Starfield: far layer. Static under the pointer — it only drifts
 *      on its own clock, so the background stays put while you move. ──── */
const STAR_VERT = `
attribute vec3 aRand;
uniform float uTime, uSize, uDist, uOpacity;
varying float vAlpha;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.03 + aRand.x * 6.283) * 14.0;
  p.y += cos(uTime * 0.026 + aRand.y * 6.283) * 10.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.35 + aRand.x * 0.75) * (uDist / max(0.001, -mv.z));
  float tw = 0.55 + 0.45 * sin(uTime * (0.25 + aRand.y * 0.9) + aRand.z * 31.0);
  vAlpha = (0.18 + aRand.z * 0.5) * tw * uOpacity;
}`;
const STAR_FRAG = `
precision mediump float; uniform vec3 uColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, vAlpha * smoothstep(0.5, 0.1, d));
}`;

function makeField() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  glHost.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const FOV = 45;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 12000);
  const dpr = Math.min(devicePixelRatio || 1, 2);

  const uniforms = {
    uForm: { value: 0 }, uBlast: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 },
    uMouse: { value: new THREE.Vector2(9e5, 9e5) }, uMouseK: { value: 0 }, uDrift: { value: 0 },
    uGlint: { value: 0.22 }, uJitter: { value: 0 }, uHalf: { value: 300 },
    uSize: { value: 1.7 * dpr }, uDist: { value: 1000 }, uColor: { value: inkColor() },
    uSpin: { value: 0 }, uLens: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthTest: false, depthWrite: false });
  let points = null;

  const starU = {
    uTime: uniforms.uTime, uDist: uniforms.uDist, uSize: { value: 1.5 * dpr },
    uOpacity: { value: 0 }, uColor: uniforms.uColor,
  };
  const starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: starU, transparent: true, depthTest: false, depthWrite: false });
  let stars = null;

  function buildStars() {
    const n = 2400, pos = new Float32Array(n * 3), rnd = new Float32Array(n * 3);
    const w = innerWidth * 2.6, h = innerHeight * 2.2;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * w;
      pos[i * 3 + 1] = (Math.random() - 0.5) * h;
      pos[i * 3 + 2] = -900 - Math.random() * 2600;
      rnd[i * 3] = Math.random(); rnd[i * 3 + 1] = Math.random(); rnd[i * 3 + 2] = Math.random();
    }
    if (stars) { stars.geometry.dispose(); scene.remove(stars); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rnd, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    stars = new THREE.Points(g, starMat);
    stars.frustumCulled = false;
    scene.add(stars);
  }

  function fit() {
    const w = innerWidth, h = innerHeight;
    const dist = (h / 2) / Math.tan((FOV / 2) * Math.PI / 180);
    camera.aspect = w / h; camera.position.set(0, 0, dist); camera.updateProjectionMatrix();
    uniforms.uDist.value = dist;
    renderer.setSize(w, h, false);
  }

  function load(sample) {
    const n = sample.count;
    const text = new Float32Array(n * 3), dust = new Float32Array(n * 3);
    const rand = new Float32Array(n * 3), delay = new Float32Array(n);
    const bw = innerWidth * 1.25, bh = innerHeight * 1.05, half = sample.width / 2;
    uniforms.uHalf.value = half;
    for (let i = 0; i < n; i++) {
      const x = sample.pts[i * 2], y = sample.pts[i * 2 + 1];
      text[i * 3] = x + (Math.random() - 0.5) * 1.1;
      text[i * 3 + 1] = y + (Math.random() - 0.5) * 1.1;
      text[i * 3 + 2] = (Math.random() - 0.5) * 9;
      dust[i * 3] = (Math.random() - 0.5) * bw;
      dust[i * 3 + 1] = (Math.random() - 0.5) * bh;
      dust[i * 3 + 2] = -560 + Math.random() * 700;
      rand[i * 3] = Math.random(); rand[i * 3 + 1] = Math.random(); rand[i * 3 + 2] = Math.random();
      delay[i] = Math.min(0.999, (x + half) / (half * 2) * 0.55 + Math.random() * 0.45);
    }
    if (points) { points.geometry.dispose(); scene.remove(points); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(dust, 3));
    g.setAttribute("aDust", new THREE.BufferAttribute(dust, 3));
    g.setAttribute("aText", new THREE.BufferAttribute(text, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 3));
    g.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    points = new THREE.Points(g, material);
    points.frustumCulled = false;
    scene.add(points);
  }

  const clock = new THREE.Clock();
  const state = { sway: 0 };
  (function loop() {
    /* Bailed out — the canvas is hidden, stop burning frames on it. */
    if (!live()) { renderer.dispose(); return; }
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    const s = state.sway;
    camera.position.x = Math.sin(t * 0.07) * 30 * s;
    camera.position.y = Math.cos(t * 0.052) * 20 * s;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
  fit(); buildStars();
  return { uniforms, starU, state, fit, load, buildStars, setColor: () => (uniforms.uColor.value = inkColor()) };
}

let field = null;
try { field = makeField(); } catch (e) { bail(); throw e; }
/* Renderer is up — claim the page before the watchdog fires. */
html.dataset.dust = "on";

/* ── Comet: a rare streak crossing the field ──────────────────────── */
let cometTimer = null;
function fireComet() {
  if (!comet) return;
  const fromTop = Math.random() < 0.6;
  const angle = fromTop ? 18 + Math.random() * 16 : -(14 + Math.random() * 14);
  const y = fromTop ? innerHeight * (0.05 + Math.random() * 0.35) : innerHeight * (0.55 + Math.random() * 0.35);
  const len = 130 + Math.random() * 190;
  gsap.set(comet, { opacity: 0, width: len, rotate: angle, x: -len - 60, y });
  gsap.timeline()
    .to(comet, { opacity: 1, duration: 0.22, ease: "power2.out" })
    .to(comet, { x: innerWidth + len, y: y + Math.tan(angle * Math.PI / 180) * (innerWidth + len * 2), duration: 1.5 + Math.random() * 1.1, ease: "none" }, 0)
    .to(comet, { opacity: 0, duration: 0.5, ease: "power2.in" }, "-=0.55");
}
function scheduleComet() {
  cometTimer = setTimeout(() => { fireComet(); scheduleComet(); }, 6000 + Math.random() * 16000);
}
function startComets() { if (!cometTimer) { setTimeout(fireComet, 1200); scheduleComet(); } }
function stopComets() { clearTimeout(cometTimer); cometTimer = null; if (comet) gsap.to(comet, { opacity: 0, duration: 0.3 }); }

/* ── Orchestration ─────────────────────────────────────────────────────── */
let open = false, busy = false, ready = false;
gsap.set(rows, { y: 12 });
/* starfield, spin and lensing are always on */
field.starU.uOpacity.value = 1;
field.uniforms.uSpin.value = 1;
field.uniforms.uLens.value = 1;
startComets();

sampleName(16000).then((sample) => {
  field.load(sample);
  ready = true;
  const u = field.uniforms;
  gsap.timeline()
    .to(u.uForm, { value: 1, duration: 2.4, ease: "power2.inOut" })
    .to(u.uMouseK, { value: 1, duration: 1.2 }, "-=0.8")
    .to(u.uJitter, { value: 1, duration: 1.8, ease: "power2.out" }, "-=1.2")
    .to(gate, { opacity: 1, duration: 0.9, ease: "power2.out" }, "-=0.6");
}).catch(() => {
  /* getImageData is the usual suspect — anti-fingerprinting extensions throw
   * on canvas readback. Unhandled, this left the gate at opacity 0 forever. */
  bail();
});

function doOpen() {
  if (open || busy || !ready) return;
  busy = true; open = true;
  page.setAttribute("data-open", "");
  document.body.classList.remove("is-closed");
  const u = field.uniforms;

  gsap.killTweensOf(gate);
  const tl = gsap.timeline({ onComplete: () => (busy = false) });
  tl.to(gate, { opacity: 0, duration: 0.3, ease: "power2.out", overwrite: true }, 0)
    .set(gate, { pointerEvents: "none" }, 0.3)
    .to(u.uMouseK, { value: 0, duration: 0.4 }, 0)
    .to(u.uBlast, { value: 1, duration: 1.9, ease: "expo.out" }, 0)
    .to(u.uDrift, { value: 1, duration: 2.8, ease: "power1.out" }, 0)
    .to(field.state, { sway: 1, duration: 3.2, ease: "power2.out" }, 0)
    .to(u.uGlint, { value: 0.62, duration: 2.6, ease: "power2.out" }, 0.4);

  tl.fromTo(h1, { opacity: 0, letterSpacing: "0.9em", filter: "blur(7px)" },
      { opacity: 1, letterSpacing: "0.06em", filter: "blur(0px)", duration: 1.5, ease: "expo.out" }, 0.3)
    .fromTo(dim, { opacity: 0, letterSpacing: "0.62em", filter: "blur(5px)" },
      { opacity: 1, letterSpacing: "0.14em", filter: "blur(0px)", duration: 1.3, ease: "expo.out" }, 0.5)
    .to(rows, { opacity: 1, y: 0, duration: 0.85, stagger: 0.11, ease: "power2.out" }, 0.8)
    .to(foot, { opacity: 1, duration: 0.7 }, 1.7);
}

function doClose() {
  if (!open || busy) return;
  busy = true;
  const u = field.uniforms;
  gsap.killTweensOf(u.uMouse.value);
  u.uMouseK.value = 0;
  u.uMouse.value.set(9e5, 9e5);

  gsap.timeline({
    onComplete: () => {
      open = false; busy = false;
      page.removeAttribute("data-open");
      document.body.classList.add("is-closed");
      gsap.set(gate, { pointerEvents: "auto" });
      gsap.set([h1, dim], { clearProps: "letterSpacing,filter" });
    },
  })
    .to([...rows].reverse(), { opacity: 0, y: 10, duration: 0.34, stagger: 0.05, ease: "power2.in" }, 0)
    .to(foot, { opacity: 0, duration: 0.28 }, 0)
    .to(dim, { opacity: 0, letterSpacing: "0.62em", filter: "blur(5px)", duration: 0.55, ease: "power2.in" }, 0.1)
    .to(h1, { opacity: 0, letterSpacing: "0.9em", filter: "blur(7px)", duration: 0.7, ease: "power2.in" }, 0.2)
    .to(u.uBlast, { value: 0, duration: 1.5, ease: "power3.inOut" }, 0.3)
    .to(u.uDrift, { value: 0, duration: 1.5, ease: "power2.inOut" }, 0.3)
    .to(field.state, { sway: 0, duration: 1.2, ease: "power2.inOut" }, 0.3)
    .to(u.uGlint, { value: 0.22, duration: 1.2, ease: "power2.inOut" }, 0.3)
    .to(gate, { opacity: 1, duration: 0.6, overwrite: true }, 1.2);
}

/* Pointer drives the repulsion / lensing centre. The starfield ignores it. */
const mouse = field.uniforms.uMouse.value;
addEventListener("pointermove", (e) => {
  if (open || !ready) return;
  const x = e.clientX - innerWidth / 2, y = -(e.clientY - innerHeight / 2);
  if (Math.abs(mouse.x) > 1e4) {
    mouse.set(x, y);
    gsap.to(field.uniforms.uMouseK, { value: 1, duration: 0.5, overwrite: true });
    return;
  }
  gsap.to(mouse, { x, y, duration: 0.35, ease: "power2.out", overwrite: true });
}, { passive: true });
addEventListener("pointerleave", () => gsap.to(field.uniforms.uMouseK, { value: 0, duration: 0.6 }));
addEventListener("pointerenter", () => { if (!open && ready && Math.abs(mouse.x) < 1e4) gsap.to(field.uniforms.uMouseK, { value: 1, duration: 0.6 }); });

gate.addEventListener("click", doOpen);
glHost.addEventListener("click", () => { if (!open) doOpen(); });
if (closeBtn) closeBtn.addEventListener("click", doClose);
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && open) doClose();
  if ((e.key === "Enter" || e.key === " ") && !open) { e.preventDefault(); doOpen(); }
});
addEventListener("resize", () => {
  field.fit(); field.buildStars();
  if (!open && !busy) sampleName(16000).then(field.load);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(field.setColor, 60));
