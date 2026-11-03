/**
 * THE JAIL — "X IS NOW YOUR FRIEND" celebration
 * ===============================================
 *
 *   new JailFriendScreen(host, charId, friendCount, onDone)
 *
 * Plays on the jail canvas the first time a leader's mini-game is
 * finished (making three friends is how the jail is won). You and the
 * new friend bounce together, arms over shoulders, grinning, under
 * confetti. Tap to continue -> onDone(). Text is functional UI labels.
 */

const JAIL_FRIEND_LOOKS = {
  player: { shirt: '#f2f2f2', pants: '#4a5060', skin: '#e8b48a', hair: '#3a2a1e', tank: true, headband: '#ff3d9a' },
  mangione: { shirt: '#7ec89a', pants: '#2d3a4a', skin: '#ecbc94', hair: '#24160c', tank: true, brows: true },
  sbf: { shirt: '#6ab0d8', pants: '#8a7a5a', skin: '#f0c9a0', hair: '#3a2414', curls: true, shorts: true },
  diddy: { shirt: '#24202a', pants: '#18141c', skin: '#7a4a30', hair: '#141010', shades: true, chain: true, sleeves: true },
};

class JailFriendScreen {
  constructor(host, charId, friendCount, onDone) {
    this.host = host;
    this.charId = charId;
    this.count = friendCount;
    this.onDone = onDone;
    this.char = JAIL_CHARACTERS.find(c => c.id === charId);
    this.name = (this.char.shortName || charId).toUpperCase();
    this.canvas = host.canvas;
    this.ctx = host.ctx;
    this.t = 0;
    this.done = false;
    this.confetti = [];
    const colors = ['#f4c542', '#ff3d9a', '#7ec89a', '#6ab0d8', '#c86ab0', '#ffffff'];
    for (let i = 0; i < 140; i++) this.confetti.push(this._piece(colors, true));
    this.colors = colors;

    this._tapH = (e) => {
      e.preventDefault();
      if (this.t > 1.2) this._finish();
    };
    this._touchH = (e) => { e.preventDefault(); if (this.t > 1.2) this._finish(); };
    this._ptrH = (e) => { if (e.pointerType === 'touch') return; this._tapH(e); };
    this._keyH = (e) => { if (e.code === 'Space' || e.code === 'Enter') this._tapH(e); };
    this.canvas.addEventListener('touchstart', this._touchH, { passive: false });
    this.canvas.addEventListener('pointerdown', this._ptrH);
    window.addEventListener('keydown', this._keyH);

    this.last = performance.now();
    this._loop();
  }

