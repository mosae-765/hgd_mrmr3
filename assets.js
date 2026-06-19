'use strict';

/**
 * 로딩 우선순위:
 *   1) 사용자 선택 폴더
 *   2) default_assets/{key}.png
 *   3) 색상 사각형 (충돌 위치 표시용)
 *
 * 폴백 규칙 (2·3에도 동일 적용):
 *   - dino_run1 이미지 존재 → 나머지 dino 미존재 시 대체
 *   - bird1 이미지 존재    → bird2 미존재 시 대체
 */

const ASSET_KEYS = [
  'dino_run1','dino_run2','dino_jump',
  'dino_duck1','dino_duck2','dino_dead',
  'cactus_s1','cactus_l1',
  'bird1','bird2',
  'ground','cloud',
];

// 최후 폴백: 색상 사각형 (크기·색만 의미 있음)
const DEFAULT_DEFS = {
  dino_run1 : { w:44,   h:47,  color:'#4a7c59' },
  dino_run2 : { w:44,   h:47,  color:'#4a7c59' },
  dino_jump : { w:44,   h:47,  color:'#4a7c59' },
  dino_duck1: { w:44,   h:30,  color:'#4a7c59' },
  dino_duck2: { w:44,   h:30,  color:'#4a7c59' },
  dino_dead : { w:44,   h:47,  color:'#c04030' },
  cactus_s1 : { w:17,   h:35,  color:'#3a8c3a' },
  cactus_l1 : { w:25,   h:50,  color:'#1e6b1e' },
  bird1     : { w:46,   h:40,  color:'#5566aa' },
  bird2     : { w:46,   h:40,  color:'#5566aa' },
  ground    : { w:2400, h:24,  color:'#c8a87a' },
  cloud     : { w:92,   h:28,  color:'#d8d8d8' },
};

function makeRect(w, h, color) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').fillStyle = color;
  c.getContext('2d').fillRect(0, 0, w, h);
  return c;
}

// ─────────────────────────────────────────────
//  AssetLoader
// ─────────────────────────────────────────────
class AssetLoader {
  constructor() {
    this.images        = {};
    this.sizes         = {};
    this.loaded        = [];   // 사용자 폴더에서 로드
    this.defaultLoaded = [];   // default_assets/에서 로드
    this.fallback      = [];   // 다른 이미지로 대체
    this.missing       = [];   // 사각형 사용
    this._userSet      = new Set();
    this._defaultSet   = new Set();
    this._ready        = false;
  }

  /**
   * 사용자 폴더 선택 시:
   *   1) 폴더 파일 매핑 → 2) default_assets/ 보완 → 3) 폴백 → 4) 사각형
   */
  async loadFromFiles(fileList) {
    this._init();

    // filename(no ext, lowercase) → File
    const map = {};
    for (const f of fileList) {
      map[f.name.replace(/\.png$/i, '').toLowerCase()] = f;
    }

    // Pass 1: 사용자 폴더
    await Promise.all(ASSET_KEYS.map(async (key) => {
      if (map[key]) {
        try {
          const img = await this._fileToImage(map[key]);
          this._register(key, img, 'user');
          return;
        } catch (_) {}
      }
      this.missing.push(key);
    }));

    // Pass 2: default_assets/ (누락 키만)
    await this._fillFromDefaultAssets();

    // Pass 3: 폴백
    this._applyFallbacks();

    // Pass 4: 사각형
    for (const key of [...this.missing]) this._useRect(key);

    this._ready = true;
    return {
      loaded       : this.loaded,
      defaultLoaded: this.defaultLoaded,
      fallback     : this.fallback,
      missing      : this.missing,
    };
  }

  /**
   * 폴더 선택 없이 시작 시:
   *   1) default_assets/ → 2) 폴백 → 3) 사각형
   */
  async loadDefaults() {
    this._init();
    this.missing = [...ASSET_KEYS];

    await this._fillFromDefaultAssets();
    this._applyFallbacks();
    for (const key of [...this.missing]) this._useRect(key);

    this._ready = true;
  }

  getImage(key)      { return this.images[key] || null; }
  getSize(key)       { return this.sizes[key]  || { w: 1, h: 1 }; }
  isReady()          { return this._ready; }
  isUserLoaded(key)  { return this._userSet.has(key); }
  /** 실제 이미지 파일로 로드된 키 (사용자 또는 default_assets, 폴백·사각형 제외) */
  isActualImage(key) { return this._userSet.has(key) || this._defaultSet.has(key); }

  // ── private ──

  _init() {
    this.images        = {};
    this.sizes         = {};
    this.loaded        = [];
    this.defaultLoaded = [];
    this.fallback      = [];
    this.missing       = [];
    this._userSet      = new Set();
    this._defaultSet   = new Set();
    this._ready        = false;
  }

  _register(key, img, source) {
    this.images[key] = img;
    this.sizes[key]  = { w: img.naturalWidth, h: img.naturalHeight };
    if (source === 'user') {
      this._userSet.add(key);
      this.loaded.push(key);
    } else {
      this._defaultSet.add(key);
      this.defaultLoaded.push(key);
    }
  }

  async _fillFromDefaultAssets() {
    await Promise.all([...this.missing].map(async (key) => {
      try {
        const img = await this._loadPath(`default_assets/${key}.png`);
        this._register(key, img, 'default');
        this._removeMissing(key);
      } catch (_) { /* 파일 없음 — missing 유지 */ }
    }));
  }

  _applyFallbacks() {
    const hasDinoRun1 = this._userSet.has('dino_run1') || this._defaultSet.has('dino_run1');
    if (hasDinoRun1) {
      for (const k of ['dino_run2','dino_jump','dino_duck1','dino_dead']) {
        if (this._isMissing(k)) {
          this.images[k] = this.images['dino_run1'];
          // 게임은 pose별 고정 크기로 렌더하므로 DEFAULT_DEFS 크기 유지
          this.sizes[k] = DEFAULT_DEFS[k]
            ? { w: DEFAULT_DEFS[k].w, h: DEFAULT_DEFS[k].h }
            : { ...this.sizes['dino_run1'] };
          this._removeMissing(k);
          this.fallback.push(k);
        }
      }
      // dino_duck1 처리 완료 후, dino_duck2 따로 처리
      if (this._isMissing('dino_duck2')){
        const k = 'dino_duck2';
        this.images[k] = this.images['dino_duck1'];
        this.sizes[k] = DEFAULT_DEFS[k]
            ? { w: DEFAULT_DEFS[k].w, h: DEFAULT_DEFS[k].h }
            : { ...this.sizes['dino_duck1'] };
          this._removeMissing(k);
          this.fallback.push(k);
      }
    }

    const hasBird1 = this._userSet.has('bird1') || this._defaultSet.has('bird1');
    if (hasBird1 && this._isMissing('bird2')) {
      this.images['bird2'] = this.images['bird1'];
      this.sizes['bird2']  = { ...this.sizes['bird1'] };
      this._removeMissing('bird2');
      this.fallback.push('bird2');
    }
  }

  _useRect(key) {
    const def = DEFAULT_DEFS[key];
    if (!def) return;
    this.images[key] = makeRect(def.w, def.h, def.color);
    this.sizes[key]  = { w: def.w, h: def.h };
  }

  _isMissing(key)     { return this.missing.includes(key); }
  _removeMissing(key) { this.missing = this.missing.filter(k => k !== key); }

  _loadPath(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload  = () => res(img);
      img.onerror = () => rej();
      img.src     = src;
    });
  }

  _fileToImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(); };
      img.src     = url;
    });
  }
}

// Singleton
const assetLoader = new AssetLoader();
