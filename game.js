'use strict';

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────
const CW = 1000;          // canvas width
const CH = 400;          // canvas height
const GROUND_Y = 360;   // top of ground surface
const SCALE = CH / 300; // size scale factor relative to 300px reference height
const GRAVITY = 0.75;
const JUMP_VEL = -15;
const SPD_INIT = 5.5;
const SPD_MAX = 14;
const SPD_ACCEL = 0.0006; // added to speed each frame


// ─────────────────────────────────────────────
//  Dino 크기 계산 (이미지 실제 크기 기반)
// ─────────────────────────────────────────────
function computeDinoSizes(assets) {
  const MAX_H = Math.round(CH * 0.3);  // 표시 높이 (CH에 비례)

  function fitToMaxH(key, defW, defH) {
    const sz = assets.getSize(key);
    if (!sz || sz.w <= 1 || sz.h <= 1) return { w: defW, h: defH };
    const h = MAX_H;  // 항상 MAX_H로 스케일 (업/다운 모두)
    const w = Math.round(sz.w * h / sz.h);
    return { w, h };
  }

  const stand = fitToMaxH('dino_run1', Math.round(44 * SCALE), Math.round(47 * SCALE));
  const duck = { w: Math.round(stand.w), h: Math.round(stand.h * 0.9) };

  return { stand, duck };
}

// ─────────────────────────────────────────────
//  Dino
// ─────────────────────────────────────────────
class Dino {
  /** sizes: { stand:{w,h}, duck:{w,h} } */
  constructor(sizes) {
    this.standW = sizes.stand.w;
    this.standH = sizes.stand.h;
    this.duckW = sizes.duck.w;
    this.duckH = sizes.duck.h;
    this.reset();
  }

  reset() {
    this.w = this.standW; this.h = this.standH;
    this.x = 80;
    this.y = GROUND_Y - this.h;
    this.vy = 0;
    this.onGround = true;
    this.jumpCount = 0;
    this.ducking = false;
    this.dead = false;
    this.frame = 0;
    this.frameTick = 0;
  }

  jump() {
    if (this.dead || this.jumpCount >= 2) return;
    this.vy = JUMP_VEL;
    this.onGround = false;
    this.ducking = false;
    this.w = this.standW; this.h = this.standH;
    this.jumpCount++;
  }

  setDuck(on) {
    if (this.dead || !this.onGround) return;
    this.ducking = on;
    this.w = on ? this.duckW : this.standW;
    this.h = on ? this.duckH : this.standH;
    this.y = GROUND_Y - this.h;
  }

  update() {
    if (!this.onGround) {
      this.vy += GRAVITY;
      this.y += this.vy;
      if (this.y >= GROUND_Y - this.h) {
        this.y = GROUND_Y - this.h;
        this.vy = 0;
        this.onGround = true;
        this.jumpCount = 0;
      }
    }
    this.frameTick++;
    if (this.frameTick >= 7) { this.frame = (this.frame + 1) % 2; this.frameTick = 0; }
  }

