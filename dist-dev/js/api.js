const API_BASE = '';

// ─── Cache ───
const CACHE_PREFIX = 'yc_';
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000;

function cacheSet(key, data, hash, version) {
  try {
    const v = JSON.stringify({ data, hash: hash || '', ts: Date.now(), v: version || 0 });
    if (v.length > 4 * 1024 * 1024) return;  // too large, skip caching
    localStorage.setItem(CACHE_PREFIX + key, v);
  } catch (e) {
    // localStorage full → purge oldest cached entries and retry
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      keys.sort((a, b) => {
        try { return JSON.parse(localStorage.getItem(a)).ts - JSON.parse(localStorage.getItem(b)).ts; } catch { return 0; }
      });
      while (keys.length > 5) {
        localStorage.removeItem(keys.shift());
      }
      const v = JSON.stringify({ data, hash: hash || '', ts: Date.now(), v: version || 0 });
      if (v.length <= 4 * 1024 * 1024) localStorage.setItem(CACHE_PREFIX + key, v);
    } catch {}
  }
}
function cacheGet(key, version) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    // 接口结构变更防御：缓存版本与调用方要求不符时视为未命中（避免旧格式数据静默复用）
    if (version && entry.v !== version) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    return entry;
  } catch { return null; }
}
function cacheDel(key) {
  try { localStorage.removeItem(CACHE_PREFIX + key); } catch {}
}

function getUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'owner' || user.role === 'teacher');
}

let _fetchCount = 0;

async function fetchWithCache(key, fetchFn, renderFn, version) {
  const cached = cacheGet(key, version);
  if (cached) renderFn(cached.data);
  if (_fetchCount === 0) showNavLoading('加载中...');
  _fetchCount++;
  try {
    const hash = cached ? cached.hash || '' : '';
    const res = await apiPost('/api/sync', { pages: { [key]: hash } });
    const pr = res.pages[key];
    if (pr && pr.changed) {
      const freshData = await fetchFn();
      if (freshData !== undefined) { cacheSet(key, freshData, pr.hash, version); }
      renderFn(freshData);
    } else if (!cached) {
      const freshData = await fetchFn();
      if (freshData !== undefined) { cacheSet(key, freshData, '', version); }
      renderFn(freshData);
    }
  } catch (e) {
    if (!cached) {
      const freshData = await fetchFn();
      if (freshData !== undefined) { cacheSet(key, freshData, '', version); }
      renderFn(freshData);
    }
  } finally {
    _fetchCount--;
    if (_fetchCount === 0) hideNavLoading();
  }
}


