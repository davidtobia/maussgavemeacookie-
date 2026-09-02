/**
 * THE TRANSPLANT TRAIL - ACT 3: THE JAIL ("THE YARD")
 * ======================================================
 *
 * Second pass. The single-ally recruitment arc + weapon beat + Big Steve
 * fight (first pass) is shelved in jail-shelved.js, not deleted — see
 * that file's header for why and what reviving it needs.
 *
 * This file is orchestration only: infra (resize/overlay plumbing), the
 * one authored intake panel, the yard (explorable hub, camera-follow,
 * discovery), the dialogue-tree engine that walks JAIL_DIALOGUE, the
 * friendship model, and the shared result/summary panels. All authored
 * content lives in jail-data.js; the three mini-games live in
 * jail-minigames.js. This file never hardcodes a character name or a
 * line of dialogue — it walks jail-data.js's objects generically, which
 * is what lets the project owner rewrite the entire arc's content without
 * touching a line of code here.
 *
 * Debug entry: `window.JAIL_DEBUG = { startAt: 'yard'|'rhythm'|'bench'|
 * 'trip', friendship: { diddy: 40, ... } }`, set before `?jail=1` boots
 * this up, jumps straight past intake/dialogue into the yard or a
 * specific mini-game — for iterating on one piece without replaying the
 * whole arc every reload.
 */