  draw(ctx, assets, cache, dpr) {
    let key;
    if (this.dead) key = 'dino_dead';
    else if (!this.onGround) key = 'dino_jump';
    else if (this.ducking) key = `dino_duck${this.frame + 1}`;
    else key = `dino_run${this.frame + 1}`;

    const img = assets.getImage(key);
    if (img) {
      const bmp = cache.get(key, img, Math.round(this.w * dpr), Math.round(this.h * dpr));
      ctx.drawImage(bmp, Math.round(this.x), Math.round(this.y), this.w, this.h);
    } else {
      ctx.fillStyle = this.dead ? '#7b4a1e' : '#4a7c59';
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }

  /** 이미지 크기에 비례한 인셋 히트박스 */
  box() {
    const ix = Math.round(this.w * 0.06);
    const iy = Math.round(this.h * 0.05);
    return { x: this.x + ix, y: this.y + iy, w: this.w - ix * 2, h: this.h - iy * 2 };
  }
}

// ─────────────────────────────────────────────
//  Obstacle configs
// ─────────────────────────────────────────────
const CACTUS_GAP = 2;  // px gap between repeated cactus units

// cactus_s1 / cactus_l1 이미지를 count 개씩 나란히 배치
const _CS = Math.round(17 * SCALE);  // cactus small unit width
const _SH = Math.round(35 * SCALE);  // cactus small height
const _CL = Math.round(25 * SCALE);  // cactus large unit width
const _LH = Math.round(50 * SCALE);  // cactus large height
const CACTUS_CFGS = [
  { key: 'cactus_s1', baseW: _CS, h: _SH, count: 1 },
  { key: 'cactus_s1', baseW: _CS, h: _SH, count: 2 },
  { key: 'cactus_s1', baseW: _CS, h: _SH, count: 3 },
  { key: 'cactus_l1', baseW: _CL, h: _LH, count: 1 },
  { key: 'cactus_l1', baseW: _CL, h: _LH, count: 2 },
  { key: 'cactus_l1', baseW: _CL, h: _LH, count: 3 },
];

// Bird Y positions relative to ground
const BIRD_YS = [
  GROUND_Y - Math.round(120 * SCALE),  // high — duck or jump over
  GROUND_Y - Math.round(60 * SCALE),  // mid  — jump over
  GROUND_Y - Math.round(32 * SCALE),  // low  — jump over (easier)
];

class Obstacle {
  constructor(cfg, x) {
    this.key = cfg.key;
    this.isBird = !!cfg.isBird;
    this.count = cfg.count || 1;
    this.baseW = cfg.baseW || cfg.w;
    this.h = cfg.h;
    this.w = this.isBird
      ? cfg.w
      : this.baseW * this.count + CACTUS_GAP * (this.count - 1);
    this.x = x;
    this.y = this.isBird
      ? BIRD_YS[Math.floor(Math.random() * BIRD_YS.length)]
      : GROUND_Y - this.h;
    this.frame = 0;
    this.frameTick = 0;
  }

  update(speed) {
    this.x -= speed;
    if (this.isBird) {
      this.frameTick++;
      if (this.frameTick >= 9) { this.frame = (this.frame + 1) % 2; this.frameTick = 0; }
    }
  }

  draw(ctx, assets, cache, dpr) {
    if (this.isBird) {
      const key = `bird${this.frame + 1}`;
      const img = assets.getImage(key);
      if (img) {
        const bmp = cache.get(key, img, Math.round(this.w * dpr), Math.round(this.h * dpr));
        ctx.drawImage(bmp, Math.round(this.x), Math.round(this.y), this.w, this.h);
      } else { ctx.fillStyle = '#5566aa'; ctx.fillRect(this.x, this.y, this.w, this.h); }
    } else {
      const img = assets.getImage(this.key);
      if (img) {
        const bmp = cache.get(this.key, img, Math.round(this.baseW * dpr), Math.round(this.h * dpr));
        for (let i = 0; i < this.count; i++) {
          ctx.drawImage(bmp,
            Math.round(this.x + i * (this.baseW + CACTUS_GAP)),
            Math.round(this.y),
            this.baseW, this.h);
        }
      } else {
        ctx.fillStyle = this.key === 'cactus_l1' ? '#1e6b1e' : '#3a8c3a';
        ctx.fillRect(this.x, this.y, this.w, this.h);
      }
    }
  }

  box() { return { x: this.x + 3, y: this.y + 3, w: this.w - 6, h: this.h - 4 }; }
  gone() { return this.x + this.w < -10; }
}

// ─────────────────────────────────────────────
//  Scrolling ground
// ─────────────────────────────────────────────
class Ground {
  constructor(assets) {
    this.h = Math.round(24 * SCALE);

    const sz = assets.getSize('ground');
    this.tileW = (sz && sz.w > 1 && sz.h > 1)
      ? Math.round(sz.w * this.h / sz.h)
      : Math.round(600 * SCALE);

    const tileCount = Math.ceil(CW / this.tileW) + 2;
    this.tiles = [];
    for (let i = 0; i < tileCount; i++) this.tiles.push(i * this.tileW);
  }

  update(speed) {
    for (let i = 0; i < this.tiles.length; i++) this.tiles[i] -= speed;

    let maxX = -Infinity;
    for (const x of this.tiles) if (x > maxX) maxX = x;

    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] + this.tileW < 0) this.tiles[i] = maxX += this.tileW;
    }
  }

  draw(ctx, assets, cache, dpr) {
    const img = assets.getImage('ground');
    if (img) {
      const bmp = cache.get('ground', img, Math.round(this.tileW * dpr), Math.round(this.h * dpr));
      for (const x of this.tiles) ctx.drawImage(bmp, Math.round(x), GROUND_Y, this.tileW, this.h);
    } else {
      ctx.fillStyle = '#c8a87a';
      ctx.fillRect(0, GROUND_Y, CW, this.h);
      ctx.fillStyle = '#b08058';
      ctx.fillRect(0, GROUND_Y, CW, 4);
    }
  }
}

