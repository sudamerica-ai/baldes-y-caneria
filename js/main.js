/* main.js — orchestration: Lenis smooth scroll, GSAP/ScrollTrigger choreography,
   water + particle mounting per scene, act-transition wipes, cursor ripple, audio.
   Only transform/opacity are animated; heavy canvases mount/unmount by visibility. */

import { WaterField } from "./water.js";
import { ParticleField } from "./particles.js";

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOBILE = matchMedia("(max-width: 720px), (hover: none)").matches;
const DENSITY = MOBILE ? 0.5 : 1;

/* ---------------------------------------------------------------- Lenis */
let lenis = null;
function initScroll() {
  if (REDUCED) return;
  lenis = new window.Lenis({ duration: 1.15, smoothWheel: true, lerp: 0.09,
    wheelMultiplier: 1, touchMultiplier: 1.4 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ------------------------------------------------ headline / copy reveal */
function buildCopyTimelines() {
  document.querySelectorAll(".scene").forEach((scene) => {
    const copy = scene.querySelector(".copy");
    const lines = copy.querySelectorAll(".reveal > span");
    const body = copy.querySelector(".body, .lede, .partd");
    const tl = gsap.timeline({
      scrollTrigger: { trigger: scene, start: "top 62%", toggleActions: "play none none reverse" },
    });
    if (!REDUCED) {
      tl.to(lines, { yPercent: 0, duration: 1.05, ease: "expo.out", stagger: 0.09 });
      if (body) tl.from(body, { autoAlpha: 0, y: 26, duration: 0.9, ease: "power3.out" }, "-=0.6");
      gsap.from(copy, {
        autoAlpha: 0, duration: 0.6,
        scrollTrigger: { trigger: scene, start: "top 75%", toggleActions: "play none none reverse" },
      });
    } else {
      gsap.set(lines, { yPercent: 0 });
    }
  });
}

/* ------------------------------------------------------ image parallax */
function buildParallax() {
  if (REDUCED) return;
  document.querySelectorAll(".scene").forEach((scene) => {
    const img = scene.querySelector(".bg-image[data-parallax]");
    if (!img) return;
    const depth = parseFloat(img.dataset.parallax) || 0.12;
    gsap.fromTo(img, { yPercent: -depth * 50 }, {
      yPercent: depth * 50, ease: "none",
      scrollTrigger: { trigger: scene, start: "top bottom", end: "bottom top", scrub: true },
    });
    // fog planes drift the other way for depth
    const fog = scene.querySelector(".layer.fog");
    if (fog) gsap.fromTo(fog, { yPercent: 12, autoAlpha: 0 },
      { yPercent: -12, autoAlpha: 0.5, ease: "none",
        scrollTrigger: { trigger: scene, start: "top bottom", end: "bottom top", scrub: true } });
  });
}

/* ------------------------------------------------------ special effects */
function buildFx(activeCanvases) {
  // pond fill: a rising cyan water level clipped over the scene, scrubbed
  document.querySelectorAll('[data-fx="fill"]').forEach((scene) => {
    const stage = scene.querySelector(".stage");
    const fill = document.createElement("div");
    fill.className = "fill-mask";
    fill.style.background = "linear-gradient(0deg, rgba(43,163,196,.34), rgba(79,214,224,.14) 60%, transparent)";
    fill.style.transformOrigin = "bottom";
    fill.style.transform = "scaleY(0.16)";
    stage.appendChild(fill);
    if (!REDUCED) gsap.to(fill, { scaleY: 0.92, ease: "none",
      scrollTrigger: { trigger: scene, start: "top top", end: "bottom bottom", scrub: 0.6 } });
  });

  // pipe: draw the stroke, then let the drop particles flow
  document.querySelectorAll('[data-fx="pipe"]').forEach((scene) => {
    const path = scene.querySelector(".pipe-draw path");
    if (path && !REDUCED) {
      gsap.fromTo(path, { strokeDashoffset: 1, strokeDasharray: 1 },
        { strokeDashoffset: 0, ease: "none",
          scrollTrigger: { trigger: scene, start: "top 70%", end: "center center", scrub: 0.5 } });
    }
  });

  // compound: the orb image scales up as you scroll (inevitability)
  document.querySelectorAll('[data-fx="compound"]').forEach((scene) => {
    const img = scene.querySelector("[data-fx-target]");
    if (img && !REDUCED) gsap.fromTo(img, { scale: 1.05 }, { scale: 1.32, ease: "power1.in",
      scrollTrigger: { trigger: scene, start: "top top", end: "bottom bottom", scrub: 0.7 } });
  });
}

/* --------------------------------------------- act-transition liquid wipe */
function buildActWipes() {
  if (REDUCED) return;
  const wipe = document.getElementById("wipe");
  wipe.style.background =
    "radial-gradient(120% 100% at 50% 0%, rgba(79,214,224,.85), rgba(10,44,72,.96) 45%, rgba(4,16,28,1) 80%)";
  const groups = ["B", "C"];    // fire when entering the first scene of a new act
  groups.forEach((g) => {
    const first = document.querySelector(`.scene[data-group="${g}"]`);
    if (!first) return;
    ScrollTrigger.create({
      trigger: first, start: "top 90%", end: "top 30%",
      onEnter: () => flashWipe(wipe), onLeaveBack: () => {},
    });
  });
}
let wiping = false;
function flashWipe(wipe) {
  if (wiping) return; wiping = true;
  gsap.timeline({ onComplete: () => (wiping = false) })
    .set(wipe, { opacity: 0, scaleY: 0.2, transformOrigin: "bottom" })
    .to(wipe, { opacity: 1, scaleY: 1.05, duration: 0.5, ease: "power2.in" })
    .to(wipe, { opacity: 0, duration: 0.6, ease: "power2.out" }, "+=0.05");
}

/* ------------------------------------------------ canvas mount by visibility */
const rafItems = new Set();
function mountCanvases() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const inst = e.target.__fx;
      if (!inst) return;
      if (e.isIntersecting) { inst.start(); rafItems.add(inst); }
      else { inst.stop(); rafItems.delete(inst); }
    });
  }, { rootMargin: "10% 0px" });

  document.querySelectorAll(".scene").forEach((scene) => {
    // water fields
    scene.querySelectorAll("canvas.water[data-w]").forEach((cv) => {
      const kind = scene.dataset.water;
      const opts = kind === "rain" ? { cell: 9, rain: 0.5, gain: 1.1 }
                 : kind === "pool" ? { cell: 8, rain: 0.15, gain: 1.2 }
                 : { cell: 8, rain: 0.08, gain: 1 };
      const wf = new WaterField(cv, opts);
      cv.__fx = wf;
      io.observe(cv);
      cv.__isWater = true;
    });
    // particle fields
    scene.querySelectorAll("canvas.fx[data-p]").forEach((cv) => {
      const pf = new ParticleField(cv, {
        mode: cv.dataset.p, density: DENSITY,
        color: cv.dataset.color === "gold" ? "gold" : "cyan",
        onSplash: (x, y) => {
          // drops splash into the nearest water field of the same scene
          const w = scene.querySelector("canvas.water[data-w]");
          if (w && w.__fx) {
            const r = w.getBoundingClientRect(), rp = cv.getBoundingClientRect();
            w.__fx.drop(x + (rp.left - r.left), y + (rp.top - r.top), 220);
          }
        },
      });
      cv.__fx = pf;
      io.observe(cv);
    });
  });
}

