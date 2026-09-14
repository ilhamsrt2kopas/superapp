export const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/GANTI_DENGAN_DEPLOYMENT_ID/exec',
  SCHOOL_NAME: 'SRT 2 Kota Pasuruan',
  TAGLINE: 'Cerdas Bersama, Tumbuh Setara',
  LOGO_URL: './icons/icon-192.png'
};

const SESSION_KEY = 'srt2_session';
export const S = {
  get session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } },
  set session(v) { localStorage.setItem(SESSION_KEY, JSON.stringify(v)); },
  clear() { localStorage.removeItem(SESSION_KEY); }
};

// Cache in-memory untuk data yang jarang berubah — hilang saat tab ditutup/reload,
// jadi tetap aman (tidak pernah menampilkan data basi lintas sesi).
const CACHEABLE = { siswa_list: 60000, petugas_list: 60000, barang_list: 20000, barang_list_pinjam: 20000, barang_list_ambil: 20000 };
const memCache = new Map();
export function invalidateCache(action) { memCache.delete(action); }
export function invalidateBarangCache() { ['barang_list', 'barang_list_pinjam', 'barang_list_ambil'].forEach(invalidateCache); }

export async function api(action, payload) {
  if (CACHEABLE[action]) {
    const hit = memCache.get(action);
    if (hit && Date.now() - hit.t < CACHEABLE[action]) return hit.data;
  }
  const body = { action, token: S.session ? S.session.token : null, payload: payload || {} };
  try {
    const res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.ok && data.code === 'AUTH') { S.clear(); location.reload(); }
    if (data.ok && CACHEABLE[action]) memCache.set(action, { t: Date.now(), data });
    return data;
  } catch (err) {
    toast('Gagal terhubung ke server. Cek koneksi internet.');
    return { ok: false, message: 'network_error' };
  }
}

export function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
export function qs(sel, root) { return (root || document).querySelector(sel); }
export function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

export function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
}

export function debounce(fn, ms) {
  let last = 0;
  return (...args) => { const now = Date.now(); if (now - last < ms) return; last = now; fn(...args); };
}

const loadedScripts = {};
export function loadScript(src, globalCheck) {
  if (globalCheck && window[globalCheck]) return Promise.resolve();
  if (loadedScripts[src]) return loadedScripts[src];
  loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load-fail'));
    document.head.appendChild(s);
  });
  return loadedScripts[src];
}

const THEME_KEY = 'srt2_theme';
export function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem(THEME_KEY, theme); }
export function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }
applyTheme(getTheme());

/* ================= QR Scanner: TIDAK memuat pustaka/kamera sebelum tombol ditekan ================= */
let activeScanner = null;
export async function stopActiveScanner() {
  if (!activeScanner) return;
  const s = activeScanner; activeScanner = null;
  try { await s.stop(); } catch (e) {}
  try { s.clear(); } catch (e) {}
}

export function renderQrLauncher(container, onDecode, debounceMs = 1200) {
  container.innerHTML = `<div class="qr-launcher"><button class="btn small" data-qr-start>📷 Mulai Scan</button></div>`;
  qs('[data-qr-start]', container).onclick = () => startScannerUI(container, onDecode, debounceMs);
}