// ─────────────────────────────────────────────
//  Cloud
// ─────────────────────────────────────────────
class Cloud {
  constructor(x, y) { this.x = x; this.y = y; this.w = Math.round(92 * SCALE); this.h = Math.round(28 * SCALE); }

  update() { this.x -= 0.8; }
  gone() { return this.x + this.w < 0; }

  draw(ctx, assets, cache, dpr) {
    const img = assets.getImage('cloud');
    if (img) {
      const bmp = cache.get('cloud', img, Math.round(this.w * dpr), Math.round(this.h * dpr));
      ctx.drawImage(bmp, Math.round(this.x), Math.round(this.y), this.w, this.h);
    } else {
      ctx.fillStyle = 'rgba(200,200,200,0.6)';
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }
}

// ─────────────────────────────────────────────
//  BitmapCache
// ─────────────────────────────────────────────
class BitmapCache {
  constructor(pixelArt = false) { this._map = new Map(); this._pixelArt = pixelArt; }

  get(assetKey, img, physW, physH) {
    const key = `${assetKey}|${physW}|${physH}`;
    if (!this._map.has(key)) {
      this._map.set(key, this._prescale(img, physW, physH));
    }
    return this._map.get(key);
  }

  _prescale(src, targetW, targetH) {
    const srcW = src.naturalWidth || src.width || targetW;
    const srcH = src.naturalHeight || src.height || targetH;

    if (srcW === targetW && srcH === targetH) return src;
      const oc = new OffscreenCanvas(targetW, targetH);
      const ctx = oc.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0, targetW, targetH);
      return oc;
  }
}

// ─────────────────────────────────────────────
//  AABB collision
// ─────────────────────────────────────────────
function overlaps(a, b) {
  return !(a.x + a.w <= b.x || a.x >= b.x + b.w ||
    a.y + a.h <= b.y || a.y >= b.y + b.h);
}

// ─────────────────────────────────────────────
//  Main Game
// ─────────────────────────────────────────────
class Game {
  constructor(canvas, assets, pixelArt = false) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;

    this.dpr = 3;
    this.ctx.imageSmoothingEnabled = !pixelArt;

    this.hiScore = parseInt(localStorage.getItem('dino_hi') || '0');
    this._state = 'idle';  // idle | running | dead

    this._applyCanvasSize();
    this._onResize = () => this._applyCanvasSize();
    window.addEventListener('resize', this._onResize);

    canvas.classList.toggle('pixelated', pixelArt);
    this.cache = new BitmapCache(pixelArt);

    this._reset();
    this._bindInput();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  // ── responsive sizing: display width = window width * 0.7, logical units stay CW×CH ──
  _applyCanvasSize() {
    const dpr = 3;
    const displayW = window.innerWidth * 0.7;
    const displayH = displayW * (CH / CW);
    const scale = displayW / CW;

    this.canvas.width = Math.round(displayW * dpr);
    this.canvas.height = Math.round(displayH * dpr);
    this.canvas.style.width = displayW + 'px';
    this.canvas.style.height = displayH + 'px';

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr * scale, dpr * scale);

