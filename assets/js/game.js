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
  const RECOVER = 70, TRIP = 0.65;       // after a hurdle: speed x0.65, then win it back at 70/s²
  const FLOOR = 200, TOP_MIN = 90, TOP_MAX = 160, DEATH_Y = FLOOR + 30;
  const VIEW_W = 380, VIEW_H = 200;
  const PX = 2, PW = 7 * PX, PH = 12 * PX;     // sprite pixel size, player box
  const UNITS_PER_M = 10;
  const BEST_KEY = 'cv-rooftop-best';

  // Difficulty tiers (metres) — each one is announced by the milestone toast of the same distance
  const HURDLES_AT = 150, BUGS_AT = 500, MAIL_AT = 1000, LEGACY_AT = 2000;
  const BUG_SPEED = 35, BUG_PATROL = 60;                // crawling bugs
  const MAIL_SPEED = 70, MAIL_GAP = 6;                  // reply-alls fly in this far above your head
  const CRUMBLE_DELAY = 0.3, SINK_ACC = 120, SINK_MAX = 70, CRUMBLE_TOP_MAX = 125;   // legacy roofs

  const SPRITES = {
    runA: ['..###..', '..###..', '..###..', '...#...', '.#####.', '#.###.#', '..###..', '..###..', '..#.#..', '.#...#.', '.#...#.', '#.....#'],
    runB: ['..###..', '..###..', '..###..', '...#...', '..###..', '.#####.', '..###..', '..###..', '...##..', '...#.#.', '..#..#.', '..#....'],
    jump: ['..###..', '..###..', '..###..', '#..#..#', '.#####.', '..###..', '..###..', '..###..', '.#..#..', '#....#.', '.....#.', '.......'],
    mail: ['#########', '##+++++##', '#+#+++#+#', '#++#+#++#', '#+++#+++#', '#########'],
  };
  // Hurdle pixel art: '#' accent, '+' light detail (dark while unlit), '*' shown only while lit (P0 siren)
  const HURDLES = {
    bug:   { label: 'bug', frames: [
             ['..#.....#..', '...#...#...', '....###....', '#..#####..#', '.#.##+##.#.', '...##+##...', '.#.##+##.#.', '#..#####..#', '....###....'],
             ['..#.....#..', '...#...#...', '....###....', '.#.#####.#.', '#..##+##..#', '...##+##...', '#..##+##..#', '.#.#####.#.', '....###....']] },
    meet:  { label: 'meeting', frames: [['..#...#..', '#########', '#########', '#+++++++#', '#+#+#+#+#', '#+++++++#', '#+#+#+#+#', '#+++++++#', '#########']] },
    debt:  { label: 'tech debt', frames: [['..######..', '..#....#..', '..#....#..', '##########', '#...##...#', '#...##...#', '#...##...#', '##########']] },
    merge: { label: 'merge conflict', frames: [['###########', '#.+.....+.#', '#..+...+..#', '#++++.++++#', '#..+...+..#', '#.+.....+.#', '###########', '.....#.....', '.....#.....']] },
    flaky: { label: 'flaky test', frames: [['..#####..', '...#.#...', '...#.#...', '...#.#...', '..#...#..', '.#.....#.', '#+++++++#', '#+++++++#', '.#######.']] },
    p0:    { label: 'P0', frames: [['*...*...*', '.*.....*.', '...###...', '..#+++#..', '.#+++++#.', '.#+++++#.', '#########', '#########']] },
    creep: { label: 'scope creep', frames: [['...#...', '..##.#.', '...###.', '.#.#...', '.###...', '...#.#.', '...###.', '.#.#...', '..###..']] },
  };
  const HURDLE_TYPES = Object.keys(HURDLES);
  const MILESTONES = [[100, 'MVP'], [250, 'First 10 users'], [500, 'v1.0 shipped', 'bugs in prod'],
                      [1000, 'Product–market fit', 'inbox is exploding'], [2000, 'Series A', 'legacy code ahead'],
                      [3500, 'Unicorn'], [5000, 'IPO']];
  const QUIPS = {
    fall: ['Fell into the backlog.', 'Scope crept in.', 'Missed the deadline.', 'Shipped to /dev/null.',
           'Needs one more sprint.', 'Rolled back.'],
    wall: ['Hit a wall. Happens to every roadmap.', 'Ran straight into a blocker.'],
    legacy: ['Legacy code took you down.', 'Nobody knew how that part worked.'],
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  // Keeps climbing the whole run (fast early, gentler later) up to a hard cap
  const targetSpeed = m => Math.min(SPEED_MAX, SPEED_START + 3.8 * Math.sqrt(Math.max(0, m)));
  const milestone = i => MILESTONES[i] || [5000 + 2500 * (i - MILESTONES.length + 1), 'Still shipping'];
  // How far a legacy roof has sunk t seconds after you land on it
  const sinkDepth = t => {
    const u = Math.max(0, t - CRUMBLE_DELAY), tMax = SINK_MAX / SINK_ACC;
    return u < tMax ? SINK_ACC * u * u / 2 : SINK_ACC * tMax * tMax / 2 + SINK_MAX * (u - tMax);
  };

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
  let buildings, mails, px, prevPx, y, prevY, vy, speed, onGround, coyote, buffer, jumping, holdT, lastRoof;
  let held = false, clock = 0, shakeT, animT, toast, mIdx, overT, quip, newBest, shownM;
  let best = 0;
  try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (_) {}

  function reset() {
    const first = { x: -300, w: 300 + SPEED_START * 3.5, top: 140, seed: 1, hurdles: [], vIn: SPEED_START };
    addWindows(first);
    first.vEdge = edgeSpeed(first, SPEED_START);
    buildings = [first];
    mails = [];
    px = prevPx = 0;
    y = prevY = 140 - PH;
    vy = 0; speed = SPEED_START;
    onGround = true; coyote = buffer = holdT = 0; jumping = false; lastRoof = first;
    shakeT = animT = overT = 0; toast = null; mIdx = 0; newBest = false; shownM = -1;
    fill();
  }

  /* ---- LEVEL GENERATOR ---- */

  // Slowest you can possibly be at this roof's edge: arrive at the slowest possible speed, trip on
  // every hurdle (at the furthest point it can be, which leaves the least runway to recover), then
  // recover. Speed never drops any other way, so this is a true lower bound.
  function edgeSpeed(b, v) {
    let pos = b.x;
    const recover = (v, to) => Math.min(targetSpeed(to / UNITS_PER_M), Math.sqrt(v * v + 2 * RECOVER * Math.max(0, to - pos)));
    const trips = b.hurdles.map(h => h.x1).concat(b.mailMeet ? [b.mailMeet + 50] : []).sort((a, c) => a - c);
    for (const x of trips) { v = Math.max(SPEED_FLOOR, recover(v, x) * TRIP); pos = x; }
    return recover(v, b.x + b.w);
  }

  function makeHurdle(type, x, top, live) {
    const rows = HURDLES[type].frames[0];
    const h = rows.length * PX;
    const o = { type, x, x0: x, x1: x, y: top - h, w: rows[0].length * PX, h, top, live, dir: -1,
                phase: Math.random() * 4, hit: false, vx: 0, vy: 0, rot: 0 };
    if (type === 'bug' && live) { o.x1 = x + BUG_PATROL; o.x = rand(x, o.x1); }
    return o;
  }

  function addBuilding() {
    const last = buildings[buildings.length - 1];
    const end = last.x + last.w, m = end / UNITS_PER_M;
    const vt = targetSpeed(m), vIn = last.vEdge;
    // Take-off height: a legacy roof may have sunk this far by the time the slowest runner leaves it
    const from = last.top + (last.crumble ? sinkDepth((last.w + PW) / last.vIn + COYOTE) : 0);
    const lo = Math.max(TOP_MIN, from - APEX * 0.6);
    const crumble = m >= LEGACY_AT && !last.crumble && lo <= CRUMBLE_TOP_MAX && Math.random() < 0.3;
    const top = clamp(from + rand(-APEX * 0.6, 55), lo, Math.max(lo, crumble ? CRUMBLE_TOP_MAX : TOP_MAX));
    // Gap is sized for the slowest runner who could reach this edge, so it's always clearable
    const gap = vIn * 0.9 * airTime(top - from) * rand(0.45, 1);
    const w = crumble ? vt * rand(0.9, 1.3) + 60 : vt * rand(1.1, 2.6) + 80;
    const b = { x: end + gap, w, top, seed: Math.random() * 1000, hurdles: [], vIn, crumble };

    if (!crumble) {
      // Hurdles: none in the first stretch, and always leave runway before the next edge
      const hlo = b.x + vt * 0.45, hhi = b.x + w - vt * 0.6 - 24 - BUG_PATROL;
      if (m >= HURDLES_AT && w > vt * 1.4 && hhi > hlo && Math.random() < 0.65) {
        const n = w > vt * 2.2 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          b.hurdles.push(makeHurdle(pick(HURDLE_TYPES), hlo + (hhi - hlo) * (i + rand(0.15, 0.85)) / n, top, m >= BUGS_AT));
        }
      }
      // A reply-all will fly in to meet you around here (spawned in update())
      if (m >= MAIL_AT && w > vt * 2 && Math.random() < 0.45) b.mailMeet = b.x + w * rand(0.3, 0.5);
    }
    b.vEdge = edgeSpeed(b, vIn);
    addWindows(b);
    buildings.push(b);
  }

  // Which windows are lit, decided once per building: bit r of win[c] = row r of column c
  function addWindows(b) {
    b.win = [];
    for (let c = 0; c <= (b.w - 14) / 14; c++) {
      let mask = 0;
      for (let r = 0; r < 7; r++) if (hash(b.seed + c * 7.13 + r * 3.7) > 0.55) mask |= 1 << r;
      b.win.push(mask);
    }
  }

  function fill() {
    let last = buildings[buildings.length - 1];
    while (last.x + last.w < px + viewW + 400) { addBuilding(); last = buildings[buildings.length - 1]; }
    while (buildings.length > 2 && buildings[0].x + buildings[0].w < px - viewW) buildings.shift();
  }

  const supportAt = x => buildings.find(b => b.x < x + PW && b.x + b.w > x);

  /* ---- PHYSICS (one fixed step) ---- */
  function update(dt) {
    clock += dt;
    if (state === 'over') { overT += dt; return; }
    if (toast) { toast.t += dt; if (toast.t > toast.life) toast = null; }
    if (state !== 'running' && state !== 'dying') return;

    prevPx = px; prevY = y;
    shakeT = Math.max(0, shakeT - dt);

    // Legacy roofs sink once you've landed on them
    for (const b of buildings) {
      if (!b.sinking || b.top > FLOOR + 60) continue;
      b.sinkT += dt;
      if (b.sinkT > CRUMBLE_DELAY) { b.sv = Math.min(SINK_MAX, b.sv + SINK_ACC * dt); b.top += b.sv * dt; }
    }

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

    // Ground contact (riding the roof down if it's sinking)
    if (onGround) {
      const b = supportAt(px);
      if (!b) { onGround = false; coyote = COYOTE; }
      else y = b.top - PH;
    } else if (vy >= 0) {
      const b = supportAt(px);
      if (b && prevY + PH <= b.top + 0.01 && y + PH >= b.top) {
        y = b.top - PH; vy = 0; onGround = true; lastRoof = b;
        if (b.crumble && !b.sinking) { b.sinking = true; b.sinkT = b.sv = 0; shake(0.1); }
      }
    }

    // Hurdles trip you up (Canabalt-style) and go flying
    for (const b of buildings) for (const h of b.hurdles) updateHurdle(h, dt);

    // Reply-alls: launched from just off-screen so they meet you mid-roof
    for (const b of buildings) {
      if (!b.mailMeet || b.mailSent || state !== 'running') continue;
      const lead = viewW * 0.78 + 20;
      if (px + lead * speed / (speed + MAIL_SPEED) >= b.mailMeet) {
        b.mailSent = true;
        const base = b.top - PH - MAIL_GAP - 6 * PX;
        mails.push({ x: px + lead, y: base, base, w: 9 * PX, h: 6 * PX, t: 0, hit: false, vx: 0, vy: 0, rot: 0 });
      }
    }
    for (const e of mails) {
      if (e.hit) { tumble(e, dt); continue; }
      e.t += dt;
      e.x -= MAIL_SPEED * dt;
      e.y = e.base + Math.sin(e.t * 5) * 2;
      if (state === 'running' && hits(e)) trip(e);
    }
    for (let i = mails.length - 1; i >= 0; i--) if (mails[i].x < px - viewW || mails[i].y > FLOOR + 40) mails.splice(i, 1);

    // Milestones + score
    const m = Math.floor(px / UNITS_PER_M);
    if (state === 'running' && m >= milestone(mIdx)[0]) {
      const [, title, sub] = milestone(mIdx++);
      toast = { title, sub, t: 0, life: sub ? 2.6 : 1.8 };
    }
    if (m !== shownM && m >= 0) { shownM = m; ui.score.textContent = m + 'm'; }

    if (y > DEATH_Y) gameOver();
    fill();
  }

  function updateHurdle(h, dt) {
    if (h.hit) { tumble(h, dt); return; }
    if (h.type === 'bug' && h.live) {
      h.x += h.dir * BUG_SPEED * dt;
      if (h.x <= h.x0) { h.x = h.x0; h.dir = 1; } else if (h.x >= h.x1) { h.x = h.x1; h.dir = -1; }
    }
    if (h.type === 'creep') {   // grows as you get close
      const rows = h.live ? clamp(Math.round(3 + 6 * (170 - (h.x - px - PW)) / 140), 3, 9) : 6;
      h.h = rows * PX; h.y = h.top - h.h;
    }
    if (state === 'running' && hits(h)) trip(h);
  }

  const hits = o => px + PW > o.x + 1 && px < o.x + o.w - 1 && y + PH > o.y + 1 && y < o.y + o.h;

  function trip(o) {
    o.hit = true; o.vx = speed * 0.6 + 40; o.vy = -170;
    speed = Math.max(SPEED_FLOOR, speed * TRIP);
    shake(0.15);
  }

  function tumble(o, dt) { o.vy += G * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += 9 * dt; }

  function shake(t) { if (!reducedMotion.matches) shakeT = t; }

  function gameOver() {
    if (state === 'running') quip = pick(lastRoof && lastRoof.crumble ? QUIPS.legacy : QUIPS.fall);
    state = 'over'; overT = 0; toast = null;
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
    if (state === 'running') { buffer = BUFFER; return; }
    if (state === 'over') { if (overT <= 0.4) return; reset(); }
    if (state === 'dying') return;
    state = 'running';
    start();
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
  let font = '';
  function text(str, x, y, size, color) {
    const f = `${size * dpr}px Lora, Georgia, serif`;
    if (f !== font) ctx.font = font = f;
    ctx.fillStyle = color;
    ctx.fillText(str, x * dpr, y * dpr);
  }

  // Small muted caption at a world position (hurdle labels)
  function label(str, wx, wy) {
    text(str, (wx - camX) * s / dpr, (wy - viewTop) * s / dpr, Math.max(10, 9 * s / dpr), C.muted);
  }

  // Pixel sprite at a world position. `from` skips top rows (growing vines); `rot` tumbles it.
  function sprite(rows, x, y, { flip = false, rot = 0, lit = true, from = 0 } = {}) {
    const cols = rows[0].length, w = cols * PX, h = (rows.length - from) * PX;
    let cur = null;   // only touch ctx.fillStyle when the color changes
    if (rot) {
      ctx.save();
      ctx.translate((x + w / 2 - camX) * s, (y + h / 2 - viewTop) * s);
      ctx.rotate(rot);
    }
    for (let r = from; r < rows.length; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = rows[r][flip ? cols - 1 - c : c];
        if (ch === '.' || (ch === '*' && !lit)) continue;
        const col = ch === '#' ? C.accent : lit ? C.player : C.bg;
        if (col !== cur) ctx.fillStyle = cur = col;
        if (rot) ctx.fillRect((c * PX - w / 2) * s, ((r - from) * PX - h / 2) * s, PX * s, PX * s);
        else rect(x + c * PX, y + (r - from) * PX, PX, PX);
      }
    }
    if (rot) ctx.restore();
  }

  function drawHurdle(h) {
    if (h.x > camX + viewW || h.x + h.w < camX || h.y > FLOOR) return;
    const def = HURDLES[h.type];
    if (h.type === 'flaky' && h.live && !h.hit && Math.floor(clock * 7 + h.phase) % 4 === 0) return;   // flickers
    const rows = def.frames[h.type === 'bug' && h.live ? Math.floor(clock * 8) % 2 : 0];
    sprite(rows, h.x, h.y, {
      flip: h.dir > 0, rot: h.hit ? h.rot : 0, from: rows.length - h.h / PX,
      lit: h.type !== 'p0' || Math.floor(clock * 4 + h.phase) % 2 === 0,
    });
    if (!h.hit) label(def.label, h.x + h.w / 2, h.y - 5);
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
      if (b.x > camX + viewW || b.x + b.w < camX || b.top > FLOOR) continue;
      ctx.fillStyle = C.building;
      rect(b.x, b.top, b.w, FLOOR - b.top + 2);
      ctx.fillStyle = C.window;
      ctx.globalAlpha = 0.4;
      const c0 = Math.max(0, Math.floor((camX - b.x) / 14) - 1);
      const c1 = Math.min(b.win.length - 1, Math.ceil((camX + viewW - b.x) / 14));
      for (let c = c0; c <= c1; c++) {
        const mask = b.win[c];
        for (let r = 0, wy = b.top + 12; mask >> r && wy < FLOOR; r++, wy += 16) {
          if (mask & 1 << r) rect(b.x + 8 + c * 14, wy, 6, 8);
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.edge;
      if (b.crumble) {
        // Legacy roof: broken edge, cracks down the facade, a faint sign
        for (let x = b.x; x < b.x + b.w; x += 12) rect(x, b.top, Math.min(8, b.x + b.w - x), 1.2);
        ctx.fillStyle = C.bg;
        for (let k = 1; k <= 3; k++) {
          const cx = b.x + b.w * k / 4 + (hash(b.seed + k) - 0.5) * 30;
          rect(cx, b.top + 1, 2, 7); rect(cx + 2, b.top + 7, 2, 7); rect(cx, b.top + 13, 2, 6);
        }
        ctx.globalAlpha = 0.8;
        label('legacy', b.x + b.w / 2, b.top + 34);
        ctx.globalAlpha = 1;
      } else {
        rect(b.x, b.top, b.w, 1.2);
      }
    }

    // Hurdles and reply-alls, with their labels
    for (const b of buildings) for (const h of b.hurdles) drawHurdle(h);
    for (const e of mails) {
      if (e.x > camX + viewW || e.x + e.w < camX) continue;
      sprite(SPRITES.mail, e.x, e.y, { rot: e.hit ? e.rot : 0 });
      if (!e.hit) {
        ctx.fillStyle = C.muted;   // speed lines
        rect(e.x + e.w + 3, e.y + 3, 5, 1); rect(e.x + e.w + 5, e.y + 6, 4, 1);
        label('reply-all', e.x + e.w / 2, e.y - 5);
      }
    }

    // Runner
    const pose = !onGround && state !== 'ready' ? SPRITES.jump
                : state === 'running' ? (Math.floor(animT / 14) % 2 ? SPRITES.runA : SPRITES.runB)
                : SPRITES.runB;
    ctx.fillStyle = C.player;
    for (let r = 0; r < pose.length; r++) {
      for (let c = 0; c < 7; c++) if (pose[r][c] === '#') rect(ix + c * PX, iy + r * PX, PX, PX);
    }

    // Milestone toast (with a second line when it unlocks something new)
    if (toast) {
      const fadeOut = toast.life - 0.4;
      ctx.globalAlpha = toast.t < 0.2 ? toast.t / 0.2 : toast.t > fadeOut ? Math.max(0, (toast.life - toast.t) / 0.4) : 1;
      text(toast.title, cssW / 2, 34, 16, C.accent);
      if (toast.sub) text(toast.sub, cssW / 2, 54, 12, C.secondary);
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
    if (state === 'ready' || state === 'paused' || (state === 'over' && overT > 0.4)) stop();
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
    font = '';
    if (buildings) { fill(); render(1); }
  }

  /* ---- DIALOG ---- */
  // Dialog styles live here (not style.css) so nobody downloads them until they play. Site tokens only.
  const CSS = `
.game { width: min(760px, calc(100vw - 32px)); max-width: none; max-height: calc(100dvh - 32px); margin: auto; padding: 0;
  overflow: hidden; color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border-mid);
  border-radius: var(--radius-sm); -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.game[open] { animation: game-in 0.18s ease-out; }
.game::backdrop { background: rgba(0, 0, 0, 0.7); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
@keyframes game-in { from { opacity: 0; transform: translateY(6px); } }
.game-bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 10px 16px;
  font-size: var(--text-sm); color: var(--color-muted); }
.game-bar-right { display: flex; align-items: center; gap: var(--space-sm); }
.game-num { color: var(--color-heading); font-variant-numeric: tabular-nums; }
.game-close { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; font: inherit;
  font-size: var(--text-sm); line-height: 1; color: var(--color-secondary); background: var(--color-surface);
  border: 1px solid var(--color-border-mid); border-radius: 50%; cursor: pointer; transition: border-color 0.15s, color 0.15s; }
.game-close:hover, .game-close:focus-visible { border-color: var(--color-heading); color: var(--color-heading); outline: none; }
.game-canvas { display: block; width: 100%; aspect-ratio: 3 / 1; min-height: 170px; max-height: calc(100dvh - 140px);
  background: var(--color-bg); touch-action: none; cursor: pointer; outline: none; }
.game-hint { padding: 10px 16px 12px; font-size: 12px; text-align: center; color: var(--color-muted); }
@media (max-width: 560px) { .game-canvas { aspect-ratio: 2 / 1; } }
@media (prefers-reduced-motion: reduce) { .game[open] { animation: none; } }`;

  function build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

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
