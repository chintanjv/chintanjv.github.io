/* game.js — the nav "?" easter egg: a one-button rooftop runner.
   Lazy-loaded by main.js the first time the "?" is hovered or clicked; nothing here runs on page load. */
(() => {
  'use strict';

  /* ---- TUNING (world units; the view always shows at least 380 x 200) ---- */
  const STEP = 1 / 120;                  // fixed physics step: same feel at 60/120/144Hz
  const G = 2000, G_HOLD = 900;          // gravity, and lighter gravity while jump is held
  const JUMP_V = 380, HOLD_MAX = 0.18;   // take-off speed, max time holding adds height
  const COYOTE = 0.08, BUFFER = 0.1;     // grace windows that make jumps feel fair
  const SPEED_START = 180, SPEED_MAX = 520, SPEED_FLOOR = 144;
  const RECOVER = 70, TRIP = 0.65;       // after a crate: speed x0.65, then win it back at 70/s²
  const FLOOR = 200, TOP_MIN = 90, TOP_MAX = 160, DEATH_Y = FLOOR + 30;
  const VIEW_W = 380, VIEW_H = 200;
  const PX = 2, PW = 7 * PX, PH = 12 * PX;     // sprite pixel size, player box
  const CRATE = 13, UNITS_PER_M = 10;
  const BEST_KEY = 'cv-rooftop-best';

  const SPRITES = {
    runA: ['..###..', '..###..', '..###..', '...#...', '.#####.', '#.###.#', '..###..', '..###..', '..#.#..', '.#...#.', '.#...#.', '#.....#'],
    runB: ['..###..', '..###..', '..###..', '...#...', '..###..', '.#####.', '..###..', '..###..', '...##..', '...#.#.', '..#..#.', '..#....'],
    jump: ['..###..', '..###..', '..###..', '#..#..#', '.#####.', '..###..', '..###..', '..###..', '.#..#..', '#....#.', '.....#.', '.......'],
  };
  const LABELS = ['bug', 'meeting', 'scope creep', 'tech debt', 'merge conflict', 'reply-all', 'flaky test', 'P0'];
  const MILESTONES = [[100, 'MVP'], [250, 'First 10 users'], [500, 'v1.0 shipped'], [1000, 'Product–market fit'],
                      [2000, 'Series A'], [3500, 'Unicorn'], [5000, 'IPO']];
  const QUIPS = {
    fall: ['Fell into the backlog.', 'Scope crept in.', 'Missed the deadline.', 'Shipped to /dev/null.',
           'Needs one more sprint.', 'Rolled back.'],
    wall: ['Hit a wall. Happens to every roadmap.', 'Ran straight into a blocker.'],
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  // Keeps climbing the whole run (fast early, gentler later) up to a hard cap
  const targetSpeed = m => Math.min(SPEED_MAX, SPEED_START + 3.8 * Math.sqrt(Math.max(0, m)));
  const milestone = i => MILESTONES[i] || [5000 + 2500 * (i - MILESTONES.length + 1), 'Still shipping'];

  /* ---- JUMP ARC: a full-hold jump simulated once with the exact game physics.
     The level generator uses it so every gap is always clearable. ---- */
  const ARC = [];
  for (let t = 0, y = 0, vy = -JUMP_V; y < FLOOR; t += STEP) {
    vy += (t < HOLD_MAX && vy < 0 ? G_HOLD : G) * STEP;
    y += vy * STEP;
    ARC.push({ t: t + STEP, y, vy });
  }
  const APEX = -Math.min(...ARC.map(p => p.y));
  // Seconds in the air before the feet come back down to height dy (negative = higher ledge)
  const airTime = dy => (ARC.find(p => p.vy > 0 && p.y >= dy) || ARC[ARC.length - 1]).t;

  /* ---- STATE ---- */
  let state = 'ready';   // ready | running | dying | paused | over
  let buildings, px, prevPx, y, prevY, vy, speed, onGround, coyote, buffer, jumping, holdT;
  let held = false, shakeT, animT, toast, mIdx, overT, quip, newBest, shownM;
  let best = 0;
  try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (_) {}

  function reset() {
    const first = { x: -300, w: 300 + SPEED_START * 3.5, top: 140, seed: 1, crates: [] };
    first.vEdge = edgeSpeed(first, SPEED_START);
    buildings = [first];
    px = prevPx = 0;
    y = prevY = 140 - PH;
    vy = 0; speed = SPEED_START;
    onGround = true; coyote = buffer = holdT = 0; jumping = false;
    shakeT = animT = overT = 0; toast = null; mIdx = 0; newBest = false; shownM = -1;
    fill();
  }

  // Slowest you can possibly be at this roof's edge: arrive at the slowest possible speed, trip on
  // every crate, then recover. Speed never drops any other way, so this is a true lower bound.
  function edgeSpeed(b, v) {
    let pos = b.x;
    const recover = (v, to) => Math.min(targetSpeed(to / UNITS_PER_M), Math.sqrt(v * v + 2 * RECOVER * (to - pos)));
    for (const c of b.crates) { v = Math.max(SPEED_FLOOR, recover(v, c.x) * TRIP); pos = c.x; }
    return recover(v, b.x + b.w);
  }

  function addBuilding() {
    const last = buildings[buildings.length - 1];
    const end = last.x + last.w;
    const vt = targetSpeed(end / UNITS_PER_M);
    // Gap is sized for the slowest runner who could reach this edge, so it's always clearable
    const v = last.vEdge * 0.9;
    const top = clamp(last.top + rand(-APEX * 0.6, 55), TOP_MIN, TOP_MAX);
    const gap = v * airTime(top - last.top) * rand(0.45, 1);
    const w = vt * rand(1.1, 2.6) + 80;
    const b = { x: end + gap, w, top, seed: Math.random() * 1000, crates: [] };

    // Crates: none in the first stretch, and always leave runway before the next edge
    if (end > 1500 && w > vt * 1.4 && Math.random() < 0.65) {
      const n = w > vt * 2.2 ? 2 : 1;
      const lo = b.x + vt * 0.45, hi = b.x + w - vt * 0.6 - CRATE;
      for (let i = 0; i < n; i++) {
        b.crates.push({ x: lo + (hi - lo) * (i + rand(0.15, 0.85)) / n, y: top - CRATE,
                        label: pick(LABELS), hit: false, vx: 0, vy: 0, rot: 0 });
      }
    }
    b.vEdge = edgeSpeed(b, last.vEdge);
    buildings.push(b);
  }

  function fill() {
    let last = buildings[buildings.length - 1];
    while (last.x + last.w < px + viewW + 400) { addBuilding(); last = buildings[buildings.length - 1]; }
    while (buildings.length > 2 && buildings[0].x + buildings[0].w < px - viewW) buildings.shift();
  }

  const supportAt = x => buildings.find(b => b.x < x + PW && b.x + b.w > x);

  /* ---- PHYSICS (one fixed step) ---- */
  function update(dt) {
    if (state === 'over') { overT += dt; return; }
    if (toast) { toast.t += dt; if (toast.t > 1.8) toast = null; }
    if (state !== 'running' && state !== 'dying') return;

    prevPx = px; prevY = y;
    shakeT = Math.max(0, shakeT - dt);

    // Horizontal: auto-run, ramping toward the distance-based target speed
    if (state === 'running') speed = Math.min(targetSpeed(px / UNITS_PER_M), speed + RECOVER * dt);
    const oldRight = px + PW;
    px += speed * dt;
    animT += speed * dt;

    // Ran into the side of a taller building
    if (state === 'running') {
      for (const b of buildings) {
        if (oldRight <= b.x && px + PW > b.x && y + PH > b.top + 2) {
          px = prevPx = b.x - PW; speed = 0; onGround = false; state = 'dying';
          quip = pick(QUIPS.wall); shake(0.2);
          break;
        }
      }
    }

    // Jump (buffered press + coyote time)
    buffer = Math.max(0, buffer - dt);
    coyote = Math.max(0, coyote - dt);
    if (state === 'running' && buffer > 0 && (onGround || coyote > 0)) {
      vy = -JUMP_V; jumping = true; holdT = 0; onGround = false; coyote = buffer = 0;
    }
    if (jumping && (!held || vy >= 0 || holdT >= HOLD_MAX)) jumping = false;

    // Vertical
    if (!onGround) {
      vy += (jumping ? G_HOLD : G) * dt;
      y += vy * dt;
      if (jumping) holdT += dt;
    }

    // Ground contact
    if (onGround) {
      if (!supportAt(px)) { onGround = false; coyote = COYOTE; }
    } else if (vy >= 0) {
      const b = supportAt(px);
      if (b && prevY + PH <= b.top + 0.01 && y + PH >= b.top) { y = b.top - PH; vy = 0; onGround = true; }
    }

    // Crates trip you up (Canabalt-style) and go flying
    for (const b of buildings) {
      for (const c of b.crates) {
        if (c.hit) { c.vy += G * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += 9 * dt; continue; }
        if (state === 'running' && px + PW > c.x && px < c.x + CRATE && y + PH > c.y && y < c.y + CRATE) {
          c.hit = true; c.vx = speed * 0.6 + 40; c.vy = -170;
          speed = Math.max(SPEED_FLOOR, speed * TRIP);
          shake(0.15);
        }
      }
    }

    // Milestones + score
    const m = Math.floor(px / UNITS_PER_M);
    if (state === 'running' && m >= milestone(mIdx)[0]) { toast = { text: milestone(mIdx)[1], t: 0 }; mIdx++; }
    if (m !== shownM && m >= 0) { shownM = m; ui.score.textContent = m + 'm'; }

    if (y > DEATH_Y) gameOver();
    fill();
  }

  function shake(t) { if (!reducedMotion.matches) shakeT = t; }

  function gameOver() {
    if (state === 'running') quip = pick(QUIPS.fall);
    state = 'over'; overT = 0;
    prevPx = px; prevY = y;
    const m = Math.max(0, Math.floor(px / UNITS_PER_M));
    if (m > best) {
      best = m; newBest = true;
      try { localStorage.setItem(BEST_KEY, best); } catch (_) {}
      ui.best.textContent = best + 'm';
    }
  }

  /* ---- INPUT ---- */
  function press() {
    held = true;
    if (state === 'ready' || state === 'paused') { state = 'running'; return; }
    if (state === 'over') { if (overT > 0.4) { reset(); state = 'running'; } return; }
    buffer = BUFFER;
  }
  function release() { held = false; }

  /* ---- RENDERING ---- */
  let dialog, canvas, ctx, ui, C;
  let cssW = 1, cssH = 1, dpr = 1, s = 1, viewW = VIEW_W, viewH = VIEW_H, viewTop = 0, camX = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const touchOnly = matchMedia('(hover: none)');

  // World-space rect, snapped to device pixels so everything stays crisp
  function rect(x, y, w, h) {
    const x0 = Math.round((x - camX) * s), y0 = Math.round((y - viewTop) * s);
    ctx.fillRect(x0, y0, Math.round((x + w - camX) * s) - x0, Math.round((y + h - viewTop) * s) - y0);
  }

  // Text in CSS-pixel coordinates, in the site's font
  function text(str, x, y, size, color) {
    ctx.font = `${size * dpr}px Lora, Georgia, serif`;
    ctx.fillStyle = color;
    ctx.fillText(str, x * dpr, y * dpr);
  }

  function render(alpha) {
    const ix = prevPx + (px - prevPx) * alpha;
    const iy = prevY + (y - prevY) * alpha;
    camX = ix - viewW * 0.22 + (shakeT > 0 ? rand(-2, 2) : 0);

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Far skyline (parallax), kept faint so it never reads as a rooftop
    ctx.fillStyle = C.sky;
    ctx.globalAlpha = 0.6;
    const SEG = 46, fx = camX * 0.25;
    for (let i = Math.floor(fx / SEG); i * SEG - fx < viewW; i++) {
      rect(camX + i * SEG - fx, 60 + hash(i) * 70, SEG * (0.55 + 0.4 * hash(i + 0.5)), FLOOR);
    }
    ctx.globalAlpha = 1;

    // Buildings, windows, roof edges
    for (const b of buildings) {
      if (b.x > camX + viewW || b.x + b.w < camX) continue;
      ctx.fillStyle = C.building;
      rect(b.x, b.top, b.w, FLOOR - b.top + 2);
      ctx.fillStyle = C.window;
      ctx.globalAlpha = 0.4;
      const c0 = Math.max(0, Math.floor((camX - b.x) / 14) - 1);
      const c1 = Math.min(Math.floor((b.w - 14) / 14), Math.ceil((camX + viewW - b.x) / 14));
      for (let c = c0; c <= c1; c++) {
        for (let r = 0, wy = b.top + 12; wy < FLOOR; r++, wy += 16) {
          if (hash(b.seed + c * 7.13 + r * 3.7) > 0.55) rect(b.x + 8 + c * 14, wy, 6, 8);
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.edge;
      rect(b.x, b.top, b.w, 1.2);
    }

    // Crates + their labels
    for (const b of buildings) {
      for (const c of b.crates) {
        if (c.x > camX + viewW || c.x + CRATE < camX || c.y > FLOOR) continue;
        ctx.fillStyle = C.accent;
        if (c.hit) {
          ctx.save();
          ctx.translate((c.x + CRATE / 2 - camX) * s, (c.y + CRATE / 2 - viewTop) * s);
          ctx.rotate(c.rot);
          ctx.fillRect(-CRATE / 2 * s, -CRATE / 2 * s, CRATE * s, CRATE * s);
          ctx.restore();
        } else {
          rect(c.x, c.y, CRATE, CRATE);
          ctx.fillStyle = C.bg;
          rect(c.x + 2, c.y + 2, CRATE - 4, CRATE - 4);
          ctx.fillStyle = C.accent;
          rect(c.x + 4, c.y + 4, CRATE - 8, CRATE - 8);
          text(c.label, (c.x + CRATE / 2 - camX) * s / dpr, (c.y - 5 - viewTop) * s / dpr, Math.max(10, 9 * s / dpr), C.muted);
        }
      }
    }

    // Runner
    const frame = !onGround && state !== 'ready' ? SPRITES.jump
                : state === 'running' ? (Math.floor(animT / 14) % 2 ? SPRITES.runA : SPRITES.runB)
                : SPRITES.runB;
    ctx.fillStyle = C.player;
    for (let r = 0; r < frame.length; r++) {
      for (let c = 0; c < 7; c++) if (frame[r][c] === '#') rect(ix + c * PX, iy + r * PX, PX, PX);
    }

    // Milestone toast
    if (toast) {
      ctx.globalAlpha = toast.t < 0.2 ? toast.t / 0.2 : toast.t > 1.4 ? Math.max(0, (1.8 - toast.t) / 0.4) : 1;
      text(toast.text, cssW / 2, 34, 16, C.accent);
      ctx.globalAlpha = 1;
    }

    // Overlays
    const cx = cssW / 2, cy = cssH / 2;
    if (state === 'ready') {
      text(touchOnly.matches ? 'Tap to start' : 'Press space or click to start', cx, cy - 16, 16, C.heading);
      text('Jump the gaps. Hold to jump higher.', cx, cy + 6, 13, C.secondary);
    } else if (state === 'paused') {
      dim();
      text('Paused', cx, cy - 8, 18, C.heading);
      text(touchOnly.matches ? 'Tap to resume' : 'Press space to resume', cx, cy + 14, 13, C.secondary);
    } else if (state === 'over') {
      dim();
      const m = Math.max(0, Math.floor(px / UNITS_PER_M));
      text(`Shipped ${m}m`, cx, cy - 22, 22, C.heading);
      text(quip, cx, cy + 2, 13, C.secondary);
      if (newBest) text('New best!', cx, cy + 22, 13, C.accent);
      if (overT > 0.4) text(touchOnly.matches ? 'Tap to ship again' : 'Press space to ship again', cx, cy + (newBest ? 44 : 26), 12, C.muted);
    }
  }

  function dim() {
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }

  /* ---- LOOP (runs only while the dialog is open and the tab is visible) ---- */
  let raf = 0, last = 0, acc = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render(state === 'running' || state === 'dying' ? acc / STEP : 1);
  }
  function start() { if (!raf) { last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function resize() {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const scale = Math.min(cssH / VIEW_H, cssW / VIEW_W);   // CSS px per world unit
    viewW = cssW / scale; viewH = cssH / scale;
    viewTop = FLOOR - viewH;                                // extra room goes to the sky
    s = scale * dpr;
    ctx.textAlign = 'center';   // resizing the canvas resets context state
    if (buildings) { fill(); render(1); }
  }

  /* ---- DIALOG ---- */
  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'game';
    dialog.setAttribute('aria-label', 'Rooftop runner');
    dialog.innerHTML = `
      <div class="game-bar">
        <span>Shipped <span class="game-num" data-score>0m</span></span>
        <span class="game-bar-right">
          <span>Best <span class="game-num" data-best>${best}m</span></span>
          <button type="button" class="game-close" aria-label="Close game">✕</button>
        </span>
      </div>
      <canvas class="game-canvas" tabindex="0" autofocus role="img" aria-label="Rooftop runner game"></canvas>
      <p class="game-hint">${touchOnly.matches ? 'Tap to jump · hold to jump higher'
                                                : 'Space or ↑ to jump · hold to jump higher · Esc to close'}</p>`;
    document.body.appendChild(dialog);

    canvas = dialog.querySelector('canvas');
    ctx = canvas.getContext('2d', { alpha: false });
    ui = { score: dialog.querySelector('[data-score]'), best: dialog.querySelector('[data-best]') };

    dialog.querySelector('.game-close').addEventListener('click', () => dialog.close());

    // Close on backdrop click (only if the press also started on the backdrop)
    let downOnBackdrop = false;
    dialog.addEventListener('pointerdown', e => { downOnBackdrop = e.target === dialog; });
    dialog.addEventListener('click', e => { if (downOnBackdrop && e.target === dialog) dialog.close(); });

    canvas.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      press();
    });
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    const isJumpKey = e => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    document.addEventListener('keydown', e => {
      if (!dialog.open || !isJumpKey(e) || e.target.closest?.('button')) return;
      e.preventDefault();
      if (!e.repeat) press();
    });
    document.addEventListener('keyup', e => { if (dialog.open && isJumpKey(e)) { e.preventDefault(); release(); } });

    dialog.addEventListener('close', () => {
      stop();
      held = false;
      document.documentElement.style.overflow = '';
    });

    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => {
      if (!dialog.open) return;
      if (document.hidden) { stop(); if (state === 'running') state = 'paused'; held = false; }
      else start();
    });

    new ResizeObserver(resize).observe(canvas);
  }

  function readColors() {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    C = {
      bg: v('--color-bg', '#0e0e0e'),       sky: v('--color-surface', '#161616'),
      building: v('--color-card-bg', '#1c1c1c'), window: v('--color-border-mid', '#333'),
      edge: v('--color-muted', '#888'),     player: v('--color-text', '#e8e6e1'),
      accent: v('--color-hover', '#cd7c5e'), heading: v('--color-heading', '#fff'),
      secondary: v('--color-secondary', '#b0aca6'), muted: v('--color-muted', '#888'),
    };
  }

  function open() {
    if (!dialog) build();
    readColors();
    reset();
    state = 'ready';
    ui.score.textContent = '0m';
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    canvas.focus({ preventScroll: true });
    resize();
    start();
  }

  window.RooftopGame = { open };
})();