async function startScannerUI(container, onDecode, debounceMs) {
  container.innerHTML = `<p class="muted-text">Memuat pemindai...</p>`;
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js', 'Html5Qrcode');
  } catch (e) {
    container.innerHTML = `<p class="error-text">Gagal memuat pustaka pemindai. Cek koneksi lalu coba lagi.</p><button class="btn small" data-qr-retry>Coba Lagi</button>`;
    qs('[data-qr-retry]', container).onclick = () => startScannerUI(container, onDecode, debounceMs);
    return;
  }
  if (!window.isSecureContext) { container.innerHTML = `<p class="error-text">Kamera hanya bisa diakses lewat HTTPS.</p>`; return; }

  let cameras = [];
  try { cameras = await Html5Qrcode.getCameras(); } catch (e) {}

  const videoId = 'qr-video-' + Date.now();
  container.innerHTML = `
    <div class="qr-launcher">
      ${cameras.length > 1 ? `<select class="search-box" id="qr-cam-select">${cameras.map((c, i) => `<option value="${c.id}">${c.label || 'Kamera ' + (i + 1)}</option>`).join('')}</select>` : ''}
      <div id="${videoId}"></div>
      <button class="btn small secondary" data-qr-stop>Batal</button>
    </div>`;

  const scanner = new Html5Qrcode(videoId);
  activeScanner = scanner;
  const debouncedDecode = debounce((text) => onDecode(text), debounceMs);
  const config = { fps: 10, qrbox: (vw, vh) => { const s = Math.floor(Math.min(vw, vh) * 0.7); return { width: s, height: s }; } };

  const camSelect = qs('#qr-cam-select', container);
  const chosen = camSelect ? camSelect.value : (cameras[0] ? cameras[0].id : { facingMode: 'environment' });

  try {
    await scanner.start(chosen, config, (t) => debouncedDecode(t), () => {});
  } catch (err) {
    try {
      await scanner.start({ facingMode: 'environment' }, config, (t) => debouncedDecode(t), () => {});
    } catch (err2) {
      let pesan = 'Tidak bisa mengakses kamera. Izinkan akses kamera di pengaturan browser.';
      if (err2.name === 'NotAllowedError') pesan = 'Akses kamera ditolak. Aktifkan izin Kamera untuk situs ini.';
      if (err2.name === 'NotReadableError') pesan = 'Kamera sedang dipakai aplikasi lain.';
      container.innerHTML = `<p class="error-text">${pesan}</p><button class="btn small" data-qr-retry>Coba Lagi</button>`;
      qs('[data-qr-retry]', container).onclick = () => startScannerUI(container, onDecode, debounceMs);
      return;
    }
  }
  if (camSelect) camSelect.onchange = async () => { await stopActiveScanner(); startScannerUI(container, onDecode, debounceMs); };
  qs('[data-qr-stop]', container).onclick = async () => { await stopActiveScanner(); renderQrLauncher(container, onDecode, debounceMs); };
}

/* ================= Modal pilih banyak item, dikelompokkan per kategori/jenjang ================= */
export function openMultiSelectModal({ title, groups, multiple = true, initialSelected = [], onConfirm }) {
  const selected = new Map(initialSelected.map((x) => [x.id, x]));
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal-box">
        <h3>${title}</h3>
        <input class="search-box" id="msm-search" placeholder="Cari...">
        <div id="msm-groups" style="max-height:48vh;overflow-y:auto;"></div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn small secondary" id="msm-cancel">Batal</button>
          <button class="btn small" id="msm-ok">Pilih (<span id="msm-count">${selected.size}</span>)</button>
        </div>
      </div>
    </div>`);
  document.body.appendChild(overlay);

  function render(filterText = '') {
    const box = qs('#msm-groups', overlay);
    const q = filterText.toLowerCase();
    box.innerHTML = groups.map((g) => {
      const items = g.items.filter((it) => !q || it.label.toLowerCase().includes(q));
      if (items.length === 0) return '';
      return `<div class="msm-group"><div class="msm-group-title">${g.name}</div>${items.map((it) => `
        <label class="msm-item"><input type="${multiple ? 'checkbox' : 'radio'}" name="msm-radio" data-id="${it.id}" ${selected.has(it.id) ? 'checked' : ''}><span>${it.label}</span></label>`).join('')}</div>`;
    }).join('') || '<p class="muted-text" style="padding:10px;">Tidak ditemukan</p>';

    qsa('input[data-id]', box).forEach((inp) => {
      inp.onchange = () => {
        const id = inp.dataset.id;
        const item = groups.flatMap((g) => g.items).find((x) => x.id === id);
        if (!multiple) selected.clear();
        if (inp.checked) selected.set(id, item); else selected.delete(id);
        qs('#msm-count', overlay).textContent = selected.size;
        if (!multiple) render(qs('#msm-search', overlay).value);
      };
    });
  }
  render();
  qs('#msm-search', overlay).addEventListener('input', (e) => render(e.target.value));
  qs('#msm-cancel', overlay).onclick = () => overlay.remove();
  qs('#msm-ok', overlay).onclick = () => { onConfirm(Array.from(selected.values())); overlay.remove(); };
}

/* ================= Helper cetak A4 ================= */
export function kopSuratHtml() {
  return `<div class="kop-surat"><img src="${CONFIG.LOGO_URL}"><div class="kop-text"><h2>${CONFIG.SCHOOL_NAME}</h2><p>Sekolah Berasrama · "${CONFIG.TAGLINE}"</p><p>Kota Pasuruan, Jawa Timur</p></div></div>`;
}
export function todayIndo() { return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
export async function printHtml(innerHtml) {
  const area = qs('#print-area');
  area.innerHTML = innerHtml;
  await loadScript('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js', 'QRCode');
  qsa('[data-qr]', area).forEach((slot) => new QRCode(slot, { text: slot.dataset.qr, width: 90, height: 90 }));
  setTimeout(() => window.print(), 200);
}