class JailGame {
  constructor(gameState, onComplete) {
    this.gameState = gameState;
    this.onComplete = onComplete;

    this.canvas = document.getElementById('jail-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.phase = 'idle';
    this._af = null;
    this._frame = 0;

    // ---- Friendship model ----
    // Three simultaneous tracks, all starting at 10 (see
    // JAIL_REDESIGN_PLAN.md §6 for the budget this is tuned against).
    this.friendship = {};
    this.miniBestGain = {};   // best mini-game friendshipGain so far, per char — only the best run counts
    this.minigameDone = {};
    this.lastGrade = {};
    this.lastDetail = {};
    this.discovered = {};
    this.discoverFrame = {};  // _frame at moment of discovery, for the name-label fade-in
    this.flags = new Set();
    this.convoResume = {};    // charId -> { convoId: nodeId } for abandoned mid-tree conversations
    this.convosDone = {};     // charId -> Set of finished conversation ids
    JAIL_CHARACTERS.forEach(c => {
      this.friendship[c.id] = 10;
      this.miniBestGain[c.id] = 0;
      this.minigameDone[c.id] = false;
      this.lastGrade[c.id] = null;
      this.lastDetail[c.id] = null;
      this.discovered[c.id] = false;
      this.convosDone[c.id] = new Set();
    });
    this._flavorSeen = new Set(); // JAIL_YARD_FLAVOR ids already shown, separate from real gameplay flags

    this.yard = null;         // built once by startYard(); persists across conversations/minigames
    this.activeConvo = null;  // { charId, convoId, nodeId }
    this.activeMinigame = null;

    validateJailDialogue();
  }

  // ------------------------------------------------
  // INFRASTRUCTURE — same shape as HeistGame's
  // ------------------------------------------------

  init() {
    this.resize();
    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
    this._bindYardInput();

    const dbg = window.JAIL_DEBUG;
    if (dbg && dbg.friendship) Object.assign(this.friendship, dbg.friendship);

    const mgMap = { rhythm: 'diddy', bench: 'mangione', trip: 'sbf' };
    if (dbg && dbg.startAt === 'yard') { this.startYard(); return; }
    if (dbg && mgMap[dbg.startAt]) {
      this.startYard();
      this.launchMinigame(mgMap[dbg.startAt]);
      return;
    }

    this.showIntake();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth;
    this.canvas.height = rect.height || window.innerHeight;
  }

  stopLoop() {
    if (this._af) { cancelAnimationFrame(this._af); this._af = null; }
  }

  showOverlay(id) {
    document.querySelectorAll('#jail-game .jail-overlay').forEach(el => el.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  hideOverlays() {
    document.querySelectorAll('#jail-game .jail-overlay').forEach(el => el.classList.add('hidden'));
  }

  hideMinigameHuds() {
    ['jail-rhythm-hud', 'jail-bench-hud', 'jail-trip-hud'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const betPanel = document.getElementById('jail-trip-bet-panel');
    if (betPanel) betPanel.classList.add('hidden');
  }

  // Generic dialogue renderer — every narrative beat (intake, the gate
  // confirm, and every dialogue-tree node) goes through this one overlay.
  // `speakerColor` draws the name chip in that character's color;
  // omit it (narrator lines, intake, system prompts) for no chip at all.
  showDialogue({ title, sub, body, choices, speakerColor }) {
    const chip = document.getElementById('jail-dialogue-chip');
    if (chip) {
      if (title && speakerColor) {
        chip.textContent = title;
        chip.style.background = speakerColor;
        chip.classList.remove('hidden');
      } else {
        chip.classList.add('hidden');
      }
    }
    document.getElementById('jail-dialogue-title').textContent = title || '';
    document.getElementById('jail-dialogue-sub').textContent = sub || '';
    const bodyEl = document.getElementById('jail-dialogue-body');
    bodyEl.innerHTML = '';
    (body || []).forEach(line => {
      const p = document.createElement('p');
      p.className = 'heist-narration';
      p.textContent = line;
      bodyEl.appendChild(p);
    });

    const choicesEl = document.getElementById('jail-dialogue-choices');
    choicesEl.innerHTML = '';
    const list = choices && choices.length ? choices : [{ label: 'Continue', onClick: () => {} }];
    list.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'menu-option';
      btn.textContent = c.label;
      if (c.locked) {
        btn.disabled = true;
        btn.classList.add('jail-choice-locked');
      } else {
        btn.onclick = c.onClick;
      }
      choicesEl.appendChild(btn);
    });

    this.showOverlay('jail-dialogue');
  }

  // Friendship-delta feedback — flashes "+2" / "-1" near the dialogue
  // panel whenever a choice actually moves a score, so the friendship
  // system is never a mystery number changing offscreen.
  _flashPip(delta) {
    const el = document.getElementById('jail-dialogue-pip');
    if (!el || !delta) return;
    el.textContent = delta > 0 ? `+${delta}` : `${delta}`;
    el.style.color = delta > 0 ? '#7ec89a' : '#e05a4a';
    el.classList.remove('jail-pip-flash');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('jail-pip-flash');
  }

  // ------------------------------------------------
  // PHASE 1 — INTAKE
  // ------------------------------------------------

  showIntake() {
    this.phase = 'intake';
    this.stopLoop();
    const d = JAIL_INTAKE;
    this.showDialogue({
      title: d.title,
      sub: d.sub,
      body: d.lines,
      choices: [{ label: d.button, onClick: () => this.startYard() }],
    });
  }

  // ------------------------------------------------
  // THE YARD — world geometry
  // ------------------------------------------------

  yardLayout() {
    if (this._layoutCache) return this._layoutCache;
    const worldW = 180, worldH = 120;
    const props = [
      // Perimeter fence, bottom split to leave a gate-width gap at x:82-98.
      { id: 'fenceTop', x: 4, y: 4, w: 172, h: 3 },
      { id: 'fenceBottomL', x: 4, y: 113, w: 78, h: 3 },
      { id: 'fenceBottomR', x: 98, y: 113, w: 78, h: 3 },
      { id: 'fenceLeft', x: 4, y: 4, w: 3, h: 112 },
      { id: 'fenceRight', x: 173, y: 4, w: 3, h: 112 },
      // Play props — solid, collidable.
      { id: 'handballWall', x: 78, y: 12, w: 24, h: 6 },
      { id: 'bleachers', x: 10, y: 46, w: 9, h: 30 },
      { id: 'picnic1', x: 118, y: 40, w: 11, h: 8 },
      { id: 'picnic2', x: 132, y: 50, w: 11, h: 8 },
      { id: 'picnic3', x: 120, y: 60, w: 11, h: 8 },
      { id: 'weightPlatform', x: 152, y: 88, w: 16, h: 12 },
      { id: 'phoneBankWall', x: 10, y: 90, w: 5, h: 20 },
    ];
    const gate = { x: 90, y: 115, r: 6 };
    const spawn = { x: 90, y: 106 };
    this._layoutCache = { worldW, worldH, props, gate, spawn };
    return this._layoutCache;
  }

  // ------------------------------------------------
  // THE YARD — lifecycle
  // ------------------------------------------------

  startYard() {
    this.stopLoop();
    this.hideOverlays();
    this.hideMinigameHuds();
    this.phase = 'yard';
    this.activeMinigame = null;

    if (!this.yard) {
      const layout = this.yardLayout();
      const ambient = [];
      for (let i = 0; i < 18; i++) {
        const x = 10 + Math.random() * (layout.worldW - 20);
        const y = 10 + Math.random() * (layout.worldH - 20);
        ambient.push({ x, y, tx: x, ty: y, speed: 0.12 + Math.random() * 0.1, pauseTimer: Math.random() * 120 });
      }
      this.yard = {
        px: layout.spawn.x, py: layout.spawn.y,
        tx: layout.spawn.x, ty: layout.spawn.y,
        speed: 0.9,
        camX: layout.spawn.x, camY: layout.spawn.y,
        camView: 90,
        ambient,
        pendingApproach: null,
        approachId: null,
      };
    }

    document.getElementById('jail-yard-hud').classList.remove('hidden');
    this.updateYardHud();
    this.yardLoop();
  }

  // Bound once in init(), never re-bound — each handler checks `this.phase`
  // itself (same idiom heist.js's floorClick/bindMazeInput use), so it's
  // safe for these to stay live across every phase transition without
  // stacking duplicate listeners on repeated trips back to the yard.
  _bindYardInput() {
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.yardClick(e.clientX - rect.left, e.clientY - rect.top);
    });

    this._yardKeyDir = { x: 0, y: 0 };
    const keyMap = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    window.addEventListener('keydown', (e) => {
      if (this.phase !== 'yard') return;
      const dir = keyMap[e.key.toLowerCase()];
      if (!dir) return;
      if (dir === 'up') this._yardKeyDir.y = -1;
      if (dir === 'down') this._yardKeyDir.y = 1;
      if (dir === 'left') this._yardKeyDir.x = -1;
      if (dir === 'right') this._yardKeyDir.x = 1;
    });
    window.addEventListener('keyup', (e) => {
      const dir = keyMap[e.key.toLowerCase()];
      if (!dir) return;
      if ((dir === 'up' && this._yardKeyDir.y < 0) || (dir === 'down' && this._yardKeyDir.y > 0)) this._yardKeyDir.y = 0;
      if ((dir === 'left' && this._yardKeyDir.x < 0) || (dir === 'right' && this._yardKeyDir.x > 0)) this._yardKeyDir.x = 0;
    });

    const approachBtn = document.getElementById('jail-yard-approach');
    if (approachBtn) {
      approachBtn.addEventListener('click', () => {
        if (this.phase !== 'yard' || !this.yard || !this.yard.approachId) return;
        this.enterConversation(this.yard.approachId);
      });
    }
  }

