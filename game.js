(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute-btn');

  // 逻辑分辨率（竖屏）
  const W = 480;
  const H = 720;
  const TAU = Math.PI * 2;

  // 物理参数（按 60fps 一帧计算）
  const GRAVITY = 0.45;
  const MOVE_ACCEL = 0.55;
  const MOVE_MAX = 7.5;
  const FRICTION = 0.92;
  const BOUNCE_VY = -13.5;
  const SPRING_VY = -20.5;
  const START_Y = H - 130;

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (a, b) => ((a % b) + b) % b;

  // localStorage 在部分浏览器（隐私模式 / file://）下可能不可用，做一层兜底
  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        // 忽略
      }
    }
  };

  // ---------- 音效 ----------
  let audioCtx = null;
  let muted = store.get('sky-hopper-muted') === '1';

  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audioCtx = null;
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const sfxBounce = () => tone(360, 0.12, 'triangle', 0.12, 170);
  const sfxSpring = () => {
    tone(180, 0.18, 'sawtooth', 0.09, 760);
    tone(520, 0.24, 'sine', 0.10, 1300, 0.03);
  };
  const sfxBreak = () => tone(160, 0.22, 'square', 0.07, 55);
  const sfxStar = () => {
    tone(880, 0.08, 'sine', 0.11, 1250);
    tone(1320, 0.12, 'sine', 0.09, 1650, 0.05);
  };
  const sfxOver = () => {
    tone(300, 0.34, 'sawtooth', 0.09, 80);
    tone(200, 0.5, 'sawtooth', 0.07, 50, 0.12);
  };
  const sfxStart = () => {
    tone(523, 0.08, 'sine', 0.11);
    tone(659, 0.08, 'sine', 0.11, null, 0.06);
    tone(784, 0.12, 'sine', 0.11, null, 0.12);
  };

  function updateMuteBtn() {
    muteBtn.textContent = muted ? '音效 关' : '音效 开';
  }

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    muted = !muted;
    store.set('sky-hopper-muted', muted ? '1' : '0');
    updateMuteBtn();
    if (!muted) {
      ensureAudio();
      sfxStart();
    }
  });
  updateMuteBtn();

  // ---------- 游戏状态 ----------
  let state = 'ready'; // ready | playing | over
  let score = 0;
  let best = Number(store.get('sky-hopper-best') || 0);
  let isNewBest = false;
  let camY = 0;
  let shake = 0;
  let flash = 0;
  let nowMs = 0;

  const player = {
    x: W / 2,
    y: 0,
    vx: 0,
    vy: 0,
    r: 18,
    squash: 0
  };

  let platforms = [];
  let stars = [];
  let particles = [];
  let popups = [];
  let highestY = 0;
  let prevPlatX = W / 2;
  let platCount = 0;
  let minPlayerY = 0;

  // 背景装饰
  const farStars = [];
  for (let i = 0; i < 70; i++) {
    farStars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      s: 0.6 + Math.random() * 1.8,
      tw: Math.random() * TAU
    });
  }
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * W,
      y: Math.random() * 1600,
      w: 80 + Math.random() * 130
    });
  }

  // ---------- 工具 ----------
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makePlatform(x, topY, type) {
    const p = {
      x,
      y: topY,
      w: type === 'breakable' ? 88 : 76,
      h: 18,
      type,
      vx: 0,
      centerX: x,
      range: 0,
      broken: false
    };
    if (type === 'moving') {
      p.range = 55 + Math.random() * 75;
      p.vx = (Math.random() < 0.5 ? -1 : 1) * (1.1 + Math.random() * 0.8);
    }
    return p;
  }

  function pickType() {
    if (platCount < 4) return 'normal';
    const r = Math.random();
    if (r < 0.52) return 'normal';
    if (r < 0.74) return 'moving';
    if (r < 0.92) return 'breakable';
    return 'spring';
  }

  function nextGap() {
    const d = Math.min(1, score / 1500);
    const lo = 62 + d * 28;
    const hi = 108 + d * 52;
    return rand(lo, hi);
  }

  function platformTop(p) {
    return p.type === 'spring' ? p.y - 18 : p.y;
  }

  function addPlatformAbove(fromY) {
    const newY = fromY - nextGap();
    const type = pickType();
    let x;
    if (type === 'moving') {
      x = clamp(prevPlatX + rand(-140, 140), 42, W - 42);
    } else {
      x = clamp(prevPlatX + rand(-175, 175), 34, W - 34);
    }
    const p = makePlatform(x, newY, type);
    platforms.push(p);
    prevPlatX = x;
    platCount++;

    if (type !== 'spring' && platCount > 6 && Math.random() < 0.12) {
      stars.push({
        x: clamp(x + rand(-70, 70), 30, W - 30),
        y: newY - 44,
        r: 12,
        t: Math.random() * TAU
      });
    }
    return newY;
  }

  function resetGame() {
    platforms = [];
    stars = [];
    particles = [];
    popups = [];
    score = 0;
    camY = 0;
    shake = 0;
    flash = 0;
    isNewBest = false;
    platCount = 0;
    prevPlatX = W / 2;

    platforms.push(makePlatform(W / 2, START_Y, 'normal'));
    platCount++;

    player.x = W / 2;
    player.y = START_Y - player.r - 2;
    player.vx = 0;
    player.vy = 0;
    player.squash = 0;
    minPlayerY = player.y;

    highestY = START_Y;
    while (highestY > -H * 1.5) {
      highestY = addPlatformAbove(highestY);
    }
  }

  function startGame() {
    resetGame();
    state = 'playing';
    ensureAudio();
    sfxStart();
  }

  // ---------- 粒子与弹字 ----------
  function addPopup(text, x, y, color) {
    popups.push({ text, x, y, color, life: 42 });
  }

  function spawnBounceParticles(x, y) {
    for (let i = 0; i < 8; i++) {
      particles.push({
        x,
        y,
        vx: rand(-3, 3),
        vy: rand(-3.2, -0.6),
        life: rand(16, 30),
        r: rand(1.5, 3.5),
        color: '#b9f6ca'
      });
    }
  }

  function spawnBreakParticles(x, y) {
    for (let i = 0; i < 15; i++) {
      particles.push({
        x: x + rand(-22, 22),
        y,
        vx: rand(-4, 4),
        vy: rand(-3.4, -0.8),
        life: rand(28, 48),
        r: rand(2, 4.5),
        color: i % 2 ? '#8d5a35' : '#b07a4f'
      });
    }
  }

  function spawnSparks(x, y) {
    for (let i = 0; i < 12; i++) {
      particles.push({
        x,
        y,
        vx: rand(-5, 5),
        vy: rand(-4.5, -1),
        life: rand(14, 26),
        r: rand(1.8, 3.2),
        color: '#ffd166'
      });
    }
  }

  function spawnStarParticles(x, y) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU;
      const sp = rand(1, 3.5);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(20, 34),
        r: rand(1.8, 3),
        color: '#ffe08a'
      });
    }
  }

  // ---------- 更新 ----------
  function updateMovingPlatforms(dt) {
    for (const p of platforms) {
      if (p.type !== 'moving' || p.broken) continue;
      p.x += p.vx * dt;
      if (p.x > p.centerX + p.range) {
        p.x = p.centerX + p.range;
        p.vx *= -1;
      } else if (p.x < p.centerX - p.range) {
        p.x = p.centerX - p.range;
        p.vx *= -1;
      }
    }
  }

  function update(dt) {
    updateMovingPlatforms(dt);

    // 左右控制（键盘或按住屏幕左右半区）
    let move = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    if (touchDir !== 0) move = touchDir;
    player.vx += move * MOVE_ACCEL * dt;
    if (move === 0) player.vx *= Math.pow(FRICTION, dt);
    player.vx = clamp(player.vx, -MOVE_MAX, MOVE_MAX);
    player.x += player.vx * dt;

    // 左右循环
    if (player.x > W + player.r) player.x = -player.r;
    if (player.x < -player.r) player.x = W + player.r;

    // 重力
    const prevY = player.y;
    player.vy += GRAVITY * dt;
    if (player.vy > 18) player.vy = 18;
    player.y += player.vy * dt;

    const prevBottom = prevY + player.r;
    const bottom = player.y + player.r;

    // 平台碰撞
    if (player.vy > 0) {
      for (const p of platforms) {
        if (p.broken) continue;
        const hw = p.w / 2;
        const insideX = player.x + player.r * 0.78 > p.x - hw && player.x - player.r * 0.78 < p.x + hw;
        if (!insideX) continue;

        const top = platformTop(p);
        if (prevBottom <= top && bottom >= top) {
          player.y = top - player.r;
          player.squash = -0.34;

          if (p.type === 'spring') {
            player.vy = SPRING_VY;
            player.squash = -0.55;
            spawnSparks(p.x, top);
            shake = Math.max(shake, 5);
            sfxSpring();
            addPopup('弹簧!', p.x, top - 18, '#ffd166');
          } else {
            player.vy = BOUNCE_VY;
            spawnBounceParticles(p.x, top);
            sfxBounce();

            if (p.type === 'breakable') {
              p.broken = true;
              spawnBreakParticles(p.x, p.y);
              shake = Math.max(shake, 9);
              sfxBreak();
            }
          }
          break;
        }
      }
    }

    // 星星收集
    for (const s of stars) {
      s.t += 0.08 * dt;
      const dx = player.x - s.x;
      const dy = player.y - s.y;
      if (dx * dx + dy * dy < (player.r + s.r) * (player.r + s.r)) {
        s.collected = true;
        score += 30;
        sfxStar();
        addPopup('+30', s.x, s.y, '#ffe08a');
        spawnStarParticles(s.x, s.y);
      }
    }
    stars = stars.filter((s) => !s.collected);

    // 分数与相机
    if (player.y < minPlayerY) minPlayerY = player.y;
    score = Math.max(score, Math.floor((START_Y - minPlayerY) / 10));
    if (score > best) {
      isNewBest = true;
      best = score;
      store.set('sky-hopper-best', best);
    }

    const targetCam = player.y - H * 0.45;
    if (targetCam < camY) camY = targetCam;

    // 动态生成平台
    while (highestY - camY > -80) {
      highestY = addPlatformAbove(highestY);
    }

    // 清理出屏物体
    platforms = platforms.filter((p) => !p.broken && p.y - camY < H + 80);
    stars = stars.filter((s) => s.y - camY < H + 80);

    // 上升尾迹
    if (player.vy < -6 && Math.random() < 0.45) {
      particles.push({
        x: player.x + rand(-9, 9),
        y: player.y + player.r * 0.5,
        vx: 0,
        vy: 1.4,
        life: 12,
        r: rand(1.5, 3),
        color: 'rgba(255,255,255,0.55)'
      });
    }

    // 粒子 / 弹字 / 震屏 / 挤压恢复
    for (const pt of particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 0.25 * dt;
      pt.life -= dt;
    }
    particles = particles.filter((pt) => pt.life > 0);

    for (const p of popups) {
      p.y -= 0.8 * dt;
      p.life -= dt;
    }
    popups = popups.filter((p) => p.life > 0);

    shake *= Math.pow(0.86, dt);
    if (shake < 0.2) shake = 0;
    player.squash += (0 - player.squash) * 0.12 * dt;

    // 掉落判定
    if (player.y - camY > H + 60) {
      state = 'over';
      flash = 1;
      sfxOver();
    }
  }

  // ---------- 绘制 ----------
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1026');
    g.addColorStop(0.62, '#1c2140');
    g.addColorStop(1, '#3a2a63');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 月亮（慢速视差）
    const moonY = mod(140 - camY * 0.03, H + 320) - 160;
    const mg = ctx.createRadialGradient(W - 92, moonY, 8, W - 92, moonY, 58);
    mg.addColorStop(0, 'rgba(255,244,214,0.95)');
    mg.addColorStop(0.35, 'rgba(255,244,214,0.35)');
    mg.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(W - 92, moonY, 58, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff2d6';
    ctx.beginPath();
    ctx.arc(W - 92, moonY, 26, 0, TAU);
    ctx.fill();

    // 远星
    for (const st of farStars) {
      const sy = mod(st.y - camY * 0.06, H);
      const tw = 0.55 + 0.45 * Math.sin(nowMs * 0.002 + st.tw);
      ctx.globalAlpha = tw * 0.8;
      ctx.fillStyle = '#e8ecff';
      ctx.fillRect(st.x, sy, st.s, st.s);
    }
    ctx.globalAlpha = 1;

    // 云（中速视差）
    ctx.fillStyle = '#ffffff';
    for (const c of clouds) {
      const sy = mod(c.y - camY * 0.12, 1600) - 220;
      ctx.globalAlpha = 0.09;
      ctx.beginPath();
      ctx.ellipse(c.x, sy, c.w * 0.55, c.w * 0.2, 0, 0, TAU);
      ctx.ellipse(c.x - c.w * 0.28, sy + 8, c.w * 0.3, c.w * 0.14, 0, 0, TAU);
      ctx.ellipse(c.x + c.w * 0.3, sy + 9, c.w * 0.32, c.w * 0.15, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlatform(p, sy) {
    const hw = p.w / 2;
    let topCol;
    let botCol;

    if (p.type === 'moving') {
      topCol = '#4fd1c5';
      botCol = '#2b8a83';
    } else if (p.type === 'breakable') {
      topCol = '#b07a4f';
      botCol = '#7d5233';
    } else {
      topCol = '#57e08a';
      botCol = '#2ea85c';
    }

    ctx.save();

    // 弹簧平台：底座 + 弹簧 + 顶垫
    if (p.type === 'spring') {
      const padTop = p.y - 18;
      ctx.fillStyle = '#7a4a2b';
      roundRectPath(p.x - hw, p.y, p.w, p.h, 8);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const xx = p.x - 13 + 6.5 * i;
        const yy = padTop + 2 + (i % 2 === 0 ? 0 : 8);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();

      ctx.fillStyle = '#ff9f43';
      roundRectPath(p.x - 20, padTop, 40, 10, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(p.x - 10, padTop + 2, 9, 2);
      ctx.restore();
      return;
    }

    const g = ctx.createLinearGradient(0, sy, 0, sy + p.h);
    g.addColorStop(0, topCol);
    g.addColorStop(1, botCol);
    ctx.fillStyle = g;
    roundRectPath(p.x - hw, sy, p.w, p.h, 8);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRectPath(p.x - hw + 3, sy + 2, p.w - 6, 4, 2);
    ctx.fill();

    if (p.type === 'breakable') {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 9, sy + 3);
      ctx.lineTo(p.x - 1, sy + p.h - 4);
      ctx.lineTo(p.x + 6, sy + 5);
      ctx.moveTo(p.x + 12, sy + p.h - 3);
      ctx.lineTo(p.x + 17, sy + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlatforms() {
    for (const p of platforms) {
      const sy = p.y - camY;
      if (sy < -90 || sy > H + 90) continue;
      drawPlatform(p, sy);
    }
  }

  function drawStar(s) {
    const sy = s.y - camY;
    if (sy < -60 || sy > H + 60) return;
    const pulse = 1 + 0.18 * Math.sin(s.t);
    ctx.save();
    ctx.translate(s.x, sy);
    ctx.rotate(s.t * 0.5);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * s.r * pulse, Math.sin(a) * s.r * pulse);
      ctx.lineTo(Math.cos(a2) * s.r * 0.5 * pulse, Math.sin(a2) * s.r * 0.5 * pulse);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffe08a';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, s.r * 0.32, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.min(1, pt.life / 18);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - camY, pt.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawEar(x, y, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, -11, 6, 13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffb6c8';
    ctx.beginPath();
    ctx.ellipse(0, -10, 3.2, 8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const bob = state === 'ready' ? Math.sin(nowMs * 0.003) * 4 : 0;
    const px = player.x;
    const py = player.y - camY + bob;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.vx * 0.035 + player.vy * 0.005);
    const sy = 1 + player.squash;
    const sx = 1 - player.squash * 0.7;
    ctx.scale(sx, sy);

    drawEar(-11, -6, -0.22);
    drawEar(11, -6, 0.22);

    const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, player.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.75, '#f2f5ff');
    g.addColorStop(1, '#cdd6f4');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(60,70,120,0.25)';
    ctx.stroke();

    ctx.fillStyle = '#26304a';
    ctx.beginPath();
    ctx.arc(-6, -2, 3, 0, TAU);
    ctx.arc(6, -2, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-5, -3, 1.1, 0, TAU);
    ctx.arc(7, -3, 1.1, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,150,170,0.55)';
    ctx.beginPath();
    ctx.arc(-10, 3, 3, 0, TAU);
    ctx.arc(10, 3, 3, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = '#26304a';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 2, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawPopups() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 16px system-ui, sans-serif';
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - camY);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    ctx.save();
    ctx.textAlign = 'center';

    ctx.fillStyle = 'rgba(10,14,32,0.35)';
    roundRectPath(W / 2 - 62, 24, 124, 76, 18);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 42px system-ui, sans-serif';
    ctx.fillText(String(score), W / 2, 66);

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('最高 ' + best, W / 2, 90);
    ctx.restore();
  }

  function drawReady() {
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,28,0.42)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 46px system-ui, sans-serif';
    ctx.fillText('跳跳兔', W / 2, H * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('SKY HOPPER', W / 2, H * 0.3 + 30);

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText('← → 或按住屏幕左右移动', W / 2, H * 0.68);
    ctx.fillText('落到平台上，跳得越高分越高', W / 2, H * 0.68 + 24);

    const pulse = 0.75 + 0.25 * Math.sin(nowMs * 0.005);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#57e08a';
    roundRectPath(W / 2 - 86, H * 0.52 - 26, 172, 52, 26);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#08210f';
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText('点击开始', W / 2, H * 0.52 + 6);
    ctx.restore();
  }

  function drawOver() {
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,28,0.56)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ff7b7b';
    ctx.font = '800 42px system-ui, sans-serif';
    ctx.fillText('游戏结束', W / 2, H * 0.33);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText(score + ' 分', W / 2, H * 0.41);

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('最高分 ' + best + (isNewBest && score > 0 ? ' · 新纪录!' : ''), W / 2, H * 0.47);

    ctx.fillStyle = '#57e08a';
    roundRectPath(W / 2 - 92, H * 0.56, 184, 52, 26);
    ctx.fill();
    ctx.fillStyle = '#08210f';
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText('再玩一次', W / 2, H * 0.56 + 6);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) {
      ctx.translate(rand(-shake, shake), rand(-shake, shake));
    }
    drawSky();
    drawPlatforms();
    for (const s of stars) drawStar(s);
    drawParticles();
    drawPlayer();
    drawPopups();
    ctx.restore();

    if (state === 'playing' || state === 'over') drawHUD();
    if (state === 'ready') drawReady();
    if (state === 'over') drawOver();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.7).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      flash *= 0.9;
      if (flash < 0.03) flash = 0;
    }
  }

  // ---------- 输入 ----------
  const keys = { left: false, right: false };
  let touchDir = 0;

  function handlePrimary() {
    if (state !== 'playing') {
      startGame();
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      ensureAudio();
      handlePrimary();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ensureAudio();
    if (state !== 'playing') {
      startGame();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    touchDir = x < W / 2 ? -1 : 1;
  });

  window.addEventListener('pointerup', () => {
    touchDir = 0;
  });
  window.addEventListener('pointercancel', () => {
    touchDir = 0;
  });

  // ---------- 画布与主循环 ----------
  function setupCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / (1000 / 60), 3);
    last = now;
    nowMs = now;
    if (state === 'playing') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  setupCanvas();
  resetGame();
  requestAnimationFrame(frame);
})();