    // BitmapCache가 실제 물리 해상도(dpr × 화면 확대율)로 프리스케일하도록 전달
    this.renderScale = dpr * scale;
  }

  // ── private state reset (keeps hi-score) ──
  _reset() {
    this.dino = new Dino(computeDinoSizes(this.assets));
    this.ground = new Ground(this.assets);
    this.obstacles = [];
    this.clouds = [];
    this.score = 0;
    this.speed = SPD_INIT;
    this.dist = 0;

    this._obsTick = 0;
    this._obsGap = 100;   // frames between obstacles
    this._cldTick = 0;
    this._cldGap = 120;

    this._flashFrames = 0;   // score milestone flash
    this._nightFrames = 0;   // current night-mode sub-timer
    this._night = false;
    this._nightAlpha = 0;   // 0=day, 1=night

    this._spawnCloud(CW * 0.5 + Math.random() * CW * 0.5);
  }

  // ── input ──
  _bindInput() {
    this._onKey = (e) => this._handleKey(e);
    this._onKeyUp = (e) => { if (e.code === 'ArrowDown') this.dino.setDuck(false); };
    this._onTouch = (e) => { e.preventDefault(); this._action(); };
    document.addEventListener('keydown', this._onKey);
    document.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('touchstart', this._onTouch, { passive: false });
  }

  _handleKey(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault(); this._action();
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      if (this._state === 'running') this.dino.setDuck(true);
    }
  }

  _action() {
    if (this._state === 'idle') this._start();
    else if (this._state === 'running') this.dino.jump();
    else if (this._state === 'dead') this._restart();
  }

  _start() {
    this._state = 'running';
  }

  _restart() {
    this._reset();
    this._state = 'running';
  }

  // ── spawn helpers ──
  _spawnCloud(x) {
    const y = 40 + Math.random() * 80;
    this.clouds.push(new Cloud(x !== undefined ? x : CW + 40, y));
  }

  _spawnObstacle() {
    const birdOk = this.score >= 250 && Math.random() < 0.28;
    let cfg;
    if (birdOk) {
      cfg = { key: 'bird', w: Math.round(46 * SCALE), h: Math.round(40 * SCALE), isBird: true };
    } else {
      cfg = CACTUS_CFGS[Math.floor(Math.random() * CACTUS_CFGS.length)];
    }
    this.obstacles.push(new Obstacle(cfg, CW + 60));

    // Gap shrinks as speed rises
    const extra = Math.max(0, (this.speed - SPD_INIT) * 4);
    this._obsGap = Math.max(40, 80 + Math.random() * 60 - extra);
  }

  // ── update ──
  _update() {
    if (this._state !== 'running') return;

    // Speed ramp
    this.speed = Math.min(SPD_MAX, this.speed + SPD_ACCEL);

    // Score
    this.dist += this.speed;
    const prev = this.score;
    this.score = Math.floor(this.dist / 10);
    if (Math.floor(this.score / 100) > Math.floor(prev / 100)) {
      this._flashFrames = 36;   // ~0.6s flash
    }
    if (this._flashFrames > 0) this._flashFrames--;

    // Night-mode cycle (every ~800 score points)
    this._nightFrames++;
    if (this._nightFrames >= 800) {
      this._nightFrames = 0;
      this._night = !this._night;
    }
    // Smooth transition
    const tgt = this._night ? 1 : 0;
    this._nightAlpha += (tgt - this._nightAlpha) * 0.03;

    // Entities
    this.dino.update();
    this.ground.update(this.speed);

    // Obstacles
    this._obsTick++;
    if (this._obsTick >= this._obsGap) {
      this._obsTick = 0;
      this._spawnObstacle();
    }
    for (const obs of this.obstacles) {
      obs.update(this.speed);
      if (overlaps(this.dino.box(), obs.box())) {
        this.dino.dead = true;
        this._state = 'dead';
        if (this.score > this.hiScore) {
          this.hiScore = this.score;
          localStorage.setItem('dino_hi', this.hiScore);
        }
        return;
      }
    }
    this.obstacles = this.obstacles.filter(o => !o.gone());

    // Clouds
    this._cldTick++;
    if (this._cldTick >= this._cldGap) {
      this._cldTick = 0;
      this._cldGap = 100 + Math.random() * 100;
      this._spawnCloud();
    }
    for (const c of this.clouds) c.update();
    this.clouds = this.clouds.filter(c => !c.gone());
  }

  // ── draw ──
  _draw() {
    const ctx = this.ctx;
    const a = this._nightAlpha;

    // Sky
    const dayBg = [153, 232, 255];
    const ngtBg = [17, 25, 40];
    const bg = dayBg.map((v, i) => Math.round(v + (ngtBg[i] - v) * a));
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    ctx.fillRect(0, 0, CW, CH);

    // Entities
    for (const c of this.clouds) c.draw(ctx, this.assets, this.cache, this.renderScale);
    this.ground.draw(ctx, this.assets, this.cache, this.renderScale);
    for (const o of this.obstacles) o.draw(ctx, this.assets, this.cache, this.renderScale);
    this.dino.draw(ctx, this.assets, this.cache, this.renderScale);

    // HUD
    const fg = a > 0.5 ? '#e0e0e0' : '#535353';
    const scoreFlash = this._flashFrames > 0 && (this._flashFrames % 8 < 4);
    ctx.fillStyle = scoreFlash ? `rgb(${bg[0]},${bg[1]},${bg[2]})` : fg;
    ctx.font = 'bold 20px "Tiny5"';
    ctx.textAlign = 'right';
    ctx.fillText(
      `HI ${pad(this.hiScore)}  ${pad(this.score)}`,
      CW - 12, 28
    );
    ctx.textAlign = 'left';

    // Overlays
    if (this._state === 'idle') {
      this._overlay(ctx, fg, '스페이스 / ↑ 으로 시작', null);
    } else if (this._state === 'dead') {
      this._overlay(ctx, fg, 'GAME OVER', '스페이스 / ↑ 으로 재시작');
    }
  }

  _overlay(ctx, color, line1, line2) {
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    if (line2) {
      ctx.font = 'bold 22px "Mona12"';
      ctx.fillText(line1, CW / 2, CH / 2 - 14);
      ctx.font = '13px "Mona12"';
      ctx.fillText(line2, CW / 2, CH / 2 + 14);
    } else {
      ctx.font = 'bold 18px "Mona12"';
      ctx.fillText(line1, CW / 2, CH / 2);
    }
    ctx.textAlign = 'left';
  }

  // ── loop ──
  _loop() {
    this._update();
    this._draw();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    document.removeEventListener('keydown', this._onKey);
    document.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('touchstart', this._onTouch);
    window.removeEventListener('resize', this._onResize);
  }
}