  yardBounds() {
    // Same square-side fix floorBounds() documents at length (heist.js)
    // — every distance check below is Math.hypot in raw logical units, so
    // the rendered rect has to actually be square or discovery/approach
    // radii stop matching what's drawn on a non-square screen.
    const W = this.canvas.width, H = this.canvas.height;
    const availW = W * 0.92, availH = H * 0.8;
    const side = Math.min(availW, availH);
    return { x: (W - side) / 2, y: H * 0.12 + (availH - side) / 2, w: side, h: side };
  }

  yardClick(px, py) {
    if (this.phase !== 'yard') return;
    const b = this.yardBounds();
    const view = this.yard.camView;
    const camMinX = this.yard.camX - view / 2, camMinY = this.yard.camY - view / 2;
    const x = camMinX + ((px - b.x) / b.w) * view;
    const y = camMinY + ((py - b.y) / b.h) * view;
    const layout = this.yardLayout();
    if (x < -10 || x > layout.worldW + 10 || y < -10 || y > layout.worldH + 10) return;

    // Tapping a discovered leader's dot walks you to them and auto-enters
    // conversation on arrival — as valid as walking up and using Talk to.
    const hit = JAIL_CHARACTERS.find(c => this.discovered[c.id] && Math.hypot(c.yard.x - x, c.yard.y - y) < 9);
    if (hit) {
      this.yard.tx = hit.yard.x; this.yard.ty = hit.yard.y;
      this.yard.pendingApproach = hit.id;
      return;
    }

    if (Math.hypot(layout.gate.x - x, layout.gate.y - y) < layout.gate.r + 3) {
      this.yard.tx = layout.gate.x; this.yard.ty = layout.gate.y;
      this.yard.pendingApproach = 'gate';
      return;
    }

    this.yard.tx = jailClamp(x, 6, layout.worldW - 6);
    this.yard.ty = jailClamp(y, 6, layout.worldH - 6);
    this.yard.pendingApproach = null;
  }

