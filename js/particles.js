/* particles.js — depth-sorted particle field. Three behaviours:
   bubble (rises + wobbles), mote (drifts + twinkles), drop (gravity fall,
   used by the pipe; can invoke an onSplash callback at a target line). */

const CY = "79,214,224";
const GO = "255,211,110";

function rand(a, b) { return a + Math.random() * (b - a); }

export class ParticleField {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.mode = opts.mode || "bubbles";   // bubbles | motes | drops
    this.density = opts.density ?? 1;
    this.color = opts.color === "gold" ? GO : CY;
    this.onSplash = opts.onSplash || null;
    this.splashY = opts.splashY ?? 0.72;  // fraction of height where drops land
    this.running = false;
    this.parts = [];
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seed();
  }

  count() {
    const base = this.mode === "drops" ? 46 : this.mode === "motes" ? 60 : 40;
    const area = (this.w * this.h) / (1280 * 720);
    return Math.round(base * area * this.density);
  }

  seed() {
    const n = this.count();
    this.parts = [];
    for (let i = 0; i < n; i++) this.parts.push(this.make(true));
  }

  make(initial) {
    const z = rand(0.25, 1);             // depth
    if (this.mode === "drops") {
      return {
        x: rand(0.42, 0.58) * this.w + rand(-30, 30),
        y: initial ? rand(-this.h, this.splashY * this.h) : rand(-60, -10),
        z, vy: rand(120, 260) * z, r: rand(1.2, 3.2) * z, a: rand(.5, 1),
      };
    }
    if (this.mode === "motes") {
      return {
        x: rand(0, this.w), y: rand(0, this.h), z,
        vx: rand(-8, 8) * z, vy: rand(-6, 6) * z,
        r: rand(.6, 2.2) * z, a: rand(.15, .7), tw: rand(0, 6.28), tws: rand(1, 3),
      };
    }
    // bubbles
    return {
      x: rand(0, this.w), y: initial ? rand(0, this.h) : this.h + rand(0, 40), z,
      vx: rand(-6, 6), vy: -rand(14, 46) * z, r: rand(1.5, 5) * z,
      a: rand(.15, .55), wob: rand(0, 6.28), wobs: rand(.6, 1.6),
    };
  }

  step(dt) {
    const g = 640;
    for (let p of this.parts) {
      if (this.mode === "drops") {
        p.vy += g * p.z * dt; p.y += p.vy * dt;
        if (p.y >= this.splashY * this.h) {
          if (this.onSplash) this.onSplash(p.x, this.splashY * this.h, p.z);
          Object.assign(p, this.make(false));
        }
      } else if (this.mode === "motes") {
        p.tw += p.tws * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -10) p.x = this.w + 10; if (p.x > this.w + 10) p.x = -10;
        if (p.y < -10) p.y = this.h + 10; if (p.y > this.h + 10) p.y = -10;
      } else {
        p.wob += p.wobs * dt;
        p.x += (p.vx + Math.sin(p.wob) * 10 * p.z) * dt;
        p.y += p.vy * dt;
        if (p.y < -20) Object.assign(p, this.make(false));
      }
    }
  }

  render() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = "lighter";
    for (let p of this.parts) {
      let a = p.a;
      if (this.mode === "motes") a = p.a * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(p.tw)));
      const col = (this.mode === "motes" && p.z > .8) ? GO : this.color;
      const r = p.r;
      const grd = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.4);
      grd.addColorStop(0, `rgba(${col},${a})`);
      grd.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = grd;
      c.beginPath(); c.arc(p.x, p.y, r * 3.4, 0, 6.2832); c.fill();
      if (this.mode === "drops") {   // streak
        c.strokeStyle = `rgba(${col},${a * .5})`; c.lineWidth = r * .8;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - r * 5); c.stroke();
      }
    }
    c.globalCompositeOperation = "source-over";
  }

  frame(dt) { if (this.running) { this.step(Math.min(dt, 0.05)); this.render(); } }
  start() { this.running = true; }
  stop() { this.running = false; }
}