function pad(n) { return String(n).padStart(5, '0'); }

// ─────────────────────────────────────────────
//  UI wiring
// ─────────────────────────────────────────────
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const gameCanvas = document.getElementById('game-canvas');
const folderBtn = document.getElementById('folder-btn');
const folderInput = document.getElementById('folder-input');
const folderNameEl = document.getElementById('folder-name');
const assetStatusEl = document.getElementById('asset-status');
const playBtn = document.getElementById('play-btn');
const backBtn = document.getElementById('back-btn');
const modeSmooth = document.getElementById('mode-smooth');
const modePixel = document.getElementById('mode-pixel');

let game = null;
let pixelArt = false;

modeSmooth.addEventListener('click', () => {
  pixelArt = false;
  modeSmooth.classList.add('is-active');
  modePixel.classList.remove('is-active');
});
modePixel.addEventListener('click', () => {
  pixelArt = true;
  modePixel.classList.add('is-active');
  modeSmooth.classList.remove('is-active');
});

// Folder selection
folderBtn.addEventListener('click', () => folderInput.click());

folderInput.addEventListener('change', async () => {
  const files = folderInput.files;
  if (!files || files.length === 0) return;

  const folder = files[0].webkitRelativePath.split('/')[0];
  folderNameEl.textContent = folder;
  assetStatusEl.innerHTML = '<span style="color:#888">에셋 로딩 중…</span>';

  const { loaded, defaultLoaded, fallback, missing } = await assetLoader.loadFromFiles(files);

  const parts = [];
  if (loaded.length)
    parts.push(`<span class="ok">✓ 사용자 폴더 ${loaded.length}개: ${loaded.join(', ')}</span>`);
  if (defaultLoaded.length)
    parts.push(`<span class="ok">Ⓗ 기본 에셋 ${defaultLoaded.length}개: ${defaultLoaded.join(', ')}</span>`);
  if (fallback.length)
    parts.push(`<span class="ok">Ⓖ 중복 적용 ${fallback.length}개: ${fallback.join(', ')}</span>`);
  if (missing.length)
    parts.push(`<span class="miss">Ⓓ 없음 ${missing.length}개: ${missing.join(', ')}</span>`);
  assetStatusEl.innerHTML = parts.join('<br>');
});

// Start game
async function startGame() {
  // 폴더를 선택하지 않은 경우 default_assets/ → 사각형 순으로 로드
  if (!assetLoader.isReady()) await assetLoader.loadDefaults();

  startScreen.style.display = 'none';
  gameScreen.style.display = 'flex';
  gameCanvas.focus();

  if (game) game.destroy();
  game = new Game(gameCanvas, assetLoader, pixelArt);
}

playBtn.addEventListener('click', startGame);

// SPACE on start screen also starts game
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && gameScreen.style.display === 'none') {
    e.preventDefault();
    startGame();
  }
});

// Back button
backBtn.addEventListener('click', () => {
  if (game) { game.destroy(); game = null; }
  gameScreen.style.display = 'none';
  startScreen.style.display = 'flex';
});