  yardPushOffProps(entity, r) {
    this.yardLayout().props.forEach(w => {
      const closestX = Math.max(w.x, Math.min(entity.x, w.x + w.w));
      const closestY = Math.max(w.y, Math.min(entity.y, w.y + w.h));
      const dx = entity.x - closestX, dy = entity.y - closestY;
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist < 0.0001) return;
      const push = r - dist;
      entity.x += (dx / dist) * push;
      entity.y += (dy / dist) * push;
    });
  }

  yardToast(text, ms) {
    const el = document.getElementById('jail-yard-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._yardToastTimer);
    this._yardToastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2400);
  }

  updateYardHud() {
    const strip = document.getElementById('jail-yard-friend-strip');
    if (!strip) return;
    JAIL_CHARACTERS.forEach(c => {
      let row = document.getElementById(`jail-yard-row-${c.id}`);
      if (!this.discovered[c.id]) {
        if (row) row.remove();
        return;
      }
      if (!row) {
        row = document.createElement('div');
        row.className = 'jail-yard-friend-row';
        row.id = `jail-yard-row-${c.id}`;
        row.innerHTML = `
          <div class="jail-yard-friend-dot" style="background:${c.color}"></div>
          <div class="jail-yard-friend-name">${c.name}</div>
          <div class="jail-yard-friend-bar"><div class="jail-yard-friend-bar-fill" id="jail-yard-bar-${c.id}"></div></div>
          <div class="jail-yard-friend-tier" id="jail-yard-tier-${c.id}"></div>
        `;
        strip.appendChild(row);
      }
      const val = this.friendship[c.id];
      const fill = document.getElementById(`jail-yard-bar-${c.id}`);
      if (fill) { fill.style.width = `${jailClamp(val, 0, 100)}%`; fill.style.background = c.color; }
      const tierEl = document.getElementById(`jail-yard-tier-${c.id}`);
      if (tierEl) tierEl.textContent = this.tierLabelFor(val);
    });
  }

  tierIndexFor(val) {
    let idx = 0;
    JAIL_TIERS.forEach((t, i) => { if (val >= t.min) idx = i; });
    return idx;
  }

  tierLabelFor(val) { return JAIL_TIERS[this.tierIndexFor(val)].label; }

  enterConversation(charId) {
    this.stopLoop();
    this.hideOverlays();
    this.phase = 'dialogue';
    document.getElementById('jail-yard-hud').classList.add('hidden');
    const approachBtn = document.getElementById('jail-yard-approach');
    if (approachBtn) approachBtn.classList.add('hidden');

    const char = JAIL_CHARACTERS.find(c => c.id === charId);
    const convoId = this.nextConvoFor(charId);
    if (!convoId) {
      this.showDialogue({
        title: char.name,
        speakerColor: char.color,
        body: ['[PLACEHOLDER: nothing new to say right now]'],
        choices: [{ label: 'Back to the yard', onClick: () => this.startYard() }],
      });
      return;
    }
    this.startConversation(charId, convoId);
  }

  approachGate() {
    const remaining = JAIL_CHARACTERS.filter(c => !this.minigameDone[c.id]);
    const lines = remaining.length
      ? [`[PLACEHOLDER — leaving early. Still on the table: ${remaining.map(c => c.name).join(', ')}.]`]
      : ['[PLACEHOLDER — nothing left on the table, this exit is clean.]'];
    this.stopLoop();
    this.phase = 'dialogue';
    this.showDialogue({
      title: 'The gate',
      sub: remaining.length ? 'You can still turn back' : 'All clear',
      body: lines,
      choices: [
        { label: 'Back to the yard', onClick: () => this.startYard() },
        { label: 'Leave for good', onClick: () => this.showSummary() },
      ],
    });
  }

  yardLoop() {
    if (this.phase !== 'yard') return;
    this._frame++;
    const y = this.yard;
    const layout = this.yardLayout();

    if (this._yardKeyDir.x || this._yardKeyDir.y) {
      y.tx = jailClamp(y.px + this._yardKeyDir.x * 14, 6, layout.worldW - 6);
      y.ty = jailClamp(y.py + this._yardKeyDir.y * 14, 6, layout.worldH - 6);
    }

    {
      const dx = y.tx - y.px, dy = y.ty - y.py;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.4) {
        y.px += (dx / dist) * Math.min(y.speed, dist);
        y.py += (dy / dist) * Math.min(y.speed, dist);
      } else if (y.pendingApproach) {
        const pending = y.pendingApproach;
        y.pendingApproach = null;
        if (pending === 'gate') { this.approachGate(); return; }
        this.enterConversation(pending);
        return;
      }
      this.yardPushOffProps(y, 2.4);
    }

    y.ambient.forEach(a => {
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        a.x += (dx / dist) * Math.min(a.speed, dist);
        a.y += (dy / dist) * Math.min(a.speed, dist);
      } else if (a.pauseTimer > 0) {
        a.pauseTimer--;
      } else {
        a.tx = 10 + Math.random() * (layout.worldW - 20);
        a.ty = 10 + Math.random() * (layout.worldH - 20);
        a.pauseTimer = 60 + Math.random() * 180;
      }
      this.yardPushOffProps(a, 2);
    });

    {
      const view = y.camView;
      y.camX = Math.max(view / 2, Math.min(layout.worldW - view / 2, y.px));
      y.camY = Math.max(view / 2, Math.min(layout.worldH - view / 2, y.py));
    }

    this._updateDiscoveryAndApproach();
    this._checkYardFlavor();

    this.updateYardHud();
    this.drawYardScene();
    this._af = requestAnimationFrame(() => this.yardLoop());
  }

  // Three-radius discovery read, all in world units (see
  // JAIL_REDESIGN_PLAN.md §3): >26 cluster-only, <=26 discover (name +
  // toast, once), <=9 approach (pulsing ring + Talk to button).
  _updateDiscoveryAndApproach() {
    const y = this.yard;
    let nearestApproach = null, nearestDist = Infinity;
    JAIL_CHARACTERS.forEach(c => {
      const d = Math.hypot(c.yard.x - y.px, c.yard.y - y.py);
      if (d <= 26 && !this.discovered[c.id]) {
        this.discovered[c.id] = true;
        this.discoverFrame[c.id] = this._frame;
        this.yardToast(`${c.discoverToast}`, 3200);
        this.updateYardHud();
      }
      if (this.discovered[c.id] && d <= 9 && d < nearestDist) {
        nearestDist = d;
        nearestApproach = c.id;
      }
    });
    y.approachId = nearestApproach;
    const btn = document.getElementById('jail-yard-approach');
    if (btn) {
      if (nearestApproach) {
        const c = JAIL_CHARACTERS.find(x => x.id === nearestApproach);
        btn.textContent = `Talk to ${c.name}`;
        btn.classList.remove('hidden');
        btn.style.borderColor = c.color;
        btn.style.color = c.color;
      } else {
        btn.classList.add('hidden');
      }
    }
  }

  _checkYardFlavor() {
    const y = this.yard;
    JAIL_YARD_FLAVOR.forEach(f => {
      if (this._flavorSeen.has(f.id)) return;
      const d = Math.hypot(f.x - y.px, f.y - y.py);
      if (d <= f.r + 3) {
        this._flavorSeen.add(f.id);
        if (f.setsFlag) this.flags.add(f.setsFlag);
        this.yardToast(`${f.title} — ${f.lines[0]}`, 2800);
      }
    });
  }

  // ------------------------------------------------
  // YARD RENDERING
  // ------------------------------------------------

  drawYardScene() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const b = this.yardBounds();
    const y = this.yard;
    const layout = this.yardLayout();
    const view = y.camView;
    const camMinX = y.camX - view / 2, camMinY = y.camY - view / 2;
    const toPx = (x, yy) => [b.x + ((x - camMinX) / view) * b.w, b.y + ((yy - camMinY) / view) * b.h];
    const toPxLen = (v) => (v / view) * b.w;
    const margin = 10;
    const visible = (x, yy) => x > camMinX - margin && x < camMinX + view + margin && yy > camMinY - margin && yy < camMinY + view + margin;

    ctx.fillStyle = '#08090a';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();

    const grd = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    grd.addColorStop(0, '#28282c'); grd.addColorStop(1, '#1a1a1e');
    ctx.fillStyle = grd;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    for (let gx = 0; gx <= layout.worldW; gx += 12) {
      const [px] = toPx(gx, 0);
      if (px < b.x - 2 || px > b.x + b.w + 2) continue;
      ctx.beginPath(); ctx.moveTo(px, b.y); ctx.lineTo(px, b.y + b.h); ctx.stroke();
    }

    // Turf tint discs — always visible, this is the "something is
    // happening there" long-range read that draws you toward a cluster
    // before you're anywhere near discovery range.
    JAIL_CHARACTERS.forEach(c => {
      if (!visible(c.yard.x, c.yard.y)) return;
      const [cx, cy] = toPx(c.yard.x, c.yard.y);
      const r = toPxLen(c.yard.turfR);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, jailAlpha(c.color, 0.15));
      g.addColorStop(1, jailAlpha(c.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    });

    layout.props.forEach(p => {
      if (!visible(p.x + p.w / 2, p.y + p.h / 2)) return;
      const [px, py] = toPx(p.x, p.y);
      const pw = toPxLen(p.w), ph = toPxLen(p.h);
      const isFence = p.id.startsWith('fence');
      if (isFence) {
        ctx.strokeStyle = 'rgba(200,205,210,0.4)'; ctx.lineWidth = 1;
        for (let t = 0; t < pw + ph; t += 6) {
          ctx.beginPath();
          ctx.moveTo(px + Math.min(t, pw), py + Math.max(0, t - pw));
          ctx.lineTo(px + Math.max(0, t - ph), py + Math.min(t, ph));
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#3a3833';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = '#1e1c18'; ctx.lineWidth = 2;
        ctx.strokeRect(px, py, pw, ph);
      }
    });

    if (visible(layout.gate.x, layout.gate.y)) {
      const [gx, gy] = toPx(layout.gate.x, layout.gate.y);
      const pulse = 0.5 + Math.sin(this._frame * 0.05) * 0.3;
      ctx.save();
      ctx.shadowColor = '#d4a574'; ctx.shadowBlur = 10 * pulse;
      ctx.strokeStyle = '#d4a574'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(gx, gy, toPxLen(layout.gate.r), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(212,165,116,0.8)';
      ctx.font = '11px VT323, monospace'; ctx.textAlign = 'center';
      ctx.fillText('GATE', gx, gy - toPxLen(layout.gate.r) - 6);
    }

    JAIL_YARD_FLAVOR.forEach(f => {
      if (!visible(f.x, f.y)) return;
      const [fx, fy] = toPx(f.x, f.y);
      const seen = this._flavorSeen.has(f.id);
      ctx.beginPath(); ctx.arc(fx, fy, toPxLen(f.r) * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = seen ? 'rgba(212,165,116,0.22)' : 'rgba(212,165,116,0.6)';
      ctx.fill();
    });

    y.ambient.forEach(a => {
      if (!visible(a.x, a.y)) return;
      const [ax, ay] = toPx(a.x, a.y);
      ctx.beginPath(); ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#6b6157';
      ctx.fill();
    });

    // Leader clusters — entourage satellites idling around a colored core
    // dot; this whole cluster is the "signal against the grey noise" the
    // discovery system leans on.
    JAIL_CHARACTERS.forEach(c => {
      if (!visible(c.yard.x, c.yard.y)) return;
      const [cx, cy] = toPx(c.yard.x, c.yard.y);
      const disc = this.discovered[c.id];

      for (let i = 0; i < c.yard.entourage; i++) {
        const a = (i / c.yard.entourage) * Math.PI * 2 + this._frame * 0.006;
        const rr = toPxLen(9 + Math.sin(this._frame * 0.03 + i) * 1.5);
        const sx = cx + Math.cos(a) * rr, sy = cy + Math.sin(a) * rr * 0.6;
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = jailAlpha(c.color, 0.45);
        ctx.fill();
      }

      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();

      if (disc) {
        const df = this.discoverFrame[c.id] != null ? this.discoverFrame[c.id] : 0;
        const alpha = jailClamp((this._frame - df) / 20, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px VT323, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(c.name.toUpperCase(), cx, cy - 18);
        ctx.fillStyle = jailAlpha(c.color, 0.95);
        ctx.font = '10px VT323, monospace';
        ctx.fillText(this.tierLabelFor(this.friendship[c.id]), cx, cy - 6);
        ctx.restore();
      }

      if (y.approachId === c.id) {
        const pulse = 12 + Math.sin(this._frame * 0.15) * 3;
        ctx.beginPath(); ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px VT323, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TALK', cx, cy - 30);
      }
    });

    {
      const [px, py] = toPx(y.px, y.py);
      const moving = Math.hypot(y.tx - y.px, y.ty - y.py) > 1;
      if (moving) {
        const [tx, ty] = toPx(y.tx, y.ty);
        ctx.strokeStyle = 'rgba(212,165,116,0.5)';
        ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#d4a574';
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }

    ctx.restore();
  }

  // ------------------------------------------------
  // DIALOGUE ENGINE
  // ------------------------------------------------

  nextConvoFor(charId) {
    const convos = JAIL_DIALOGUE[charId] || [];
    for (const convo of convos) {
      if (this.convosDone[charId].has(convo.id)) continue;
      if (this.checkRequires(convo.requires, charId)) return convo.id;
    }
    return null;
  }

  startConversation(charId, convoId) {
    const convos = JAIL_DIALOGUE[charId] || [];
    const convo = convos.find(c => c.id === convoId);
    if (!convo) { this.startYard(); return; }
    const resume = this.convoResume[charId] && this.convoResume[charId][convoId];
    this.activeConvo = { charId, convoId, nodeId: resume || convo.start };
    this.renderNode();
  }

  renderNode() {
    const { charId, convoId } = this.activeConvo;
    const char = JAIL_CHARACTERS.find(c => c.id === charId);
    const convo = (JAIL_DIALOGUE[charId] || []).find(c => c.id === convoId);
    let node = convo.nodes[this.activeConvo.nodeId];
    if (!node) {
      console.error(`[jail] missing node "${this.activeConvo.nodeId}" in ${charId}/${convoId}`);
      this.startYard();
      return;
    }

    if (node.requires && !this.checkRequires(node.requires, charId) && node.altNode) {
      const alt = convo.nodes[node.altNode];
      if (!alt) { console.error(`[jail] missing altNode "${node.altNode}" in ${charId}/${convoId}`); this.startYard(); return; }
      node = alt;
    }

    const speaker = node.speaker || 'narrator';
    const title = node.title || (speaker === 'narrator' ? '' : speaker === 'player' ? (this.gameState.playerName || 'You') : char.name);
    const speakerColor = speaker === 'narrator' ? null : speaker === 'player' ? '#d4a574' : char.color;
    const lines = Array.isArray(node.lines) ? node.lines : (node.lines ? [node.lines] : []);

    if (node.end) {
      const label = node.end.label || (node.end.minigame ? 'Continue' : 'Back to the yard');
      this.showDialogue({
        title, sub: node.sub, body: lines, speakerColor,
        choices: [{ label, onClick: () => this.endConversation(node.end) }],
      });
      return;
    }

    let choices;
    if (node.choices && node.choices.length) {
      choices = node.choices.map(c => {
        const passes = !c.requires || this.checkRequires(c.requires, charId);
        if (!passes) return c.lockedLabel ? { label: c.lockedLabel, locked: true } : null;
        return { label: c.label, onClick: () => this.chooseOption(c) };
      }).filter(Boolean);
    } else {
      choices = [{ label: 'Continue', onClick: () => this.advanceNode(node.next) }];
    }

    // Leave button — guaranteed at the true root of the conversation
    // (`convo.start`), only where the author opts in with `canLeave` past
    // that. Never a trap: the root always has a way out.
    const isRoot = this.activeConvo.nodeId === convo.start;
    const canLeave = isRoot ? (node.canLeave !== false) : (node.canLeave === true);
    if (canLeave) choices = choices.concat([{ label: 'Walk away', onClick: () => this.abandonConversation() }]);

    this.showDialogue({ title, sub: node.sub, body: lines, speakerColor, choices });
  }

  chooseOption(choice) {
    const { charId } = this.activeConvo;
    if (choice.effects) this.applyEffects(choice.effects, charId);
    this.advanceNode(choice.next);
  }

  advanceNode(nextId) {
    if (!nextId) { console.error('[jail] a node/choice had neither `next` nor `end`'); this.startYard(); return; }
    this.activeConvo.nodeId = nextId;
    this.renderNode();
  }

  abandonConversation() {
    const { charId, convoId, nodeId } = this.activeConvo;
    this.convoResume[charId] = this.convoResume[charId] || {};
    this.convoResume[charId][convoId] = nodeId;
    this.activeConvo = null;
    this.startYard();
  }

  endConversation(end) {
    const { charId, convoId } = this.activeConvo;
    this.convosDone[charId].add(convoId);
    if (this.convoResume[charId]) delete this.convoResume[charId][convoId];
    this.activeConvo = null;

    if (end.minigame) { this.launchMinigame(charId); return; }
    this.startYard();
  }

  checkRequires(cond, charId) {
    if (!cond) return true;
    if (cond.flag && !this.flags.has(cond.flag)) return false;
    if (cond.flags && !cond.flags.every(f => this.flags.has(f))) return false;
    if (cond.notFlag && this.flags.has(cond.notFlag)) return false;
    if (cond.notFlags && cond.notFlags.some(f => this.flags.has(f))) return false;
    if (cond.friendshipAtLeast != null && this.friendship[charId] < cond.friendshipAtLeast) return false;
    if (cond.friendshipBelow != null && this.friendship[charId] >= cond.friendshipBelow) return false;
    if (cond.otherFriendship) {
      for (const id of Object.keys(cond.otherFriendship)) {
        if ((this.friendship[id] || 0) < cond.otherFriendship[id]) return false;
      }
    }
    if (cond.minigameDone != null && this.minigameDone[charId] !== cond.minigameDone) return false;
    if (cond.lastGrade && !cond.lastGrade.includes(this.lastGrade[charId])) return false;
    if (cond.convoDone && !this.convosDone[charId].has(cond.convoDone)) return false;
    return true;
  }

  applyEffects(fx, charId) {
    if (!fx) return;
    if (fx.friendship) {
      this.friendship[charId] = jailClamp(this.friendship[charId] + fx.friendship, 0, 100);
      this._flashPip(fx.friendship);
    }
    if (fx.friendshipOther) {
      Object.keys(fx.friendshipOther).forEach(id => {
        if (this.friendship[id] == null) return;
        this.friendship[id] = jailClamp(this.friendship[id] + fx.friendshipOther[id], 0, 100);
      });
    }
    if (fx.flags) fx.flags.forEach(f => this.flags.add(f));
    if (fx.clearFlags) fx.clearFlags.forEach(f => this.flags.delete(f));
    if (fx.aura != null) this.gameState.aura = Math.max(0, Math.min(100, (this.gameState.aura || 0) + fx.aura));
    this.updateYardHud();
  }

  // ------------------------------------------------
  // MINI-GAME LAUNCH / RESULT
  // ------------------------------------------------

  launchMinigame(charId) {
    this.stopLoop();
    this.hideOverlays();
    document.getElementById('jail-yard-hud').classList.add('hidden');
    this.phase = 'minigame';
    const char = JAIL_CHARACTERS.find(c => c.id === charId);
    const onDone = (result) => this.onMinigameResult(charId, result);
    if (char.minigame === 'rhythm') this.activeMinigame = new JailRhythmGame(this, charId, onDone);
    else if (char.minigame === 'bench') this.activeMinigame = new JailBenchGame(this, charId, onDone);
    else if (char.minigame === 'trip') this.activeMinigame = new JailTripGame(this, charId, onDone);
  }

  // "The best run counts, not the latest" — friendship only moves up by
  // the *improvement* over the previous best, so replaying never costs
  // anything and a rough first attempt at a brand-new mechanic can't
  // permanently cap a friendship track.
  onMinigameResult(charId, result) {
    this.activeMinigame = null;
    const prevBest = this.miniBestGain[charId] || 0;
    if (result.friendshipGain > prevBest) {
      this.friendship[charId] = jailClamp(this.friendship[charId] + (result.friendshipGain - prevBest), 0, 100);
      this.miniBestGain[charId] = result.friendshipGain;
    }
    this.minigameDone[charId] = true;
    this.lastGrade[charId] = result.grade;
    this.lastDetail[charId] = result.detail;

    if (charId === 'sbf' && result.detail && result.detail.rescued) this.flags.add('sbf_rescued_caroline');

    this.showResultPanel(charId, result, prevBest);
  }

  showResultPanel(charId, result, prevBest) {
    this.phase = 'result';
    const char = JAIL_CHARACTERS.find(c => c.id === charId);
    const bestNow = Math.max(prevBest, result.friendshipGain);
    document.getElementById('jail-result-title').textContent = `Result — ${char.name}`;
    document.getElementById('jail-result-sub').textContent = result.friendshipGain > prevBest
      ? `New best run: +${result.friendshipGain} friendship`
      : `This run: +${result.friendshipGain} friendship (best run so far: +${bestNow} — best counts, not latest)`;

    const statsEl = document.getElementById('jail-result-stats');
    statsEl.innerHTML = '';
    result.stats.forEach(([label, value]) => {
      const p = document.createElement('p');
      p.className = 'cannon-stat';
      p.textContent = `${label}: ${value}`;
      statsEl.appendChild(p);
    });

    document.getElementById('jail-result-again').onclick = () => this.launchMinigame(charId);
    document.getElementById('jail-result-continue').onclick = () => this.enterConversation(charId);

    this.showOverlay('jail-result');
  }

  // ------------------------------------------------
  // RELEASE-DAY SUMMARY
  // ------------------------------------------------

  showSummary() {
    this.phase = 'summary';
    this.stopLoop();
    this.hideOverlays();
    document.getElementById('jail-yard-hud').classList.add('hidden');

    const rows = JAIL_CHARACTERS.map(c => {
      const val = this.friendship[c.id];
      const tierIdx = this.tierIndexFor(val);
      return { c, val, tierIdx, text: JAIL_OUTCOMES.perCharacter[c.id][tierIdx] };
    });
    const friendCount = rows.filter(r => r.tierIdx >= 3).length;

    const listEl = document.getElementById('jail-summary-list');
    listEl.innerHTML = '';
    rows.forEach(r => {
      const div = document.createElement('div');
      div.className = 'jail-summary-row';
      const head = document.createElement('div');
      head.className = 'jail-summary-row-head';
      head.innerHTML = `<span class="jail-summary-dot" style="background:${r.c.color}"></span>
        <span class="jail-summary-name">${r.c.name}</span>
        <span class="jail-summary-tier" style="color:${r.c.color}">${JAIL_TIERS[r.tierIdx].label}</span>`;
      const p = document.createElement('p');
      p.className = 'heist-narration';
      p.textContent = r.text;
      div.appendChild(head);
      div.appendChild(p);
      listEl.appendChild(div);
    });

    document.getElementById('jail-summary-release').textContent = JAIL_OUTCOMES.release[friendCount];
    document.getElementById('jail-summary-continue').onclick = () => this.finish(rows, friendCount);

    this.showOverlay('jail-summary');
  }

  finish(rows, friendCount) {
    this.phase = 'done';
    this.stopLoop();
    this.hideOverlays();
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);

    const nycFriends = rows.filter(r => r.tierIdx >= 3).map(r => r.c.id);
    this.onComplete({
      jailFriendship: { ...this.friendship },
      jailFlags: Array.from(this.flags),
      nycFriends,
      jailFriendCount: friendCount,
      jailDone: true,
      jailWon: friendCount === 3,
      jailPath: null, // dead field, kept only so old saves still load cleanly
    });
  }
}

let jailGame = null;

// ------------------------------------------------
// AUTHORING SAFETY NET
// ------------------------------------------------
// Walks every character -> conversation -> node in JAIL_DIALOGUE and
// console-errors on anything that would silently dead-end a playthrough:
// a next/start/altNode pointing at a missing id, a node with none of
// choices/next/end, a node unreachable from its conversation's start, a
// conversation with no reachable terminal, or a friendshipOther naming an
// unknown character. Runs once when JailGame is constructed; also callable
// from the console any time as `validateJailDialogue()`.
function validateJailDialogue() {
  let errors = 0;
  const err = (msg) => { console.error(`[jail-data] ${msg}`); errors++; };

  JAIL_CHARACTERS.forEach(char => {
    const convos = JAIL_DIALOGUE[char.id];
    if (!convos || !convos.length) { err(`${char.id}: no JAIL_DIALOGUE entries`); return; }

    convos.forEach(convo => {
      if (!convo.nodes || !convo.nodes[convo.start]) {
        err(`${char.id}/${convo.id}: start node "${convo.start}" is missing`);
        return;
      }
      const nodeIds = Object.keys(convo.nodes);
      const reachable = new Set();
      const toVisit = [convo.start];
      let hasTerminal = false;

      const checkTarget = (from, field, target) => {
        if (target && !convo.nodes[target]) err(`${char.id}/${convo.id}/${from}: ${field} points at missing node "${target}"`);
      };

      while (toVisit.length) {
        const id = toVisit.pop();
        if (reachable.has(id) || !convo.nodes[id]) continue;
        reachable.add(id);
        const node = convo.nodes[id];

        const hasChoices = node.choices && node.choices.length;
        const hasNext = !!node.next;
        const hasEnd = !!node.end;
        if (!hasChoices && !hasNext && !hasEnd) err(`${char.id}/${convo.id}/${id}: node has neither choices, next, nor end`);
        if (hasEnd) hasTerminal = true;

        if (node.altNode) { checkTarget(id, 'altNode', node.altNode); toVisit.push(node.altNode); }
        if (hasNext) { checkTarget(id, 'next', node.next); toVisit.push(node.next); }
        if (hasChoices) {
          node.choices.forEach((c, i) => {
            if (!c.next && !c.end) err(`${char.id}/${convo.id}/${id}: choice ${i} ("${c.label}") has no next`);
            if (c.next) { checkTarget(id, `choice ${i} next`, c.next); toVisit.push(c.next); }
            if (c.effects && c.effects.friendshipOther) {
              Object.keys(c.effects.friendshipOther).forEach(otherId => {
                if (!JAIL_CHARACTERS.some(ch => ch.id === otherId)) {
                  err(`${char.id}/${convo.id}/${id}: choice ${i} friendshipOther names unknown character "${otherId}"`);
                }
              });
            }
          });
        }
      }

      nodeIds.forEach(id => { if (!reachable.has(id)) err(`${char.id}/${convo.id}: node "${id}" is unreachable from "${convo.start}"`); });
      if (!hasTerminal) err(`${char.id}/${convo.id}: no reachable terminal (end) node`);
    });
  });

  if (errors === 0) console.log('[jail-data] validateJailDialogue: OK, no issues found.');
  else console.error(`[jail-data] validateJailDialogue: ${errors} issue(s) found — see above.`);
  return errors;
}
window.validateJailDialogue = validateJailDialogue;