const S = (d) => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  megaphone: S`<path d="m3 11 18-5v12L3 13Z"/><path d="M11.6 16.6a3 3 0 1 1-5.2-3"/>`,
  clipboard: S`<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14h6"/><path d="M9 18h6"/><path d="M9 10h6"/>`,
  check: S`<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`,
  'x-circle': S`<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>`,
  barrier: S`<rect x="4" y="9" width="16" height="10" rx="2"/><path d="M9 9V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4"/><path d="M2 19h20"/>`,
  alert: S`<path d="M12 3 2 21h20L12 3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  wrench: S`<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 0 0-1.4 0l-3.8 3.8Z"/><path d="M8.5 9.5 3 15v4h4l5.5-5.5"/><circle cx="17.5" cy="6.5" r=".5" fill="currentColor"/>`,
  person: S`<circle cx="12" cy="8" r="5"/><path d="M3 21a9 9 0 0 1 18 0"/>`,
  calendar: S`<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
  'file-text': S`<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>`,
  menu: S`<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>`,
  clock: S`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  wallet: S`<circle cx="12" cy="12" r="10"/><path d="M12 7v10"/><path d="M15 9h-4a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4H9"/>`,
  camera: S`<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/>`,
  'chevron-left': S`<polyline points="15 18 9 12 15 6"/>`,
  'chevron-right': S`<polyline points="9 18 15 12 9 6"/>`,
  'chevron-down': S`<polyline points="6 9 12 15 18 9"/>`,
  shield: S`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
  x: S`<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  'message-circle': S`<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>`,
  'check-circle': S`<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
  paperclip: S`<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>`,
  settings: S`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  'trending-up': S`<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`,
  'trending-down': S`<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>`,
  'refresh': S`<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`,
  'trophy': S`<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>`,
  'lock': S`<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  'book-check': S`<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><polyline points="9 10 11 12 15 8"/>`,
  'palette': S`<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-10-10-10z"/>`,
  'moon': S`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`,
  'sunrise': S`<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="M8 6l4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>`,
  'thumbs-up': S`<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>`,
  'star': S`<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`,
  'messages-square': S`<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>`,
  'keyboard': S`<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12"/><line x1="4" y1="16" x2="4" y2="10"/><line x1="20" y1="16" x2="20" y2="10"/>`,
  'lightbulb': S`<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>`,
  'clock-rewind': S`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="m4 4 3 3-3 3"/>`,
  'alert-triangle': S`<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  'trash-2': S`<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`,
  'lock-x': S`<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="14" y1="16" x2="18" y2="20"/><line x1="18" y1="16" x2="14" y2="20"/>`,
  'book-open': S`<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
  'users': S`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  'user-plus': S`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>`,
  'download': S`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`,
  'zap': S`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/>`,
  'search': S`<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,
  'award': S`<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>`,
  'eye-off': S`<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>`,
  'terminal': S`<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>`,
  'smile': S`<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>`,
  'image': S`<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`,
  'gift': S`<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>`,
  'map-pin': S`<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`,
  'message-square': S`<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
  'wand-2': S`<path d="m21.64 3.64-7.28 7.28"/><path d="m15.93 3.64 4.43 4.43"/><path d="M2 21l7.28-7.28"/><path d="m6.93 20.36 4.43-4.43"/><path d="M4 4l.01.01"/><path d="M8 8l.01.01"/><path d="M16 16l.01.01"/><path d="M20 20l.01.01"/>`,
  'party-popper': S`<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="7" r="2"/><path d="M12 12 3 21"/><path d="m8.5 3.5 3 3"/><path d="m18 13 3 3"/><path d="m14.5 17.5 3 3"/>`,
  'cookie': S`<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5A10 10 0 0 0 12 2Z"/><circle cx="8" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="10" r="1"/><circle cx="14" cy="16" r="1"/><circle cx="9" cy="14" r="1"/>`,
  'alert-circle': S`<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>`,
  'heart': S`<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>`,
  'package': S`<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>`,
  'cloud': S`<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`,
  'database': S`<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>`,
  'hard-drive': S`<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>`,
  'cube': S`<path d="M21 16a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>`,
  'upload': S`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`,
  'bell': S`<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`,
  'inbox': S`<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>`,
  'user-check': S`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>`,
  'clock': S`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  'hourglass': S`<path d="M6 3h12"/><path d="M6 8a6 6 0 0 0 12 0c0-3-6-5-6-5"/><path d="M6 21h12"/><path d="M6 16a6 6 0 0 1 12 0c0 3-6 5-6 5"/>`,
};
function icon(name) {
  return ICONS[name] || '';
}

async function api(path, options = {}, retries = 1) {
  const headers = { ...options.headers };

  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  const signal = options.signal || controller.signal;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请检查网络后重试');
    }
    // Network error (offline, DNS, etc.)
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return api(path, options, retries - 1);
    }
    throw new Error('网络连接失败，请检查网络后重试');
  }
  clearTimeout(timeoutId);

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    if (retries > 0 && res.status !== 403 && res.status !== 401) {
      await new Promise(r => setTimeout(r, 1500));
      return api(path, options, retries - 1);
    }
    throw new Error('安全验证失败，请刷新页面后重试');
  }

  let data;
  try {
    data = await res.json();
  } catch {
    if (retries > 0 && res.status !== 502 && res.status !== 503 && res.status !== 504) {
      await new Promise(r => setTimeout(r, 1500));
      return api(path, options, retries - 1);
    }
    throw new Error('服务器返回格式错误，请刷新页面后重试');
  }
  if (!data.success) {
    throw new Error(data.error || '请求失败');
  }
  if (data._cleanup > 0) toast(`已自动清理 ${data._cleanup} 条冗余数据`, 'info');
  return data.data;
}

// ─── shortcuts ───
function apiGet(path) { return api(path); }

function apiPost(path, body) {
  return api(path, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

function apiPut(path, body) {
  return api(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

function apiDel(path) {
  return api(path, { method: 'DELETE' });
}

// ─── toast ───
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer') || (() => {
    const d = document.createElement('div');
    d.id = 'toastContainer'; d.className = 'toast-container'; d.setAttribute('aria-live', 'polite');
    document.body.appendChild(d);
    return d;
  })();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('exit'); setTimeout(() => el.remove(), 250); }, 3000);
}

// ─── site closed check ───
let _siteClosed = false;
let _siteClosedMessage = '';
let _overlayCaptcha = null;
const STATUS_CACHE_KEY = 'site_status';
const STATUS_CACHE_TTL = 30000;

function getCachedStatus() {
  try {
    const raw = sessionStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.closed !== 'boolean') { sessionStorage.removeItem(STATUS_CACHE_KEY); return null; }
    const { closed, message, ts } = parsed;
    if (Date.now() - ts > STATUS_CACHE_TTL) { sessionStorage.removeItem(STATUS_CACHE_KEY); return null; }
    return { closed, message };
  } catch { return null; }
}

function setCachedStatus(closed, message) {
  try { sessionStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ closed, message, ts: Date.now() })); } catch {}
}

function isPrivilegedRole(user) {
  return isAdmin(user);
}

function applyOverlay(show) {
  const el = document.getElementById('sco');
  if (!el) return;
  if (show) {
    el.innerHTML = '';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--md-primary);display:flex;align-items:center;justify-content:center;color:var(--md-on-primary);font-family:var(--md-font-body,sans-serif);text-align:center;padding:24px;flex-direction:column;opacity:1;pointer-events:auto;transition:opacity .3s';
  } else {
    el.remove();
  }
}

let _overlayActive = false;

async function checkSiteClosed() {
  _overlayActive = false;
  const cached = getCachedStatus();
  if (cached) {
    _siteClosed = cached.closed;
    _siteClosedMessage = cached.message || '';
    if (_siteClosed && !isPrivilegedRole(getUser())) {
      _overlayActive = true;
      applyOverlay(true);
      showSiteClosedOverlay();
    }
  }
  const closed = await refreshSiteStatus();
  if (closed && !isPrivilegedRole(getUser())) {
    if (!_overlayActive) {
      applyOverlay(true);
      showSiteClosedOverlay();
    }
    return true;
  }
  applyOverlay(false);
  return false;
}

async function refreshSiteStatus() {
  try {
    const data = await apiGet('/api/settings');
    _siteClosed = !!data.site_closed;
    _siteClosedMessage = data.site_closed_message || '';
    setCachedStatus(_siteClosed, _siteClosedMessage);
    return _siteClosed;
  } catch {
    return false;
  }
}

function showSiteClosedOverlay() {
  const el = document.getElementById('sco');
  if (!el) return;
  el.innerHTML = `
    <h1>${icon('wrench')} 网站维护中</h1>
    <p id="siteClosedMsg"></p>
    <div class="admin-login-down" style="margin-top:40px;border-top:1px solid rgba(255,255,255,.2);padding-top:24px;width:100%;max-width:320px">
      <p style="font-size:.85rem;opacity:.6;margin-bottom:12px">管理员登录</p>
      <input class="form-input" id="adminLoginName" placeholder="管理员姓名" style="margin-bottom:8px" autocomplete="username">
      <input class="form-input" type="password" id="adminLoginPwd" placeholder="密码" style="margin-bottom:12px" autocomplete="current-password">
      <div id="overlayCaptchaBox" style="margin-bottom:12px"></div>
      <button class="btn btn-primary btn-block" id="adminLoginBtn" style="font-size:.95rem">登录</button>
      <p id="adminLoginError" style="font-size:.82rem;color:var(--md-error);margin-top:8px;display:none"></p>
    </div>`;
  trapFocus(el);
  const msg = _siteClosedMessage || '雅礼团委-通办暂时关闭，请稍后再访问';
  const msgEl = document.getElementById('siteClosedMsg');
  if (msgEl) msgEl.textContent = msg;
  initOverlayCaptcha();
  const btn = document.getElementById('adminLoginBtn');
  btn.removeEventListener('click', handleAdminLogin);
  btn.addEventListener('click', handleAdminLogin);
}

function initOverlayCaptcha() {
  if (typeof CaptchaWidget === 'undefined') {
    const s = document.createElement('script');
    s.src = '/js/captcha.js';
    s.onload = () => { _overlayCaptcha = new CaptchaWidget('overlayCaptchaBox'); };
    document.head.appendChild(s);
  } else {
    _overlayCaptcha = new CaptchaWidget('overlayCaptchaBox');
  }
}

async function handleAdminLogin() {
  const name = document.getElementById('adminLoginName').value.trim();
  const password = document.getElementById('adminLoginPwd').value;
  const btn = document.getElementById('adminLoginBtn');
  const errEl = document.getElementById('adminLoginError');
  if (!name || !password) { errEl.textContent = '请输入姓名和密码'; errEl.style.display = ''; return; }
  btn.disabled = true; btn.textContent = '登录中...';
  errEl.style.display = 'none';
  try {
    const data = await apiPost('/api/auth/login', { name, password, ...(_overlayCaptcha ? _overlayCaptcha.getData() : {}) });
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.password_reset) {
      alert('你的账号密码已重置，初始密码为 Yali@1234，请及时修改密码');
    }
    // merge local achievements to server
    const localAch2 = (() => { try { return JSON.parse(localStorage.getItem('achievements') || '[]'); } catch { return []; } })();
    if (localAch2.length) {
      const serverAch = data.user.achievements || [];
      const merged = localAch2.filter(a => !serverAch.includes(a));
      for (const id of merged) {
        try { apiPost('/api/achievements/unlock', { id }); } catch {}
      }
      localStorage.removeItem('achievements');
    }
    if (data.user.role !== 'admin' && data.user.role !== 'owner' && data.user.role !== 'teacher') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      errEl.textContent = '仅管理员可在维护期间登录';
      errEl.style.display = '';
      btn.disabled = false; btn.textContent = '登录';
      return;
    }
    const sco = document.getElementById('sco');
    if (sco) sco.remove();
    location.reload();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = '';
    btn.disabled = false; btn.textContent = '登录';
    if (_overlayCaptcha) _overlayCaptcha.refresh();
  }
}

// ─── Page transition (seamless navigation) ───
let _pageDirty = false;
function setPageDirty(dirty) { _pageDirty = dirty; }

window.addEventListener('beforeunload', e => {
  if (_pageDirty) { e.preventDefault(); e.returnValue = ''; }
});

document.addEventListener('click', e => {
  if (e.defaultPrevented) return;
  const a = e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('javascript:') || a.hasAttribute('download') || a.target === '_blank') return;
  if (_pageDirty) {
    e.preventDefault();
    confirmAction('有未保存的更改，确定离开吗？', ok => {
      if (!ok) return;
      _pageDirty = false;
      location.href = href;
  });
}
});

document.addEventListener('click', function(e) {
  var target = e.target.closest('[data-action]');
  if (!target) return;
  // 表单上的 data-action 由 submit handler 处理，避免点击输入框时提前触发并阻止 radio/checkbox 选中
  if (target.tagName === 'FORM') return;
  e.preventDefault();
  var fn = window[target.dataset.action];
  if (typeof fn === 'function') fn(target.dataset, target);
});

document.addEventListener('submit', function(e) {
  var target = e.target.closest('[data-action]');
  if (!target) return;
  e.preventDefault();
  var fn = window[target.dataset.action];
  if (typeof fn === 'function') fn(target.dataset, target);
});

// ─── Image compression ───
const IMG_MAX_SIZE = 900 * 1024;
const IMG_MAX_DIM = 1920;

function compressImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > IMG_MAX_DIM || height > IMG_MAX_DIM) {
        const ratio = Math.min(IMG_MAX_DIM / width, IMG_MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.85;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > IMG_MAX_SIZE && quality > 0.1) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ─── Lazy image loading + blob cache ───
const IMG_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23e8eaed" width="400" height="300"/%3E%3C/svg%3E';
const _blobCache = new Map();
const _blobCacheMax = 100;
const _imgQueue = [];
let _imgQueueBusy = false;

function dataUrlToBlobUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.startsWith('blob:')) return dataUrl || '';
  if (_blobCache.has(dataUrl)) return _blobCache.get(dataUrl);
  try {
    if (_blobCache.size >= _blobCacheMax) {
      const firstKey = _blobCache.keys().next().value;
      if (firstKey) {
        const oldUrl = _blobCache.get(firstKey);
        if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
        _blobCache.delete(firstKey);
      }
    }
    const mime = dataUrl.match(/^data:([^;]+)/)?.[1] || 'image/jpeg';
    const bin = atob(dataUrl.split(',')[1]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], { type: mime });
    const url = URL.createObjectURL(blob);
    _blobCache.set(dataUrl, url);
    return url;
  } catch { return dataUrl; }
}

function _processImgQueue() {
  if (!_imgQueue.length) { _imgQueueBusy = false; return; }
  if (_imgQueueBusy) return;
  _imgQueueBusy = true;
  const img = _imgQueue.shift();
  // skip orphaned images (removed from DOM)
  if (!img.isConnected) { _imgQueueBusy = false; _processImgQueue(); return; }
  const src = dataUrlToBlobUrl(img.dataset.src);
  img.src = src;
  const done = () => {
    img.removeAttribute('data-src');
    img.dataset.loaded = '1';
    _imgQueueBusy = false;
    _processImgQueue();
  };
  if (img.complete && img.naturalWidth) { done(); return; }
  img.onload = done;
  img.onerror = done;
}

let _lazyObserver = null;

function lazyLoadImages(root) {
  _imgQueueBusy = false;
  if (_lazyObserver) _lazyObserver.disconnect();
  const imgs = (root || document).querySelectorAll('img[data-src]:not([data-loaded])');
  if (!imgs.length) return;
  _lazyObserver = new IntersectionObserver((entries) => {
    let added = false;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      _lazyObserver.unobserve(img);
      _imgQueue.push(img);
      added = true;
    }
    if (added) _processImgQueue();
  }, { rootMargin: '100px' });
  for (const img of imgs) _lazyObserver.observe(img);
}

function closeModal(overlay) {
  if (!overlay || overlay.style.display === 'none') return;
  var fn = overlay._onClose;
  overlay._onClose = null;
  try { if (typeof fn === 'function') fn(); } catch (e) {}
  if (overlay._trapHandler) { overlay.removeEventListener('keydown', overlay._trapHandler); overlay._trapHandler = null; }
  if (overlay._countdownTimer) { clearInterval(overlay._countdownTimer); overlay._countdownTimer = null; }
  const modal = overlay.querySelector('.modal');
  overlay.classList.add('closing');
  if (modal) modal.classList.add('closing');
  // 保存 timer ID，以便 openModal 在链式调用时取消挂起的关闭动画
  overlay._closeTimer = setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('closing');
    if (modal) modal.classList.remove('closing');
    document.body.style.overflow = '';
    overlay._closeTimer = null;
  }, 280);
}

function trapFocus(container) {
  const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  const old = container._trapHandler;
  if (old) container.removeEventListener('keydown', old);
  const handler = function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  container._trapHandler = handler;
  container.addEventListener('keydown', handler);
  first.focus();
}

function confirmAction(msg, cb, allowHtml = false) {
  openModal({
    title: '',
    body: '<p style="margin-bottom:20px;font-size:1rem;color:var(--md-on-surface);text-align:center">' + (allowHtml ? msg : escapeHtml(msg)) + '</p>',
    maxWidth: '380px',
    footer: [
      { text: '确定', variant: 'primary', onClick: function() { var c = document.getElementById('modalContainer'); c._onClose = null; closeModal(c); cb(true); } },
      { text: '取消', variant: 'outline', onClick: function() { closeModal(document.getElementById('modalContainer')); } }
    ],
    onClose: function() { cb(false); }
  });
}

// ─── CSP violation handler (Kaspersky etc.) ───
document.addEventListener('securitypolicyviolation', e => {
  if (e.blockedURI.includes('kaspersky-labs.com')) return;
  console.warn(`[CSP] 被阻止: ${e.blockedURI}（${e.effectiveDirective}）`);
});

// ─── Personalize (apply on every page) ───
(function applyPersonalize() {
  try {
    let raw = localStorage.getItem('personalize');
    if (!raw) {
      const m = document.cookie.match(/(?:^|;\s*)personalize=([^;]*)/);
      if (m) raw = decodeURIComponent(m[1]);
    }
    const prefs = JSON.parse(raw || '{}');
    if (prefs.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (prefs.theme === 'auto') {
      document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        const p = JSON.parse(localStorage.getItem('personalize') || '{}');
        if (p.theme === 'auto') document.documentElement.classList.toggle('dark', e.matches);
      });
    }
    if (prefs.color) {
      document.documentElement.style.setProperty('--md-primary', prefs.color);
      const r = parseInt(prefs.color.slice(1,3), 16), g = parseInt(prefs.color.slice(3,5), 16), b = parseInt(prefs.color.slice(5,7), 16);
      document.documentElement.style.setProperty('--md-primary-dim', `rgba(${r},${g},${b},.8)`);
    }
    if (prefs.fontSize) {
      document.documentElement.style.fontSize = prefs.fontSize + 'px';
    }
    if (prefs.animation === false) {
      document.documentElement.classList.add('reduce-animation');
    }
    if (prefs.noAnimation === true) {
      document.documentElement.classList.add('no-animation');
    }
    if (prefs.superGraphic === true) {
      document.documentElement.classList.add('super-graphic');
      if (!document.getElementById('sgCss')) {
        const link = document.createElement('link');
        link.id = 'sgCss'; link.rel = 'stylesheet'; link.href = '/css/graphic.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('sgJs')) {
        const script = document.createElement('script');
        script.id = 'sgJs'; script.src = '/js/graphic.js';
        document.head.appendChild(script);
      }
    }
  } catch (_) {}
})();

// ─── Cookie consent ───
function initCookieConsent() {
  if (localStorage.getItem('cookieConsent')) return;
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = `<span class="cookie-banner-icon">${icon('cookie')}</span><span>本站使用 Cookie 维持登录。继续使用即表示同意。</span><button class="btn btn-sm btn-primary" data-action="acceptCookieConsent">知道了</button>`;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));
}
window.acceptCookieConsent = async function() {
  localStorage.setItem('cookieConsent', 'true');
  const b = document.querySelector('.cookie-banner');
  if (b) { b.classList.remove('show'); setTimeout(() => b.remove(), 400); }
  if (await unlockAchievement('cookie_monster')) showAchievementToast('cookie_monster');
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCookieConsent);
else initCookieConsent();

// horizontal scroll for .img-row on mouse wheel
(function initImgRowScroll() {
  function attachRow(row) {
    if (row.dataset._hz) return;
    row.dataset._hz = '1';
    row.addEventListener('wheel', e => {
      if (row.scrollWidth > row.clientWidth) {
        e.preventDefault();
        const d = e.deltaY;
        row.scrollLeft += d * (Math.abs(d) < 1 ? 30 : 1);
      }
    }, { passive: false });
  }
  document.querySelectorAll('.img-row:not([data-_hz])').forEach(attachRow);
  let mo = new MutationObserver(() => {
    document.querySelectorAll('.img-row:not([data-_hz])').forEach(attachRow);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  window._imgRowObserver = mo;
})();

// sync cookie when localStorage changes from another tab
window.addEventListener('storage', e => {
  if (e.key === 'personalize' && e.newValue) {
    document.cookie = 'personalize=' + encodeURIComponent(e.newValue) + ';path=/;max-age=31536000';
  }
});

// ─── Idle Auto-Logout (20 minutes) ───
(function initIdleLogout() {
  const TIMEOUT = 20 * 60 * 1000;
  const WARN_AT = 18 * 60 * 1000;
  let timer = null;
  let warnTimer = null;
  let warned = false;

  function doLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    apiPost('/api/auth/logout').catch(() => {});
    window.location.href = 'login.html';
  }

  function showWarning() {
    if (warned) return;
    warned = true;
    toast('你已闲置 18 分钟，2 分钟后将自动退出登录', 'info');
  }

  function resetTimer() {
    if (!getUser()) return;
    warned = false;
    clearTimeout(timer);
    clearTimeout(warnTimer);
    warnTimer = setTimeout(showWarning, WARN_AT);
    timer = setTimeout(doLogout, TIMEOUT);
  }

  const _idleUser = getUser(); if (_idleUser && _idleUser.role !== 'public') {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, resetTimer, { passive: true });
    });
    resetTimer();
  }
})();

// ─── Achievements ───
const ACHIEVEMENT_DEFS = [
  { id: 'read_all_changelog', title: '真的会有人看这个吗？', desc: '打开所有更新日志条目并停留30秒', icon: 'book-check' },
  { id: 'color_freak', title: '五彩斑斓的黑', desc: '在10秒内切换6次以上主题色', icon: 'palette' },
  { id: 'night_owl', title: '夜猫子', desc: '凌晨的校园别有一番风味（00:00–05:00登录）', icon: 'moon' },
  { id: 'early_bird', title: '早起的鸟儿', desc: '清晨的第一缕阳光（06:00–08:00登录）', icon: 'sunrise' },
  { id: 'high_five', title: '击掌！', desc: '连续点击顶部logo 10次', icon: 'thumbs-up' },
  { id: 'collector', title: '收藏家', desc: '解锁半数以上的成就', icon: 'star' },
  { id: 'chatty', title: '社交恐怖分子', desc: '在动态发送超过50条消息', icon: 'messages-square' },
  { id: 'commenter', title: '键盘侠', desc: '累计提交超过10条评论或议题', icon: 'keyboard' },
  { id: 'proposer', title: '提案王', desc: '累计创建超过5个议题', icon: 'lightbulb' },
  { id: 'time_traveler', title: '时间旅行者', desc: '翻阅尘封的记忆（查看超过90天的内容）', icon: 'clock-rewind' },
  { id: 'intruder', title: '入侵者', desc: '触发404越权警告', icon: 'alert-triangle' },
  { id: 'reset_master', title: '删繁就简', desc: '在个性化页面重置所有设置', icon: 'trash-2' },
  { id: 'locked_out', title: '被拒之门外', desc: '连续3次输错密码', icon: 'lock-x' },
  { id: 'reader', title: '阅览室常客', desc: '累计查看50条公告', icon: 'book-open' },
  { id: 'power', title: 'Power...?Point.', desc: '成为管理员或站长', icon: 'shield' },
  { id: 'extrovert', title: 'e人', desc: '在动态发送超过100条消息', icon: 'users' },
  { id: 'introvert', title: 'i人', desc: '只看不说话，浏览动态超过5次而不发一言', icon: 'eye-off' },
  { id: 'lightning', title: '闪电侠', desc: '消息发出后3秒内撤回', icon: 'zap' },
  { id: 'archaeologist', title: '考古学家', desc: '查看超过180天前的公告', icon: 'search' },
  { id: 'ocd', title: '黑白无常', desc: '深色/浅色模式切换超过20次', icon: 'refresh' },
  { id: 'night_owl2', title: '夜猫子2.0', desc: '连续3天在凌晨登录', icon: 'moon' },
  { id: 'novice', title: '初来乍到', desc: '首次提交议题、评论或投票', icon: 'award' },
  { id: 'pigeon', title: '鸽子', desc: '注册后超过31天没登录', icon: 'clock-rewind' },
  { id: 'dev', title: '开发者', desc: '在控制台输入特定指令', icon: 'terminal' },
  { id: 'easter_egg', title: '不是彩蛋', desc: '点击关于页面的雅礼校徽5次', icon: 'smile' },
  { id: 'screenshot', title: '截图侠', desc: '尝试复制页面中的图片', icon: 'image' },
  { id: 'frequent_404', title: '404常客', desc: '累计访问404页面超过3次', icon: 'alert-circle' },
  { id: 'super_graphic', title: 'Super Graphic', desc: '开启华丽动画效果', icon: 'party-popper' },
  { id: 'attendance', title: '全勤奖', desc: '连续7天登录', icon: 'calendar' },
  { id: 'moonlight', title: '月光族', desc: '在月底最后一天登录', icon: 'moon' },
  { id: 'anniversary', title: '周年庆', desc: '注册满一整年那天登录', icon: 'gift' },
  { id: 'cookie_monster', title: '浏览器吃下了所有饼干', desc: '接受了 Cookie 告知', icon: 'cookie' },
  { id: 'feedback_first', title: '我有话要说', desc: '首次提交反馈', icon: 'message-square' },
  { id: 'feedback_tenth', title: '反馈反馈反馈反馈！', desc: '累计提交10次反馈', icon: 'message-square' },
  { id: 'green_bubble', title: '你也要学绿泡泡吗', desc: '点击更新日志 v3.0.0 中的神秘句子', icon: 'message-circle' },
];
function getAchievements() {
  const u = getUser();
  const fromUser = (u && Array.isArray(u.achievements)) ? u.achievements : [];
  try {
    const fromLocal = JSON.parse(localStorage.getItem('achievements') || '[]');
    if (Array.isArray(fromLocal) && fromLocal.length) {
      return [...new Set([...fromUser, ...fromLocal])];
    }
  } catch {}
  return fromUser;
}
async function unlockAchievement(id) {
  const list = getAchievements();
  if (list.includes(id)) return false;
  try {
    const data = await apiPost('/api/achievements/unlock', { id });
    const u = getUser();
    if (u) { u.achievements = data.achievements; localStorage.setItem('user', JSON.stringify(u)); }
    checkCollector();
    return true;
  } catch {
    list.push(id);
    localStorage.setItem('achievements', JSON.stringify(list));
    return true;
  }
}
function hasAchievement(id) {
  return getAchievements().includes(id);
}
function showAchievementToast(id) {
  const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
  if (!def) return;
  const el = document.createElement('div');
  el.className = 'ach-toast';
  el.innerHTML = `<div class="ach-toast-icon">${icon(def.icon)}</div>
