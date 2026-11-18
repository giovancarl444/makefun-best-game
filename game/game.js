/* ============================================================================
   PERIAPSIS — a minimalist orbital slingshot
   Vanilla JS · no dependencies · no network · runs from file://
   ----------------------------------------------------------------------------
   Drag anywhere: a tether runs from the probe to the cursor. Release to burn
   in the opposite direction. Collect every mote, then touch the warp ring.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- constants */
  const W = 1280;
  const H = 720;
  const TAU = Math.PI * 2;
  const FIXED = 1 / 180;
  const MAX_BURNS = 4;
  const MAX_DRAG = 220;
  const MAX_IMPULSE = 300;
  const PROBE_R = 6;
  const TRAIL_MAX = 460;
  const FINAL_DRIFT = 16;
  const MONO = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

  const C = {
    ink: '#e9f5ff',
    soft: '#c2d5f4',
    dim: 'rgba(184, 208, 246, 0.74)',
    faint: 'rgba(156, 184, 236, 0.44)',
    ghost: 'rgba(150, 178, 230, 0.16)',
    cyan: '#86f2ff',
    mint: '#7dffd2',
    gold: '#ffd27a',
    violet: '#bda2ff',
    red: '#ff6d80',
    glass: 'rgba(8, 14, 26, 0.72)'
  };

  /* ------------------------------------------------------------------- helpers */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const hsla = (h, s, l, a) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';
  const mod = (n, m) => ((n % m) + m) % m;

  function formatTime(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return String(m).padStart(2, '0') + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function drawText(str, x, y, opts) {
    opts = opts || {};
    const size = opts.size || 12;
    const color = opts.color || C.ink;
    const align = opts.align || 'left';
    const spacing = opts.spacing || 0;
    const alpha = opts.alpha === undefined ? 1 : opts.alpha;
    const weight = opts.weight || 400;
    const glow = opts.glow || 0;
    const glowColor = opts.glowColor || color;
    ctx.save();
    ctx.font = weight + ' ' + size + 'px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glow;
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /* --------------------------------------------------------------------- canvas */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let dpr = 1;

  function resize() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    const cssW = Math.max(1, Math.floor(W * scale));
    const cssH = Math.max(1, Math.floor(H * scale));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const s = (cssW * dpr) / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  window.addEventListener('resize', resize);

  /* ------------------------------------------------------------------ art assets */
  let backdrop = null;
  let vignette = null;
  let glowCyan, glowGold, glowViolet, glowMint, glowWhite, glowRed;

  function makeGlow(color) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.16, color);
    grd.addColorStop(0.48, color.replace(/[\d.]+\)$/, '0.16)'));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function buildAssets() {
    glowCyan = makeGlow('rgba(120,240,255,0.85)');
    glowGold = makeGlow('rgba(255,205,110,0.9)');
    glowViolet = makeGlow('rgba(175,140,255,0.8)');
    glowMint = makeGlow('rgba(110,255,200,0.85)');
    glowWhite = makeGlow('rgba(225,240,255,0.9)');
    glowRed = makeGlow('rgba(255,95,120,0.85)');

    backdrop = document.createElement('canvas');
    backdrop.width = W;
    backdrop.height = H;
    const b = backdrop.getContext('2d');
    b.fillStyle = '#04050a';
    b.fillRect(0, 0, W, H);

    const blobs = [
      { x: 210, y: 140, r: 460, c: '84,74,190', a: 0.15 },
      { x: 1010, y: 590, r: 560, c: '22,92,150', a: 0.13 },
      { x: 760, y: 120, r: 330, c: '150,58,150', a: 0.055 },
      { x: 420, y: 640, r: 420, c: '40,80,150', a: 0.07 }
    ];
    for (const blob of blobs) {
      const g = b.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
      g.addColorStop(0, 'rgba(' + blob.c + ',' + blob.a + ')');
      g.addColorStop(0.55, 'rgba(' + blob.c + ',' + blob.a * 0.35 + ')');
      g.addColorStop(1, 'rgba(' + blob.c + ',0)');
      b.fillStyle = g;
      b.fillRect(0, 0, W, H);
    }

    // a very faint galactic band
    b.save();
    b.translate(W * 0.5, H * 0.44);
    b.rotate(-0.38);
    const band = b.createLinearGradient(0, -110, 0, 110);
    band.addColorStop(0, 'rgba(120,150,220,0)');
    band.addColorStop(0.5, 'rgba(120,150,220,0.035)');
    band.addColorStop(1, 'rgba(120,150,220,0)');
    b.fillStyle = band;
    b.fillRect(-W, -110, W * 2, 220);
    b.restore();

    // film grain (subtle, procedural)
    const grain = document.createElement('canvas');
    grain.width = 256;
    grain.height = 256;
    const gg = grain.getContext('2d');
    const img = gg.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 10;
    }
    gg.putImageData(img, 0, 0);
    b.globalAlpha = 0.5;
    b.fillStyle = b.createPattern(grain, 'repeat');
    b.fillRect(0, 0, W, H);
    b.globalAlpha = 1;

    vignette = document.createElement('canvas');
    vignette.width = W;
    vignette.height = H;
    const v = vignette.getContext('2d');
    const vg = v.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.86);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(0,0,0,0.12)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    v.fillStyle = vg;
    v.fillRect(0, 0, W, H);

    // bake the vignette into the backdrop: one full-screen blit per frame
    b.drawImage(vignette, 0, 0, W, H);
  }

  /* ------------------------------------------------------------------- starfield */
  const starLayers = [];

  function buildStars() {
    starLayers.length = 0;
    const defs = [
      { n: 150, depth: 0.12, min: 0.5, max: 1.2, a: 0.46 },
      { n: 96, depth: 0.3, min: 0.7, max: 1.7, a: 0.68 },
      { n: 50, depth: 0.62, min: 1.0, max: 2.4, a: 0.95 }
    ];
    for (const d of defs) {
      const stars = [];
      for (let i = 0; i < d.n; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          s: rand(d.min, d.max),
          a: rand(d.a * 0.3, d.a),
          p: Math.random() * TAU,
          tw: rand(0.35, 1.5),
          warm: Math.random() < 0.16,
          hero: Math.random() < 0.035
        });
      }
      starLayers.push({ depth: d.depth, stars: stars });
    }
  }

  function drawStars(t, px, py) {
    for (let li = 0; li < starLayers.length; li++) {
      const layer = starLayers[li];
      const ox = -px * layer.depth * 0.16;
      const oy = -py * layer.depth * 0.16;
      for (let i = 0; i < layer.stars.length; i++) {
        const st = layer.stars[i];
        const x = mod(st.x + ox, W + 30) - 15;
        const y = mod(st.y + oy, H + 30) - 15;
        const tw = 0.68 + 0.32 * Math.sin(t * st.tw + st.p);
        ctx.globalAlpha = st.a * tw;
        ctx.fillStyle = st.warm ? '#ffe0bd' : '#d6e6ff';
        if (st.s > 1.55) {
          ctx.beginPath();
          ctx.arc(x, y, st.s * 0.62, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, st.s, st.s);
        }
        if (st.hero) {
          ctx.globalAlpha = st.a * tw * 0.5;
          ctx.strokeStyle = st.warm ? '#ffd9ae' : '#cfe6ff';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(x - 5, y);
          ctx.lineTo(x + 5, y);
          ctx.moveTo(x, y - 5);
          ctx.lineTo(x, y + 5);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------------------- levels */
  const LEVELS = [
    {
      name: 'FIRST LIGHT',
      hint: 'DRAG ANYWHERE · RELEASE TO BURN',
      planets: [{ x: 640, y: 380, r: 46, mu: 6.5e6, hue: 196, ring: true, tilt: -0.32 }],
      start: { x: 380, y: 380, vx: 0, vy: 152 },
      motes: [[553, 613], [838, 500], [781, 190], [345, 455]],
      ring: { x: 360, y: 520, r: 44 }
    },
    {
      name: 'SLINGSHOT',
      hint: 'PROGRADE BURNS RAISE THE FAR SIDE',
      planets: [
        { x: 390, y: 360, r: 38, mu: 3.2e6, hue: 206, ring: false, tilt: 0 },
        { x: 890, y: 360, r: 26, mu: 1.3e6, hue: 326, ring: true, tilt: -0.5 }
      ],
      start: { x: 390, y: 550, vx: -127, vy: 0 },
      motes: [[216, 390], [348, 142], [620, 110], [885, 210]],
      ring: { x: 938, y: 486, r: 44 }
    },
    {
      name: 'COUNTER ORBIT',
      hint: 'THREAD THE GAP · MIND THE SECOND WELL',
      planets: [
        { x: 890, y: 360, r: 38, mu: 3.2e6, hue: 26, ring: true, tilt: 0.42 },
        { x: 390, y: 360, r: 26, mu: 1.3e6, hue: 194, ring: false, tilt: 0 }
      ],
      start: { x: 890, y: 550, vx: 127, vy: 0 },
      motes: [[1064, 390], [932, 142], [660, 110], [560, 89], [395, 210]],
      ring: { x: 320, y: 300, r: 34 }
    }
  ];

  /* ----------------------------------------------------------------------- audio */
  const sfx = {
    ctx: null,
    master: null,
    muted: false,
    noiseBuffer: null,

    unlock: function () {
      if (this.muted) return;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.2;
          this.master.connect(this.ctx.destination);
          const len = Math.floor(this.ctx.sampleRate * 0.6);
          this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const data = this.noiseBuffer.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (err) {
        /* audio is a bonus, never a blocker */
      }
    },

    tone: function (freq, dur, type, vol, when, slideTo) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + (when || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.03);
    },

    noise: function (dur, vol, when, freq, q) {
      if (!this.ctx || this.muted || !this.noiseBuffer) return;
      const t = this.ctx.currentTime + (when || 0);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq || 700;
      filter.Q.value = q || 0.8;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.02);
    },

    launch: function (power) {
      this.tone(180 + power * 90, 0.24, 'triangle', 0.22, 0, 48);
      this.noise(0.18, 0.12 + power * 0.1, 0, 900 + power * 700, 0.7);
      this.tone(520 + power * 180, 0.08, 'sine', 0.05, 0, 880);
    },
    mote: function (index) {
      const base = 740 + index * 55;
      this.tone(base, 0.1, 'sine', 0.18, 0);
      this.tone(base * 1.5, 0.16, 'triangle', 0.1, 0.05);
    },
    ring: function () {
      this.tone(392, 0.2, 'sine', 0.13, 0);
      this.tone(587.3, 0.24, 'sine', 0.1, 0.08);
      this.tone(784, 0.4, 'triangle', 0.08, 0.16);
    },
    win: function () {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i++) {
        this.tone(notes[i], 0.7, 'triangle', 0.12, i * 0.09);
        this.tone(notes[i] * 2, 0.5, 'sine', 0.035, i * 0.09 + 0.02);
      }
      this.tone(130.8, 1.2, 'sine', 0.06, 0.1);
    },
    fail: function () {
      this.tone(196, 0.55, 'sawtooth', 0.09, 0, 52);
      this.tone(98, 0.7, 'sine', 0.12, 0, 40);
      this.noise(0.4, 0.07, 0, 300, 0.5);
    },
    start: function () {
      this.tone(392, 0.12, 'sine', 0.07, 0);
      this.tone(587.3, 0.18, 'sine', 0.05, 0.08);
    },
    toggle: function () {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.2;
      if (!this.muted) this.unlock();
      G.flash = this.muted ? 'AUDIO MUTED' : 'AUDIO ON';
      G.flashT = 1.4;
    }
  };

  /* ------------------------------------------------------------------- game state */
  const G = {
    state: 'title',
    levelIndex: 0,
    level: null,
    probe: null,
    motes: [],
    ring: null,
    collected: 0,
    burnsUsed: 0,
    levelTime: 0,
    worldTime: 0,
    splits: [],
    totalTime: 0,
    intro: 0,
    clear: 0,
    flash: '',
    flashT: 0,
    drainAt: -1,
    failReason: '',
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    aiming: false,
    aimX: 0,
    aimY: 0,
    pointerId: null,
    timeScale: 1,
    timeAcc: 0,
    trailAcc: 0
  };

  let trail = [];
  let sparks = [];
  let waves = [];

  function burnsLeft() {
    return MAX_BURNS - G.burnsUsed;
  }

  function aimCharge() {
    if (!G.probe) return 0;
    const d = Math.hypot(G.probe.x - G.aimX, G.probe.y - G.aimY);
    return clamp((d - 9) / MAX_DRAG, 0, 1);
  }

  /* --------------------------------------------------------------- level control */
  function loadLevel(index) {
    const def = LEVELS[index];
    G.levelIndex = index;
    G.level = {
      name: def.name,
      hint: def.hint,
      planets: def.planets.map(function (p) {
        return Object.assign({}, p);
      })
    };
    G.probe = {
      x: def.start.x,
      y: def.start.y,
      vx: def.start.vx,
      vy: def.start.vy,
      angle: Math.atan2(def.start.vy, def.start.vx),
      thrust: 0,
      dead: false
    };
    G.motes = def.motes.map(function (m, i) {
      return { x: m[0], y: m[1], r: 13, phase: rand(0, TAU), collected: false, index: i };
    });
    G.ring = { x: def.ring.x, y: def.ring.y, r: def.ring.r, active: false, spin: rand(0, TAU), pulse: 0 };
    G.collected = 0;
    G.burnsUsed = 0;
    G.levelTime = 0;
    G.intro = 2.8;
    G.clear = 0;
    G.flash = '';
    G.flashT = 0;
    G.drainAt = -1;
    G.failReason = '';
    G.aiming = false;
    G.pointerId = null;
    G.timeScale = 1;
    G.timeAcc = 0;
    G.trailAcc = 0;
    G.state = 'playing';
    G.shake = 2;
    trail = [];
    sparks = [];
    waves = [];
    canvas.style.cursor = 'crosshair';
    sfx.start();
  }

  function startRun() {
    G.splits = [];
    G.totalTime = 0;
    loadLevel(0);
  }

  function completeLevel() {
    if (G.state !== 'playing') return;
    G.state = 'clear';
    G.clear = 0;
    G.aiming = false;
    G.shake = 10;
    G.flash = 'WARP RING ENGAGED';
    G.flashT = 2;
    G.ring.pulse = 1;
    G.splits.push(G.levelTime);
    G.totalTime = G.splits.reduce(function (a, b) { return a + b; }, 0);
    spawnBurst(G.ring.x, G.ring.y, 56, 'mint', 240, 1.4);
    spawnWave(G.ring.x, G.ring.y, C.mint, 90, 1.2);
    spawnWave(G.ring.x, G.ring.y, C.cyan, 40, 1.0);
    sfx.win();
    canvas.style.cursor = 'pointer';
  }

  function fail(reason) {
    if (G.state !== 'playing') return;
    G.state = 'fail';
    G.failReason = reason;
    G.aiming = false;
    G.shake = 16;
    G.flash = '';
    G.flashT = 0;
    if (G.probe) spawnBurst(G.probe.x, G.probe.y, 46, 'red', 300, 1.1);
    spawnWave(G.probe.x, G.probe.y, C.red, 60, 0.9);
    sfx.fail();
    canvas.style.cursor = 'pointer';
  }

  function retryLevel() {
    loadLevel(G.levelIndex);
  }

  function winRun() {
    G.state = 'win';
    G.aiming = false;
    canvas.style.cursor = 'pointer';
  }

  /* --------------------------------------------------------------------- input */
  function pointerWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H
    };
  }

  function beginAim(e) {
    if (!G.probe || G.probe.dead) return;
    if (burnsLeft() <= 0) {
      G.flash = 'NO BURNS REMAINING';
      G.flashT = 1.4;
      return;
    }
    const p = pointerWorld(e);
    G.aiming = true;
    G.aimX = p.x;
    G.aimY = p.y;
    G.pointerId = e.pointerId;
    try {
      if (canvas.setPointerCapture && e.pointerId !== undefined) canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function cancelAim() {
    G.aiming = false;
    G.pointerId = null;
  }

  function releaseAim() {
    if (!G.aiming) return;
    const p = G.probe;
    if (!p || p.dead) {
      G.aiming = false;
      return;
    }
    const dx = p.x - G.aimX;
    const dy = p.y - G.aimY;
    const dist = Math.hypot(dx, dy);
    const charge = clamp((dist - 9) / MAX_DRAG, 0, 1);
    G.aiming = false;
    G.pointerId = null;
    if (charge < 0.04 || dist < 10) return;

    const mag = charge * MAX_IMPULSE;
    p.vx += (dx / dist) * mag;
    p.vy += (dy / dist) * mag;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 620) {
      p.vx *= 620 / speed;
      p.vy *= 620 / speed;
    }
    p.thrust = 1;
    G.burnsUsed++;
    if (G.burnsUsed >= MAX_BURNS) G.drainAt = G.levelTime;
    G.shake = Math.max(G.shake, 4 + charge * 8);
    G.trailAcc = 0;
    spawnBurst(p.x, p.y, 10 + Math.round(charge * 18), 'cyan', 60 + charge * 170, 0.55);
    sfx.launch(charge);
  }

  window.addEventListener('pointerdown', function (e) {
    sfx.unlock();
    if (e.button !== undefined && e.button !== 0) return;
    if (G.state === 'title') {
      startRun();
      e.preventDefault();
      return;
    }
    if (G.state === 'fail') {
      retryLevel();
      e.preventDefault();
      return;
    }
    if (G.state === 'win') {
      startRun();
      e.preventDefault();
      return;
    }
    if (G.state === 'clear') return;
    if (G.state === 'playing') {
      beginAim(e);
      e.preventDefault();
    }
  });

  window.addEventListener('pointermove', function (e) {
    const p = pointerWorld(e);
    if (G.aiming) {
      G.aimX = p.x;
      G.aimY = p.y;
    }
  });

  window.addEventListener('pointerup', function (e) {
    if (G.aiming && (G.pointerId === null || G.pointerId === e.pointerId)) releaseAim();
  });

  window.addEventListener('pointercancel', function () {
    if (G.aiming) cancelAim();
  });

  window.addEventListener('blur', function () {
    if (G.aiming) cancelAim();
  });

  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (k === ' ' || k === 'Enter') {
      if (G.state === 'title') {
        sfx.unlock();
        startRun();
        e.preventDefault();
      } else if (G.state === 'win') {
        startRun();
        e.preventDefault();
      } else if (G.state === 'fail') {
        retryLevel();
        e.preventDefault();
      }
    } else if (k === 'r' || k === 'R') {
      if (G.state === 'fail') retryLevel();
      else if (G.state === 'win') startRun();
    } else if (k === 'Escape') {
      if (G.aiming) cancelAim();
    } else if (k === 'm' || k === 'M') {
      sfx.unlock();
      sfx.toggle();
    }
  });

  /* -------------------------------------------------------------------- physics */
  function emitTrail(dt) {
    const p = G.probe;
    if (!p || p.dead) return;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed < 6) return;
    G.trailAcc += speed * dt;
    while (G.trailAcc > 3.6) {
      G.trailAcc -= 3.6;
      const inv = 1 / speed;
      const jitter = rand(-1.3, 1.3);
      const nx = -p.vy * inv;
      const ny = p.vx * inv;
      const life = rand(0.9, 1.9);
      trail.push({
        x: p.x - p.vx * inv * 2.2 + nx * jitter,
        y: p.y - p.vy * inv * 2.2 + ny * jitter,
        vx: p.vx * 0.08 + rand(-4, 4),
        vy: p.vy * 0.08 + rand(-4, 4),
        life: life,
        max: life,
        size: rand(4.2, 9.2) * (0.8 + Math.min(speed, 340) / 520),
        spark: Math.random() < 0.16
      });
    }
    if (trail.length > TRAIL_MAX) trail.splice(0, trail.length - TRAIL_MAX);
  }

  function collectMote(m) {
    m.collected = true;
    G.collected++;
    G.shake = Math.max(G.shake, 2.5);
    spawnBurst(m.x, m.y, 16, 'gold', 90, 0.7);
    spawnWave(m.x, m.y, C.gold, 10, 0.6);
    sfx.mote(G.collected);
    if (G.collected >= G.motes.length) {
      G.ring.active = true;
      G.flash = 'WARP RING ONLINE';
      G.flashT = 1.8;
      G.shake = Math.max(G.shake, 4);
      spawnWave(G.ring.x, G.ring.y, C.mint, 30, 1.1);
      sfx.ring();
    }
  }

  function physicsStep(dt) {
    const p = G.probe;
    if (!p || p.dead || G.state !== 'playing') return;
    const pp = G.level.planets;
    let ax = 0;
    let ay = 0;

    for (let i = 0; i < pp.length; i++) {
      const pl = pp[i];
      const dx = pl.x - p.x;
      const dy = pl.y - p.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) || 0.0001;
      if (d < pl.r + PROBE_R) {
        p.dead = true;
        fail('GRAVITY WELL IMPACT');
        return;
      }
      const a = pl.mu / (d2 + 1600);
      ax += (a * dx) / d;
      ay += (a * dy) / d;
    }

    // soft containment field: the sector is not infinite
    const margin = 70;
    const pull = 5.5;
    if (p.x < margin) ax += (margin - p.x) * pull;
    else if (p.x > W - margin) ax -= (p.x - (W - margin)) * pull;
    if (p.y < margin) ay += (margin - p.y) * pull;
    else if (p.y > H - margin) ay -= (p.y - (H - margin)) * pull;

    p.vx += ax * dt;
    p.vy += ay * dt;

    if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
      const damp = Math.exp(-1.4 * dt);
      p.vx *= damp;
      p.vy *= damp;
    }

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 620) {
      p.vx *= 620 / speed;
      p.vy *= 620 / speed;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle = Math.atan2(p.vy, p.vx);
    if (p.thrust > 0) p.thrust = Math.max(0, p.thrust - dt * 2.4);

    emitTrail(dt);

    for (let i = 0; i < G.motes.length; i++) {
      const m = G.motes[i];
      if (m.collected) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) < m.r + PROBE_R + 22) collectMote(m);
    }

    if (G.ring.active) {
      const rd = Math.hypot(G.ring.x - p.x, G.ring.y - p.y);
      if (rd < G.ring.r + 20) completeLevel();
    }
  }

  /* ------------------------------------------------------------------- particles */
  function spawnBurst(x, y, count, color, speed, life) {
    let sprite = 'cyan';
    if (color === 'gold') sprite = 'gold';
    else if (color === 'mint') sprite = 'mint';
    else if (color === 'red') sprite = 'red';
    else if (color === 'violet') sprite = 'violet';
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const v = rand(0.18, 1) * speed;
      sparks.push({
        x: x,
        y: y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(life * 0.45, life),
        max: life,
        size: rand(2.5, 7),
        sprite: sprite
      });
    }
  }

  function spawnWave(x, y, color, radius, life) {
    waves.push({ x: x, y: y, r: 6, maxR: radius, life: life, max: life, color: color });
  }

  function updateParticles(dt) {
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      p.life -= dt;
      if (p.life <= 0) {
        trail.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.7 * dt);
      p.vy *= Math.exp(-1.7 * dt);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.exp(-1.1 * dt);
      s.vy *= Math.exp(-1.1 * dt);
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= dt;
      if (w.life <= 0) {
        waves.splice(i, 1);
        continue;
      }
      const k = 1 - w.life / w.max;
      w.r = 6 + (w.maxR - 6) * (1 - Math.pow(1 - k, 2));
    }
  }

  /* ----------------------------------------------------------------------- update */
  function update(raw) {
    G.worldTime += raw;

    if (G.state === 'playing') {
      G.levelTime += raw;
      if (G.intro > 0) G.intro -= raw;

      const targetScale = G.aiming ? 0.22 : 1;
      G.timeScale += (targetScale - G.timeScale) * Math.min(1, raw * 12);
      G.timeAcc += raw * G.timeScale;
      let guard = 0;
      while (G.timeAcc >= FIXED && guard < 30) {
        physicsStep(FIXED);
        G.timeAcc -= FIXED;
        guard++;
        if (G.state !== 'playing') break;
      }

      if (G.state === 'playing' && G.burnsUsed >= MAX_BURNS && G.drainAt >= 0) {
        if (G.levelTime - G.drainAt > FINAL_DRIFT) fail('BURNS EXHAUSTED');
      }
    } else {
      G.timeScale += (1 - G.timeScale) * Math.min(1, raw * 8);
    }

    const pdt = G.state === 'playing' ? raw * G.timeScale : raw;
    updateParticles(pdt);

    if (G.flashT > 0) G.flashT = Math.max(0, G.flashT - raw);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - raw * 26);
    G.shakeX = G.shake > 0.1 ? rand(-1, 1) * G.shake : 0;
    G.shakeY = G.shake > 0.1 ? rand(-1, 1) * G.shake : 0;

    if (G.ring) {
      G.ring.spin += raw * (G.ring.active ? 0.9 : 0.25);
      G.ring.pulse = Math.max(0, G.ring.pulse - raw * 1.5);
    }

    if (G.state === 'clear') {
      G.clear += raw;
      if (G.clear > 2.0) {
        if (G.levelIndex >= LEVELS.length - 1) winRun();
        else loadLevel(G.levelIndex + 1);
      }
    }
  }

  /* --------------------------------------------------------------------- drawing */
  function drawBackdrop() {
    if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);
    else {
      ctx.fillStyle = '#04050a';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawPlanetRing(pl, front) {
    const rx = pl.r * 2.12;
    const ry = pl.r * 0.58;
    const tilt = pl.tilt || 0;
    ctx.save();
    ctx.translate(pl.x, pl.y);
    ctx.rotate(tilt);

    const a = front ? 0.55 : 0.24;
    ctx.lineCap = 'butt';

    ctx.beginPath();
    if (front) ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
    else ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.strokeStyle = hsla(pl.hue, 55, 72, a * 0.55);
    ctx.lineWidth = 5.5;
    ctx.stroke();

    ctx.beginPath();
    if (front) ctx.ellipse(0, 0, rx * 0.9, ry * 0.9, 0, 0, Math.PI);
    else ctx.ellipse(0, 0, rx * 0.9, ry * 0.9, 0, 0, TAU);
    ctx.strokeStyle = hsla(pl.hue, 40, 85, a * 0.32);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    if (front) ctx.ellipse(0, 0, rx * 1.2, ry * 1.2, 0, 0, Math.PI);
    else ctx.ellipse(0, 0, rx * 1.2, ry * 1.2, 0, 0, TAU);
    ctx.strokeStyle = hsla(pl.hue, 50, 65, a * 0.22);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  function drawPlanet(pl) {
    const hue = pl.hue;

    const aura = ctx.createRadialGradient(pl.x, pl.y, pl.r * 0.75, pl.x, pl.y, pl.r * 3.6);
    aura.addColorStop(0, hsla(hue, 85, 62, 0.16));
    aura.addColorStop(0.35, hsla(hue, 85, 62, 0.05));
    aura.addColorStop(1, hsla(hue, 85, 62, 0));
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, pl.r * 3.6, 0, TAU);
    ctx.fill();

    if (pl.ring) drawPlanetRing(pl, false);

    const body = ctx.createRadialGradient(
      pl.x - pl.r * 0.42,
      pl.y - pl.r * 0.48,
      pl.r * 0.05,
      pl.x,
      pl.y,
      pl.r * 1.08
    );
    body.addColorStop(0, hsla(hue, 58, 74, 1));
    body.addColorStop(0.32, hsla(hue, 52, 44, 1));
    body.addColorStop(0.72, hsla(hue, 55, 18, 1));
    body.addColorStop(1, hsla(hue, 60, 5, 1));
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, pl.r, 0, TAU);
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, pl.r, 0, TAU);
    ctx.clip();

    // faint cloud bands
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const yy = pl.r * (-0.55 + i * 0.34);
      ctx.ellipse(pl.x, pl.y + yy, pl.r * 0.98, pl.r * (0.09 + i * 0.015), pl.tilt || 0, 0, TAU);
      ctx.strokeStyle = hsla(hue, 60, 80, 0.055);
      ctx.lineWidth = 1 + i * 0.4;
      ctx.stroke();
    }

    // night side
    const shade = ctx.createRadialGradient(
      pl.x + pl.r * 0.75,
      pl.y + pl.r * 0.8,
      pl.r * 0.05,
      pl.x + pl.r * 0.4,
      pl.y + pl.r * 0.4,
      pl.r * 1.55
    );
    shade.addColorStop(0, 'rgba(1,3,8,0.62)');
    shade.addColorStop(0.55, 'rgba(1,3,8,0.22)');
    shade.addColorStop(1, 'rgba(1,3,8,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(pl.x - pl.r, pl.y - pl.r, pl.r * 2, pl.r * 2);
    ctx.restore();

    // lit rim
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, pl.r - 0.6, 0, TAU);
    ctx.strokeStyle = hsla(hue, 90, 78, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();

    // atmosphere line
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, pl.r + 1.5, 0, TAU);
    ctx.strokeStyle = hsla(hue, 90, 70, 0.14);
    ctx.lineWidth = 3;
    ctx.stroke();

    if (pl.ring) drawPlanetRing(pl, true);
  }

  function drawMote(m) {
    if (m.collected) return;
    const bob = Math.sin(G.worldTime * 1.7 + m.phase) * 3.5;
    const x = m.x;
    const y = m.y + bob;
    const pulse = 1 + Math.sin(G.worldTime * 2.6 + m.phase) * 0.14;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7;
    const gs = 52 * pulse;
    ctx.drawImage(glowGold, x - gs, y - gs, gs * 2, gs * 2);
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 21 * pulse, m.phase, m.phase + Math.PI * 1.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 27 * pulse, m.phase + 2.1, m.phase + 2.1 + Math.PI * 0.75);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.shadowColor = C.gold;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff4d6';
    ctx.beginPath();
    ctx.arc(x, y, 5.2, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x - 1.2, y - 1.4, 1.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawWarpRing() {
    const r = G.ring;
    if (!r) return;
    const active = r.active;
    const color = active ? C.mint : 'rgba(148,172,226,0.82)';
    const pulse = 1 + Math.sin(G.worldTime * (active ? 3.2 : 1.2)) * (active ? 0.035 : 0.012);

    ctx.save();
    ctx.translate(r.x, r.y);

    if (!active) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.14;
      const gs = r.r * 3.4 * pulse;
      ctx.drawImage(glowViolet, -gs, -gs, gs * 2, gs * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (active) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.42;
      const gs = r.r * 4.4 * pulse;
      ctx.drawImage(glowMint, -gs, -gs, gs * 2, gs * 2);
      ctx.globalAlpha = 1;
      const portal = ctx.createRadialGradient(0, 0, 0, 0, 0, r.r * 1.1);
      portal.addColorStop(0, 'rgba(125,255,210,0.13)');
      portal.addColorStop(0.65, 'rgba(125,255,210,0.035)');
      portal.addColorStop(1, 'rgba(125,255,210,0)');
      ctx.fillStyle = portal;
      ctx.beginPath();
      ctx.arc(0, 0, r.r * 1.1, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.rotate(r.spin);
    ctx.lineCap = 'round';
    ctx.shadowColor = active ? C.mint : 'rgba(140,170,230,0.55)';
    ctx.shadowBlur = active ? 22 : 10;

    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, r.r * pulse, a0, a0 + 0.62);
      ctx.strokeStyle = color;
      ctx.globalAlpha = active ? 0.9 : 0.7;
      ctx.lineWidth = active ? 2.6 : 1.8;
      ctx.stroke();
    }

    ctx.rotate(-r.spin * 2.2);
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * TAU + G.worldTime * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, r.r * 0.7, a0, a0 + 1.2);
      ctx.strokeStyle = active ? 'rgba(210,255,240,0.75)' : 'rgba(160,185,235,0.48)';
      ctx.globalAlpha = 1;
      ctx.lineWidth = active ? 1.3 : 1.1;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (active) {
      ctx.rotate(r.spin * 0.6);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + G.worldTime * 0.7;
        const rr = r.r * (0.2 + (i % 5) * 0.13);
        ctx.fillStyle = i % 2 ? 'rgba(180,255,235,0.55)' : 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1 + (i % 3) * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // center marker
    ctx.strokeStyle = active ? 'rgba(220,255,245,0.8)' : 'rgba(170,195,240,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.stroke();

    ctx.restore();

    drawText('WARP', r.x, r.y + r.r + 30, {
      size: 11,
      align: 'center',
      spacing: 4,
      color: active ? C.mint : 'rgba(174,198,242,0.7)',
      alpha: active ? 0.95 : 0.7,
      glow: active ? 8 : 0
    });
  }

  function drawProbe() {
    const p = G.probe;
    if (!p || p.dead) return;
    const sp = Math.hypot(p.vx, p.vy);
    const ang = sp > 8 ? Math.atan2(p.vy, p.vx) : p.angle;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.62;
    ctx.drawImage(glowCyan, p.x - 44, p.y - 44, 88, 88);
    ctx.restore();

    // locator brackets keep the small probe readable against bright motes
    if (!G.aiming) {
      ctx.save();
      ctx.strokeStyle = 'rgba(134,242,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, -2.5, -0.95);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, 0.65, 2.2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);

    if (p.thrust > 0.02) {
      const th = p.thrust;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flame = ctx.createLinearGradient(-4, 0, -36 - th * 26, 0);
      flame.addColorStop(0, 'rgba(200,255,255,0.85)');
      flame.addColorStop(0.35, 'rgba(110,225,255,0.4)');
      flame.addColorStop(1, 'rgba(90,130,255,0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-25 - th * 22, -5 - th * 3);
      ctx.lineTo(-20 - th * 16, 0);
      ctx.lineTo(-25 - th * 22, 5 + th * 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#f2fcff';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-3.6, 0);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(120,240,255,0.9)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#0b1a26';
    ctx.beginPath();
    ctx.arc(1.5, 0, 1.7, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(160,250,255,0.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-2, -3.6);
    ctx.lineTo(5, -0.8);
    ctx.stroke();

    ctx.restore();
  }

  function drawTrail() {
    if (!trail.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // a faint filament keeps the exhaust reading as one body, not a dotted line
    ctx.lineWidth = 1;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i];
      const b = trail[i - 1];
      const age = a.life / a.max;
      if (age < 0.45) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy > 900) continue;
      ctx.strokeStyle = 'rgba(120,235,255,' + (age * 0.1).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
    }

    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const age = clamp(p.life / p.max, 0, 1);
      const t = 1 - age;
      let sprite = glowCyan;
      if (t > 0.62) sprite = glowViolet;
      else if (t < 0.22) sprite = glowWhite;
      const s = p.size * (0.5 + age * 0.8) * (p.spark ? 0.8 : 1);
      ctx.globalAlpha = age * age * (p.spark ? 0.85 : 0.62);
      ctx.drawImage(sprite, p.x - s, p.y - s, s * 2, s * 2);
      if (t < 0.28) {
        ctx.globalAlpha = (0.28 - t) * 1.8;
        const cs = s * 0.5;
        ctx.drawImage(glowWhite, p.x - cs, p.y - cs, cs * 2, cs * 2);
      }
    }
    ctx.restore();
  }

  function drawSparks() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      const a = Math.max(0, s.life / s.max);
      const size = s.size * (0.5 + a * 0.8);
      let sprite = glowCyan;
      if (s.sprite === 'gold') sprite = glowGold;
      else if (s.sprite === 'mint') sprite = glowMint;
      else if (s.sprite === 'red') sprite = glowRed;
      else if (s.sprite === 'violet') sprite = glowViolet;
      ctx.globalAlpha = a * 0.8;
      ctx.drawImage(sprite, s.x - size, s.y - size, size * 2, size * 2);
    }
    ctx.restore();
  }

  function drawWaves() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      const a = Math.max(0, w.life / w.max);
      ctx.globalAlpha = a * 0.55;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 1 + a * 1.6;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPrediction() {
    const charge = aimCharge();
    if (!G.aiming || charge < 0.035 || !G.probe || G.probe.dead) return;
    const p = G.probe;
    const dx = p.x - G.aimX;
    const dy = p.y - G.aimY;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const mag = charge * MAX_IMPULSE;
    let x = p.x;
    let y = p.y;
    let vx = p.vx + (dx / d) * mag;
    let vy = p.vy + (dy / d) * mag;
    const sim = 1 / 75;
    const pts = [];
    let hit = false;

    for (let step = 0; step < 165; step++) {
      let ax = 0;
      let ay = 0;
      for (let i = 0; i < G.level.planets.length; i++) {
        const pl = G.level.planets[i];
        const ddx = pl.x - x;
        const ddy = pl.y - y;
        const dd2 = ddx * ddx + ddy * ddy;
        const dd = Math.sqrt(dd2) || 0.0001;
        const a = pl.mu / (dd2 + 1600);
        ax += (a * ddx) / dd;
        ay += (a * ddy) / dd;
      }

      // the sector's soft containment field is part of the real flight model
      const margin = 70;
      const pull = 5.5;
      if (x < margin) ax += (margin - x) * pull;
      else if (x > W - margin) ax -= (x - (W - margin)) * pull;
      if (y < margin) ay += (margin - y) * pull;
      else if (y > H - margin) ay -= (y - (H - margin)) * pull;

      vx += ax * sim;
      vy += ay * sim;
      const sp = Math.hypot(vx, vy);
      if (sp > 620) {
        vx *= 620 / sp;
        vy *= 620 / sp;
      }
      x += vx * sim;
      y += vy * sim;
      if (step % 2 === 0) pts.push({ x: x, y: y });

      for (let i = 0; i < G.level.planets.length; i++) {
        const pl = G.level.planets[i];
        if (Math.hypot(pl.x - x, pl.y - y) < pl.r + PROBE_R) {
          hit = true;
          break;
        }
      }
      if (hit) break;
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) break;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(134,242,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 5]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 3; i < pts.length; i += 5) {
      const a = 0.4 * (1 - i / pts.length);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = hit && i === pts.length - 1 ? C.red : C.cyan;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (hit && pts.length) {
      const last = pts[pts.length - 1];
      ctx.strokeStyle = 'rgba(255,109,128,0.6)';
      ctx.beginPath();
      ctx.arc(last.x, last.y, 5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAim() {
    if (!G.aiming || !G.probe || G.probe.dead) return;
    const p = G.probe;
    const charge = aimCharge();
    const dx = G.aimX - p.x;
    const dy = G.aimY - p.y;
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const launch = Math.atan2(-dy, -dx);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // tether
    ctx.strokeStyle = 'rgba(134,242,255,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]);
    ctx.lineDashOffset = -G.worldTime * 26;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(G.aimX, G.aimY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (charge > 0.02) {
      const len = 34 + charge * 58;
      const tipX = p.x + Math.cos(launch) * len;
      const tipY = p.y + Math.sin(launch) * len;
      ctx.strokeStyle = 'rgba(134,242,255,' + (0.4 + charge * 0.5) + ')';
      ctx.lineWidth = 1.4;
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - Math.cos(launch - 0.4) * 9, tipY - Math.sin(launch - 0.4) * 9);
      ctx.lineTo(tipX - Math.cos(launch + 0.4) * 9, tipY - Math.sin(launch + 0.4) * 9);
      ctx.closePath();
      ctx.fillStyle = 'rgba(180,250,255,0.85)';
      ctx.fill();
      ctx.shadowBlur = 0;

      // charge ring around probe
      ctx.strokeStyle = 'rgba(134,242,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(134,242,255,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, TAU);
      ctx.stroke();
    }

    // cursor reticle
    const rx = Math.cos(ang);
    const ry = Math.sin(ang);
    ctx.strokeStyle = 'rgba(134,242,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(G.aimX, G.aimY, 6, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(G.aimX - rx * 13, G.aimY - ry * 13);
    ctx.lineTo(G.aimX - rx * 8, G.aimY - ry * 8);
    ctx.moveTo(G.aimX + rx * 8, G.aimY + ry * 8);
    ctx.lineTo(G.aimX + rx * 13, G.aimY + ry * 13);
    ctx.stroke();

    ctx.restore();

    // impulse readout
    const barW = 210;
    const barX = W / 2 - barW / 2;
    const barY = H - 62;
    ctx.save();
    ctx.fillStyle = 'rgba(6,12,22,0.6)';
    ctx.fillRect(barX - 10, barY - 22, barW + 20, 38);
    drawText('IMPULSE', barX, barY - 8, { size: 9, spacing: 3, color: C.dim });
    drawText(String(Math.round(charge * 100)).padStart(2, '0') + '%', barX + barW, barY - 8, {
      size: 9,
      spacing: 1,
      color: C.cyan,
      align: 'right'
    });
    ctx.fillStyle = 'rgba(134,242,255,0.14)';
    ctx.fillRect(barX, barY, barW, 2);
    ctx.fillStyle = C.cyan;
    ctx.fillRect(barX, barY, barW * charge, 2);
    ctx.restore();
    drawPrediction();
  }

  /* ----------------------------------------------------------------------- HUD */
  function drawCorners() {
    const m = 22;
    const l = 16;
    ctx.save();
    ctx.strokeStyle = 'rgba(150,185,240,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(m, m + l);
    ctx.lineTo(m, m);
    ctx.lineTo(m + l, m);
    ctx.moveTo(W - m - l, m);
    ctx.lineTo(W - m, m);
    ctx.lineTo(W - m, m + l);
    ctx.moveTo(m, H - m - l);
    ctx.lineTo(m, H - m);
    ctx.lineTo(m + l, H - m);
    ctx.moveTo(W - m - l, H - m);
    ctx.lineTo(W - m, H - m);
    ctx.lineTo(W - m, H - m - l);
    ctx.stroke();
    ctx.restore();
  }

  function drawHUD() {
    if (G.state === 'title' || !G.level) return;
    drawCorners();

    const x = 44;
    const top = 46;

    drawText('SECTOR', x, top, { size: 11, spacing: 3, color: C.dim });
    drawText(String(G.levelIndex + 1).padStart(2, '0') + ' / ' + String(LEVELS.length).padStart(2, '0'), x, top + 28, {
      size: 26,
      spacing: 5,
      color: C.ink,
      glow: 8,
      glowColor: 'rgba(134,242,255,0.35)'
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(134,242,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top + 40);
    ctx.lineTo(x + 96, top + 40);
    ctx.stroke();
    ctx.restore();
    drawText(G.level.name, x, top + 62, { size: 12, spacing: 4, color: C.dim });

    // motes
    const my = top + 104;
    drawText('MOTES', x, my, { size: 12, spacing: 3, color: C.dim });
    drawText(String(G.collected).padStart(2, '0') + ' / ' + String(G.motes.length).padStart(2, '0'), x + 94, my, {
      size: 12,
      spacing: 2,
      color: C.ink
    });
    for (let i = 0; i < G.motes.length; i++) {
      const cx = x + i * 19;
      const cy = my + 17;
      const on = i < G.collected;
      ctx.save();
      if (on) {
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 10;
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(cx, cy, 3.6, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(160,185,230,0.42)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(cx, cy, 3.2, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // burns
    const by = top + 156;
    drawText('BURNS', x, by, { size: 12, spacing: 3, color: C.dim });
    drawText(String(burnsLeft()).padStart(2, '0') + ' / ' + String(MAX_BURNS).padStart(2, '0'), x + 94, by, { size: 12, spacing: 2, color: C.ink });
    for (let i = 0; i < MAX_BURNS; i++) {
      const bx = x + i * 17;
      const use = i < G.burnsUsed;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bx + 8, by + 18);
      ctx.lineTo(bx + 1, by + 18);
      ctx.lineTo(bx + 5, by + 11);
      ctx.closePath();
      if (use) {
        ctx.strokeStyle = 'rgba(140,165,210,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = G.burnsUsed >= MAX_BURNS - 1 ? C.gold : C.cyan;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 7;
        ctx.fill();
      }
      ctx.restore();
    }

    // time
    drawText('T+ ' + formatTime(G.levelTime), W - 44, top + 12, {
      size: 20,
      spacing: 2,
      color: C.ink,
      align: 'right'
    });
    drawText('MISSION CLOCK', W - 44, top + 34, {
      size: 10,
      spacing: 3,
      color: C.dim,
      align: 'right'
    });

    // final drift countdown
    if (G.burnsUsed >= MAX_BURNS && G.drainAt >= 0 && G.state === 'playing') {
      const left = Math.max(0, FINAL_DRIFT - (G.levelTime - G.drainAt));
      const danger = left < 5;
      drawText('FINAL DRIFT', W - 44, top + 68, {
        size: 9,
        spacing: 3,
        color: danger ? C.red : C.gold,
        align: 'right',
        alpha: danger ? 0.7 + 0.3 * Math.sin(G.worldTime * 10) : 0.8
      });
      drawText(formatTime(left), W - 44, top + 88, {
        size: 18,
        spacing: 2,
        color: danger ? C.red : C.gold,
        align: 'right',
        glow: danger ? 10 : 0
      });
    }

    // hint (stays until the first burn, so the controls are never a mystery)
    if (G.burnsUsed === 0 && G.state === 'playing') {
      const a = clamp(G.levelTime / 0.6, 0, 1) * 0.86;
      drawText(G.level.hint, W / 2, H - 38, {
        size: 11,
        spacing: 3,
        color: C.soft,
        align: 'center',
        alpha: a
      });
    }

    // flash message
    if (G.flashT > 0 && G.flash) {
      const a = Math.min(1, G.flashT * 1.6);
      drawText(G.flash, W / 2, 96, {
        size: 13,
        spacing: 5,
        color: G.flash.indexOf('NO ') === 0 ? C.red : C.mint,
        align: 'center',
        alpha: a,
        glow: 12
      });
    }

    // sector intro banner
    if (G.intro > 0 && G.state === 'playing') {
      const a = Math.min(1, Math.min(G.intro / 0.7, (2.8 - G.intro) / 0.35)) * 0.9;
      if (a > 0) {
        drawText('SECTOR ' + String(G.levelIndex + 1).padStart(2, '0'), W / 2, 128, {
          size: 10,
          spacing: 7,
          color: C.dim,
          align: 'center',
          alpha: a
        });
        drawText(G.level.name, W / 2, 160, {
          size: 21,
          spacing: 9,
          color: C.ink,
          align: 'center',
          alpha: a,
          glow: 10,
          glowColor: 'rgba(134,242,255,0.4)'
        });
        ctx.save();
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = C.cyan;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 90, 176);
        ctx.lineTo(W / 2 + 90, 176);
        ctx.stroke();
        ctx.restore();
      }
    }

    // off-screen probe indicator
    if (G.state === 'playing' && G.probe && !G.probe.dead) {
      const p = G.probe;
      if (p.x < 10 || p.x > W - 10 || p.y < 10 || p.y > H - 10) {
        const cx = clamp(p.x, 26, W - 26);
        const cy = clamp(p.y, 26, H - 26);
        const a = Math.atan2(p.y - H / 2, p.x - W / 2);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(134,242,255,0.7)';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // muted marker
    if (sfx.muted) {
      drawText('MUTED', W - 44, H - 26, {
        size: 8,
        spacing: 3,
        color: C.faint,
        align: 'right'
      });
    }
  }

  /* -------------------------------------------------------------------- titles */
  function drawTitleScene() {
    drawBackdrop();
    drawStars(G.worldTime * 0.35, Math.sin(G.worldTime * 0.1) * 40, 0);

    const t = G.worldTime;
    const planet = { x: 930, y: 760, r: 204, hue: 196, ring: true, tilt: -0.34 };
    const small = { x: 176, y: 146, r: 34, hue: 318, ring: true, tilt: 0.5 };

    // orbit guide
    ctx.save();
    ctx.strokeStyle = 'rgba(134,242,255,0.09)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 9]);
    ctx.beginPath();
    ctx.ellipse(planet.x, planet.y, 420, 246, -0.08, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    drawPlanet(small);
    drawPlanet(planet);

    // drifting motes
    const motes = [
      { x: 604, y: 520 },
      { x: 772, y: 552 },
      { x: 1074, y: 506 }
    ];
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      drawMote({ x: m.x, y: m.y + Math.sin(t * 0.6 + i * 2.1) * 4, r: 13, phase: i * 1.7, collected: false });
    }

    // decorative probe on an ellipse with an analytic trail
    const cx = planet.x;
    const cy = planet.y;
    const rx = 420;
    const ry = 246;
    const baseAng = -0.08;
    const head = t * 0.5 + 2.35;
    for (let i = 26; i >= 0; i--) {
      const a = head - i * 0.035;
      const ex = cx + Math.cos(a) * rx * Math.cos(baseAng) - Math.sin(a) * ry * Math.sin(baseAng);
      const ey = cy + Math.cos(a) * rx * Math.sin(baseAng) + Math.sin(a) * ry * Math.cos(baseAng);
      if (i === 0) continue;
      const alpha = (1 - i / 26) * 0.28;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      ctx.drawImage(glowCyan, ex - 6, ey - 6, 12, 12);
      ctx.restore();
    }
    const px = cx + Math.cos(head) * rx * Math.cos(baseAng) - Math.sin(head) * ry * Math.sin(baseAng);
    const py = cy + Math.cos(head) * rx * Math.sin(baseAng) + Math.sin(head) * ry * Math.cos(baseAng);
    const prevX = cx + Math.cos(head - 0.02) * rx * Math.cos(baseAng) - Math.sin(head - 0.02) * ry * Math.sin(baseAng);
    const prevY = cy + Math.cos(head - 0.02) * rx * Math.sin(baseAng) + Math.sin(head - 0.02) * ry * Math.cos(baseAng);
    const ang = Math.atan2(py - prevY, px - prevX);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#f2fcff';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -5.6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, 5.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32;
    ctx.drawImage(glowCyan, px - 30, py - 30, 60, 60);
    ctx.restore();

    // wordmark
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.1);
    drawText('PERIAPSIS', W / 2, 286, {
      size: 74,
      align: 'center',
      spacing: 18,
      color: '#eef8ff',
      glow: 26,
      glowColor: 'rgba(120,235,255,0.5)'
    });
    ctx.save();
    const grad = ctx.createLinearGradient(W / 2 - 160, 0, W / 2 + 160, 0);
    grad.addColorStop(0, 'rgba(134,242,255,0)');
    grad.addColorStop(0.5, 'rgba(134,242,255,0.55)');
    grad.addColorStop(1, 'rgba(134,242,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(W / 2 - 170, 316, 340, 1);
    ctx.restore();

    drawText('ORBITAL SLINGSHOT', W / 2, 348, {
      size: 13,
      align: 'center',
      spacing: 9,
      color: C.cyan,
      alpha: 0.9
    });

    drawText('CLICK OR PRESS SPACE TO LAUNCH', W / 2, 422, {
      size: 15,
      align: 'center',
      spacing: 4,
      color: C.ink,
      alpha: pulse,
      glow: 8,
      glowColor: 'rgba(134,242,255,0.35)'
    });
    drawText('DRAG ANYWHERE TO AIM · RELEASE TO BURN · 4 BURNS PER SECTOR', W / 2, 450, {
      size: 11,
      align: 'center',
      spacing: 2,
      color: C.soft,
      alpha: 0.9
    });

    drawText('M · MUTE', W - 44, H - 34, {
      size: 10,
      spacing: 3,
      color: C.faint,
      align: 'right'
    });

    drawCorners();
  }

  /* ------------------------------------------------------------------- overlays */
  function drawFailOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(3,6,12,0.74)';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 520);
    g.addColorStop(0, 'rgba(255,60,90,0.08)');
    g.addColorStop(1, 'rgba(255,60,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const cx = W / 2;
    drawText('SIGNAL LOST', cx, 300, {
      size: 46,
      align: 'center',
      spacing: 12,
      color: C.red,
      glow: 24,
      glowColor: 'rgba(255,80,110,0.5)'
    });
    drawText('SECTOR ' + String(G.levelIndex + 1).padStart(2, '0') + ' · ' + G.level.name, cx, 332, {
      size: 9,
      align: 'center',
      spacing: 4,
      color: C.dim
    });
    drawText(G.failReason, cx, 386, {
      size: 13,
      align: 'center',
      spacing: 4,
      color: C.ink,
      alpha: 0.9
    });

    ctx.save();
    ctx.strokeStyle = 'rgba(255,109,128,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 120, 356);
    ctx.lineTo(cx + 120, 356);
    ctx.stroke();
    ctx.restore();

    const pulse = 0.6 + 0.4 * Math.sin(G.worldTime * 3.2);
    drawText('PRESS R OR CLICK TO RETRY', cx, 452, {
      size: 12,
      align: 'center',
      spacing: 5,
      color: C.ink,
      alpha: pulse
    });
    drawText('MOTES ' + G.collected + ' / ' + G.motes.length + ' · BURNS USED ' + G.burnsUsed + ' / ' + MAX_BURNS, cx, 482, {
      size: 9,
      align: 'center',
      spacing: 3,
      color: C.faint
    });
  }

  function drawWinOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(3,8,14,0.68)';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, 320, 40, W / 2, 320, 600);
    g.addColorStop(0, 'rgba(125,255,210,0.09)');
    g.addColorStop(1, 'rgba(125,255,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const cx = W / 2;
    drawText('PERIAPSIS ACHIEVED', cx, 250, {
      size: 13,
      align: 'center',
      spacing: 8,
      color: C.mint,
      glow: 12
    });
    drawText('SIGNAL RECOVERED', cx, 312, {
      size: 52,
      align: 'center',
      spacing: 11,
      color: C.ink,
      glow: 22,
      glowColor: 'rgba(125,255,210,0.45)'
    });

    ctx.save();
    ctx.strokeStyle = 'rgba(125,255,210,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 180, 338);
    ctx.lineTo(cx + 180, 338);
    ctx.stroke();
    ctx.restore();

    drawText('TOTAL TRANSIT ' + formatTime(G.totalTime), cx, 388, {
      size: 11,
      align: 'center',
      spacing: 4,
      color: C.soft
    });

    for (let i = 0; i < LEVELS.length; i++) {
      const y = 426 + i * 22;
      const active = i < G.splits.length;
      drawText('SECTOR ' + String(i + 1).padStart(2, '0') + '  ' + LEVELS[i].name, cx - 150, y, {
        size: 9,
        spacing: 2,
        color: active ? C.dim : C.ghost
      });
      drawText(active ? formatTime(G.splits[i]) : '—', cx + 150, y, {
        size: 9,
        align: 'right',
        spacing: 2,
        color: active ? C.ink : C.ghost
      });
    }

    const pulse = 0.6 + 0.4 * Math.sin(G.worldTime * 3.0);
    drawText('PRESS R OR CLICK TO RUN IT AGAIN', cx, 540, {
      size: 12,
      align: 'center',
      spacing: 5,
      color: C.ink,
      alpha: pulse
    });
  }

  /* --------------------------------------------------------------------- render */
  function drawWorld() {
    const p = G.probe;
    drawStars(G.worldTime, p ? p.x - W / 2 : 0, p ? p.y - H / 2 : 0);

    const planets = G.level ? G.level.planets : [];
    for (let i = 0; i < planets.length; i++) drawPlanet(planets[i]);

    if (!G.level) return;
    drawWarpRing();
    for (let i = 0; i < G.motes.length; i++) drawMote(G.motes[i]);

    drawTrail();
    drawProbe();
    drawSparks();
    drawWaves();
    drawAim();
  }

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);

    if (G.state === 'title') {
      drawTitleScene();
    } else {
      drawBackdrop();
      ctx.save();
      ctx.translate(G.shakeX, G.shakeY);
      drawWorld();
      ctx.restore();
      drawHUD();
      if (G.state === 'fail') drawFailOverlay();
      if (G.state === 'win') drawWinOverlay();
    }

    // final-drift warning vignette
    if (G.state === 'playing' && G.burnsUsed >= MAX_BURNS && G.drainAt >= 0) {
      const left = Math.max(0, FINAL_DRIFT - (G.levelTime - G.drainAt));
      if (left < 5) {
        const a = (1 - left / 5) * 0.16 * (0.6 + 0.4 * Math.sin(G.worldTime * 9));
        const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 760);
        g.addColorStop(0, 'rgba(255,60,90,0)');
        g.addColorStop(1, 'rgba(255,60,90,' + a + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  /* ----------------------------------------------------------------------- loop */
  let lastTime = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    let raw = (now - lastTime) / 1000;
    lastTime = now;
    if (!isFinite(raw) || raw < 0) raw = 0;
    raw = Math.min(raw, 0.05);
    update(raw);
    render();
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------------------- init */
  buildAssets();
  buildStars();
  resize();
  canvas.style.cursor = 'pointer';
  requestAnimationFrame(frame);
})();