  _piece(colors, anywhere) {
    return {
      x: Math.random(), y: anywhere ? -Math.random() * 1.2 : -0.05 - Math.random() * 0.1,
      vy: 0.12 + Math.random() * 0.18, vx: (Math.random() - 0.5) * 0.06,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  }

  _loop() {
    if (this.done) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.confetti.forEach((p, i) => {
      p.y += p.vy * dt; p.x += p.vx * dt + Math.sin(this.t * 3 + i) * 0.0006; p.rot += p.vr * dt;
      if (p.y > 1.05) this.confetti[i] = this._piece(this.colors, false);
    });
    this._draw();
    this._af = requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const W = rect.width || window.innerWidth, H = rect.height || window.innerHeight;
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const u = Math.min(W / 420, H / 760);
    const VW = W / u, VH = H / u, cx = VW / 2;
    const ctx = this.ctx, t = this.t;
    ctx.setTransform(dpr * u, 0, 0, dpr * u, 0, 0);

    // Backdrop: friend's color burst with spinning rays.
    const bg = ctx.createRadialGradient(cx, VH * 0.55, 20, cx, VH * 0.55, Math.max(VW, VH) * 0.8);
    bg.addColorStop(0, jailShade(this.char.color, 25)); bg.addColorStop(0.5, jailShade(this.char.color, -25)); bg.addColorStop(1, '#140c18');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.translate(cx, VH * 0.55); ctx.rotate(t * 0.35);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    const R = Math.max(VW, VH);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a + 0.2) * R, Math.sin(a + 0.2) * R); ctx.fill();
    }
    ctx.restore();

    // The two of you, bouncing in sync.
    const intro = Math.min(1, t / 0.5);
    const ease = 1 - Math.pow(1 - intro, 3);
    const bounce = -Math.abs(Math.sin(t * 5.5)) * 26 * ease;
    const groundY = VH * 0.7;
    const s = Math.min(1.7, VW / 260);
    const gap = 46 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, groundY + 4, 120 * s * 0.8, 12 * s, 0, 0, Math.PI * 2); ctx.fill();
    const lx = cx - gap - (1 - ease) * VW * 0.6, rx = cx + gap + (1 - ease) * VW * 0.6;
    const friendLook = JAIL_FRIEND_LOOKS[this.charId] || { ...JAIL_FRIEND_LOOKS.player, shirt: this.char.color, headband: null };
    // Friend's arm goes behind you; yours goes over their shoulders.
    this._hugArm(rx, groundY + bounce, s, -1, friendLook, lx);
    this._buddy(lx, groundY + bounce, s, 1, JAIL_FRIEND_LOOKS.player, t, 0);
    this._buddy(rx, groundY + bounce, s, -1, friendLook, t, 1.3);
    this._hugArm(lx, groundY + bounce, s, 1, JAIL_FRIEND_LOOKS.player, rx);

    // Hearts drifting up between you.
    for (let i = 0; i < 5; i++) {
      const p = ((t * 0.5 + i / 5) % 1);
      const hx = cx + Math.sin((t + i) * 2) * 30 * s, hy = groundY - 170 * s - p * 110;
      ctx.globalAlpha = Math.sin(p * Math.PI) * ease;
      this._heart(hx, hy, 9 + 6 * (1 - p), '#ff3d6a');
    }
    ctx.globalAlpha = 1;

    // Confetti.
    this.confetti.forEach(p => {
      ctx.save();
      ctx.translate(p.x * VW, p.y * VH); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    // Headline.
    const pop = t < 0.35 ? 0.3 + 0.7 * (t / 0.35) * 1.15 : 1 + 0.035 * Math.sin(t * 7);
    const jx = (Math.random() - 0.5) * (t < 0.8 ? 6 : 1.5), jy = (Math.random() - 0.5) * (t < 0.8 ? 6 : 1.5);
    ctx.save();
    ctx.translate(cx + jx, VH * 0.13 + jy); ctx.scale(pop, pop); ctx.rotate(Math.sin(t * 3) * 0.03);
    this._text(this.name, 0, 0, this._fit(this.name, 92, VW - 30), '#ffffff', this.char.color);
    ctx.restore();
    ctx.save();
    ctx.translate(cx, VH * 0.13 + 70); ctx.scale(pop, pop);
    this._text('IS NOW YOUR FRIEND', 0, 0, this._fit('IS NOW YOUR FRIEND', 46, VW - 24), '#f4c542', '#1a1010');
    ctx.restore();

    // Friend count.
    const fy = groundY + 70;
    const slots = JAIL_CHARACTERS.length;
    for (let i = 0; i < slots; i++) {
      const sx = cx + (i - (slots - 1) / 2) * 58;
      const filled = i < this.count;
      const justNow = i === this.count - 1;
      const sc = justNow ? 1 + 0.25 * Math.max(0, Math.sin(Math.min(1, t / 0.8) * Math.PI)) + 0.06 * Math.sin(t * 6) : 1;
      ctx.save(); ctx.translate(sx, fy); ctx.scale(sc, sc);
      if (filled) this._heart(0, 0, 22, justNow ? '#ff3d6a' : '#e85a7a');
      else { ctx.globalAlpha = 0.35; this._heart(0, 0, 22, '#ffffff'); ctx.globalAlpha = 1; }
      ctx.restore();
    }
    const countLine = `(${this.count}/${slots} FRIENDS IN NYC ACHIEVED)`;
    this._text(countLine, cx, fy + 50, this._fit(countLine, 28, VW - 24), '#ffffff', '#1a1010');
    if (t > 1.2) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
      this._text('TAP TO CONTINUE', cx, fy + 100, 24, '#ffffff', '#1a1010');
      ctx.globalAlpha = 1;
    }
  }

  _fit(text, size, maxW) {
    this.ctx.font = `bold ${size}px VT323, monospace`;
    const w = this.ctx.measureText(text).width;
    return w > maxW ? Math.floor(size * maxW / w) : size;
  }

  _text(text, x, y, size, fill, stroke) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px VT323, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(4, size * 0.14);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }

  _heart(x, y, r, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.8);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.8, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.8, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.8);
    ctx.fill();
  }

  // Arm from this buddy's inner shoulder across to the partner's far shoulder.
  _hugArm(x, y, s, inner, look, partnerX) {
    const ctx = this.ctx;
    const sx = x + inner * 15 * s, sy = y - 96 * s;
    const ex = partnerX + inner * 14 * s, ey = y - 98 * s;
    ctx.strokeStyle = look.sleeves ? look.shirt : look.skin;
    ctx.lineCap = 'round'; ctx.lineWidth = 11 * s;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + ex) / 2, sy - 16 * s, ex, ey); ctx.stroke();
    ctx.fillStyle = look.skin;
    ctx.beginPath(); ctx.arc(ex, ey, 6.5 * s, 0, Math.PI * 2); ctx.fill();
  }

  // Front-facing, grinning. `inner` = which side the partner is on.
  _buddy(x, y, s, inner, o, t, phase) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.rotate(inner * 0.06);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Legs.
    ctx.fillStyle = o.pants;
    ctx.fillRect(-15, -52, 12, o.shorts ? 26 : 50); ctx.fillRect(3, -52, 12, o.shorts ? 26 : 50);
    if (o.shorts) {
      ctx.fillStyle = o.skin; ctx.fillRect(-13, -26, 8, 22); ctx.fillRect(5, -26, 8, 22);
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-13, -12, 8, 9); ctx.fillRect(5, -12, 8, 9);
    }
    ctx.fillStyle = '#1a1410';
    ctx.beginPath(); ctx.ellipse(-10, -2, 10, 5, 0, 0, Math.PI * 2); ctx.ellipse(10, -2, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Outer arm pumping.
    const outer = -inner;
    const wave = Math.sin(t * 9 + phase) * 0.35;
    const a = -Math.PI / 2 + outer * (0.55 + wave);
    const shx = outer * 17, shy = -96;
    const elx = shx + Math.cos(a) * 20 + outer * 6, ely = shy + Math.sin(a) * 20 + 4;
    const hx = elx + Math.cos(a - outer * 0.25) * 22, hy = ely + Math.sin(a - outer * 0.25) * 22;
    ctx.strokeStyle = o.sleeves ? o.shirt : o.skin; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(elx, ely); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = o.skin; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
    // Torso.
    ctx.fillStyle = o.shirt;
    jailRoundRectPath(ctx, -20, -104, 40, 58, 10); ctx.fill();
    if (o.tank) {
      ctx.fillStyle = o.skin;
      ctx.beginPath(); ctx.moveTo(-8, -104); ctx.quadraticCurveTo(0, -92, 8, -104); ctx.fill();
    }
    ctx.fillStyle = jailShade(o.pants, -10); ctx.fillRect(-20, -54, 40, 7);
    if (o.chain) {
      ctx.strokeStyle = '#f4c542'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -100, 12, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.arc(0, -86, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Head.
    const hyH = -128;
    if (o.curls) {
      ctx.fillStyle = o.hair;
      for (let i = 0; i < 16; i++) {
        const ang = Math.PI * (0.92 + i / 15 * 1.16);
        ctx.beginPath(); ctx.arc(Math.cos(ang) * 22, hyH + Math.sin(ang) * 22 - 2, 9 + (i % 3) * 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = o.skin;
    ctx.beginPath(); ctx.arc(0, hyH, 21, 0, Math.PI * 2); ctx.fill();
    if (o.hair && !o.curls) {
      ctx.fillStyle = o.hair;
      ctx.beginPath(); ctx.arc(0, hyH - 3, 21.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      if (o.brows) { ctx.beginPath(); ctx.ellipse(-6, hyH - 20, 16, 7, -0.3, 0, Math.PI * 2); ctx.fill(); }
    }
    if (o.headband) { ctx.fillStyle = o.headband; ctx.fillRect(-21, hyH - 13, 42, 6); }
    // Happy closed eyes (or shades), brows, blush, big grin.
    ctx.strokeStyle = '#1a1010'; ctx.lineWidth = 2.6;
    if (o.shades) {
      ctx.fillStyle = '#111';
      jailRoundRectPath(ctx, -17, hyH - 7, 14, 9, 3); ctx.fill();
      jailRoundRectPath(ctx, 3, hyH - 7, 14, 9, 3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3, hyH - 4); ctx.lineTo(3, hyH - 4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-14, hyH - 6, 4, 2); ctx.fillRect(6, hyH - 6, 4, 2);
    } else {
      ctx.beginPath(); ctx.arc(-8, hyH - 2, 4.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(8, hyH - 2, 4.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
    if (o.brows) {
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(-13, hyH - 11); ctx.lineTo(-4, hyH - 12); ctx.moveTo(4, hyH - 12); ctx.lineTo(13, hyH - 11); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,90,120,0.35)';
    ctx.beginPath(); ctx.arc(-13, hyH + 5, 4, 0, Math.PI * 2); ctx.arc(13, hyH + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a1a1a';
    ctx.beginPath(); ctx.moveTo(-11, hyH + 4); ctx.quadraticCurveTo(0, hyH + 22, 11, hyH + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-8, hyH + 4, 16, 4);
    ctx.restore();
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    if (this._af) cancelAnimationFrame(this._af);
    this.canvas.removeEventListener('touchstart', this._touchH);
    this.canvas.removeEventListener('pointerdown', this._ptrH);
    window.removeEventListener('keydown', this._keyH);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.host.resize();
    this.onDone();
  }
}
