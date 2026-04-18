import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_CONFIG = window.APP_CONFIG || {};
const BRAND = {
  appName: APP_CONFIG.appName || 'VAULT',
  appTagline: APP_CONFIG.appTagline || 'Video Management System',
  pageTitle: APP_CONFIG.pageTitle || 'VAULT — Video Manager Pro',
  collectionTitle: APP_CONFIG.collectionTitle || 'Collection',
  emptyTitle: APP_CONFIG.emptyTitle || 'Your vault is empty',
  emptySub: APP_CONFIG.emptySub || '上のボタンからローカル動画・音楽・画像を選んでライブラリへ追加してください',
  loginButtonText: APP_CONFIG.loginButtonText || 'Enter Vault',
  iconBasePath: APP_CONFIG.iconBasePath || './assets/icons',
  favicon: APP_CONFIG.favicon || './assets/icons/favicon.svg',
  appleTouchIcon: APP_CONFIG.appleTouchIcon || './assets/icons/apple-touch-icon.png'
};

function applyBranding() {
  document.title = BRAND.pageTitle;
  document.querySelectorAll('.auth-logo, .topbar-logo').forEach(el => { el.textContent = BRAND.appName; });
  const sub = document.querySelector('.auth-sub');
  if (sub) sub.textContent = BRAND.appTagline;
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.textContent = BRAND.loginButtonText;
  const gridTitle = document.querySelector('.grid-title');
  if (gridTitle) gridTitle.textContent = BRAND.collectionTitle;
  const emptyTitle = document.querySelector('.empty-state-text');
  if (emptyTitle) emptyTitle.textContent = BRAND.emptyTitle;
  const emptySub = document.getElementById('empty-state-sub');
  if (emptySub) emptySub.textContent = BRAND.emptySub;
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon && BRAND.favicon) favicon.href = BRAND.favicon;
  const apple = document.querySelector('link[rel="apple-touch-icon"]');
  if (apple && BRAND.appleTouchIcon) apple.href = BRAND.appleTouchIcon;
}


  const SUPABASE_URL = APP_CONFIG.supabaseUrl || 'YOUR_SUPABASE_URL';
  const SUPABASE_ANON_KEY = APP_CONFIG.supabaseAnonKey || 'YOUR_SUPABASE_ANON_KEY';

  const DB_NAME = 'vault_db_supabase';
  const DB_VERSION = 2;
  const VIDEOS_STORE = 'videos';
  const APP_PREFS_KEY = 'vault_app_prefs_v2';
  const URL_DRAFT_KEY = 'vault_url_draft_v1';
  const GUEST_EMAIL = '__guest__@vault.local';

  let db = null;
  let currentUser = null;
  let pendingEmailForResend = '';
  let currentFilter = 'all';
  let selectedIds = new Set();
  let editTargetId = null;
  let videosCache = [];
  let mediaViewMode = (loadPrefs().mediaView || 'player');
  const posterOpenIds = new Set();
  const localSessionObjects = new Map();
  const activeRenderObjectUrls = new Map();
  const activeVideoJsPlayers = new Map();
  const activePlyrPlayers = new Map();
  const activeHowlPlayers = new Map();
  const activeHowlStates = new Map();
  const FILE_ACCEPT_TYPES = [{ description: 'Media', accept: { 'video/*': ['.mp4','.webm','.mov','.m4v','.ogv','.ogg'], 'audio/*': ['.mp3','.wav','.m4a','.aac','.flac','.opus','.oga'], 'image/*': ['.jpg','.jpeg','.png','.gif','.webp','.avif','.svg'] } }];

  applyBranding();

  const prefs = loadPrefs();
  const authMsgEl = document.getElementById('auth-msg');
  let _currentSort = prefs.sort || 'newest';

  const hasValidSupabaseConfig = () => SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('YOUR_SUPABASE_URL') && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');
  const supabase = hasValidSupabaseConfig() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(APP_PREFS_KEY)) || { search: '', sort: 'newest', layout: 1, filter: 'all', mediaView: 'player' };
    } catch { return { search: '', sort: 'newest', layout: 1, filter: 'all', mediaView: 'player' }; }
  }
  function savePrefs() {
    localStorage.setItem(APP_PREFS_KEY, JSON.stringify({
      search: document.getElementById('search-input')?.value || '',
      sort: document.getElementById('sort-select')?.value || _currentSort || 'newest',
      layout: currentLayoutCols,
      filter: currentFilter,
      mediaView: mediaViewMode
    }));
  }
  function showMsg(msg, type='') { authMsgEl.innerHTML = msg; authMsgEl.className = 'auth-msg ' + type; }
  function setBusy(btnId, busy) { const btn = document.getElementById(btnId); if (btn) btn.disabled = !!busy; }
  const showToast = (...args) => toast(...args);

  function toast(message, type='') {
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }
  function escapeHtml(text='') { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
  function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
  function currentRedirectUrl(mode) { const url = new URL(window.location.href); url.searchParams.set('auth_mode', mode); url.hash = ''; return url.toString(); }
  function formatDate(ts) { return new Date(ts || Date.now()).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }); }

  function formatDateTime(ts) { return new Date(ts || Date.now()).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function setDraftStatus(text) { const el = document.getElementById('draft-status'); if (el) el.innerHTML = text; }
  function getUrlDraft() { try { return localStorage.getItem(URL_DRAFT_KEY) || ''; } catch { return ''; } }
  function setUrlDraft(value) { try { localStorage.setItem(URL_DRAFT_KEY, value || ''); } catch {} }
  function clearUrlDraft() { try { localStorage.removeItem(URL_DRAFT_KEY); } catch {} }
  function getVisibleSelectedRows() { const shownIds = new Set(filteredVideos().map(v => v.id)); return videosCache.filter(v => shownIds.has(v.id) && selectedIds.has(v.id)); }
  function getSelectedRows() { return videosCache.filter(v => selectedIds.has(v.id)); }
  async function batchPatchSelected(patchFactory) {
    const rows = getSelectedRows();
    if (!rows.length) return toast('選択アイテムがありません', 'error');
    for (const row of rows) await putVideoRecord({ ...row, ...patchFactory(row), updatedAt: Date.now() });
    await renderVideos();
  }
  function updateStatsRow() {
    const rows = videosCache || [];
    const counts = {
      total: rows.length,
      favorite: rows.filter(v => v.favorite).length,
      viewed: rows.filter(v => v.viewed).length,
      gif: rows.filter(v => v.type === 'gif').length,
      video: rows.filter(v => ['youtube','vimeo','direct','behance'].includes(v.type)).length,
      audio: rows.filter(v => v.type === 'audio').length,
      local: rows.filter(v => isLocalLibraryItem(v)).length,
      image: rows.filter(v => ['image'].includes(v.type)).length,
      note: rows.filter(v => (v.note || '').trim()).length,
      tag: rows.filter(v => (v.tags || []).length).length
    };
    const el = document.getElementById('stats-row');
    if (!el) return;
    el.innerHTML = [
      `総数 ${counts.total}`,
      `★ ${counts.favorite}`,
      `視聴済み ${counts.viewed}`,
      `GIF ${counts.gif}`,
      `動画 ${counts.video}`,
      `音楽 ${counts.audio}`,
      `ローカル ${counts.local}`,
      `画像 ${counts.image}`,
      `メモあり ${counts.note}`,
      `タグあり ${counts.tag}`
    ].map(v => `<span class="stat-pill">${v}</span>`).join('');
  }
  function updateRecentTagsRow() {
    const box = document.getElementById('recent-tags-row');
    if (!box) return;
    const freq = new Map();
    (videosCache || []).forEach(v => (v.tags || []).forEach(tag => freq.set(tag, (freq.get(tag) || 0) + 1)));
    const topTags = [...freq.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'ja')).slice(0, 10);
    if (!topTags.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<span class="bulk-hint">よく使うタグ:</span>' + topTags.map(([tag, n]) => `<button class="chip" onclick="applyTagSearch('${escapeHtml(tag).replace(/'/g, "\'")}')">#${escapeHtml(tag)} <span style="opacity:.7">${n}</span></button>`).join('');
  }
  window.applyTagSearch = async function(tag) {
    document.getElementById('search-input').value = tag;
    savePrefs();
    await renderVideos();
  };

  function normalizeRecord(record) {
    return {
      id: record.id,
      userEmail: record.userEmail,
      url: record.url,
      title: record.title || record.url,
      addedAt: record.addedAt || Date.now(),
      favorite: !!record.favorite,
      viewed: !!record.viewed,
      note: record.note || '',
      tags: Array.isArray(record.tags) ? record.tags : [],
      type: record.type || (parseVideoUrl(record.url)?.type || 'unknown'),
      sourceKind: record.sourceKind || 'url',
      originalLocalPath: record.originalLocalPath || '',
      localSessionKey: record.localSessionKey || '',
      localHandle: record.localHandle || null,
      mimeType: record.mimeType || '',
      volume: record.volume != null ? Number(record.volume) : 1,
      playbackRate: record.playbackRate != null ? Number(record.playbackRate) : 1
    };
  }

  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        let store;
        if (!d.objectStoreNames.contains(VIDEOS_STORE)) {
          store = d.createObjectStore(VIDEOS_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('userEmail', 'userEmail', { unique: false });
        } else {
          store = req.transaction.objectStore(VIDEOS_STORE);
        }
        if (!store.indexNames.contains('userEmail')) store.createIndex('userEmail', 'userEmail', { unique: false });
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror = () => rej(req.error);
    });
  }
  function getVideosForUser(email) {
    return new Promise((res, rej) => {
      const tx = db.transaction(VIDEOS_STORE, 'readonly');
      const idx = tx.objectStore(VIDEOS_STORE).index('userEmail');
      const req = idx.getAll(email);
      req.onsuccess = () => res((req.result || []).map(normalizeRecord));
      req.onerror = () => rej(req.error);
    });
  }
  function addVideoRecord(record) {
    return new Promise((res, rej) => {
      const tx = db.transaction(VIDEOS_STORE, 'readwrite');
      const req = tx.objectStore(VIDEOS_STORE).add(record);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  function putVideoRecord(record) {
    return new Promise((res, rej) => {
      const tx = db.transaction(VIDEOS_STORE, 'readwrite');
      const req = tx.objectStore(VIDEOS_STORE).put(record);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  function getVideoById(id) {
    return new Promise((res, rej) => {
      const tx = db.transaction(VIDEOS_STORE, 'readonly');
      const req = tx.objectStore(VIDEOS_STORE).get(id);
      req.onsuccess = () => res(req.result ? normalizeRecord(req.result) : null);
      req.onerror = () => rej(req.error);
    });
  }
  function deleteVideo(id) {
    return new Promise((res, rej) => {
      const tx = db.transaction(VIDEOS_STORE, 'readwrite');
      const req = tx.objectStore(VIDEOS_STORE).delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  }
  async function clearAllVideos(email) {
    const videos = await getVideosForUser(email);
    return new Promise((res, rej) => {
      const tx = db.transaction(VIDEOS_STORE, 'readwrite');
      const store = tx.objectStore(VIDEOS_STORE);
      videos.forEach(v => store.delete(v.id));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  function revokeActiveRenderObjectUrl(videoId) {
    const prev = activeRenderObjectUrls.get(String(videoId));
    if (prev) { try { URL.revokeObjectURL(prev); } catch {} }
    activeRenderObjectUrls.delete(String(videoId));
  }

  function setActiveRenderObjectUrl(videoId, url) {
    const key = String(videoId);
    const prev = activeRenderObjectUrls.get(key);
    if (prev && prev !== url) { try { URL.revokeObjectURL(prev); } catch {} }
    if (url) activeRenderObjectUrls.set(key, url);
    else activeRenderObjectUrls.delete(key);
  }

  async function canUseFsAccess() {
    return !!(window.isSecureContext && 'showOpenFilePicker' in window);
  }

  async function pickLocalFilesViaFsAccess(multiple = true) {
    if (!(await canUseFsAccess())) return [];
    try {
      const handles = await window.showOpenFilePicker({ multiple, types: FILE_ACCEPT_TYPES, excludeAcceptAllOption: false });
      return handles || [];
    } catch (e) {
      if (e?.name !== 'AbortError') console.error(e);
      return [];
    }
  }

  async function getFileFromHandle(handle, ask = false) {
    if (!handle) return null;
    try {
      let perm = 'granted';
      if (typeof handle.queryPermission === 'function') {
        perm = await handle.queryPermission({ mode: 'read' });
      }
      if (perm !== 'granted' && ask && typeof handle.requestPermission === 'function') {
        perm = await handle.requestPermission({ mode: 'read' });
      }
      if (perm !== 'granted') return null;
      return await handle.getFile();
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async function ensurePlayableSource(video, askPermission = false) {
    if (!video) return null;
    if (video.sourceKind === 'local-handle' && video.localHandle) {
      const file = await getFileFromHandle(video.localHandle, askPermission);
      if (!file) return null;
      const objectUrl = URL.createObjectURL(file);
      setActiveRenderObjectUrl(video.id, objectUrl);
      return objectUrl;
    }
    if (video.sourceKind === 'local-object-url') {
      return getLocalPlayableUrl(video);
    }
    revokeActiveRenderObjectUrl(video.id);
    return null;
  }

  function makeLocalSessionKey(file) {
    const safeName = String(file?.name || 'local').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-60);
    return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '-' + safeName;
  }

  function registerLocalSessionFile(file, existingKey = '') {
    const key = existingKey || makeLocalSessionKey(file);
    const prev = localSessionObjects.get(key);
    if (prev?.objectUrl) {
      try { URL.revokeObjectURL(prev.objectUrl); } catch {}
    }
    const objectUrl = URL.createObjectURL(file);
    localSessionObjects.set(key, {
      file,
      objectUrl,
      name: file?.name || '',
      mimeType: file?.type || '',
      type: inferTypeFromMime(file?.type || '', file?.name || '')
    });
    return key;
  }

  function getLocalPlayableUrl(video) {
    if (!video || video.sourceKind !== 'local-object-url') return null;
    if (video.localSessionKey && localSessionObjects.has(video.localSessionKey)) {
      return localSessionObjects.get(video.localSessionKey).objectUrl;
    }
    return null;
  }

  function hasActiveLocalSessionFile(video) {
    return !!getLocalPlayableUrl(video);
  }

  function normalizeLocalPath(raw) {
    const value = raw.trim();
    if (!value) return '';
    if (/^file:\/\//i.test(value)) return value;
    if (/^[a-zA-Z]:\\/.test(value)) return 'file:///' + value.replace(/\\/g, '/');
    if (/^\\\\/.test(value)) return 'file:' + value.replace(/\\/g, '/');
    return value;
  }
  function inferTypeFromMime(mime, fallbackName = '') {
    const m = String(mime || '').toLowerCase();
    const name = String(fallbackName || '').toLowerCase();
    if (m.startsWith('video/')) return 'direct';
    if (m.startsWith('audio/')) return 'audio';
    if (m === 'image/gif' || /\.gif($|\?)/i.test(name)) return 'gif';
    if (m.startsWith('image/')) return 'image';
    if (/\.(mp4|webm|ogv|ogg|mov|m4v)($|\?)/i.test(name)) return 'direct';
    if (/\.(mp3|wav|m4a|aac|flac|oga|opus)($|\?)/i.test(name)) return 'audio';
    if (/\.(jpg|jpeg|png|webp|avif|svg)($|\?)/i.test(name)) return 'image';
    return 'unknown';
  }

  function parseVideoUrl(raw) {
    const normalized = normalizeLocalPath(raw);
    const url = normalized.trim();
    if (!url) return null;
    const isLocal = /^file:\/\//i.test(url);
    const isBlob = /^blob:/i.test(url);
    const isLocalSession = /^local-session:\/\//i.test(url);
    const isLocalHandle = /^local-handle:\/\//i.test(url);
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return { type: 'youtube', id: ytMatch[1], url, isLocal, isBlob: false };
    const vmMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
    if (vmMatch) return { type: 'vimeo', id: vmMatch[1], url, isLocal, isBlob: false };
    const bhMatch = url.match(/behance\.net\/(?:gallery|project)\/(\d+)/i);
    if (bhMatch) return { type: 'behance', id: bhMatch[1], url, isLocal, isBlob: false };
    if (isLocalSession || isLocalHandle) return { type: 'unknown', url, isLocal: true, isBlob: false, isLocalSession: true, isLocalHandle };
    if (isBlob) return { type: inferTypeFromMime('', url), url, isLocal: false, isBlob: true };
    if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i.test(url)) return { type: 'direct', url, isLocal, isBlob: false };
    if (/\.(mp3|wav|m4a|aac|flac|oga|opus)(\?.*)?$/i.test(url)) return { type: 'audio', url, isLocal, isBlob: false };
    if (/\.(gif)(\?.*)?$/i.test(url)) return { type: 'gif', url, isLocal, isBlob: false };
    if (/\.(jpg|jpeg|png|webp|avif|svg)(\?.*)?$/i.test(url)) return { type: 'image', url, isLocal, isBlob: false };
    if (url.startsWith('http') || isLocal || isLocalSession || isLocalHandle) return { type: 'unknown', url, isLocal: isLocal || isLocalSession || isLocalHandle, isBlob: false, isLocalSession, isLocalHandle };
    return null;
  }

  function getEffectiveParsed(video) {
    const parsed = parseVideoUrl(video.url) || { url: video.url, isLocal: /^file:\/\//i.test(video.url), isBlob: /^blob:/i.test(video.url) };
    if (video && video.type && (!parsed.type || parsed.type === 'unknown' || parsed.isBlob)) parsed.type = video.type;
    return parsed;
  }
  function getYoutubeEmbedSrc(videoId) {
    const base = `https://www.youtube-nocookie.com/embed/${videoId}`;
    const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1', enablejsapi: '1' });
    if (location.protocol !== 'file:' && location.origin) params.set('origin', location.origin);
    return `${base}?${params.toString()}`;
  }
  function getTitle(parsed, url) {
    if (parsed.type === 'youtube') return 'YouTube — ' + parsed.id;
    if (parsed.type === 'vimeo') return 'Vimeo — ' + parsed.id;
    if (parsed.type === 'behance') return 'Behance — ' + parsed.id;
    if (parsed.type === 'audio') { try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'Audio'; } catch { return 'Audio'; } }
    if (parsed.type === 'gif') { try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'GIF'; } catch { return 'GIF'; } }
    if (parsed.type === 'image') { try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'Image'; } catch { return 'Image'; } }
    try { return new URL(url).hostname; } catch { return url; }
  }
  function isVideoLikeType(type) {
    return ['youtube','vimeo','behance','direct'].includes(type);
  }
  function shouldRenderPosterMode(video, parsed) {
    return mediaViewMode === 'poster' && isVideoLikeType(parsed?.type || video?.type) && !posterOpenIds.has(String(video.id));
  }
  function getPosterLabel(parsed) {
    if (parsed?.type === 'youtube') return 'YouTube thumbnail';
    if (parsed?.type === 'direct') return 'Video first frame';
    if (parsed?.type === 'vimeo') return 'Vimeo preview';
    if (parsed?.type === 'behance') return 'Behance preview';
    return 'Media preview';
  }
  function buildPosterHtml(video, parsed, effectiveSrc) {
    const title = escapeHtml(video.title || getTitle(parsed, effectiveSrc));
    if (parsed?.type === 'youtube') {
      return `<div class="poster-surface" onclick="openPosterPlayer(${video.id})"><img src="https://img.youtube.com/vi/${parsed.id}/hqdefault.jpg" alt="thumbnail"><div class="poster-overlay"><div class="poster-play">▶</div><div class="poster-meta"><div class="poster-title">${title}</div><div class="poster-sub">${getPosterLabel(parsed)}</div></div></div></div>`;
    }
    if (parsed?.type === 'direct') {
      return `<div class="poster-video-surface" onclick="openPosterPlayer(${video.id})"><video muted playsinline preload="metadata" data-media-src="${effectiveSrc}"></video><div class="poster-overlay"><div class="poster-play">▶</div><div class="poster-meta"><div class="poster-title">${title}</div><div class="poster-sub">${getPosterLabel(parsed)}</div></div></div></div>`;
    }
    return `<div class="poster-surface" onclick="openPosterPlayer(${video.id})"><div class="poster-overlay"><div class="poster-play">▶</div><div class="poster-meta"><div class="poster-title">${title}</div><div class="poster-sub">${getPosterLabel(parsed)}</div></div></div></div>`;
  }

  function buildEmbedHtml(video, parsed) {
    if (!parsed) return '<div class="video-unsupported"><span>無効なURL</span></div>';
    const localPlayableUrl = video._playableUrl || getLocalPlayableUrl(video);
    const effectiveSrc = localPlayableUrl || parsed.url;
    if (shouldRenderPosterMode(video, parsed)) {
      return buildPosterHtml(video, parsed, effectiveSrc);
    }
    if (parsed.type === 'youtube') {
      if (location.protocol === 'file:') {
        return `<div class="video-unsupported"><span>YouTube は file:// 直開きだと内部再生できません</span><span style="max-width:520px; line-height:1.7; color:var(--muted2);">Error 153 は Referer / origin が送れない時に出ます。http/https で配信してください。</span><a href="${parsed.url}" target="_blank" rel="noopener">YouTube で開く</a></div>`;
      }
      return `<iframe loading="lazy" id="yt-iframe-${parsed.id}" src="${getYoutubeEmbedSrc(parsed.id)}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" onerror="window.showYtFallback('${parsed.id}')"></iframe>
      <div class="yt-fallback" id="yt-fb-${parsed.id}" style="display:none" onclick="window.open('${parsed.url.replace(/'/g,'&apos;')}','_blank')"><img class="yt-thumb" src="https://img.youtube.com/vi/${parsed.id}/hqdefault.jpg" alt="YouTube thumbnail"><div class="yt-fallback-inner"><div class="yt-play-btn">▶</div><div class="yt-fallback-label">埋め込み不可 / 外部再生</div><a class="yt-fallback-open" href="${parsed.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">YouTube で開く ↗</a></div></div>`;
    }
    if (parsed.type === 'vimeo') return `<iframe loading="lazy" src="https://player.vimeo.com/video/${parsed.id}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`;
    if (parsed.type === 'behance') return `<iframe loading="lazy" src="https://www.behance.net/embed/project/${parsed.id}?ilo0=1" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen allow="clipboard-write *; fullscreen *"></iframe>`;
    if (parsed.type === 'direct') return `<video id="media-video-${video.id}" class="video-js vjs-default-skin vjs-big-play-centered" controls playsinline preload="metadata" data-media-src="${effectiveSrc}"></video><div class="media-error-note" id="media-error-${video.id}" style="display:none"></div>`;
    if (parsed.type === 'audio') return `<div class="audio-embed audio-plyr-embed"><div class="audio-shell"><div class="audio-shell-head"><div><div class="audio-shell-title" title="${escapeHtml(video.title || 'Audio')}">${escapeHtml(video.title || 'Audio')}</div><div class="audio-shell-sub">ローカル音楽プレイヤー</div></div><span class="tag-badge local-library-pill">Audio Library</span></div><audio id="plyr-audio-${video.id}" class="plyr-audio" controls preload="metadata" data-media-src="${effectiveSrc}"></audio><div class="media-error-note" id="media-error-${video.id}" style="display:none"></div></div></div>`;
    if (parsed.type === 'gif') return `<img class="media-img" src="${effectiveSrc}" alt="gif" loading="lazy">`;
    if (parsed.type === 'image') return `<img class="media-img" src="${effectiveSrc}" alt="media" loading="lazy">`;
    if ((video.sourceKind === 'local-object-url' || video.sourceKind === 'local-handle') && !localPlayableUrl) return `<div class="video-unsupported"><span>このローカルファイルをまだ再生用に接続できていません</span><span style="max-width:520px; line-height:1.7; color:var(--muted2);">ローカルファイルはブラウザの許可が必要です。下のボタンから同じファイルを選び直すと、このカード内で内部再生できます。File System Access API が使える環境では、次回以降も同じカードから再接続しやすくなります。</span><button class="btn-primary" type="button" style="width:auto; margin-top:8px; padding:10px 16px;" onclick="relinkLocalFile(${video.id})">このカードにローカルファイルを選択</button></div>`;
    if (parsed.isLocal) return `<div class="video-unsupported"><span>このローカルパスは現在の開き方では直接読めません</span><span style="max-width:520px; line-height:1.7; color:var(--muted2);">http/https で開いたページではブラウザ制約で任意の file:/// を直接読めないことがあります。下のボタンから同じローカルファイルを選ぶと、このカード内で再生できます。</span><button class="btn-primary" type="button" style="width:auto; margin-top:8px; padding:10px 16px;" onclick="relinkLocalFile(${video.id})">このカードにローカルファイルを選択</button><a href="${parsed.url}" target="_blank" rel="noopener">ローカルファイルを開く</a></div>`;
    return `<div class="video-unsupported"><span>プレビュー非対応</span><a href="${parsed.url}" target="_blank" rel="noopener">${parsed.url}</a></div>`;
  }

  function getSearchValue() { return (document.getElementById('search-input').value || '').trim().toLowerCase(); }
  function matchesFilter(video) {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'favorites') return !!video.favorite;
    if (currentFilter === 'unviewed') return !video.viewed;
    if (currentFilter === 'local') return isLocalLibraryItem(video);
    return video.type === currentFilter;
  }
  function matchesSearch(video) {
    const q = getSearchValue();
    if (!q) return true;
    const hay = [video.title, video.url, video.note, ...(video.tags || [])].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function sortVideos(items) {
    const sortEl = document.getElementById('sort-select');
    const sort = sortEl ? sortEl.value : _currentSort;
    const sorted = [...items];
    sorted.sort((a, b) => {
      if (sort === 'newest') return (b.addedAt || 0) - (a.addedAt || 0);
      if (sort === 'oldest') return (a.addedAt || 0) - (b.addedAt || 0);
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'ja');
      if (sort === 'type') return (a.type || '').localeCompare(b.type || '', 'ja') || (b.addedAt || 0) - (a.addedAt || 0);
      if (sort === 'favorites') return Number(b.favorite) - Number(a.favorite) || (b.addedAt || 0) - (a.addedAt || 0);
      return 0;
    });
    return sorted;
  }
  function filteredVideos() { return sortVideos(videosCache.filter(v => matchesFilter(v) && matchesSearch(v))); }
  function updateSelectionCounter() {
    const txt = `${selectedIds.size} selected`;
    document.getElementById('selection-count').textContent = txt;
    const el2 = document.getElementById('selection-count-actions');
    if (el2) el2.textContent = selectedIds.size ? txt : '';
    updateAppTabSelectionBadge();
  }

  window.showYtFallback = function(id) {
    const iframe = document.getElementById('yt-iframe-' + id);
    const fb = document.getElementById('yt-fb-' + id);
    if (iframe) iframe.style.display = 'none';
    if (fb) fb.style.display = 'flex';
  };


  function triggerFilePicker(input) {
    if (!input) return false;
    try {
      input.value = '';
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return true;
      }
      input.click();
      return true;
    } catch (e) {
      console.error(e);
      try {
        input.click();
        return true;
      } catch (e2) {
        console.error(e2);
        return false;
      }
    }
  }

  function openImportPicker() {
    const input = document.getElementById('import-file');
    if (!triggerFilePicker(input)) {
      showToast('JSON読込ダイアログを開けませんでした', 'error');
    }
  }


  function isLocalLibraryItem(video) {
    return !!(video && (String(video.sourceKind || '').startsWith('local-') || /^file:\/\//i.test(video.url || '') || /^local-(session|handle):\/\//i.test(video.url || '')));
  }

  function cleanupRenderedMedia() {
    activeVideoJsPlayers.forEach(player => { try { player.dispose(); } catch {} });
    activeVideoJsPlayers.clear();
    activePlyrPlayers.forEach(player => { try { player.destroy(); } catch {} });
    activePlyrPlayers.clear();
    activeHowlPlayers.forEach(howl => { try { howl.unload(); } catch {} });
    activeHowlPlayers.clear();
    activeHowlStates.clear();
  }

  function formatClock(sec) {
    const safe = Math.max(0, Number(sec) || 0);
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function inferMimeFromVideo(video) {
    if (video?.mimeType) return video.mimeType;
    const url = String(video?.url || '').toLowerCase();
    if (url.endsWith('.mp4')) return 'video/mp4';
    if (url.endsWith('.webm')) return 'video/webm';
    if (url.endsWith('.mov') || url.endsWith('.m4v')) return 'video/mp4';
    if (url.endsWith('.mp3')) return 'audio/mpeg';
    if (url.endsWith('.wav')) return 'audio/wav';
    if (url.endsWith('.m4a')) return 'audio/mp4';
    return '';
  }

  function renderHowlerUi(videoId) {
    const state = activeHowlStates.get(String(videoId));
    const wrap = document.querySelector(`[data-howler-id="${videoId}"]`);
    if (!state || !wrap) return;
    wrap.innerHTML = `
      <div class="howler-player">
        <div class="howler-head">
          <div class="howler-meta">
            <div class="howler-title" title="${escapeHtml(state.title)}">${escapeHtml(state.title)}</div>
            <div class="howler-sub">howler.js / ローカル音楽プレイヤー</div>
          </div>
          <span class="tag-badge local-library-pill">Audio Library</span>
        </div>
        <div class="howler-main">
          <button class="howler-play" type="button" onclick="toggleHowlerPlay(${videoId})">${state.playing ? '❚❚' : '▶'}</button>
          <div class="howler-timebox">
            <input class="howler-progress" type="range" min="0" max="${Math.max(1, state.duration || 1)}" step="0.01" value="${Math.min(state.seek || 0, Math.max(1, state.duration || 1))}" oninput="seekHowler(${videoId}, this.value)">
            <div class="howler-times"><span>${formatClock(state.seek)}</span><span>${formatClock(state.duration)}</span></div>
          </div>
        </div>
      </div>`;
  }

  function syncHowlerState(videoId) {
    const howl = activeHowlPlayers.get(String(videoId));
    const prev = activeHowlStates.get(String(videoId));
    if (!howl || !prev) return;
    const next = { ...prev, seek: howl.seek() || 0, duration: howl.duration() || prev.duration || 0, playing: howl.playing() };
    activeHowlStates.set(String(videoId), next);
    renderHowlerUi(videoId);
  }

  function initializeHowlerPlayer(videoId, videoRecord, src) {
    const key = String(videoId);
    const container = document.querySelector(`[data-howler-id="${videoId}"]`);
    if (!container) return;
    const old = activeHowlPlayers.get(key);
    if (old) { try { old.unload(); } catch {} }
    if (typeof Howl !== 'function') {
      container.innerHTML = '<div class="media-error-note" style="display:block">howler.js の読み込みに失敗しました</div>';
      return;
    }
    activeHowlStates.set(key, { title: videoRecord.title || 'Audio', seek: 0, duration: 0, playing: false });
    const howl = new Howl({
      src: [src],
      html5: true,
      preload: true,
      volume: getVolumeValue(videoRecord),
      rate: getRateValue(videoRecord),
      format: videoRecord.mimeType ? undefined : undefined,
      onload: () => syncHowlerState(videoId),
      onplay: () => syncHowlerState(videoId),
      onpause: () => syncHowlerState(videoId),
      onstop: () => syncHowlerState(videoId),
      onend: () => syncHowlerState(videoId),
      onseek: () => syncHowlerState(videoId),
      onloaderror: () => showMediaError(videoId, '音楽ファイルの読み込みに失敗しました'),
      onplayerror: () => showMediaError(videoId, '音楽ファイルを再生できませんでした')
    });
    activeHowlPlayers.set(key, howl);
    renderHowlerUi(videoId);
    const tick = () => {
      if (!activeHowlPlayers.has(key)) return;
      if (howl.playing()) syncHowlerState(videoId);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function getCardMediaEl(videoId) {
    const card = document.querySelector('.video-card[data-id="' + videoId + '"]');
    if (!card) return null;
    return card.querySelector('video, audio');
  }

  function showMediaError(videoId, msg) {
    const el = document.getElementById('media-error-' + videoId);
    if (!el) return;
    el.textContent = msg || 'このファイルはこのブラウザで再生できません';
    el.style.display = 'block';
  }

  function clearMediaError(videoId) {
    const el = document.getElementById('media-error-' + videoId);
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }

  function initializeCardMedia(videoId, videoRecord) {
    if (videoRecord?.type === 'audio') {
      clearMediaError(videoId);
      const media = document.getElementById('plyr-audio-' + videoId);
      const src = media?.dataset.mediaSrc || '';
      if (!media || !src) {
        showMediaError(videoId, '音楽ファイルの接続に失敗しました');
        return;
      }
      media.src = src;
      media.volume = getVolumeValue(videoRecord);
      media.playbackRate = getRateValue(videoRecord);
      media.onloadedmetadata = () => clearMediaError(videoId);
      media.oncanplay = () => clearMediaError(videoId);
      media.onerror = () => {
        const err = media.error;
        const codeMap = { 1: '再生が中断されました', 2: '音楽ファイルの読み込みに失敗しました', 3: '音楽ファイルのデコードに失敗しました', 4: 'このブラウザが対応しない形式またはコーデックです' };
        showMediaError(videoId, codeMap[err?.code] || '音楽ファイルの読み込みに失敗しました');
      };
      media.load();
      if (typeof Plyr === 'function') {
        const oldPlyr = activePlyrPlayers.get(String(videoId));
        if (oldPlyr) { try { oldPlyr.destroy(); } catch {} }
        const player = new Plyr(media, {
          controls: ['progress','current-time','duration','mute','volume','play','rewind','fast-forward','settings','airplay','fullscreen'],
          settings: ['speed'],
          speed: { selected: getRateValue(videoRecord), options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
          tooltips: { controls: true, seek: true },
          keyboard: { focused: true, global: false }
        });
        player.on('ready', () => {
          try { player.volume = getVolumeValue(videoRecord); } catch {}
          try { player.speed = getRateValue(videoRecord); } catch {}
        });
        player.on('volumechange', async () => {
          const fresh = await getVideoById(videoId);
          if (!fresh) return;
          await putVideoRecord({ ...fresh, volume: Number(player.volume || 0), updatedAt: Date.now() });
        });
        player.on('ratechange', async () => {
          const fresh = await getVideoById(videoId);
          if (!fresh) return;
          await putVideoRecord({ ...fresh, playbackRate: Number(player.speed || 1), updatedAt: Date.now() });
        });
        activePlyrPlayers.set(String(videoId), player);
      }
      return;
    }
    const media = getCardMediaEl(videoId);
    if (!media) return;
    const src = media.dataset.mediaSrc || media.getAttribute('src') || '';
    if (src && media.getAttribute('src') !== src) {
      media.src = src;
    }
    media.onloadedmetadata = () => clearMediaError(videoId);
    media.oncanplay = () => clearMediaError(videoId);
    media.onerror = () => {
      const err = media.error;
      const codeMap = { 1: '再生が中断されました', 2: 'ネットワークまたはURLの読み込みに失敗しました', 3: 'ファイルのデコードに失敗しました', 4: 'このブラウザが対応しない形式またはコーデックです' };
      showMediaError(videoId, codeMap[err?.code] || 'このファイルはこのブラウザで再生できません');
    };
    if (videoRecord?.type === 'direct' && typeof videojs === 'function' && media.classList.contains('video-js')) {
      let player = activeVideoJsPlayers.get(String(videoId));
      if (player) { try { player.dispose(); } catch {} }
      player = videojs(media, { controls: true, preload: 'metadata', fluid: true, playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2] });
      player.src({ src, type: inferMimeFromVideo(videoRecord) || undefined });
      player.ready(() => {
        player.volume(getVolumeValue(videoRecord));
        player.playbackRate(getRateValue(videoRecord));
      });
      player.on('loadedmetadata', () => clearMediaError(videoId));
      player.on('error', () => showMediaError(videoId, 'Video.js で動画を再生できませんでした'));
      activeVideoJsPlayers.set(String(videoId), player);
      return;
    }
    media.load();
    applyMediaStateToElement(videoId, videoRecord);
  }

  function getVolumeValue(video) {
    const value = Number(video && video.volume != null ? video.volume : 1);
    if (!Number.isFinite(value)) return 1;
    return Math.max(0, Math.min(1, value));
  }

  function getRateValue(video) {
    const value = Number(video && video.playbackRate != null ? video.playbackRate : 1);
    if (!Number.isFinite(value)) return 1;
    return Math.max(0.25, Math.min(3, value));
  }

  function buildMediaControlsHtml(video) {
    return '';
  }

  function applyMediaStateToElement(videoId, videoRecord) {
    if (videoRecord?.type === 'audio') {
      const plyr = activePlyrPlayers.get(String(videoId));
      const audioEl = document.getElementById('plyr-audio-' + videoId);
      if (audioEl) {
        audioEl.volume = getVolumeValue(videoRecord);
        audioEl.playbackRate = getRateValue(videoRecord);
      }
      if (plyr) {
        try { plyr.volume = getVolumeValue(videoRecord); } catch {}
        try { plyr.speed = getRateValue(videoRecord); } catch {}
      }
      return;
    }
    const media = getCardMediaEl(videoId);
    if (!media) return;
    media.volume = getVolumeValue(videoRecord);
    media.playbackRate = getRateValue(videoRecord);
    if (['direct', 'audio'].includes(videoRecord.type)) {
      media.muted = false;
      media.defaultMuted = false;
    }
  }

  window.previewMediaVolume = function(videoId, rawValue) {
    const pct = Math.max(0, Math.min(100, Number(rawValue) || 0));
    const label = document.getElementById('media-volume-label-' + videoId);
    if (label) label.textContent = pct + '%';
    const media = getCardMediaEl(videoId);
    if (media) media.volume = pct / 100;
    const howl = activeHowlPlayers.get(String(videoId));
    if (howl) howl.volume(pct / 100);
  };

  window.saveMediaVolume = async function(videoId, rawValue) {
    const pct = Math.max(0, Math.min(100, Number(rawValue) || 0));
    const media = getCardMediaEl(videoId);
    if (media) media.volume = pct / 100;
    const howl = activeHowlPlayers.get(String(videoId));
    if (howl) howl.volume(pct / 100);
    await upsertVideoFields(videoId, { volume: pct / 100 }, { skipRender: true });
  };

  window.savePlaybackRate = async function(videoId, rawValue) {
    const rate = Math.max(0.25, Math.min(3, Number(rawValue) || 1));
    const media = getCardMediaEl(videoId);
    if (media) media.playbackRate = rate;
    const howl = activeHowlPlayers.get(String(videoId));
    if (howl) howl.rate(rate);
    await upsertVideoFields(videoId, { playbackRate: rate }, { skipRender: true });
  };


  window.toggleHowlerPlay = function(videoId) {
    const howl = activeHowlPlayers.get(String(videoId));
    if (!howl) return;
    if (howl.playing()) howl.pause(); else howl.play();
    syncHowlerState(videoId);
  };

  window.seekHowler = function(videoId, rawValue) {
    const howl = activeHowlPlayers.get(String(videoId));
    if (!howl) return;
    const sec = Math.max(0, Number(rawValue) || 0);
    howl.seek(sec);
    syncHowlerState(videoId);
  };

    async function attachLocalFiles(files) {
    if (!files || !files.length || !currentUser) return;
    let added = 0;
    for (const file of files) {
      try {
        const sessionKey = registerLocalSessionFile(file);
        const type = inferTypeFromMime(file.type, file.name);
        await putVideoRecord({
          userEmail: currentUser.email,
          url: 'local-session://' + sessionKey,
          title: file.name || 'Local media',
          type,
          sourceKind: 'local-object-url',
          localSessionKey: sessionKey,
          mimeType: file.type || '',
          originalLocalPath: file.name || '',
          favorite: false,
          viewed: false,
          note: '',
          tags: [],
          volume: 1,
          playbackRate: 1,
          addedAt: Date.now(),
          updatedAt: Date.now()
        });
        added++;
      } catch (e) {
        console.error(e);
      }
    }
    if (added) {
      showToast(`${added}件のローカルファイルを追加しました。`, 'success');
      await renderVideos();
    } else {
      showToast('ローカルファイルの追加に失敗しました', 'error');
    }
  }

  async function attachLocalHandles(handles) {
    if (!handles || !handles.length || !currentUser) return;
    let added = 0;
    for (const handle of handles) {
      try {
        const file = await getFileFromHandle(handle, true);
        if (!file) continue;
        await putVideoRecord({
          userEmail: currentUser.email,
          url: 'local-handle://' + (handle.name || file.name || Date.now()),
          title: file.name || handle.name || 'Local media',
          type: inferTypeFromMime(file.type, file.name || handle.name),
          sourceKind: 'local-handle',
          localHandle: handle,
          mimeType: file.type || '',
          originalLocalPath: handle.name || file.name || '',
          favorite: false,
          viewed: false,
          note: '',
          tags: [],
          volume: 1,
          playbackRate: 1,
          addedAt: Date.now(),
          updatedAt: Date.now()
        });
        added++;
      } catch (e) {
        console.error(e);
      }
    }
    if (added) {
      showToast(`${added}件のローカルファイルを追加しました。`, 'success');
      await renderVideos();
    } else {
      showToast('ローカルファイルの追加に失敗しました', 'error');
    }
  }

  window.openLocalPicker = async function openLocalPicker() {
    const pickerInput = document.getElementById('local-media-picker');
    const acceptSnapshot = pickerInput?.getAttribute('accept') || '';
    const handles = await pickLocalFilesViaFsAccess(true);
    if (handles.length) {
      await attachLocalHandles(handles);
      return;
    }
    const input = document.getElementById('local-media-picker');
    if (!triggerFilePicker(input)) {
      showToast('ローカルファイル選択ダイアログを開けませんでした', 'error');
    }
    setTimeout(() => { if (pickerInput) pickerInput.setAttribute('accept', acceptSnapshot || 'video/*,audio/*,image/*,.gif,.webp,.mp4,.webm,.mov,.m4v,.mp3,.wav,.m4a,.aac,.flac,.opus'); }, 0);
  }

  window.relinkLocalFile = async function relinkLocalFile(videoId) {
    const current = await getVideoById(videoId);
    const handles = await pickLocalFilesViaFsAccess(false);
    if (handles.length) {
      const handle = handles[0];
      const file = await getFileFromHandle(handle, true);
      if (!file || !current) return;
      current.originalLocalPath = current.originalLocalPath || current.url;
      current.url = 'local-handle://' + (handle.name || file.name || Date.now());
      current.title = file.name || current.title;
      current.type = inferTypeFromMime(file.type, file.name) || current.type;
      current.sourceKind = 'local-handle';
      current.localHandle = handle;
      current.localSessionKey = '';
      current.mimeType = file.type || current.mimeType || '';
      current.updatedAt = Date.now();
      await putVideoRecord(current);
      showToast('ローカルファイルをこのカードに再リンクしました。', 'success');
      await renderVideos();
      return;
    }
    const input = document.getElementById('local-media-relink-picker');
    if (!input) return;
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const current = await getVideoById(videoId);
        const sessionKey = registerLocalSessionFile(file, current?.localSessionKey || '');
        if (!current) {
          showToast('対象カードが見つかりません', 'error');
          return;
        }
        current.originalLocalPath = current.originalLocalPath || current.url;
        current.url = 'local-session://' + sessionKey;
        current.title = file.name || current.title;
        current.type = inferTypeFromMime(file.type, file.name) || current.type;
        current.sourceKind = 'local-object-url';
        current.localSessionKey = sessionKey;
        current.localHandle = null;
        current.mimeType = file.type || current.mimeType || '';
        current.updatedAt = Date.now();
        await putVideoRecord(current);
        showToast('ローカルファイルをこのカードに再リンクしました。', 'success');
        await renderVideos();
      } catch (e) {
        console.error(e);
      }
    };
    if (!triggerFilePicker(input)) showToast('ローカルファイル選択ダイアログを開けませんでした', 'error');
  }

  function typeLabel(type) {
    const map = { youtube: 'YouTube', vimeo: 'Vimeo', behance: 'Behance', direct: 'Video', audio: 'Audio', gif: 'GIF', image: 'Image', unknown: 'URL' };
    return map[type] || type;
  }

  async function renderVideos() {
    videosCache = await getVideosForUser(currentUser.email);
    const grid = document.getElementById('video-grid');
    const empty = document.getElementById('empty-state');
    const shown = filteredVideos();

    document.getElementById('topbar-count').textContent = `${videosCache.length} items`;
    document.getElementById('grid-meta').textContent = `総数 ${videosCache.length}件 / 表示 ${shown.length}件 / お気に入り ${videosCache.filter(v=>v.favorite).length}件 / 選択 ${selectedIds.size}件`;
    updateStatsRow();
    updateRecentTagsRow();
    cleanupRenderedMedia();
    grid.innerHTML = '';

    const shownIds = new Set(shown.map(v => String(v.id)));
    Array.from(activeRenderObjectUrls.keys()).forEach(id => { if (!shownIds.has(String(id))) revokeActiveRenderObjectUrl(id); });

    if (!shown.length) {
      empty.style.display = 'block';
      document.getElementById('empty-state-sub').textContent = videosCache.length ? '条件に一致するアイテムがありません。検索語やフィルタを見直してください。' : '上のフォームにURLを入力して動画を追加してください';
      updateSelectionCounter();
      return;
    }
    empty.style.display = 'none';

    for (let i = 0; i < shown.length; i++) {
      const v = shown[i];
      v._playableUrl = await ensurePlayableSource(v, false);
      const parsed = getEffectiveParsed(v);
      const embed = buildEmbedHtml(v, parsed);
      const isExternalPage = ['youtube','behance','vimeo'].includes(v.type);
      const tagsHtml = (v.tags || []).slice(0, 4).map(tag => `<button class="tag-badge clickable" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('');
      const card = document.createElement('article');
      card.className = 'video-card' + (selectedIds.has(v.id) ? ' selected' : '');
      card.dataset.id = v.id;
      card.innerHTML = `
        <div class="video-card-top">
          <input class="video-select" type="checkbox" ${selectedIds.has(v.id) ? 'checked' : ''} aria-label="select item" onchange="toggleSelection(${v.id}, this.checked)">
          <span class="video-index">${String(i+1).padStart(2,'0')}</span>
          <div class="video-title-wrap">
            <div class="video-title" title="${escapeHtml(v.title || v.url)}">${escapeHtml(v.title || v.url)}</div>
            <div class="video-subline">
              <span class="type-badge">${typeLabel(v.type)}</span>
              ${isLocalLibraryItem(v) ? '<span class="tag-badge local-library-pill">Local Library</span>' : ''}
              ${v.favorite ? '<span class="state-badge favorite">★ favorite</span>' : ''}
              ${v.viewed ? '<span class="state-badge viewed">✓ viewed</span>' : ''}
              <span class="date-badge">追加 ${formatDate(v.addedAt)}</span><span class="date-badge">更新 ${formatDate(v.updatedAt || v.addedAt)}</span>
            </div>
          </div>
          <div class="card-actions">
            <button class="icon-btn favorite ${v.favorite ? 'active' : ''}" title="お気に入り" onclick="toggleFavorite(${v.id})">★</button>
            <button class="icon-btn viewed ${v.viewed ? 'active' : ''}" title="視聴済み" onclick="toggleViewed(${v.id})">✓</button>
            <button class="icon-btn" title="編集" onclick="openEditModal(${v.id})">✎</button>
            ${isExternalPage ? `<button class="icon-btn" title="外部で開く" onclick="window.open('${v.url.replace(/'/g,'&apos;')}','_blank')">↗</button>` : ''}
            <button class="icon-btn" title="削除" onclick="removeVideo(${v.id})">✕</button>
          </div>
        </div>
        <div class="video-embed-wrap">${embed}</div>
        ${buildMediaControlsHtml(v)}
        <div class="video-card-footer">
          <div class="video-url-row">
            <span class="video-url-snippet">${escapeHtml(v.url)}</span>
            <button class="icon-btn" title="URLコピー" onclick="copyUrl('${v.url.replace(/'/g,'&apos;')}', this)">⧉</button>
          </div>
          <div class="video-note-row">
            <span class="video-note-snippet">${escapeHtml(v.note || 'メモなし')}</span>
          </div>
          <div class="video-tags-row"><div class="video-tags-wrap">${tagsHtml || '<span class="tag-badge">tagなし</span>'}</div></div>
        </div>`;
      grid.appendChild(card);
      initializeCardMedia(v.id, v);

      if (parsed?.type === 'youtube' && location.protocol !== 'file:') {
        setTimeout(() => {
          const iframe = card.querySelector('iframe');
          if (!iframe) return;
          let loaded = false;
          iframe.addEventListener('load', () => { loaded = true; });
          setTimeout(() => { if (!loaded) window.showYtFallback(parsed.id); }, 3000);
        }, 100);
      }
    }
    updateSelectionCounter();
  }

  async function upsertVideoFields(id, patch, opts = {}) {
    const item = await getVideoById(id);
    if (!item) return;
    const nextRecord = { ...item, ...patch, updatedAt: Date.now() };
    await putVideoRecord(nextRecord);
    const cacheIndex = videosCache.findIndex(v => String(v.id) === String(id));
    if (cacheIndex >= 0) videosCache[cacheIndex] = normalizeRecord(nextRecord);
    if (!opts.skipRender) await renderVideos();
  }

  window.toggleFavorite = async function(id) { const item = await getVideoById(id); await upsertVideoFields(id, { favorite: !item.favorite }); };
  window.toggleViewed = async function(id) { const item = await getVideoById(id); await upsertVideoFields(id, { viewed: !item.viewed }); };
  window.toggleSelection = function(id, checked) { if (checked) selectedIds.add(id); else selectedIds.delete(id); updateSelectionCounter(); renderCardSelectionState(); };
  function renderCardSelectionState() { document.querySelectorAll('.video-card').forEach(el => el.classList.toggle('selected', selectedIds.has(Number(el.dataset.id)))); }

  window.addUrls = async function() {
    const raw = document.getElementById('url-input').value;
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return toast('URLを入力してください', 'error');

    const existing = new Set((await getVideosForUser(currentUser.email)).map(v => v.url));
    let added = 0, duplicated = 0, invalid = 0;

    for (const line of lines) {
      const parsed = parseVideoUrl(line);
      if (!parsed) { invalid++; continue; }
      if (existing.has(line)) { duplicated++; continue; }
      await addVideoRecord({ userEmail: currentUser.email, url: line, title: getTitle(parsed, line), addedAt: Date.now(), favorite: false, viewed: false, note: '', tags: [], type: parsed.type, volume: 1, playbackRate: 1 });
      existing.add(line);
      added++;
    }

    document.getElementById('url-input').value = '';
    clearUrlDraft();
    setDraftStatus('入力欄をクリアしました');
    await renderVideos();
    const parts = [];
    if (added) parts.push(`追加 ${added}`);
    if (duplicated) parts.push(`重複 ${duplicated}`);
    if (invalid) parts.push(`無効 ${invalid}`);
    toast(parts.join(' / ') || '追加対象がありません', added ? 'success' : 'error');
  };

  window.removeVideo = async function(id) {
    await deleteVideo(id);
    selectedIds.delete(id);
    await renderVideos();
    toast('削除しました');
  };

  window.clearAll = async function() {
    if (!confirm('現在のアカウントの全アイテムを削除しますか？')) return;
    await clearAllVideos(currentUser.email);
    selectedIds.clear();
    await renderVideos();
    toast('すべて削除しました', 'success');
  };

  window.copyUrl = function(url, btn) {
    navigator.clipboard.writeText(url).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = orig; }, 1000);
      toast('URLをコピーしました');
    }).catch(() => toast('コピーに失敗しました', 'error'));
  };

  let currentLayoutCols = Math.max(1, Math.min(10, Number(prefs.layout || 3)));

  function syncLayoutSliders() {
    const value = String(currentLayoutCols);
    const top = document.getElementById('layout-slider-top');
    const bottom = document.getElementById('layout-slider-bottom');
    if (top && top.value !== value) top.value = value;
    if (bottom && bottom.value !== value) bottom.value = value;
  }

  function applyLayoutCols(n, shouldSave = true) {
    currentLayoutCols = Math.max(1, Math.min(10, Number(n) || 1));
    document.documentElement.style.setProperty('--vault-cols', String(currentLayoutCols));
    syncLayoutSliders();
    const grid = document.getElementById('video-grid');
    if (grid) grid.style.gridTemplateColumns = `repeat(${currentLayoutCols}, minmax(260px, 1fr))`;
    if (shouldSave) savePrefs();
    // Sync qs-cols buttons (1-5)
    document.querySelectorAll('#qs-cols .seg-btn').forEach(b => b.classList.toggle('act', Number(b.dataset.col) === currentLayoutCols));
  }

  window.setLayout = function(n) {
    applyLayoutCols(n, true);
  };

  function bumpLayoutCols(delta) {
    applyLayoutCols(currentLayoutCols + Number(delta || 0), true);
  }

  window.setMediaViewMode = async function(mode, btnId) {
    mediaViewMode = mode === 'poster' ? 'poster' : 'player';
    posterOpenIds.clear();
    // Sync old media-mode-btns if they still exist
    document.querySelectorAll('.media-mode-btns .layout-btn').forEach(b => b.classList.remove('active'));
    if (btnId && document.getElementById(btnId)) document.getElementById(btnId).classList.add('active');
    // Sync qs-bar
    document.querySelectorAll('#qs-media-view .seg-btn').forEach(b => b.classList.toggle('act', b.dataset.mv === mediaViewMode));
    savePrefs();
    await renderVideos();
  };

  window.openPosterPlayer = async function(videoId) {
    posterOpenIds.add(String(videoId));
    await renderVideos();
  };

  function bindToolbar() {

    const localPicker = document.getElementById('local-media-picker');
    if (localPicker && !localPicker.dataset.bound) {
      localPicker.addEventListener('change', handleLocalPickerChange);
      localPicker.dataset.bound = '1';
    }

    const urlInput = document.getElementById('url-input');
    urlInput.value = getUrlDraft();
    const updateDraftMetrics = () => {
      const lines = urlInput.value.split('\n').map(v => v.trim()).filter(Boolean);
      let valid = 0, invalid = 0;
      lines.forEach(line => parseVideoUrl(line) ? valid++ : invalid++);
      setUrlDraft(urlInput.value);
      setDraftStatus(`<span>下書き ${lines.length}行</span><span>有効 ${valid}</span><span>無効 ${invalid}</span>${urlInput.value ? '<span>自動保存中</span>' : '<span>入力待機中</span>'}`);
    };
    updateDraftMetrics();
    urlInput.addEventListener('input', updateDraftMetrics);
    document.getElementById('toggle-add-panel-btn').addEventListener('click', () => {
      const panel = document.getElementById('add-panel');
      panel.classList.toggle('collapsed');
      document.getElementById('toggle-add-panel-btn').textContent = panel.classList.contains('collapsed') ? '入力欄をひらく' : '入力欄をたたむ';
    });
    document.getElementById('clear-selection-btn').addEventListener('click', () => { selectedIds.clear(); updateSelectionCounter(); renderCardSelectionState(); document.querySelectorAll('.video-select').forEach(box => box.checked = false); });
    document.getElementById('copy-selected-btn').addEventListener('click', async () => {
      const rows = getSelectedRows();
      if (!rows.length) return toast('選択アイテムがありません', 'error');
      await navigator.clipboard.writeText(rows.map(v => v.url).join('\n'));
      toast(`${rows.length}件のURLをコピーしました`, 'success');
    });
    document.getElementById('open-selected-btn').addEventListener('click', () => {
      const rows = getSelectedRows();
      if (!rows.length) return toast('選択アイテムがありません', 'error');
      rows.slice(0, 10).forEach(v => { if (isLocalLibraryItem(v)) relinkLocalFile(v.id); else window.open(v.url, '_blank'); });
      toast(`${Math.min(rows.length,10)}件を処理しました`, 'success');
    });
    document.getElementById('favorite-selected-btn').addEventListener('click', async () => { await batchPatchSelected(() => ({ favorite: true })); toast('選択項目をお気に入りにしました', 'success'); });
    document.getElementById('unfavorite-selected-btn').addEventListener('click', async () => { await batchPatchSelected(() => ({ favorite: false })); toast('選択項目のお気に入りを解除しました', 'success'); });
    document.getElementById('viewed-selected-btn').addEventListener('click', async () => { await batchPatchSelected(() => ({ viewed: true })); toast('選択項目を視聴済みにしました', 'success'); });
    document.getElementById('unviewed-selected-btn').addEventListener('click', async () => { await batchPatchSelected(() => ({ viewed: false })); toast('選択項目を未視聴に戻しました', 'success'); });
    document.getElementById('tag-selected-btn').addEventListener('click', async () => {
      const value = prompt('追加するタグを入力してください（カンマ区切り可）');
      if (!value) return;
      const tags = value.split(',').map(v => v.trim()).filter(Boolean);
      if (!tags.length) return;
      await batchPatchSelected(row => ({ tags: [...new Set([...(row.tags || []), ...tags])].slice(0, 12) }));
      toast('タグを追加しました', 'success');
    });
    document.getElementById('untag-selected-btn').addEventListener('click', async () => {
      const value = prompt('削除するタグを入力してください（1つ）');
      if (!value) return;
      const tag = value.trim();
      await batchPatchSelected(row => ({ tags: (row.tags || []).filter(v => v !== tag) }));
      toast('タグを削除しました', 'success');
    });
    document.getElementById('dedupe-btn').addEventListener('click', async () => {
      const rows = await getVideosForUser(currentUser.email);
      const seen = new Set();
      let removed = 0;
      for (const row of rows.sort((a,b) => (a.addedAt||0) - (b.addedAt||0))) {
        if (seen.has(row.url)) { await deleteVideo(row.id); selectedIds.delete(row.id); removed++; }
        else seen.add(row.url);
      }
      await renderVideos();
      toast(removed ? `重複 ${removed}件を整理しました` : '重複はありません', removed ? 'success' : '');
    });
    document.getElementById('random-open-btn').addEventListener('click', () => {
      const rows = filteredVideos();
      if (!rows.length) return toast('表示中アイテムがありません', 'error');
      const row = rows[Math.floor(Math.random() * rows.length)];
      if (isLocalLibraryItem(row)) relinkLocalFile(row.id); else window.open(row.url, '_blank');
      toast('ランダムに1件開きました', 'success');
    });
    document.getElementById('clear-filters-btn').addEventListener('click', async () => {
      document.getElementById('search-input').value = '';
      document.getElementById('sort-select').value = 'newest';
      _currentSort = 'newest';
      currentFilter = 'all';
      document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
      // QSバーも同期
      document.querySelectorAll('#qs-filter .seg-btn').forEach(b => b.classList.toggle('act', b.dataset.qf === 'all'));
      document.querySelectorAll('#qs-sort .seg-btn').forEach(b => b.classList.toggle('act', b.dataset.sort === 'newest'));
      savePrefs();
      await renderVideos();
      toast('条件をリセットしました', 'success');
    });
    document.getElementById('shortcuts-btn').addEventListener('click', openShortcutsModal);
    document.getElementById('search-input').value = prefs.search || '';
    document.getElementById('sort-select').value = prefs.sort || 'newest';
    _currentSort = prefs.sort || 'newest';
    applyLayoutCols(prefs.layout ?? 3, false);
    syncLayoutSliders();
    mediaViewMode = prefs.mediaView || 'player';
    currentFilter = prefs.filter || 'all';
    document.querySelectorAll('#filter-chips .chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === currentFilter));

    document.getElementById('search-input').addEventListener('input', async () => { savePrefs(); await renderVideos(); });
    document.getElementById('sort-select').addEventListener('change', async () => {
      const v = document.getElementById('sort-select').value;
      _currentSort = v;
      document.querySelectorAll('#qs-sort .seg-btn').forEach(b => b.classList.toggle('act', b.dataset.sort === v));
      savePrefs();
      await renderVideos();
    });
    ['layout-slider-top','layout-slider-bottom'].forEach(id => {
      const slider = document.getElementById(id);
      if (!slider || slider.dataset.bound === '1') return;
      const handler = e => {
        applyLayoutCols(Number(e.target.value), true);
        syncLayoutSliders();
      };
      slider.addEventListener('input', handler);
      slider.addEventListener('change', handler);
      slider.dataset.bound = '1';
    });
    document.querySelectorAll('[data-layout-step]').forEach(btn => {
      if (btn.dataset.bound === '1') return;
      btn.addEventListener('click', () => bumpLayoutCols(Number(btn.dataset.layoutStep || 0)));
      btn.dataset.bound = '1';
    });
    document.querySelectorAll('#filter-chips .chip').forEach(chip => chip.addEventListener('click', async () => {
      currentFilter = chip.dataset.filter;
      document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.toggle('active', c === chip));
      // QSバーの絞込ボタンも同期
      document.querySelectorAll('#qs-filter .seg-btn').forEach(b => b.classList.toggle('act', b.dataset.qf === currentFilter));
      savePrefs();
      await renderVideos();
    }));
    document.getElementById('select-all-btn').addEventListener('click', async () => {
      const shown = filteredVideos();
      const allSelected = shown.length && shown.every(v => selectedIds.has(v.id));
      if (allSelected) shown.forEach(v => selectedIds.delete(v.id)); else shown.forEach(v => selectedIds.add(v.id));
      updateSelectionCounter();
      renderCardSelectionState();
      document.querySelectorAll('.video-select').forEach(box => { const card = box.closest('.video-card'); if (card) box.checked = selectedIds.has(Number(card.dataset.id)); });
    });
    document.getElementById('bulk-delete-btn').addEventListener('click', async () => {
      if (!selectedIds.size) return toast('選択項目がありません', 'error');
      if (!confirm(`選択した ${selectedIds.size} 件を削除しますか？`)) return;
      for (const id of [...selectedIds]) await deleteVideo(id);
      selectedIds.clear();
      await renderVideos();
      toast('選択項目を削除しました', 'success');
    });
    document.getElementById('export-btn').addEventListener('click', async () => {
      const rows = await getVideosForUser(currentUser.email);
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vault-export-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('JSONを書き出しました: ' + formatDateTime(Date.now()), 'success');
    });
    document.getElementById('import-open-btn').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', importJson);
  }

  async function importJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error('JSON配列ではありません');
      const existing = new Set((await getVideosForUser(currentUser.email)).map(v => v.url));
      let count = 0;
      for (const row of rows) {
        if (!row?.url || existing.has(row.url)) continue;
        const parsed = parseVideoUrl(row.url);
        await addVideoRecord({
          userEmail: currentUser.email,
          url: row.url,
          title: row.title || getTitle(parsed || { type:'unknown' }, row.url),
          addedAt: row.addedAt || Date.now(),
          favorite: !!row.favorite,
          viewed: !!row.viewed,
          note: row.note || '',
          tags: Array.isArray(row.tags) ? row.tags : [],
          type: row.type || parsed?.type || 'unknown'
        });
        existing.add(row.url);
        count++;
      }
      await renderVideos();
      toast(`JSON読込完了: ${count}件追加`, 'success');
    } catch (err) {
      toast('JSON読込に失敗しました: ' + (err?.message || ''), 'error');
    } finally {
      e.target.value = '';
    }
  }

  window.openEditModal = async function(id) {
    const item = await getVideoById(id);
    if (!item) return;
    editTargetId = id;
    document.getElementById('edit-title').value = item.title || '';
    document.getElementById('edit-url').value = item.url || '';
    document.getElementById('edit-tags').value = (item.tags || []).join(', ');
    document.getElementById('edit-note').value = item.note || '';
    document.getElementById('edit-modal').classList.add('open');
  };
  window.closeEditModal = function() { editTargetId = null; document.getElementById('edit-modal').classList.remove('open'); };
  window.saveEditModal = async function() {
    if (!editTargetId) return;
    const title = document.getElementById('edit-title').value.trim();
    const url = document.getElementById('edit-url').value.trim();
    const parsed = parseVideoUrl(url);
    if (!parsed) return toast('編集URLが無効です', 'error');
    const tags = document.getElementById('edit-tags').value.split(',').map(v => v.trim()).filter(Boolean).slice(0, 12);
    const note = document.getElementById('edit-note').value.trim();
    await upsertVideoFields(editTargetId, { title: title || 'Untitled', url, type: parsed.type, tags, note });
    closeEditModal();
    toast('編集内容を保存しました', 'success');
  };
  document.getElementById('edit-modal').addEventListener('click', e => { if (e.target.id === 'edit-modal') closeEditModal(); });
  window.openShortcutsModal = function() { document.getElementById('shortcuts-modal').classList.add('open'); };
  window.closeShortcutsModal = function() { document.getElementById('shortcuts-modal').classList.remove('open'); };
  document.getElementById('shortcuts-modal').addEventListener('click', e => { if (e.target.id === 'shortcuts-modal') closeShortcutsModal(); });

  document.addEventListener('click', async e => {
    const btn = e.target.closest('.tag-badge.clickable');
    if (!btn) return;
    const tag = btn.dataset.tag || btn.textContent || '';
    document.getElementById('search-input').value = tag;
    savePrefs();
    await renderVideos();
  });

  async function handleRedirectSession() {
    if (!supabase) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const authMode = url.searchParams.get('auth_mode');
    if (!code) return;
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return showMsg('メールリンクの処理に失敗しました: ' + escapeHtml(error.message), 'error');
    url.searchParams.delete('code');
    url.searchParams.delete('auth_mode');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    if (authMode === 'recovery') {
      switchTab('reset');
      document.getElementById('reset-request-block').style.display = 'none';
      document.getElementById('reset-update-block').style.display = '';
      showMsg('認証済みです。新しいパスワードを入力してください。', 'success');
      return;
    }
    if (authMode === 'signup') { showMsg('メール認証が完了しました。ログインしてください。', 'success'); switchTab('login'); }
  }

  window.switchTab = function(tab) {
    document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
    document.getElementById('reset-form').style.display = tab === 'reset' ? '' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('tab-reset').classList.toggle('active', tab === 'reset');
    document.getElementById('reset-request-block').style.display = '';
    document.getElementById('reset-update-block').style.display = 'none';
    showMsg('', '');
  };

  async function bootstrapAuth() {
    if (!supabase) {
      // Supabase未設定 → ゲストとして自動起動
      currentUser = { email: GUEST_EMAIL, id: 'guest', isGuest: true };
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      document.getElementById('topbar-email').innerHTML = '<span class="guest-badge">Guest Session</span>';
      await renderVideos();
      return;
    }
    await handleRedirectSession();
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        switchTab('reset');
        document.getElementById('reset-request-block').style.display = 'none';
        document.getElementById('reset-update-block').style.display = '';
        showMsg('新しいパスワードを入力してください。', 'success');
      }
      if (event === 'SIGNED_IN' && session?.user) {
        const url = new URL(window.location.href);
        const authMode = url.searchParams.get('auth_mode');
        if (authMode === 'signup' || authMode === 'recovery') return;
        loginSuccess(session.user);
      }
      if (event === 'SIGNED_OUT') handleLogoutUI();
    });
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) loginSuccess(session.user);
  }

  window.handleGuestLogin = async function() {
    currentUser = { email: GUEST_EMAIL, id: 'guest', isGuest: true };
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('topbar-email').innerHTML = '<span class="guest-badge">Guest Session</span>';
    document.getElementById('login-password').value = '';
    showMsg('', '');
    await renderVideos();
    toast('ゲストでログインしました', 'success');
  };
  window.handleLogin = async function() {
    try {
      if (!supabase) return showMsg('Supabase 設定が未入力です', 'error');
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      if (!isValidEmail(email) || !password) return showMsg('メールアドレスとパスワードを入力してください', 'error');
      setBusy('login-btn', true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      loginSuccess(data.user);
    } catch (e) {
      const msg = e?.message || 'ログインに失敗しました';
      if (/Email not confirmed/i.test(msg)) {
        pendingEmailForResend = document.getElementById('login-email').value.trim();
        document.getElementById('resend-confirm-btn').style.display = '';
        showMsg('メール認証が未完了です。受信箱を確認してください。届いていない場合は下の再送ボタンを使ってください。', 'error');
      } else showMsg(escapeHtml(msg), 'error');
    } finally { setBusy('login-btn', false); }
  };

  window.handleRegister = async function() {
    try {
      if (!supabase) return showMsg('Supabase 設定が未入力です', 'error');
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const password2 = document.getElementById('reg-password2').value;
      if (!isValidEmail(email)) return showMsg('正しいメールアドレスを入力してください', 'error');
      if (password.length < 6) return showMsg('パスワードは6文字以上にしてください', 'error');
      if (password !== password2) return showMsg('パスワードが一致しません', 'error');
      setBusy('register-btn', true);
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: currentRedirectUrl('signup') } });
      if (error) throw error;
      pendingEmailForResend = email;
      document.getElementById('resend-confirm-btn').style.display = '';
      showMsg('確認メールを送信しました。メール内リンクを開いて認証後、ログインしてください。', 'success');
      switchTab('login');
      document.getElementById('login-email').value = email;
    } catch (e) { showMsg(escapeHtml(e?.message || '登録に失敗しました'), 'error'); }
    finally { setBusy('register-btn', false); }
  };

  window.handleResendConfirmation = async function() {
    try {
      if (!supabase) return showMsg('Supabase 設定が未入力です', 'error');
      const email = pendingEmailForResend || document.getElementById('login-email').value.trim();
      if (!isValidEmail(email)) return showMsg('再送先メールアドレスがありません', 'error');
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: currentRedirectUrl('signup') } });
      if (error) throw error;
      showMsg('確認メールを再送しました。', 'success');
    } catch (e) { showMsg(escapeHtml(e?.message || '再送に失敗しました'), 'error'); }
  };

  window.handleResetRequest = async function() {
    try {
      if (!supabase) return showMsg('Supabase 設定が未入力です', 'error');
      const email = document.getElementById('reset-email').value.trim();
      if (!isValidEmail(email)) return showMsg('正しいメールアドレスを入力してください', 'error');
      setBusy('reset-request-btn', true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: currentRedirectUrl('recovery') });
      if (error) throw error;
      showMsg('再設定メールを送信しました。受信箱を確認してください。', 'success');
    } catch (e) { showMsg(escapeHtml(e?.message || '再設定メール送信に失敗しました'), 'error'); }
    finally { setBusy('reset-request-btn', false); }
  };

  window.handleResetUpdate = async function() {
    try {
      if (!supabase) return showMsg('Supabase 設定が未入力です', 'error');
      const password = document.getElementById('reset-new-pw').value;
      const password2 = document.getElementById('reset-new-pw2').value;
      if (password.length < 6) return showMsg('パスワードは6文字以上にしてください', 'error');
      if (password !== password2) return showMsg('パスワードが一致しません', 'error');
      setBusy('reset-update-btn', true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showMsg('パスワードを変更しました。ログインし直してください。', 'success');
      document.getElementById('reset-new-pw').value = '';
      document.getElementById('reset-new-pw2').value = '';
      switchTab('login');
      await supabase.auth.signOut();
    } catch (e) { showMsg(escapeHtml(e?.message || 'パスワード変更に失敗しました'), 'error'); }
    finally { setBusy('reset-update-btn', false); }
  };


  function setupAppSectionSwitcher() { /* No-op: replaced by tab system */ }

  // ── APP TABS ─────────────────────────────────────────────────────
  let _currentAppTab = 'filter';
  window.switchAppTab = function(tab) {
    _currentAppTab = tab;
    ['filter', 'add', 'actions'].forEach(t => {
      const btn = document.getElementById('apptab-' + t);
      const content = document.getElementById('apptab-content-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
      if (content) content.classList.toggle('active', t === tab);
    });
  };

  function updateAppTabSelectionBadge() {
    const count = selectedIds.size;
    const badge = document.getElementById('apptab-sel-badge');
    if (badge) badge.textContent = count > 0 ? count : '0';
    // Highlight actions tab if items selected
    const actBtn = document.getElementById('apptab-actions');
    if (actBtn) actBtn.style.color = count > 0 ? 'var(--gold2)' : '';
  }

  // ── QS-BAR binding ──────────────────────────────────────────────
  function bindQsBar() {
    // ① 表示モード切替
    document.querySelectorAll('#qs-media-view .seg-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.mv;
        mediaViewMode = mode === 'poster' ? 'poster' : 'player';
        posterOpenIds.clear();
        document.querySelectorAll('#qs-media-view .seg-btn').forEach(b => b.classList.toggle('act', b === btn));
        savePrefs();
        await renderVideos();
      });
    });

    // ② QS列ボタン（1〜5）
    document.querySelectorAll('#qs-cols .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyLayoutCols(Number(btn.dataset.col), true);
      });
    });

    // ③ QSソートボタン
    document.querySelectorAll('#qs-sort .seg-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        _currentSort = btn.dataset.sort;
        document.getElementById('sort-select').value = btn.dataset.sort;
        document.querySelectorAll('#qs-sort .seg-btn').forEach(b => b.classList.toggle('act', b === btn));
        savePrefs();
        await renderVideos();
      });
    });

    // ④ QS絞込ボタン — currentFilter を直接更新してrenderVideos
    document.querySelectorAll('#qs-filter .seg-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        currentFilter = btn.dataset.qf;
        document.querySelectorAll('#qs-filter .seg-btn').forEach(b => b.classList.toggle('act', b === btn));
        // メインのフィルターチップも同期
        document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === currentFilter));
        savePrefs();
        await renderVideos();
      });
    });

    // ⑤ メインsort-selectが変更されたときQSバーも同期（bindToolbar側で処理）

    // ⑥ 初期状態を反映（prefs から）
    const initMv = prefs.mediaView || 'player';
    document.querySelectorAll('#qs-media-view .seg-btn').forEach(b => b.classList.toggle('act', b.dataset.mv === initMv));
    const initSort = prefs.sort || 'newest';
    document.querySelectorAll('#qs-sort .seg-btn').forEach(b => b.classList.toggle('act', b.dataset.sort === initSort));
    const initFilter = prefs.filter || 'all';
    document.querySelectorAll('#qs-filter .seg-btn').forEach(b => b.classList.toggle('act', b.dataset.qf === initFilter));
    // QS-cols は applyLayoutCols 側で自動同期される
  }

  function loginSuccess(user) {
    currentUser = { email: user.email, id: user.id, isGuest: false };
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('topbar-email').textContent = user.email;
    renderVideos();  // intentionally not awaited (fire-and-forget on login)
    toast('ログインしました', 'success');
  }
  function handleLogoutUI() {
    currentUser = null;
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('topbar-email').textContent = '';
    selectedIds.clear();
    updateSelectionCounter();
  }
  window.handleLogout = async function() {
    if (currentUser && !currentUser.isGuest && supabase) await supabase.auth.signOut();
    handleLogoutUI();
    document.getElementById('login-password').value = '';
    showMsg('', '');
  };

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('search-input')?.focus(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); document.getElementById('select-all-btn')?.click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); document.getElementById('clear-filters-btn')?.click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { if (document.getElementById('app').style.display !== 'none') { e.preventDefault(); window.addUrls(); return; } }
    if (e.key === '/' && document.activeElement && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); document.getElementById('search-input')?.focus(); return; }
    if (e.key === 'Escape') { closeEditModal(); closeShortcutsModal(); }
    if (e.key !== 'Enter') return;
    if (document.getElementById('auth-screen').style.display !== 'none') {
      if (document.getElementById('tab-login').classList.contains('active')) window.handleLogin();
      else if (document.getElementById('tab-register').classList.contains('active')) window.handleRegister();
    }
  });

  await openDB();
  bindToolbar();
  setupAppSectionSwitcher();
  bindQsBar();
  applyLayoutCols(prefs.layout ?? 3, false);
  // QS-bar initial state sync happens inside bindQsBar
  await bootstrapAuth();