<div class="ach-toast-body">
  <div class="ach-toast-title">成就已解锁！</div>
  <div class="ach-toast-name">${def.title}</div>
  <div class="ach-toast-desc">${def.desc}</div>
</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 5000);
}
function checkTimeAchievements() {
  if (!getUser()) return;
  const h = new Date().getHours();
  if (h >= 0 && h < 6) {
    unlockAchievement('night_owl').then(d => { if (d) showAchievementToast('night_owl'); });
    // night_owl2: 3 consecutive midnight logins
    let dates = JSON.parse(localStorage.getItem('_nightOwlDates') || '[]');
    const today = new Date().toDateString();
    if (!dates.includes(today)) {
      dates.push(today);
      if (dates.length > 3) dates = dates.slice(-3);
      localStorage.setItem('_nightOwlDates', JSON.stringify(dates));
      if (dates.length >= 3) {
        const sorted = [...dates].sort();
        const d1 = new Date(sorted[sorted.length - 3]);
        const d2 = new Date(sorted[sorted.length - 2]);
        const d3 = new Date(sorted[sorted.length - 1]);
        if ((d2 - d1) / 86400000 === 1 && (d3 - d2) / 86400000 === 1) {
          unlockAchievement('night_owl2').then(d => { if (d) showAchievementToast('night_owl2'); });
        }
      }
    }
  }
  if (h >= 6 && h < 9) unlockAchievement('early_bird').then(d => { if (d) showAchievementToast('early_bird'); });
}
function checkCollector() {
  const total = ACHIEVEMENT_DEFS.length;
  const unlocked = getAchievements().length;
  if (unlocked >= Math.ceil(total / 2)) {
    unlockAchievement('collector').then(d => { if (d) showAchievementToast('collector'); });
  }
}
async function checkCountAchievements() {
  if (!getUser()) return;
  try {
    const data = await apiPost('/api/achievements/check-counts', {});
    if (data.unlocked && data.unlocked.length) {
      const u = getUser();
      if (u) { u.achievements = data.achievements; localStorage.setItem('user', JSON.stringify(u)); }
      data.unlocked.forEach(id => showAchievementToast(id));
    }
  } catch {}
}
function checkTimeTraveler(createdAt) {
  if (!createdAt || !getUser()) return;
  const match = createdAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return;
  const then = Date.UTC(+match[1], +match[2] - 1, +match[3]);
  const now = Date.now();
  const days = (now - then) / 86400000;
  if (days > 90 && !hasAchievement('time_traveler')) {
    unlockAchievement('time_traveler').then(d => { if (d) showAchievementToast('time_traveler'); });
  }
  if (days > 180 && !hasAchievement('archaeologist')) {
    unlockAchievement('archaeologist').then(d => { if (d) showAchievementToast('archaeologist'); });
  }
}