/* ------------------------------------------------------ cursor ripple */
function initCursor() {
  if (REDUCED || MOBILE) return;
  const cv = document.getElementById("cursor-canvas");
  const dot = document.getElementById("cursor-dot");
  const field = new WaterField(cv, { cell: 12, damp: 0.978, gain: 0.8 });
  field.start(); rafItems.add(field);
  let lx = 0, ly = 0;
  addEventListener("pointermove", (e) => {
    dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%,-50%)`;
    const dist = Math.hypot(e.clientX - lx, e.clientY - ly);
    if (dist > 6) { field.drop(e.clientX, e.clientY, Math.min(180, dist * 8)); lx = e.clientX; ly = e.clientY; }
  }, { passive: true });
  addEventListener("pointerdown", (e) => field.drop(e.clientX, e.clientY, 420));
  addEventListener("resize", () => field.resize());
}

/* ----------------------------------------------------------- master RAF */
function startRAF() {
  let last = performance.now();
  function loop(now) {
    const dt = (now - last) / 1000; last = now;
    rafItems.forEach((it) => it.frame(dt));
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------ progress */
function initProgress() {
  const bar = document.getElementById("progress");
  ScrollTrigger.create({
    start: 0, end: "max",
    onUpdate: (self) => (bar.style.width = (self.progress * 100).toFixed(2) + "%"),
  });
}

/* -------------------------------------------------- sound (WebAudio) */
/* Shared audio engine: an ambient water bed + a soft "drop" pluck fired on
   each scene enter (sonido al desplazar). Everything is synthesised — no files. */
const Audio = {
  ctx: null, bed: null, on: false, lastTick: 0,
  ensure() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // filtered brown-ish noise = soft water/ambient bed
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0); let lastN = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; d[i] = (lastN + 0.02 * w) / 1.02; lastN = d[i]; d[i] *= 3.2; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520;
    const bed = ctx.createGain(); bed.gain.value = 0;
    src.connect(lp).connect(bed).connect(ctx.destination); src.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = ctx.createGain(); lg.gain.value = 0.03; lfo.connect(lg).connect(bed.gain); lfo.start();
    this.ctx = ctx; this.bed = bed;
  },
  toggle() {
    this.ensure();
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.on = !this.on;
    this.bed.gain.setTargetAtTime(this.on ? 0.08 : 0, this.ctx.currentTime, 0.4);
    return this.on;
  },
  // a gentle water-drop pluck (sine + quick decay through a lowpass), pitched
  drop(freq = 320, vol = 0.16) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTick < 0.05) return; this.lastTick = now;
    const o = this.ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.9, now);
    o.frequency.exponentialRampToValueAtTime(freq, now + 0.12);
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    o.connect(lp).connect(g).connect(this.ctx.destination);
    o.start(now); o.stop(now + 0.55);
  },
};

/* Real background song (assets/cancion.mp3). Browsers block audible autoplay,
   so we start it on the first user gesture and fade it in gently. */
const Song = {
  el: null, on: false, vol: 0.55, started: false,
  ensure() { if (!this.el) this.el = document.getElementById("song"); return this.el; },
  fade(to) {
    const a = this.ensure(); if (!a) return;
    const from = a.volume, t0 = performance.now(), dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      a.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(step);
      else if (to === 0) a.pause();
    };
    if (to > 0 && a.paused) { a.volume = 0; a.play().catch(() => {}); }
    requestAnimationFrame(step);
  },
  start() {           // called on first gesture — begins playing by itself
    if (this.started) return;
    const a = this.ensure(); if (!a) return;
    this.started = true; this.on = true;
    this.fade(this.vol);
  },
  toggle() { this.on ? this.fade(0) : this.fade(this.vol); this.on = !this.on; return this.on; },
};

function initSound() {
  const btn = document.getElementById("soundToggle");
  const paint = (on) => {
    btn.style.color = on ? "var(--gold-1)" : "var(--cyan-3)";
    btn.textContent = on ? "◊" : "♪";
  };
  btn.addEventListener("click", () => {
    Song.started = true;           // clicking counts as the gesture
    const on = Song.toggle();
    if (!Audio.on && on) Audio.toggle(); else if (Audio.on && !on) Audio.toggle();
    paint(on);
  });
  // Autostart on the first real interaction anywhere (scroll, tap, key).
  const kick = () => {
    Song.start();
    if (!Audio.on) Audio.toggle();
    paint(true);
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((e) =>
      removeEventListener(e, kick, { capture: true }));
  };
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach((e) =>
    addEventListener(e, kick, { capture: true, once: false, passive: true }));
}

/* fire a soft, act-tuned drop each time a new scene scrolls into view */
function initScrollSound() {
  // a calm pentatonic bed so consecutive ticks feel musical, not random
  const scale = [261.6, 293.7, 329.6, 392.0, 440.0]; // C D E G A
  const scenes = [...document.querySelectorAll(".scene")];
  scenes.forEach((scene, i) => {
    const freq = scale[i % scale.length] * (scene.dataset.group === "C" ? 0.5 : 1);
    ScrollTrigger.create({
      trigger: scene, start: "top 55%", end: "bottom 45%",
      onEnter: () => Audio.drop(freq, 0.15),
      onEnterBack: () => Audio.drop(freq * 1.5, 0.10),
    });
  });
}

/* ---------------------------------------------------------------- boot */
function boot() {
  initScroll();
  buildCopyTimelines();
  buildParallax();
  buildFx();
  buildActWipes();
  mountCanvases();
  initCursor();
  initProgress();
  initSound();
  initScrollSound();
  startRAF();
  addEventListener("resize", () => {
    document.querySelectorAll("canvas").forEach((cv) => cv.__fx && cv.__fx.resize());
    ScrollTrigger.refresh();
  }, { passive: true });
  window.addEventListener("load", () => ScrollTrigger.refresh());
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
