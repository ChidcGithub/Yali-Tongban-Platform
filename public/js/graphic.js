(function () {
  if (!document.documentElement.classList.contains('super-graphic')) return;
  let fireworkObserver = null;
  const emblemImg = new Image();
  emblemImg.src = '/images/emblem.png';
  let _burstHandler = null;
  let _cardTiltRAF = null;
  let _pointerOverHandler = null;
  let _pointerMoveHandler = null;
  let _pointerOutHandler = null;

  /* ─── Color harmonization from --md-primary ─── */
  function getHarmonizedColors(count = 6) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--md-primary').trim();
    let r, g, b;

    if (raw.startsWith('#') && raw.length >= 7) {
      const hex = raw.replace('#', '');
      r = parseInt(hex.substring(0, 2), 16) / 255;
      g = parseInt(hex.substring(2, 4), 16) / 255;
      b = parseInt(hex.substring(4, 6), 16) / 255;
    } else if (raw.startsWith('rgb')) {
      const m = raw.match(/\d+/g);
      if (m && m.length >= 3) {
        r = parseInt(m[0], 10) / 255;
        g = parseInt(m[1], 10) / 255;
        b = parseInt(m[2], 10) / 255;
      }
    }

    if (r == null) {
      return ['hsl(212,31%,30%)', 'hsl(227,31%,35%)', 'hsl(197,31%,28%)', 'hsl(242,31%,33%)', 'hsl(182,31%,25%)', 'hsl(212,31%,40%)'];
    }

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    s = s * 0.5;

    const colors = [];
    const hueBase = h * 360;
    const halfRange = 25;
    const satPct = Math.round(s * 100);
    for (let i = 0; i < count; i++) {
      const hueDeg = ((hueBase - halfRange + (halfRange * 2 * i) / (count - 1)) % 360 + 360) % 360;
      const lightPct = Math.round(Math.max(15, Math.min(85, (l + (i - (count - 1) / 2) * 0.04) * 100)));
      colors.push(`hsl(${hueDeg.toFixed(0)}, ${satPct}%, ${lightPct}%)`);
    }
    return colors;
  }

  /* ─── Button shatter physics engine (2D) ─── */
  function spawnParticles(btn) {
    if (!document.documentElement.classList.contains('super-graphic')) return;
    const card = btn.closest('.card, .img-card, .announce-card, .summary-card, .activity-card, .admin-card');
    if (card) {
      card.style.animation = 'none';
      void card.offsetHeight;
      requestAnimationFrame(() => {
        card.style.animation = 'sgCardShake .5s ease-out';
        setTimeout(() => { card.style.animation = ''; }, 500);
      });
    }

    const rect = btn.getBoundingClientRect();
    const s = getComputedStyle(btn);
    const H = window.innerHeight;

    const clips = [
      'inset(0 50% 50% 0)',
      'inset(0 0 50% 50%)',
      'inset(50% 50% 0 0)',
      'inset(50% 0 0 50%)',
    ];

    const G = H * 1.0;
    const FLOOR = H - 60;
    const DRAG = 0.97;
    const all = [];

    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'sg-btn-shard';
      el.textContent = btn.textContent;
      el.style.cssText =
        `left:${rect.left}px;top:${rect.top}px;` +
        `width:${rect.width}px;height:${rect.height}px;` +
        `background:${s.backgroundColor};color:${s.color};` +
        `border-radius:${s.borderRadius};clip-path:${clips[i]};` +
        `font:${s.font};line-height:${s.lineHeight};` +
        `text-align:${s.textAlign};padding:${s.padding}`;
      document.body.appendChild(el);

      const a = Math.PI * (0.25 + i * 0.5);
      all.push({
        el, type: 'shard',
        x: 0, y: 0,
        vx: Math.cos(a) * (80 + Math.random() * 100),
        vy: -(220 + Math.random() * 140),
        rz: (Math.random() - 0.5) * 180,
        rzV: (Math.random() - 0.5) * 360,
        baseX: rect.left, baseY: rect.top,
        floorY: FLOOR,
        onFloor: false, fadeAge: 0,
      });
    }


    let last = performance.now();
    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const nf = dt / (1 / 60);
      let alive = false;

      for (const p of all) {
        if (p.removed) continue;
        alive = true;
        if (!p.onFloor) {
          p.vx *= Math.pow(DRAG, nf);
          p.vy *= Math.pow(DRAG, nf);
          p.vy += G * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rz += p.rzV * dt;

          if (p.baseY + p.y >= p.floorY) {
            p.y = p.floorY - p.baseY;
            p.vy *= -0.5;
            p.vx *= 0.85;
            p.rzV *= 0.3;
            if (Math.abs(p.vy) < 8) {
              p.vy = 0;
              p.vx = 0;
              p.rzV = 0;
              p.onFloor = true;
              p.fadeAge = 0;
            }
          }
          p.el.style.transform =
            `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${p.rz.toFixed(1)}deg)`;
        } else {
          p.fadeAge += dt;
          if (p.fadeAge > 0.5) {
            p.el.remove();
            p.removed = true;
            continue;
          }
          const opacity = p.fadeAge > 0.1 ? Math.max(0, 1 - (p.fadeAge - 0.1) / 0.4) : 1;
          p.el.style.opacity = opacity;
        }
      }

      if (alive) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initParticleBurst() {
    _burstHandler = function (e) {
      const btn = e.target.closest('.btn');
      if (!btn || btn.disabled) return;
      spawnParticles(btn);
    };
    document.addEventListener('click', _burstHandler);
  }

  /* ─── Confetti palette: primary harmonized only ─── */
  function generateConfettiPalette() {
    return getHarmonizedColors(8);
  }

  /* ─── Confetti Firework (per-frame physics) ─── */
  function triggerFirework() {
    const W = window.innerWidth, H = window.innerHeight;
    const canvas = document.createElement('canvas');
    canvas.className = 'sg-firework-canvas';
    canvas.width = W; canvas.height = H;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const palette = generateConfettiPalette();

    /* ─── Physics constants ─── */
    const GRAVITY = H * 0.18;
    const BASE_SPEED = H * 0.30;
    const SPEED_VAR = H * 0.80;
    const LIFETIME = 7.0;
    const FADE_START = 5.5;
    const ANGLE_SPREAD = 1.2;

    /* ─── Build particles ─── */
    const pieces = [];
    const centerAngle = Math.atan2(H * 0.5, W * 0.5);
    const sides = [
      { dir: -1, sx: 0 },
      { dir: 1, sx: W },
    ];

    for (const side of sides) {
      const baseAngle = side.dir === -1 ? centerAngle : Math.PI - centerAngle;
      const count = 240 + Math.floor(Math.random() * 20);
      for (let i = 0; i < count; i++) {
        const theta = baseAngle + (Math.random() - 0.5) * ANGLE_SPREAD;
        const speed = BASE_SPEED + Math.random() * SPEED_VAR;
        const shape = Math.random() < 0.4 ? 'square' : 'dot';
        const sw = 5 + Math.random() * 8;
        const sh = shape === 'square' ? sw * (0.6 + Math.random() * 0.8) : sw;

        pieces.push({
          x: side.sx + (Math.random() - 0.5) * 12,
          y: 0,
          vx: Math.cos(theta) * speed,
          vy: Math.sin(theta) * speed,
          w: sw, h: sh,
          shape,
          color: palette[Math.floor(Math.random() * palette.length)],
          isEmblem: shape === 'dot' && Math.random() < 0.01,
          angle: Math.random() * Math.PI * 2,
          angVel: (Math.random() - 0.5) * 6,
          rotX: (Math.random() - 0.5) * Math.PI,
          rotY: (Math.random() - 0.5) * Math.PI,
          rotXVel: (Math.random() - 0.5) * 4,
          rotYVel: (Math.random() - 0.5) * 4,
          wobbleAmp: 4 + Math.random() * 8,
          wobbleFreq: 0.375 + Math.random() * 0.375,
          wobblePhase: Math.random() * Math.PI * 2,
          bend: 0.15 + Math.random() * 0.2,
          bendPhase: Math.random() * Math.PI * 2,
          curlPhase: Math.random() * Math.PI * 2,
          curlVel: 0.002 + Math.random() * 0.003,
          drag: 0.96 + Math.random() * 0.03,
          gravityMul: 0.7 + Math.random() * 0.6,
          delay: Math.random() * 3.0,
          age: 0,
        });
      }
    }

    /* ─── 3D perspective rendering ─── */
    function draw3DShape(ctx, p, posX, posY, w, h, rotX, rotY, angle, bendAmt, alpha) {
      const focal = Math.max(W, H);
      const b = bendAmt * Math.sqrt(w * h);
      const crx = Math.cos(rotX), srx = Math.sin(rotX);
      const cry = Math.cos(rotY), sry = Math.sin(rotY);
      const ca = Math.cos(angle), sa = Math.sin(angle);

      /* Brightness from face normal */
      let nnx = sry * crx;
      let nny = -srx;
      let nnz = cry * crx;
      const ll = Math.sqrt(0.09 + 0.16 + 1);
      const lx = 0.3 / ll, ly = -0.4 / ll, lz = 1 / ll;
      const dot = Math.max(0, nnx * lx + nny * ly + nnz * lz);
      const brightness = 0.25 + 0.75 * dot;

      /* Color with brightness adjustment */
      const cm = p.color.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
      const hh = cm ? cm[1] : '0', ss = cm ? cm[2] : '0', llBase = cm ? parseFloat(cm[3]) : 50;
      const llAdj = Math.max(8, Math.min(92, llBase * brightness));
      const fillColor = `hsla(${hh},${ss}%,${llAdj.toFixed(0)}%,${alpha})`;

      /* 3D to screen offset */
      function toOff(lx, ly, lz) {
        let y = ly * crx - lz * srx;
        let z = ly * srx + lz * crx;
        let x = lx * cry + z * sry;
        z = -lx * sry + z * cry;
        const s = focal / (focal + Math.max(z, -focal + 1));
        return { x: x * s, y: y * s };
      }

      if (p.shape === 'square') {
        const pts = [
          toOff(-w / 2, -h / 2, 0),
          toOff(0, -h / 2, b),
          toOff(w / 2, -h / 2, 0),
          toOff(w / 2, h / 2, 0),
          toOff(0, h / 2, b),
          toOff(-w / 2, h / 2, 0),
        ];
        for (const pt of pts) {
          const rx = pt.x * ca - pt.y * sa;
          const ry = pt.x * sa + pt.y * ca;
          pt.x = posX + rx;
          pt.y = posY + ry;
        }

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.quadraticCurveTo(pts[4].x, pts[4].y, pts[5].x, pts[5].y);
        ctx.closePath();

        ctx.fillStyle = fillColor;
        ctx.shadowColor = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur = 3;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = `rgba(255,255,255,${0.2 * alpha})`;
        ctx.lineWidth = Math.max(0.5, 1);
        ctx.stroke();
      } else {
        const r = Math.max(w, h) / 2;
        const ptx = toOff(r, 0, 0);
        const pty = toOff(0, r, 0);
        const rx1 = ptx.x * ca - ptx.y * sa;
        const ry1 = ptx.x * sa + ptx.y * ca;
        const rx2 = pty.x * ca - pty.y * sa;
        const ry2 = pty.x * sa + pty.y * ca;
        const radiusX = Math.sqrt(rx1 * rx1 + ry1 * ry1);
        const radiusY = Math.sqrt(rx2 * rx2 + ry2 * ry2);
        const elAngle = Math.atan2(ry1, rx1);

        ctx.beginPath();
        ctx.ellipse(posX, posY, radiusX, radiusY, elAngle, 0, Math.PI * 2);
        ctx.closePath();

        if (p.isEmblem && emblemImg.complete) {
          ctx.save();
          ctx.clip();
          ctx.globalAlpha = alpha;
          ctx.drawImage(emblemImg, posX - radiusX, posY - radiusY, radiusX * 2, radiusY * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = fillColor;
          ctx.shadowColor = 'rgba(0,0,0,0.08)';
          ctx.shadowBlur = 3;
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = `rgba(255,255,255,${0.2 * alpha})`;
          ctx.lineWidth = Math.max(0.5, 1);
          ctx.stroke();
        }
      }
    }

    /* ─── Animation loop (per-frame physics) ─── */
    let lastTime = performance.now();

    function anim(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      ctx.clearRect(0, 0, W, H);

      let alive = false;
      const visible = [];

      for (const p of pieces) {
        p.age += dt;
        if (p.age < p.delay) { alive = true; continue; }

        const t = p.age - p.delay;
        if (t > LIFETIME) continue;

        const nf = dt / (1 / 60);

        p.vx *= Math.pow(p.drag, nf);
        p.vy *= Math.pow(p.drag, nf);
        p.vy += GRAVITY * p.gravityMul * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.angle += p.angVel * dt;
        p.rotX += p.rotXVel * dt;
        p.rotY += p.rotYVel * dt;

        if (p.x < -300 || p.x > W + 300 || p.y > H + 50) continue;

        let opacity = 1;
        if (t > FADE_START) opacity = Math.max(0, 1 - (t - FADE_START) / (LIFETIME - FADE_START));
        if (opacity <= 0) continue;

        alive = true;
        visible.push({ p, opacity, t });
      }

      visible.sort((a, b) => a.p.y - b.p.y);

      for (const { p, opacity, t } of visible) {
        const wobbleOff = p.wobbleAmp * Math.sin(t * p.wobbleFreq * Math.PI * 2 + p.wobblePhase);
        const renderX = p.x + wobbleOff;
        const renderY = p.y + wobbleOff * 0.2 * Math.sin(t * p.wobbleFreq * Math.PI * 0.7 + p.wobblePhase + 1.2);
        const bendAmt = p.bend * Math.sin(t * 0.3 + p.bendPhase);
        draw3DShape(ctx, p, renderX, renderY, p.w, p.h, p.rotX, p.rotY, p.angle, bendAmt, opacity);
      }

      if (alive) requestAnimationFrame(anim);
      else canvas.remove();
    }
    requestAnimationFrame(anim);
  }

  function initFireworkOnToast() {
    const obs = new MutationObserver(function (mutations) {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.classList && node.classList.contains('toast-success')) {
            triggerFirework();
            return;
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return obs;
  }

  /* ─── 3D Card Tilt ─── */
  function initCardTilt() {
    if (initCardTilt._done) return;
    initCardTilt._done = true;
    const pending = [];
    let activeCard = null;
    const SELECTOR = '.card, .img-card, .announce-card, .summary-card, .activity-card, .admin-card';

    function flush() {
      _cardTiltRAF = null;
      for (const { el, rx, ry } of pending.splice(0)) {
        el.style.setProperty('--rx', rx);
        el.style.setProperty('--ry', ry);
      }
    }

    function resetActive() {
      if (!activeCard) return;
      activeCard.style.willChange = '';
      activeCard.style.removeProperty('--rx');
      activeCard.style.removeProperty('--ry');
      activeCard = null;
    }

    function getTarget(e) {
      return e.target.closest(SELECTOR);
    }

    _pointerOverHandler = function (e) {
      const card = getTarget(e);
      if (card && card !== activeCard) {
        resetActive();
        activeCard = card;
        card.style.willChange = 'transform';
      }
    };
    document.addEventListener('pointerover', _pointerOverHandler, true);

    _pointerMoveHandler = function (e) {
      if (!activeCard) return;
      const rect = activeCard.getBoundingClientRect();
      let cx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      let cy = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      cx = Math.max(-0.9, Math.min(0.9, cx));
      cy = Math.max(-0.9, Math.min(0.9, cy));
      pending.push({ el: activeCard, rx: (cx * 20).toFixed(1) + 'deg', ry: (cy * -20).toFixed(1) + 'deg' });
      if (!_cardTiltRAF) _cardTiltRAF = requestAnimationFrame(flush);
    };
    document.addEventListener('pointermove', _pointerMoveHandler, true);

    _pointerOutHandler = function (e) {
      const card = getTarget(e);
      if (card && card === activeCard) {
        const r = e.relatedTarget;
        if (r && (card === r || card.contains(r))) return;
        resetActive();
      }
    };
    document.addEventListener('pointerout', _pointerOutHandler, true);
  }

  /* ─── Init ─── */
  initParticleBurst();
  fireworkObserver = initFireworkOnToast();
  initCardTilt();

  window._sgFirework = triggerFirework;
  if (window._sgPendingFirework) {
    triggerFirework();
    delete window._sgPendingFirework;
  }

  window._sgDestroy = function () {
    if (fireworkObserver) { fireworkObserver.disconnect(); fireworkObserver = null; }
    if (_burstHandler) { document.removeEventListener('click', _burstHandler); _burstHandler = null; }
    if (_pointerOverHandler) { document.removeEventListener('pointerover', _pointerOverHandler, true); _pointerOverHandler = null; }
    if (_pointerMoveHandler) { document.removeEventListener('pointermove', _pointerMoveHandler, true); _pointerMoveHandler = null; }
    if (_pointerOutHandler) { document.removeEventListener('pointerout', _pointerOutHandler, true); _pointerOutHandler = null; }
    if (_cardTiltRAF) { cancelAnimationFrame(_cardTiltRAF); _cardTiltRAF = null; }
    delete initCardTilt._done;
    document.querySelectorAll('.sg-particle, .sg-firework-canvas, .sg-btn-shard').forEach(function (el) { el.remove(); });
  };
})();