function checkNovice() {
  if (!getUser() || localStorage.getItem('_noviceDone')) return;
  localStorage.setItem('_noviceDone', '1');
  unlockAchievement('novice').then(d => { if (d) showAchievementToast('novice'); });
}

// ── Easter egg: 开发者 ──
window.__yali = async function() { const d = await unlockAchievement('dev'); if (d) showAchievementToast('dev'); };

// auto-run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('button:not([type])').forEach(b => b.type = 'button');
    lazyLoadImages();
    checkTimeAchievements();
    (async () => { const u = getUser(); if (u && (u.role === 'admin' || u.role === 'owner')) { const d = await unlockAchievement('power'); if (d) showAchievementToast('power'); } })();
    // 截图侠
    document.addEventListener('copy', () => {
      const sel = window.getSelection();
      if (sel && sel.toString()) {
        const range = sel.getRangeAt(0);
        if (range && range.commonAncestorContainer && range.commonAncestorContainer.ownerDocument) {
          const el = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
          if (el && (el.tagName === 'IMG' || el.closest('img'))) {
            unlockAchievement('screenshot').then(d => { if (d) showAchievementToast('screenshot'); });
          }
        }
      }
    });
  });
} else {
  document.querySelectorAll('button:not([type])').forEach(b => b.type = 'button');
  lazyLoadImages();
  checkTimeAchievements();
  (async () => { const u = getUser(); if (u && (u.role === 'admin' || u.role === 'owner')) { const d = await unlockAchievement('power'); if (d) showAchievementToast('power'); } })();
  document.addEventListener('copy', () => {
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      const range = sel.getRangeAt(0);
      if (range && range.commonAncestorContainer && range.commonAncestorContainer.ownerDocument) {
        const el = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
        if (el && (el.tagName === 'IMG' || el.closest('img'))) {
          unlockAchievement('screenshot').then(d => { if (d) showAchievementToast('screenshot'); });
        }
      }
    }
  });
}

// ── 动态加载 features.js（功能开关邀请弹窗）──
(function() {
  function loadFeatures() {
    if (document.querySelector('script[src*="features.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/features.js?v=' + (window.APP_VERSION || Date.now());
    s.async = true;
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFeatures);
  } else {
    loadFeatures();
  }
})();
