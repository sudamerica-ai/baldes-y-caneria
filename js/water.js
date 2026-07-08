/* water.js — SLOW, calm caustic water. Height-field ripple on a coarse grid,
   but the simulation is throttled to a fixed low rate so waves spread gently
   (fast propagation is what reads as "strobing"). Reusable for hero / pond /
   pipe / closing surfaces and for the soft cursor ripple. */

export class WaterField {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.cell = opts.cell || 10;            // px per sim cell (bigger = softer/cheaper)
    this.damp = opts.damp ?? 0.94;          // ripples fade fairly quickly = calm
    this.gain = opts.gain ?? 0.5;           // overall visible strength (subtle)
    this.rain = opts.rain ?? 0;             // ambient drops per *tick* (not per frame)
    this.rainStrength = opts.rainStrength ?? 70;
    this.stepMs = opts.stepMs ?? 70;        // sim tick interval → slow, gentle waves
    this.tint = opts.tint || [79, 214, 224];
    this.glow = opts.glow || [255, 211, 110];
    this.running = false;
    this._acc = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.gw = Math.max(4, Math.ceil(this.w / this.cell));
    this.gh = Math.max(4, Math.ceil(this.h / this.cell));
    const n = this.gw * this.gh;
    this.cur = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.buf = document.createElement("canvas");
    this.buf.width = this.gw; this.buf.height = this.gh;
    this.bctx = this.buf.getContext("2d");
    this.img = this.bctx.createImageData(this.gw, this.gh);
  }

  drop(px, py, strength = 90) {
    const gx = Math.floor((px / this.w) * this.gw);
    const gy = Math.floor((py / this.h) * this.gh);
    if (gx < 1 || gy < 1 || gx >= this.gw - 1 || gy >= this.gh - 1) return;
    this.prev[gy * this.gw + gx] += strength;
  }

  step() {
    const { gw, gh, cur, prev, damp } = this;
    for (let y = 1; y < gh - 1; y++) {
      for (let x = 1; x < gw - 1; x++) {
        const i = y * gw + x;
        const v = ((prev[i - 1] + prev[i + 1] + prev[i - gw] + prev[i + gw]) * 0.5) - cur[i];
        cur[i] = v * damp;
      }
    }
    const t = this.prev; this.prev = this.cur; this.cur = t;
    if (this.rain > 0 && Math.random() < this.rain) {
      this.drop(Math.random() * this.w, Math.random() * this.h,
        this.rainStrength * (0.5 + Math.random() * 0.6));
    }
  }

  render() {
    const { gw, gh, prev, img, tint, glow, gain } = this;
    const d = img.data;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const xl = x > 0 ? prev[i - 1] : prev[i];
        const xr = x < gw - 1 ? prev[i + 1] : prev[i];
        const yu = y > 0 ? prev[i - gw] : prev[i];
        const yd = y < gh - 1 ? prev[i + gw] : prev[i];
        const slope = (xl - xr + yu - yd);
        const hgt = prev[i];
        const spec = Math.max(0, slope * 0.6);
        const amp = Math.min(0.85, (Math.abs(hgt) * 0.009 + spec * 0.014) * gain);
        const g = Math.min(0.7, spec * 0.02);
        const k = i * 4;
        d[k]     = tint[0] * amp + glow[0] * g;
        d[k + 1] = tint[1] * amp + glow[1] * g;
        d[k + 2] = tint[2] * amp + glow[2] * g;
        d[k + 3] = Math.min(210, amp * 230 + g * 90);
      }
    }
    this.bctx.putImageData(img, 0, 0);
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.imageSmoothingEnabled = true;         // upscale blur = soft water
    c.drawImage(this.buf, 0, 0, this.w, this.h);
  }

  frame(dt) {
    if (!this.running) return;
    this._acc += dt * 1000;
    let ticks = 0;
    while (this._acc >= this.stepMs && ticks < 3) { this.step(); this._acc -= this.stepMs; ticks++; }
    this.render();
  }
  start() { this.running = true; }
  stop() { this.running = false; }
}
