/*************************************************************
 * SRKP PORTAL — APP LOGIC (vanilla JS, no build step)
 *************************************************************/
const API_URL = "https://script.google.com/macros/s/AKfycbyNM324h2AohqqM_gZ9APSc9LjT0CXyCOQ3CYlt463gS2vvz-VLh0SyxsATTw1DMFZG/exec";

const state = {
  token: localStorage.getItem('srkp_token') || null,
  user: JSON.parse(localStorage.getItem('srkp_user') || 'null'),
  view: 'dashboard',
  scanner: null,
  barangCache: null
};

/* ================= API HELPERS ================= */
async function apiGet(action, params = {}) {
  const q = new URLSearchParams({ action, token: state.token || '', ...params });
  const res = await fetch(API_URL + '?' + q.toString(), { method: 'GET' });
  return res.json();
}
async function apiPost(action, body = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: state.token || '', ...body })
  });
  return res.json();
}

/* ================= TOAST ================= */
function toast(message, type = 'success') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}
function afterApi(res, okMsg) {
  if (res.ok) toast(okMsg || res.message || 'Berhasil.', 'success');
  else toast(res.message || 'Terjadi kesalahan.', 'error');
  return res.ok;
}

/* ================= MODAL ================= */
function openModal(innerHtml) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${innerHtml}</div></div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* ================= THEME ================= */
function applyTheme() {
  const saved = localStorage.getItem('srkp_theme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = dark ? '☀️' : '🌙';
}
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  document.getElementById('btn-theme').addEventListener('click', () => {
    const nowDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', nowDark);
    localStorage.setItem('srkp_theme', nowDark ? 'dark' : 'light');
    document.getElementById('btn-theme').textContent = nowDark ? '☀️' : '🌙';
  });
  boot();
});

/* ================= QR SCANNER WRAPPER ================= */
const Scanner = {
  instance: null,
  async start(elementId, onDecode, continuous = false) {
    await this.stop();
    if (!window.isSecureContext) {
      this.renderError(elementId, 'Kamera memerlukan koneksi HTTPS. Buka portal ini melalui alamat HTTPS.');
      return;
    }
    try {
      this.instance = new Html5Qrcode(elementId);
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) {
        this.renderError(elementId, 'Tidak ada kamera yang terdeteksi pada perangkat ini.');
        return;
      }
      const cameraId = (cameras.find(c => /back|belakang|rear/i.test(c.label)) || cameras[cameras.length - 1]).id;
      await this.instance.start(
        cameraId, { fps: 10, qrbox: 240 },
        (decodedText) => { onDecode(decodedText); if (!continuous) this.stop(); },
        () => {}
      );
    } catch (err) {
      let msg = 'Gagal mengakses kamera: ' + err;
      const s = String(err);
      if (/NotAllowedError|Permission/i.test(s)) msg = 'Izin kamera ditolak. Aktifkan izin kamera pada browser untuk portal ini.';
      else if (/NotFoundError/i.test(s)) msg = 'Tidak ditemukan kamera pada perangkat ini.';
      else if (/NotReadableError/i.test(s)) msg = 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.';
      this.renderError(elementId, msg);
    }
  },
  renderError(elementId, msg) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = `<div class="qr-error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>${msg}</div>
      <button class="btn btn-accent btn-sm" style="margin-top:12px" onclick="Scanner.retry('${elementId}')">Coba Lagi</button>
    </div>`;
  },
  _retryFn: null,
  retry(elementId) { if (this._retryFn) this._retryFn(); },
  async stop() {
    if (this.instance) {
      try { await this.instance.stop(); this.instance.clear(); } catch (e) {}
      this.instance = null;
    }
  }
};

/* ================= AUTH / LOGIN ================= */
function showScreen(id) {
  ['view-welcome', 'view-login', 'app'].forEach(v => document.getElementById(v).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

async function boot() {
  wireLoginUi();
  if (state.token && state.user) {
    const me = await apiGet('getMe');
    if (me.ok) { state.user = me.data; enterApp(); return; }
    localStorage.removeItem('srkp_token'); localStorage.removeItem('srkp_user');
  }
  showScreen('view-welcome');
}

function wireLoginUi() {
  document.getElementById('btn-go-login').addEventListener('click', () => showScreen('view-login'));
  document.getElementById('btn-back-welcome').addEventListener('click', async () => { await Scanner.stop(); showScreen('view-welcome'); });

  document.getElementById('tab-password').addEventListener('click', async () => {
    document.getElementById('tab-password').classList.add('active');
    document.getElementById('tab-qr').classList.remove('active');
    document.getElementById('pane-password').classList.remove('hidden');
    document.getElementById('pane-qr').classList.add('hidden');
    await Scanner.stop();
  });
  document.getElementById('tab-qr').addEventListener('click', () => {
    document.getElementById('tab-qr').classList.add('active');
    document.getElementById('tab-password').classList.remove('active');
    document.getElementById('pane-qr').classList.remove('hidden');
    document.getElementById('pane-password').classList.add('hidden');
    Scanner._retryFn = startLoginScanner;
    startLoginScanner();
  });

  document.getElementById('btn-login-password').addEventListener('click', async () => {
    const nip = document.getElementById('in-nip').value.trim();
    const password = document.getElementById('in-pass').value;
    if (!nip || !password) return toast('Isi NIP dan password.', 'error');
    const res = await apiPost('loginPassword', { nip, password });
    if (!res.ok) return toast(res.message, 'error');
    saveSession(res.data.token, res.data.user);
  });
}

function startLoginScanner() {
  Scanner.start('qr-reader', async (text) => {
    const res = await apiPost('loginQr', { qrText: text });
    if (!res.ok) { toast(res.message, 'error'); Scanner._retryFn(); return; }
    saveSession(res.data.token, res.data.user);
  }, false);
}

function saveSession(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem('srkp_token', token);
  localStorage.setItem('srkp_user', JSON.stringify(user));
  toast('Selamat datang, ' + user.nama + '!', 'success');
  enterApp();
}

async function doLogout() {
  await apiPost('logout');
  localStorage.removeItem('srkp_token'); localStorage.removeItem('srkp_user');
  state.token = null; state.user = null;
  location.reload();
}

/* ================= MENU DEFINITIONS ================= */
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  absensi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  pengumuman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a2 2 0 1 1-3.2 2.4"/></svg>',
  perizinan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  konseling: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  peminjaman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>',
  pengambilan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8l-9 6-9-6"/><path d="M3 8l9-6 9 6v8l-9 6-9-6z"/></svg>',
  distribusi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M17 11l2 2 4-4"/></svg>',
  siswa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>',
  petugas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>',
  barang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8L12 3 3 8m18 0l-9 5m9-5v9l-9 5m0-9L3 8m9 5v9M3 8v9l9 5"/></svg>',
  profil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  rekap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19h16M7 15v-4M12 15V7M17 15v-8"/></svg>',
  persetujuan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>',
  pesan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.5-.3-3.6-.8L3 21l1.8-5.9A8.5 8.5 0 1 1 21 11.5z"/></svg>'
};

function menuForUser() {
  const u = state.user;
  if (u.role === 'OrangTua') {
    return [
      { id: 'pengumuman', label: 'Pengumuman', icon: 'pengumuman' },
      { id: 'pesan', label: 'Pesan', icon: 'pesan' },
      { id: 'profil', label: 'Profil', icon: 'profil' }
    ];
  }
  if (u.role === 'Siswa') {
    return [
      { id: 'pengumuman', label: 'Pengumuman', icon: 'pengumuman' },
      { id: 'profil', label: 'Profil', icon: 'profil' }
    ];
  }
  // Admin roles
  const items = [
    { id: 'dashboard', label: 'Dasbor', icon: 'dashboard' },
    { id: 'absensi', label: 'Absensi Siswa', icon: 'absensi' },
    { id: 'pengumuman', label: 'Buat Pengumuman', icon: 'pengumuman' },
    { id: 'perizinan', label: 'Perizinan Siswa', icon: 'perizinan' },
    { id: 'konseling', label: 'Konseling Siswa', icon: 'konseling' },
    { id: 'peminjaman', label: 'Peminjaman Barang', icon: 'peminjaman' },
    { id: 'pengambilan', label: 'Pengambilan Barang', icon: 'pengambilan' },
    { id: 'distribusi', label: 'Distribusi Barang', icon: 'distribusi' },
    { id: 'siswa', label: 'Data Siswa', icon: 'siswa' },
    { id: 'petugas', label: 'Data Petugas', icon: 'petugas' },
    { id: 'barang', label: 'Data Barang', icon: 'barang' },
    { id: 'profil', label: 'Profil', icon: 'profil' },
    { id: 'rekap', label: 'Rekap Saya', icon: 'rekap' },
    { id: 'pesan', label: 'Pesan', icon: 'pesan' }
  ];
  if (u.role === 'KepalaSekolah' || u.role === 'PegawaiBerwenang') {
    items.splice(1, 0, { id: 'persetujuan', label: 'Persetujuan', icon: 'persetujuan' });
  }
  return items;
}

const ROLE_LABEL = {
  KepalaSekolah: 'Kepala Sekolah', Guru: 'Guru', Pegawai: 'Pegawai',
  PegawaiBerwenang: 'Pegawai Berwenang', Siswa: 'Siswa', OrangTua: 'Orang Tua'
};

/* ================= APP SHELL / ROUTER ================= */
function enterApp() {
  showScreen('app');
  document.getElementById('role-chip').textContent = ROLE_LABEL[state.user.role] + (state.user.wewenang ? ' · ' + state.user.wewenang : '');
  buildNav();
  navigate(state.user.role === 'OrangTua' || state.user.role === 'Siswa' ? 'pengumuman' : 'dashboard');
}

function buildNav() {
  const items = menuForUser();
  const bottomIds = items.slice(0, 4).map(i => i.id);
  const sidebar = document.getElementById('sidebar');
  const bottomnav = document.getElementById('bottomnav');

  sidebar.innerHTML = items.map(i =>
    `<div class="item" data-id="${i.id}">${ICONS[i.icon] || ''}<span>${i.label}</span></div>`
  ).join('') + `<div class="item" data-id="__logout" style="margin-top:16px;color:var(--danger-600)">${ICONS.pesan.replace('pesan','')||''}🚪<span>&nbsp;Keluar</span></div>`;

  bottomnav.innerHTML = bottomIds.map(id => {
    const it = items.find(x => x.id === id);
    return `<button data-id="${id}">${ICONS[it.icon]}<span>${it.label}</span></button>`;
  }).join('') + `<button data-id="__more">${ICONS.barang}<span>Lainnya</span></button>`;

  sidebar.querySelectorAll('.item').forEach(el => el.addEventListener('click', () => {
    if (el.dataset.id === '__logout') return doLogout();
    navigate(el.dataset.id);
  }));
  bottomnav.querySelectorAll('button').forEach(el => el.addEventListener('click', () => {
    if (el.dataset.id === '__more') return openMoreSheet(items);
    navigate(el.dataset.id);
  }));
}

function openMoreSheet(items) {
  openModal(`<div class="modal-head"><h3 style="margin:0">Menu Lainnya</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
    <div class="grid grid-2">
      ${items.map(i => `<div class="card interactive" data-nav="${i.id}" style="text-align:center">${ICONS[i.icon]}<div style="margin-top:6px;font-weight:600;font-size:.85rem">${i.label}</div></div>`).join('')}
    </div>`);
  document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => { closeModal(); navigate(el.dataset.nav); }));
}

async function navigate(view) {
  await Scanner.stop();
  state.view = view;
  document.querySelectorAll('.sidebar .item').forEach(el => el.classList.toggle('active', el.dataset.id === view));
  document.querySelectorAll('.bottomnav button').forEach(el => el.classList.toggle('active', el.dataset.id === view));
  const content = document.getElementById('content');
  content.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  try {
    const renderer = VIEWS[view] || VIEWS.dashboard;
    await renderer(content);
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Gagal memuat halaman: ${err.message}</div>`;
  }
}

function emptyState(text) {
  return `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg><div>${text}</div></div>`;
}

/* ================= VIEW: DASHBOARD ================= */
const VIEWS = {};

VIEWS.dashboard = async (root) => {
  const res = await apiGet('getDashboard');
  if (!res.ok) return root.innerHTML = emptyState(res.message);
  const d = res.data;
  const jenjangBlock = (label, arr) => `
    <div class="card">
      <div class="card-title">${label} · Tidak Hadir</div>
      <div class="card-sub">${arr.length} siswa</div>
      <div style="margin-top:10px">${arr.length ? arr.map(s => `<div class="list-item"><div><b>${s.nama}</b><div class="card-sub">${s.kelas}</div></div></div>`).join('') : emptyState('Semua siswa ' + label + ' hadir hari ini.')}</div>
    </div>`;

  const totalStok = d.stokBarang.reduce((a, b) => a + b.jumlah, 0) || 1;
  const colors = ['#0F5257', '#E8A33D', '#146B71', '#B8862B', '#2E7D5B', '#C1443A', '#16243A', '#7A9E9F', '#9C6B1E'];
  let acc = 0;
  const gradParts = d.stokBarang.map((b, i) => {
    const pct = (b.jumlah / totalStok) * 100;
    const part = `${colors[i % colors.length]} ${acc}% ${acc + pct}%`;
    acc += pct;
    return part;
  }).join(',');

  root.innerHTML = `
    <div class="section-title"><h2>Dasbor</h2></div>
    <div class="grid grid-3">
      ${jenjangBlock('SD', d.tidakHadir.SD)}
      ${jenjangBlock('SMP', d.tidakHadir.SMP)}
      ${jenjangBlock('SMA', d.tidakHadir.SMA)}
    </div>

    <div class="section-title"><h2>Peminjaman Barang Hari Ini</h2></div>
    <div class="card">${d.peminjamanHariIni.length ? d.peminjamanHariIni.map(p => `<div class="list-item"><div><b>${p.NamaPeminjam}</b><div class="card-sub">${p.TujuanPenggunaan} · ${p.Status}</div></div></div>`).join('') : emptyState('Belum ada peminjaman hari ini.')}</div>

    <div class="section-title"><h2>Perizinan Siswa</h2></div>
    <div class="card">${d.perizinanAktif.length ? d.perizinanAktif.map(p => `<div class="list-item"><div><b>${p.Nama}</b><div class="card-sub">${p.Keperluan} · ${p.Status}</div></div></div>`).join('') : emptyState('Belum ada perizinan siswa hari ini.')}</div>

    <div class="section-title"><h2>Stok Barang Tersedia</h2></div>
    <div class="card donut-wrap">
      <div style="width:150px;height:150px;border-radius:50%;background:conic-gradient(${gradParts || '#ccc 0 100%'});flex-shrink:0" title="Stok barang"></div>
      <div class="donut-legend">
        ${d.stokBarang.map((b, i) => `<span title="${b.nama}: ${((b.jumlah/totalStok)*100).toFixed(1)}% (${b.jumlah} unit)"><i class="dot" style="background:${colors[i % colors.length]}"></i>${b.nama} — ${b.jumlah} unit</span>`).join('')}
        ${!d.stokBarang.length ? emptyState('Belum ada data barang.') : ''}
      </div>
    </div>`;
};

/* ================= VIEW: ABSENSI (continuous QR) ================= */
VIEWS.absensi = async (root) => {
  root.innerHTML = `
    <div class="section-title"><h2>Absensi Siswa</h2></div>
    <div class="field-row">
      <select id="ab-jenjang"><option value="">Semua Jenjang</option><option>SD</option><option>SMP</option><option>SMA</option></select>
      <select id="ab-sesi"><option value="1">Sesi 1</option><option value="2">Sesi 2</option><option value="3">Sesi 3</option><option value="4">Sesi 4</option></select>
    </div>
    <div class="qr-box" style="max-width:340px;margin:14px auto"><div id="qr-reader" style="width:100%;height:100%"></div></div>
    <p style="text-align:center;color:var(--text-dim);font-size:.82rem">Scanner berjalan terus-menerus. Arahkan QR siswa satu per satu.</p>
    <div id="ab-log" style="margin-top:14px"></div>
    <div class="section-title"><h2>Daftar Sesi Ini</h2></div>
    <div id="ab-roster"></div>
  `;
  const log = [];
  const renderLog = () => document.getElementById('ab-log').innerHTML = log.slice(0, 6).map(l => `<div class="toast ${l.ok ? 'success' : 'error'}" style="position:static;margin-bottom:6px">${l.msg}</div>`).join('');

  async function refreshRoster() {
    const jenjang = document.getElementById('ab-jenjang').value;
    const sesi = document.getElementById('ab-sesi').value;
    const res = await apiGet('getAbsensiRoster', { jenjang, sesi });
    const wrap = document.getElementById('ab-roster');
    if (!res.ok || !res.data.length) { wrap.innerHTML = emptyState('Belum ada data siswa untuk filter ini.'); return; }
    wrap.innerHTML = res.data.map(s => `<div class="list-item"><div style="flex:1"><b>${s.nama}</b><div class="card-sub">${s.jenjang} · ${s.kelas} · NISN ${s.nisn}</div></div>
      ${s.statusSesiIni ? `<span class="badge ${s.statusSesiIni === 'Hadir' ? 'badge-ok' : 'badge-danger'}">${s.statusSesiIni}</span>` : (s.butuhKeterangan ? '<span class="badge badge-warn">Perlu keterangan</span>' : '<span class="badge badge-warn">Belum absen</span>')}
    </div>`).join('');
  }

  async function startAbsensiScanner() {
    Scanner._retryFn = startAbsensiScanner;
    await Scanner.start('qr-reader', async (text) => {
      const sesi = document.getElementById('ab-sesi').value;
      const res = await apiPost('submitAbsensiScan', { qrText: text, sesi });
      if (res.needKeterangan) {
        openModal(`<div class="modal-head"><h3 style="margin:0">Isi Keterangan</h3></div>
          <p>${res.message}</p>
          <label>Keterangan</label><textarea id="ket-input" rows="3" placeholder="Contoh: Sakit, izin dokter, dsb."></textarea>
          <button class="btn btn-primary btn-block" style="margin-top:14px" id="ket-submit">Simpan Keterangan</button>`);
        document.getElementById('ket-submit').addEventListener('click', async () => {
          const ket = document.getElementById('ket-input').value.trim();
          if (!ket) return toast('Keterangan wajib diisi.', 'error');
          const r2 = await apiPost('submitAbsensiKeterangan', { nisn: res.nisn, sesi, keterangan: ket });
          afterApi(r2); closeModal(); refreshRoster();
        });
      } else {
        log.unshift({ ok: res.ok, msg: res.message }); renderLog();
        if (res.ok) toast(res.message, 'success'); else toast(res.message, 'error');
        refreshRoster();
      }
    }, true);
  }

  document.getElementById('ab-jenjang').addEventListener('change', refreshRoster);
  document.getElementById('ab-sesi').addEventListener('change', refreshRoster);
  refreshRoster();
  startAbsensiScanner();
};

/* ================= VIEW: PENGUMUMAN ================= */
VIEWS.pengumuman = async (root) => {
  const res = await apiGet('getPengumumanList');
  const list = res.ok ? res.data : [];
  const canCreate = ['KepalaSekolah', 'Guru', 'Pegawai', 'PegawaiBerwenang'].includes(state.user.role);
  root.innerHTML = `
    <div class="section-title"><h2>Pengumuman</h2>${canCreate ? '<button class="btn btn-accent btn-sm" id="btn-new-peng">+ Buat Pengumuman</button>' : ''}</div>
    <div id="peng-list">${list.length ? list.map(p => `
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">${p.Judul} <span class="badge ${p.Status==='Terbit'?'badge-ok':p.Status==='Ditolak'?'badge-danger':'badge-warn'}">${p.Status}</span></div>
        <div class="card-sub">${p.DiajukanOleh} · ${p.Tanggal}</div>
        <p style="margin:10px 0 0">${p.Isi}</p>
        ${p.ScanURL ? `<a href="${p.ScanURL}" target="_blank" style="font-size:.82rem;color:var(--primary)">Lihat scan pengumuman</a>` : ''}
      </div>`).join('') : emptyState('Belum ada pengumuman.')}</div>`;

  if (canCreate) document.getElementById('btn-new-peng').addEventListener('click', () => {
    openModal(`<div class="modal-head"><h3 style="margin:0">Buat Pengumuman</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
      <label>Judul Pengumuman</label><input id="pg-judul">
      <label>Isi Pengumuman</label><textarea id="pg-isi" rows="4"></textarea>
      <label>Scan Pengumuman (opsional, tautan gambar)</label><input id="pg-scan" placeholder="https://...">
      <button class="btn btn-primary btn-block" style="margin-top:14px" id="pg-submit">Ajukan ke Humas</button>`);
    document.getElementById('pg-submit').addEventListener('click', async () => {
      const judul = document.getElementById('pg-judul').value.trim();
      const isi = document.getElementById('pg-isi').value.trim();
      if (!judul || !isi) return toast('Judul dan isi wajib diisi.', 'error');
      const res2 = await apiPost('createPengumuman', { judul, isi, scanUrl: document.getElementById('pg-scan').value.trim() });
      if (afterApi(res2)) { closeModal(); navigate('pengumuman'); }
    });
  });
};

/* ================= HELPER: pilih siswa (multi + scan QR) ================= */
async function pickSiswaModal(onDone) {
  const res = await apiGet('getSiswaList');
  const all = res.ok ? res.data : [];
  const selected = new Map();
  openModal(`<div class="modal-head"><h3 style="margin:0">Pilih Siswa</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
    <div class="searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="pk-search" placeholder="Cari nama / NISN / kelas..."></div>
    <button class="btn btn-ghost btn-block" id="pk-scan-btn">📷 Scan QR Siswa untuk menambahkan</button>
    <div id="pk-scan-wrap" class="hidden qr-box" style="max-width:280px;margin:12px auto"><div id="qr-reader" style="width:100%;height:100%"></div></div>
    <div id="pk-list" style="margin-top:10px;max-height:280px;overflow-y:auto"></div>
    <div style="margin-top:10px;font-size:.82rem;color:var(--text-dim)"><span id="pk-count">0</span> siswa dipilih</div>
    <button class="btn btn-primary btn-block" style="margin-top:10px" id="pk-confirm">Lanjutkan</button>`);

  function renderList(filter = '') {
    const f = filter.toLowerCase();
    const filtered = all.filter(s => !f || Object.values(s).join(' ').toLowerCase().includes(f));
    document.getElementById('pk-list').innerHTML = filtered.map(s => `
      <div class="checklist-item ${selected.has(s.nisn) ? 'checked' : ''}" data-nisn="${s.nisn}">
        <div style="flex:1"><b>${s.nama}</b><div class="card-sub">${s.jenjang} · ${s.kelas} · ${s.nisn}</div></div>
        ${selected.has(s.nisn) ? '✓' : ''}
      </div>`).join('') || emptyState('Tidak ditemukan.');
    document.querySelectorAll('.checklist-item').forEach(el => el.addEventListener('click', () => {
      const nisn = el.dataset.nisn;
      const s = all.find(x => x.nisn === nisn);
      if (selected.has(nisn)) selected.delete(nisn); else selected.set(nisn, s);
      document.getElementById('pk-count').textContent = selected.size;
      renderList(document.getElementById('pk-search').value);
    }));
  }
  renderList();
  document.getElementById('pk-search').addEventListener('input', (e) => renderList(e.target.value));
  document.getElementById('pk-scan-btn').addEventListener('click', () => {
    document.getElementById('pk-scan-wrap').classList.remove('hidden');
    Scanner._retryFn = () => Scanner.start('qr-reader', handleScan, true);
    Scanner.start('qr-reader', handleScan, true);
  });
  function handleScan(text) {
    const nisn = text.split(' - ')[0].trim();
    const s = all.find(x => x.nisn === nisn);
    if (!s) return toast('NISN tidak ditemukan di data siswa.', 'error');
    selected.set(nisn, s);
    document.getElementById('pk-count').textContent = selected.size;
    toast(s.nama + ' ditambahkan.', 'success');
    renderList(document.getElementById('pk-search').value);
  }
  document.getElementById('pk-confirm').addEventListener('click', async () => {
    if (!selected.size) return toast('Pilih minimal 1 siswa.', 'error');
    await Scanner.stop();
    closeModal();
    onDone(Array.from(selected.values()));
  });
}

/* ================= VIEW: PERIZINAN ================= */
VIEWS.perizinan = async (root) => {
  const res = await apiGet('getPerizinanList');
  const list = res.ok ? res.data : [];
  const canApprove = state.user.role === 'KepalaSekolah' || (state.user.role === 'PegawaiBerwenang' && state.user.wewenang === 'UKS');
  root.innerHTML = `
    <div class="section-title"><h2>Form Perizinan Siswa</h2><button class="btn btn-accent btn-sm" id="btn-new-izin">+ Ajukan Izin</button></div>
    <p style="font-size:.82rem;color:var(--text-dim)">Pilih beberapa siswa sekaligus jika rincian izinnya sama — cukup satu kali pengisian untuk semua siswa terkait.</p>
    <div id="izin-list">${list.length ? list.map(p => renderPerizinanCard(p, canApprove)).join('') : emptyState('Belum ada perizinan siswa.')}</div>`;

  document.getElementById('btn-new-izin').addEventListener('click', () => {
    pickSiswaModal((siswaList) => openIzinForm(siswaList));
  });
  wirePerizinanActions(canApprove);
};

function renderPerizinanCard(p, canApprove) {
  const statusBadge = p.Status === 'Disetujui' ? 'badge-ok' : p.Status === 'Ditolak' ? 'badge-danger' : 'badge-warn';
  return `<div class="card" style="margin-bottom:10px">
    <div class="card-title">${p.Nama} <span class="badge ${statusBadge}">${p.Status}</span></div>
    <div class="card-sub">${p.Keperluan}</div>
    <div class="card-sub">${p.TglMulai} ${p.JamMulai} → ${p.TglKembali} ${p.JamKembali}</div>
    ${p.NomorSurat ? `<div class="card-sub">No. Surat: ${p.NomorSurat}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      ${canApprove && p.Status === 'Diajukan' ? `<button class="btn btn-primary btn-sm izin-approve" data-id="${p.ID}">Setujui</button><button class="btn btn-ghost btn-sm izin-reject" data-id="${p.ID}">Tolak</button>` : ''}
      ${p.Status === 'Disetujui' || p.Status === 'Selesai' ? `<button class="btn btn-ghost btn-sm izin-print" data-id="${p.ID}">🖨 Cetak Surat</button>` : ''}
    </div>
  </div>`;
}

function wirePerizinanActions(canApprove) {
  document.querySelectorAll('.izin-approve').forEach(b => b.addEventListener('click', async () => {
    const r = await apiPost('approvePerizinan', { id: b.dataset.id, setuju: true }); afterApi(r); navigate('perizinan');
  }));
  document.querySelectorAll('.izin-reject').forEach(b => b.addEventListener('click', async () => {
    const catatan = prompt('Catatan penolakan (opsional):') || '';
    const r = await apiPost('approvePerizinan', { id: b.dataset.id, setuju: false, catatan }); afterApi(r); navigate('perizinan');
  }));
  document.querySelectorAll('.izin-print').forEach(b => b.addEventListener('click', async () => {
    const r = await apiGet('printPerizinan', { id: b.dataset.id });
    if (!afterApi(r, 'Menyiapkan cetak...')) return;
    printPerizinanDoc(r.data);
  }));
}

function openIzinForm(siswaList) {
  openModal(`<div class="modal-head"><h3 style="margin:0">Detail Perizinan (${siswaList.length} siswa)</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
    <div style="font-size:.82rem;color:var(--text-dim);margin-bottom:8px">${siswaList.map(s => s.nama).join(', ')}</div>
    <div class="field-row"><div><label>Tanggal Mulai</label><input type="date" id="iz-tgl-mulai"></div><div><label>Jam Mulai</label><input type="time" id="iz-jam-mulai"></div></div>
    <div class="field-row"><div><label>Tanggal Kembali</label><input type="date" id="iz-tgl-kembali"></div><div><label>Jam Kembali</label><input type="time" id="iz-jam-kembali"></div></div>
    <label>Keperluan Izin</label><textarea id="iz-keperluan" rows="3"></textarea>
    <button class="btn btn-primary btn-block" style="margin-top:14px" id="iz-submit">Ajukan ke Kepala UKS</button>`);
  document.getElementById('iz-submit').addEventListener('click', async () => {
    const payload = {
      siswaList: JSON.stringify(siswaList.map(s => ({ nisn: s.nisn, nama: s.nama }))),
      tglMulai: document.getElementById('iz-tgl-mulai').value, jamMulai: document.getElementById('iz-jam-mulai').value,
      tglKembali: document.getElementById('iz-tgl-kembali').value, jamKembali: document.getElementById('iz-jam-kembali').value,
      keperluan: document.getElementById('iz-keperluan').value
    };
    if (!payload.tglMulai || !payload.keperluan) return toast('Lengkapi data izin.', 'error');
    const r = await apiPost('createPerizinan', payload);
    if (afterApi(r)) { closeModal(); navigate('perizinan'); }
  });
}

function printPerizinanDoc(d) {
  document.getElementById('print-area').innerHTML = `
    <div class="kop-surat"><div class="kop-logo">SR</div><div><h2>SEKOLAH RAKYAT KOTA PASURUAN</h2><p>Sekolah Berasrama · "Cerdas Bersama, Tumbuh Setara"</p><p>Nomor: ${d.NomorSurat}</p></div></div>
    <h3 style="text-align:center;text-decoration:underline">SURAT IZIN SISWA</h3>
    <p>Yang bertanda tangan di bawah ini menerangkan bahwa siswa:</p>
    <table style="width:100%"><tr><td width="160">Nama</td><td>: ${d.Nama}</td></tr><tr><td>NISN</td><td>: ${d.NISN}</td></tr></table>
    <p>Diberikan izin meninggalkan sekolah/asrama dengan rincian sebagai berikut:</p>
    <table style="width:100%">
      <tr><td width="160">Keperluan</td><td>: ${d.Keperluan}</td></tr>
      <tr><td>Waktu Berangkat</td><td>: ${d.TglMulai} pukul ${d.JamMulai}</td></tr>
      <tr><td>Waktu Kembali</td><td>: ${d.TglKembali} pukul ${d.JamKembali}</td></tr>
    </table>
    <p>Demikian surat izin ini dibuat untuk dipergunakan sebagaimana mestinya.</p>
    <div class="ttd-row"><div class="ttd-block"><p>Diajukan oleh,</p><div style="height:80px"></div><p><b>${d.DiajukanOleh}</b></p></div>
      <div class="ttd-block"><p>Menyetujui, Kepala UKS</p><img src="${d.qrTandaTangan}"><p><b>${String(d.DisetujuiOleh).split(' - ')[0]}</b></p></div></div>`;
  window.print();
}

/* ================= VIEW: KONSELING ================= */
VIEWS.konseling = async (root) => {
  const res = await apiGet('getKonselingList');
  const list = res.ok ? res.data : [];
  root.innerHTML = `
    <div class="section-title"><h2>Form Konseling Siswa</h2><button class="btn btn-accent btn-sm" id="btn-new-konseling">+ Buat Laporan</button></div>
    <div>${list.length ? list.map(k => `
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">${k.Nama} <span class="badge ${k.StatusSelesai === 'Selesai' ? 'badge-ok' : 'badge-warn'}">${k.StatusSelesai}</span></div>
        <div class="card-sub">${k.Tanggal} · oleh ${k.AdminNama}</div>
        <p style="margin:8px 0 0"><b>Masalah:</b> ${k.RincianMasalah}</p>
        <p style="margin:4px 0 0"><b>Dampak:</b> ${k.Dampak}</p>
        <p style="margin:4px 0 0"><b>Solusi:</b> ${k.Solusi}</p>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          ${k.StatusSelesai !== 'Selesai' ? `<button class="btn btn-primary btn-sm kon-selesai" data-id="${k.ID}">Tandai Selesai</button>` : `<button class="btn btn-ghost btn-sm kon-print" data-id="${k.ID}">🖨 Cetak Laporan</button>`}
        </div>
      </div>`).join('') : emptyState('Belum ada laporan konseling.')}</div>`;

  document.getElementById('btn-new-konseling').addEventListener('click', () => pickSiswaModal(openKonselingForm));
  document.querySelectorAll('.kon-selesai').forEach(b => b.addEventListener('click', async () => {
    const r = await apiPost('selesaiKonseling', { id: b.dataset.id, selesai: true }); afterApi(r); navigate('konseling');
  }));
  document.querySelectorAll('.kon-print').forEach(b => b.addEventListener('click', async () => {
    const r = await apiGet('printKonseling', { id: b.dataset.id });
    if (!afterApi(r, 'Menyiapkan cetak...')) return;
    printKonselingDoc(r.data);
  }));
};

function openKonselingForm(siswaList) {
  openModal(`<div class="modal-head"><h3 style="margin:0">Form Konseling (${siswaList.length} siswa)</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
    <div style="font-size:.82rem;color:var(--text-dim);margin-bottom:8px">${siswaList.map(s => s.nama).join(', ')}</div>
    <label>Rincian Masalah</label><textarea id="ks-masalah" rows="3"></textarea>
    <label>Dampak yang Dirasakan</label><textarea id="ks-dampak" rows="2"></textarea>
    <label>Solusi</label><textarea id="ks-solusi" rows="2"></textarea>
    <button class="btn btn-primary btn-block" style="margin-top:14px" id="ks-submit">Simpan Laporan</button>`);
  document.getElementById('ks-submit').addEventListener('click', async () => {
    const payload = {
      siswaList: JSON.stringify(siswaList.map(s => ({ nisn: s.nisn, nama: s.nama }))),
      rincianMasalah: document.getElementById('ks-masalah').value,
      dampak: document.getElementById('ks-dampak').value,
      solusi: document.getElementById('ks-solusi').value
    };
    if (!payload.rincianMasalah) return toast('Rincian masalah wajib diisi.', 'error');
    const r = await apiPost('createKonseling', payload);
    if (afterApi(r)) { closeModal(); navigate('konseling'); }
  });
}

function printKonselingDoc(d) {
  document.getElementById('print-area').innerHTML = `
    <div class="kop-surat"><div class="kop-logo">SR</div><div><h2>SEKOLAH RAKYAT KOTA PASURUAN</h2><p>Sekolah Berasrama · "Cerdas Bersama, Tumbuh Setara"</p><p>Nomor: ${d.NomorSurat}</p></div></div>
    <h3 style="text-align:center;text-decoration:underline">LAPORAN KONSELING SISWA</h3>
    <table style="width:100%"><tr><td width="160">Nama Siswa</td><td>: ${d.Nama}</td></tr><tr><td>NISN</td><td>: ${d.NISN}</td></tr><tr><td>Tanggal</td><td>: ${d.Tanggal}</td></tr></table>
    <p><b>Rincian Masalah:</b><br>${d.RincianMasalah}</p>
    <p><b>Dampak yang Dirasakan:</b><br>${d.Dampak}</p>
    <p><b>Solusi:</b><br>${d.Solusi}</p>
    <div class="ttd-row"><div class="ttd-block"><p>Siswa,</p><img src="${d.qrSiswa}"><p><b>${d.Nama}</b></p></div>
      <div class="ttd-block"><p>Guru/Pegawai,</p><img src="${d.qrAdmin}"><p><b>${d.AdminNama}</b></p></div></div>`;
  window.print();
}

/* ================= HELPER: pilih barang (multi, per kategori) ================= */
async function pickBarangModal(title, onDone, { withJumlah = true, hidePegawaiOnly = false } = {}) {
  const res = await apiGet('getBarangList');
  let all = res.ok ? res.data : [];
  if (hidePegawaiOnly) all = all.filter(b => !b.hanyaPegawai);
  const selected = new Map();
  const byKategori = {};
  all.forEach(b => { (byKategori[b.kategori] = byKategori[b.kategori] || []).push(b); });

  openModal(`<div class="modal-head"><h3 style="margin:0">${title}</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
    <div class="searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="bg-search" placeholder="Cari barang..."></div>
    <div id="bg-list" style="max-height:320px;overflow-y:auto"></div>
    <button class="btn btn-primary btn-block" style="margin-top:12px" id="bg-confirm">Lanjutkan</button>`);

  function render(filter = '') {
    const f = filter.toLowerCase();
    let html = '';
    Object.keys(byKategori).forEach(kat => {
      const items = byKategori[kat].filter(b => !f || Object.values(b).join(' ').toLowerCase().includes(f));
      if (!items.length) return;
      html += `<div style="font-weight:700;margin:10px 0 4px;font-size:.85rem;color:var(--text-dim)">${kat}</div>`;
      html += items.map(b => `<div class="checklist-item ${selected.has(b.nama) ? 'checked' : ''}" data-nama="${b.nama}">
        <div style="flex:1"><b>${b.nama}</b><div class="card-sub">Stok: ${b.jumlah} ${b.hanyaPegawai ? '· <span class="badge badge-warn">Khusus Pegawai</span>' : ''}</div></div>
        ${withJumlah && selected.has(b.nama) ? `<input type="number" min="1" max="${b.jumlah}" value="${selected.get(b.nama).jumlah}" style="width:70px" class="bg-qty" data-nama="${b.nama}">` : (selected.has(b.nama) ? '✓' : '')}
      </div>`).join('');
    });
    document.getElementById('bg-list').innerHTML = html || emptyState('Barang tidak ditemukan.');
    document.querySelectorAll('.checklist-item').forEach(el => el.addEventListener('click', (e) => {
      if (e.target.classList.contains('bg-qty')) return;
      const nama = el.dataset.nama; const b = all.find(x => x.nama === nama);
      if (selected.has(nama)) selected.delete(nama); else selected.set(nama, { ...b, jumlah: 1 });
      render(document.getElementById('bg-search').value);
    }));
    document.querySelectorAll('.bg-qty').forEach(el => el.addEventListener('input', (e) => {
      const nama = e.target.dataset.nama; const cur = selected.get(nama);
      if (cur) cur.jumlah = Math.max(1, Math.min(Number(e.target.value) || 1, cur.jumlah_max || 9999));
    }));
  }
  render();
  document.getElementById('bg-search').addEventListener('input', (e) => render(e.target.value));
  document.getElementById('bg-confirm').addEventListener('click', () => {
    if (!selected.size) return toast('Pilih minimal 1 barang.', 'error');
    closeModal();
    onDone(Array.from(selected.values()));
  });
}

/* ================= VIEW: PEMINJAMAN ================= */
VIEWS.peminjaman = async (root) => {
  const res = await apiGet('getPeminjamanList');
  const list = res.ok ? res.data : [];
  const canApprove = state.user.role === 'KepalaSekolah' || (state.user.role === 'PegawaiBerwenang' && state.user.wewenang === 'Sarpras');
  root.innerHTML = `
    <div class="section-title"><h2>Form Peminjaman Barang</h2><button class="btn btn-accent btn-sm" id="btn-new-pinjam">+ Ajukan Pinjam</button></div>
    <div>${list.length ? list.map(p => renderPeminjamanCard(p, canApprove)).join('') : emptyState('Belum ada peminjaman barang.')}</div>`;

  document.getElementById('btn-new-pinjam').addEventListener('click', () => {
    pickBarangModal('Pilih Barang Dipinjam', (items) => openPeminjamanForm(items));
  });
  wirePeminjamanActions(canApprove);
};

function renderPeminjamanCard(p, canApprove) {
  const statusBadge = p.Status === 'Selesai' ? 'badge-ok' : p.Status === 'Ditolak' ? 'badge-danger' : 'badge-warn';
  return `<div class="card" style="margin-bottom:10px">
    <div class="card-title">${p.NamaPeminjam} <span class="badge ${statusBadge}">${p.Status}</span></div>
    <div class="card-sub">${p.TujuanPenggunaan} · kembali rencana ${p.TglRencanaKembali}</div>
    <div style="margin-top:6px">${(p.items||[]).map(it => `<div class="card-sub">• ${it.NamaBarang} (${it.JumlahKembali}/${it.JumlahPinjam} kembali)</div>`).join('')}</div>
    ${p.NomorSurat ? `<div class="card-sub">No. Surat: ${p.NomorSurat}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      ${canApprove && p.Status === 'Diajukan' ? `<button class="btn btn-primary btn-sm pjm-approve" data-id="${p.ID}">Setujui</button><button class="btn btn-ghost btn-sm pjm-reject" data-id="${p.ID}">Tolak</button>` : ''}
      ${(p.Status === 'Disetujui' || p.Status === 'Sebagian Kembali') ? `<button class="btn btn-primary btn-sm pjm-kembalikan" data-id="${p.ID}">Kembalikan Barang</button>` : ''}
      ${p.Status === 'Selesai' || (canApprove && p.Status === 'Sebagian Kembali') ? `<button class="btn btn-ghost btn-sm pjm-print" data-id="${p.ID}">🖨 Cetak</button>` : ''}
    </div>
  </div>`;
}

function wirePeminjamanActions(canApprove) {
  document.querySelectorAll('.pjm-approve').forEach(b => b.addEventListener('click', async () => {
    const r = await apiPost('approvePeminjaman', { id: b.dataset.id, setuju: true }); afterApi(r); navigate('peminjaman');
  }));
  document.querySelectorAll('.pjm-reject').forEach(b => b.addEventListener('click', async () => {
    const r = await apiPost('approvePeminjaman', { id: b.dataset.id, setuju: false }); afterApi(r); navigate('peminjaman');
  }));
  document.querySelectorAll('.pjm-print').forEach(b => b.addEventListener('click', async () => {
    const r = await apiGet('printPeminjaman', { id: b.dataset.id });
    if (!afterApi(r, 'Menyiapkan cetak...')) return;
    printPeminjamanDoc(r.data);
  }));
  document.querySelectorAll('.pjm-kembalikan').forEach(b => b.addEventListener('click', async () => {
    const list = await apiGet('getPeminjamanList');
    const p = (list.data || []).find(x => x.ID === b.dataset.id);
    openKembalikanForm(p);
  }));
}

function openPeminjamanForm(items) {
  openModal(`<div class="modal-head"><h3 style="margin:0">Ajukan Peminjaman</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
    <div style="font-size:.82rem;color:var(--text-dim);margin-bottom:8px">${items.map(i => i.nama + ' x' + i.jumlah).join(', ')}</div>
    <label>Tanggal &amp; Waktu Rencana Kembali</label><input type="datetime-local" id="pj-tgl-kembali">
    <label>Tujuan Penggunaan</label><textarea id="pj-tujuan" rows="3"></textarea>
    <button class="btn btn-primary btn-block" style="margin-top:14px" id="pj-submit">Ajukan ke Sarpras</button>`);
  document.getElementById('pj-submit').addEventListener('click', async () => {
    const payload = {
      items: JSON.stringify(items.map(i => ({ nama: i.nama, jumlah: i.jumlah, hanyaPegawai: i.hanyaPegawai }))),
      tglRencanaKembali: document.getElementById('pj-tgl-kembali').value,
      tujuan: document.getElementById('pj-tujuan').value
    };
    if (!payload.tglRencanaKembali || !payload.tujuan) return toast('Lengkapi data peminjaman.', 'error');
    const r = await apiPost('createPeminjaman', payload);
    if (afterApi(r)) { closeModal(); navigate('peminjaman'); }
  });
}

function openKembalikanForm(p) {
  openModal(`<div class="modal-head"><h3 style="margin:0">Kembalikan Barang</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
    <div id="kb-list">${(p.items||[]).map(it => {
      const sisa = Number(it.JumlahPinjam) - Number(it.JumlahKembali);
      return `<div class="field-row" style="align-items:center"><div style="flex:2">${it.NamaBarang}<div class="card-sub">Sisa belum kembali: ${sisa}</div></div><input type="number" min="0" max="${sisa}" value="${sisa}" class="kb-qty" data-nama="${it.NamaBarang}" style="flex:1"></div>`;
    }).join('')}</div>
    <label>Keterangan Keterlambatan (isi jika melewati rencana kembali)</label><textarea id="kb-ket" rows="2"></textarea>
    <button class="btn btn-primary btn-block" style="margin-top:14px" id="kb-submit">Konfirmasi Pengembalian</button>`);
  document.getElementById('kb-submit').addEventListener('click', async () => {
    const returns = Array.from(document.querySelectorAll('.kb-qty')).map(el => ({ namaBarang: el.dataset.nama, jumlahKembali: Number(el.value) || 0 })).filter(r => r.jumlahKembali > 0);
    if (!returns.length) return toast('Isi jumlah barang yang dikembalikan.', 'error');
    const r = await apiPost('kembalikanBarang', { id: p.ID, returns: JSON.stringify(returns), keteranganTerlambat: document.getElementById('kb-ket').value });
    if (afterApi(r)) { closeModal(); navigate('peminjaman'); }
  });
}

function printPeminjamanDoc(d) {
  document.getElementById('print-area').innerHTML = `
    <div class="kop-surat"><div class="kop-logo">SR</div><div><h2>SEKOLAH RAKYAT KOTA PASURUAN</h2><p>Sekolah Berasrama · "Cerdas Bersama, Tumbuh Setara"</p><p>Nomor: ${d.NomorSurat}</p></div></div>
    <h3 style="text-align:center;text-decoration:underline">SURAT PEMINJAMAN BARANG</h3>
    <table style="width:100%"><tr><td width="160">Peminjam</td><td>: ${d.NamaPeminjam}</td></tr><tr><td>Tujuan</td><td>: ${d.TujuanPenggunaan}</td></tr><tr><td>Rencana Kembali</td><td>: ${d.TglRencanaKembali}</td></tr>${d.KeteranganTerlambat ? `<tr><td>Keterangan Terlambat</td><td>: ${d.KeteranganTerlambat}</td></tr>` : ''}</table>
    <table style="width:100%;margin-top:10px;border-collapse:collapse" border="1" cellpadding="6"><tr><th>Barang</th><th>Jml Pinjam</th><th>Jml Kembali</th></tr>
      ${(d.items||[]).map(it => `<tr><td>${it.NamaBarang}</td><td>${it.JumlahPinjam}</td><td>${it.JumlahKembali}</td></tr>`).join('')}</table>
    <div class="ttd-row"><div class="ttd-block"><p>Peminjam,</p><img src="${d.qrPeminjam}"><p><b>${d.NamaPeminjam}</b></p></div>
      <div class="ttd-block"><p>Sarpras,</p><img src="${d.qrSarpras}"><p><b>${String(d.DisetujuiOleh).split(' - ')[0]}</b></p></div></div>`;
  window.print();
}

/* ================= VIEW: PENGAMBILAN ================= */
VIEWS.pengambilan = async (root) => {
  const res = await apiGet('getPengambilanList');
  const list = res.ok ? res.data : [];
  root.innerHTML = `
    <div class="section-title"><h2>Form Pengambilan Barang</h2><button class="btn btn-accent btn-sm" id="btn-new-ambil">+ Ambil Barang</button></div>
    <div>${list.length ? list.map(a => `<div class="card" style="margin-bottom:10px"><div class="card-title">${a.NamaAdmin}</div><div class="card-sub">${a.Tanggal}</div><div style="margin-top:6px">${JSON.parse(a.DaftarBarang||'[]').map(i => `<div class="card-sub">• ${i.nama} x${i.jumlah}</div>`).join('')}</div></div>`).join('') : emptyState('Belum ada pengambilan barang.')}</div>`;

  document.getElementById('btn-new-ambil').addEventListener('click', () => {
    pickBarangModal('Pilih Barang Diambil', async (items) => {
      const r = await apiPost('createPengambilan', { items: JSON.stringify(items.map(i => ({ nama: i.nama, jumlah: i.jumlah }))) });
      if (afterApi(r)) navigate('pengambilan');
    });
  });
};

/* ================= VIEW: DISTRIBUSI ================= */
VIEWS.distribusi = async (root) => {
  const res = await apiGet('getDistribusiList');
  const list = res.ok ? res.data : [];
  root.innerHTML = `
    <div class="section-title"><h2>Form Distribusi Barang</h2><button class="btn btn-accent btn-sm" id="btn-new-distribusi">+ Bagikan Barang</button></div>
    <div>${list.length ? list.map(d => `<div class="card" style="margin-bottom:10px"><div class="card-title">${d.NamaAdmin}</div><div class="card-sub">${d.Tanggal} · ${JSON.parse(d.DaftarSiswa||'[]').length} siswa</div></div>`).join('') : emptyState('Belum ada distribusi barang.')}</div>`;

  document.getElementById('btn-new-distribusi').addEventListener('click', () => {
    pickSiswaModal((siswaList) => {
      pickBarangModal('Pilih Barang Dibagikan', async (items) => {
        const payload = {
          siswaList: JSON.stringify(siswaList.map(s => ({ nisn: s.nisn, nama: s.nama }))),
          items: JSON.stringify(items.map(i => ({ nama: i.nama, jumlahPerAnak: i.jumlah })))
        };
        const r = await apiPost('createDistribusi', payload);
        if (afterApi(r, 'Barang berhasil dibagikan.')) navigate('distribusi');
      }, { withJumlah: true });
    });
  });
};

/* ================= VIEW: DATA SISWA ================= */
VIEWS.siswa = async (root) => {
  const res = await apiGet('getSiswaList');
  const all = res.ok ? res.data : [];
  root.innerHTML = `
    <div class="section-title"><h2>Data Siswa</h2><button class="btn btn-ghost btn-sm" id="btn-print-siswa">🖨 Cetak Daftar</button></div>
    <div class="searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="siswa-search" placeholder="Cari nama, NISN, kelas, alamat..."></div>
    <select id="siswa-filter-jenjang" style="margin-bottom:10px"><option value="">Semua Jenjang</option><option>SD</option><option>SMP</option><option>SMA</option></select>
    <div id="siswa-list"></div>`;

  function render() {
    const f = document.getElementById('siswa-search').value.toLowerCase();
    const jf = document.getElementById('siswa-filter-jenjang').value;
    const filtered = all.filter(s => (!jf || s.jenjang === jf) && (!f || Object.values(s).join(' ').toLowerCase().includes(f)));
    document.getElementById('siswa-list').innerHTML = filtered.length ? filtered.map(s => `
      <div class="list-item">
        <img class="avatar" src="${s.foto || 'https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(s.nisn)}">
        <div style="flex:1"><b>${s.nama}</b><div class="card-sub">${s.jenjang} · ${s.kelas} · NISN ${s.nisn}</div><div class="card-sub">${s.alamat || ''}</div></div>
        <button class="btn btn-ghost btn-sm siswa-qr" data-nisn="${s.nisn}" data-nama="${s.nama}">QR</button>
      </div>`).join('') : emptyState('Siswa tidak ditemukan.');
    document.querySelectorAll('.siswa-qr').forEach(b => b.addEventListener('click', () => {
      openModal(`<div class="modal-head"><h3 style="margin:0">${b.dataset.nama}</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
        <div style="text-align:center"><img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(b.dataset.nisn + ' - ' + b.dataset.nama)}"></div>`);
    }));
  }
  document.getElementById('siswa-search').addEventListener('input', render);
  document.getElementById('siswa-filter-jenjang').addEventListener('change', render);
  document.getElementById('btn-print-siswa').addEventListener('click', () => {
    const jf = document.getElementById('siswa-filter-jenjang').value;
    const filtered = all.filter(s => !jf || s.jenjang === jf);
    document.getElementById('print-area').innerHTML = `<h3>Daftar Siswa ${jf || 'Semua Jenjang'}</h3>
      <table width="100%" border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>NISN</th><th>Nama</th><th>Jenjang</th><th>Kelas</th><th>Alamat</th></tr>
      ${filtered.map(s => `<tr><td>${s.nisn}</td><td>${s.nama}</td><td>${s.jenjang}</td><td>${s.kelas}</td><td>${s.alamat||''}</td></tr>`).join('')}</table>`;
    window.print();
  });
  render();
};

/* ================= VIEW: DATA PETUGAS ================= */
VIEWS.petugas = async (root) => {
  const res = await apiGet('getPetugasList');
  const all = res.ok ? res.data : [];
  root.innerHTML = `
    <div class="section-title"><h2>Data Petugas</h2></div>
    <div class="searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="petugas-search" placeholder="Cari nama, NIP, jabatan..."></div>
    <div id="petugas-list"></div>`;
  function render() {
    const f = document.getElementById('petugas-search').value.toLowerCase();
    const filtered = all.filter(p => !f || Object.values(p).join(' ').toLowerCase().includes(f));
    document.getElementById('petugas-list').innerHTML = filtered.length ? filtered.map(p => `
      <div class="list-item"><img class="avatar" src="${p.foto || 'https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(p.nip)}">
        <div><b>${p.nama}</b><div class="card-sub">${p.jabatan} · NIP ${p.nip}</div><div class="card-sub">${p.noHp || ''}</div></div></div>`).join('') : emptyState('Petugas tidak ditemukan.');
  }
  document.getElementById('petugas-search').addEventListener('input', render);
  render();
};

/* ================= VIEW: DATA BARANG ================= */
VIEWS.barang = async (root) => {
  const res = await apiGet('getBarangList');
  const all = res.ok ? res.data : [];
  root.innerHTML = `
    <div class="section-title"><h2>Data Barang</h2></div>
    <div class="searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="barang-search" placeholder="Cari kategori, jenis, nama barang..."></div>
    <div id="barang-list"></div>`;
  function render() {
    const f = document.getElementById('barang-search').value.toLowerCase();
    const filtered = all.filter(b => !f || Object.values(b).join(' ').toLowerCase().includes(f));
    document.getElementById('barang-list').innerHTML = filtered.length ? filtered.map(b => `
      <div class="list-item"><div style="flex:1"><b>${b.nama}</b><div class="card-sub">${b.kategori} · ${b.jenis}</div></div>
        <span class="badge ${b.jumlah > 0 ? 'badge-ok' : 'badge-danger'}">${b.jumlah} unit</span>
        ${b.hanyaPegawai ? '<span class="badge badge-warn">Pegawai</span>' : ''}</div>`).join('') : emptyState('Barang tidak ditemukan.');
  }
  document.getElementById('barang-search').addEventListener('input', render);
  render();
};

/* ================= VIEW: PROFIL ================= */
VIEWS.profil = async (root) => {
  const u = state.user;
  const idLabel = u.tipe === 'admin' ? 'NIP' : (u.tipe === 'siswa' ? 'NISN' : 'No. HP');
  const qrText = `${u.id} - ${u.nama}`;
  root.innerHTML = `
    <div class="section-title"><h2>Profil</h2></div>
    <div class="card" style="text-align:center">
      <img class="avatar" style="width:80px;height:80px;border-radius:20px;margin-bottom:10px" src="${u.foto || 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=' + encodeURIComponent(u.id)}">
      <div class="card-title">${u.nama}</div>
      <div class="card-sub">${idLabel}: ${u.id} ${u.jabatan ? '· ' + u.jabatan : ''}</div>
      <div class="card-sub">${ROLE_LABEL[u.role] || u.role} ${u.wewenang ? '· ' + u.wewenang : ''}</div>
      <div style="margin-top:14px"><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrText)}"></div>
      <button class="btn btn-ghost btn-sm" style="margin-top:12px" id="btn-print-kartu">🖨 Cetak Kartu Login</button>
    </div>
    ${u.tipe === 'admin' ? `
    <div class="section-title"><h2>Ganti Password</h2></div>
    <div class="card">
      <label>Password Lama</label><input type="password" id="pw-lama">
      <label>Password Baru</label><input type="password" id="pw-baru">
      <button class="btn btn-primary btn-block" style="margin-top:14px" id="btn-ganti-pw">Simpan Password Baru</button>
    </div>` : ''}`;

  document.getElementById('btn-print-kartu').addEventListener('click', () => {
    document.getElementById('print-area').innerHTML = `
      <div style="width:340px;border:2px solid #0F5257;border-radius:12px;padding:16px;text-align:center;margin:0 auto">
        <div style="font-weight:800">SEKOLAH RAKYAT KOTA PASURUAN</div>
        <div style="font-size:12px;margin-bottom:10px">Cerdas Bersama, Tumbuh Setara</div>
        <img style="width:70px;height:70px;border-radius:14px" src="${u.foto || ''}">
        <div style="font-weight:700;margin-top:8px">${u.nama}</div>
        <div style="font-size:12px">${idLabel}: ${u.id}</div>
        <div style="font-size:12px">${u.jabatan || ROLE_LABEL[u.role]}</div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrText)}" style="margin-top:8px">
      </div>`;
    window.print();
  });

  const btnPw = document.getElementById('btn-ganti-pw');
  if (btnPw) btnPw.addEventListener('click', async () => {
    const lama = document.getElementById('pw-lama').value, baru = document.getElementById('pw-baru').value;
    if (!lama || !baru) return toast('Lengkapi password lama dan baru.', 'error');
    const r = await apiPost('gantiPassword', { passwordLama: lama, passwordBaru: baru });
    afterApi(r);
  });
};

/* ================= VIEW: REKAP SAYA ================= */
VIEWS.rekap = async (root) => {
  const res = await apiGet('getRekapSaya');
  if (!res.ok) return root.innerHTML = emptyState(res.message);
  const d = res.data;
  const block = (title, arr, renderRow) => `<div class="section-title"><h2>${title}</h2></div><div>${arr.length ? arr.map(renderRow).join('') : emptyState('Belum ada data.')}</div>`;
  root.innerHTML = `
    <div class="section-title"><h2>Rekap Saya</h2></div>
    ${block('Peminjaman Barang', d.peminjaman, p => `<div class="list-item"><div><b>${p.TujuanPenggunaan}</b><div class="card-sub">${p.Status} · ${p.TglPengajuan}</div></div></div>`)}
    ${block('Pengambilan Barang', d.pengambilan, p => `<div class="list-item"><div><b>${p.Tanggal}</b><div class="card-sub">${JSON.parse(p.DaftarBarang||'[]').map(i=>i.nama).join(', ')}</div></div></div>`)}
    ${block('Distribusi Barang', d.distribusi, p => `<div class="list-item"><div><b>${p.Tanggal}</b><div class="card-sub">${JSON.parse(p.DaftarSiswa||'[]').length} siswa</div></div></div>`)}
    ${block('Perizinan Diajukan', d.perizinanDiajukan, p => `<div class="list-item"><div><b>${p.Nama}</b><div class="card-sub">${p.Status} · ${p.Keperluan}</div></div></div>`)}
    ${block('Konseling Ditangani', d.konseling, p => `<div class="list-item"><div><b>${p.Nama}</b><div class="card-sub">${p.StatusSelesai}</div></div></div>`)}
  `;
};

/* ================= VIEW: PERSETUJUAN ================= */
VIEWS.persetujuan = async (root) => {
  const res = await apiGet('getPersetujuanList');
  if (!res.ok) return root.innerHTML = emptyState(res.message);
  const d = res.data;
  root.innerHTML = `
    <div class="section-title"><h2>Persetujuan</h2></div>
    <div class="section-title"><h2 style="font-size:.92rem">Pengumuman Menunggu Terbit</h2></div>
    <div>${d.pengumuman.length ? d.pengumuman.map(p => `<div class="card" style="margin-bottom:8px"><div class="card-title">${p.Judul}</div><div class="card-sub">${p.DiajukanOleh}</div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-primary btn-sm ap-peng" data-id="${p.ID}">Terbitkan</button><button class="btn btn-ghost btn-sm rj-peng" data-id="${p.ID}">Tolak</button></div></div>`).join('') : emptyState('Tidak ada pengumuman menunggu.')}</div>

    <div class="section-title"><h2 style="font-size:.92rem">Perizinan Menunggu Persetujuan</h2></div>
    <div>${d.perizinan.length ? d.perizinan.map(p => `<div class="card" style="margin-bottom:8px"><div class="card-title">${p.Nama}</div><div class="card-sub">${p.Keperluan}</div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-primary btn-sm ap-izin" data-id="${p.ID}">Setujui</button><button class="btn btn-ghost btn-sm rj-izin" data-id="${p.ID}">Tolak</button></div></div>`).join('') : emptyState('Tidak ada perizinan menunggu.')}</div>

    <div class="section-title"><h2 style="font-size:.92rem">Peminjaman Menunggu Persetujuan</h2></div>
    <div>${d.peminjaman.length ? d.peminjaman.map(p => `<div class="card" style="margin-bottom:8px"><div class="card-title">${p.NamaPeminjam}</div><div class="card-sub">${p.TujuanPenggunaan}</div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-primary btn-sm ap-pjm" data-id="${p.ID}">Setujui</button><button class="btn btn-ghost btn-sm rj-pjm" data-id="${p.ID}">Tolak</button></div></div>`).join('') : emptyState('Tidak ada peminjaman menunggu.')}</div>
  `;
  document.querySelectorAll('.ap-peng').forEach(b => b.addEventListener('click', async () => { afterApi(await apiPost('approvePengumuman', { id: b.dataset.id, setuju: true })); navigate('persetujuan'); }));
  document.querySelectorAll('.rj-peng').forEach(b => b.addEventListener('click', async () => { afterApi(await apiPost('approvePengumuman', { id: b.dataset.id, setuju: false })); navigate('persetujuan'); }));
  document.querySelectorAll('.ap-izin').forEach(b => b.addEventListener('click', async () => { afterApi(await apiPost('approvePerizinan', { id: b.dataset.id, setuju: true })); navigate('persetujuan'); }));
  document.querySelectorAll('.rj-izin').forEach(b => b.addEventListener('click', async () => { afterApi(await apiPost('approvePerizinan', { id: b.dataset.id, setuju: false })); navigate('persetujuan'); }));
  document.querySelectorAll('.ap-pjm').forEach(b => b.addEventListener('click', async () => { afterApi(await apiPost('approvePeminjaman', { id: b.dataset.id, setuju: true })); navigate('persetujuan'); }));
  document.querySelectorAll('.rj-pjm').forEach(b => b.addEventListener('click', async () => { afterApi(await apiPost('approvePeminjaman', { id: b.dataset.id, setuju: false })); navigate('persetujuan'); }));
};

/* ================= VIEW: PESAN ================= */
VIEWS.pesan = async (root) => {
  const res = await apiGet('getPesanList');
  const list = res.ok ? res.data : [];
  const isAdmin = ['KepalaSekolah', 'Guru', 'Pegawai', 'PegawaiBerwenang'].includes(state.user.role);
  const isOrtu = state.user.role === 'OrangTua';

  root.innerHTML = `
    <div class="section-title"><h2>Pesan</h2>${isAdmin ? '<button class="btn btn-accent btn-sm" id="btn-new-pesan">+ Kirim ke Orang Tua</button>' : ''}</div>
    <div id="pesan-list">${list.length ? list.map(m => `
      <div class="card" style="margin-bottom:10px">
        <div class="card-title">${m.NamaSiswa} <span class="badge ${m.Dari === 'Siswa' ? 'badge-warn' : 'badge-ok'}">${m.Dari === 'Siswa' ? 'Dari Siswa' : 'Dari Orang Tua'}</span></div>
        <div class="card-sub">${m.Timestamp}</div>
        ${m.Isi ? `<p style="margin:8px 0 0">${m.Isi}</p>` : ''}
        ${m.FotoURL ? `<img src="${m.FotoURL}" style="max-width:100%;border-radius:10px;margin-top:8px">` : ''}
        ${isOrtu && m.Dari === 'Siswa' ? `<button class="btn btn-ghost btn-sm balas-btn" data-nisn="${m.NISN}" style="margin-top:8px">Balas</button>` : ''}
      </div>`).join('') : emptyState('Belum ada pesan.')}</div>`;

  if (isAdmin) document.getElementById('btn-new-pesan').addEventListener('click', () => {
    pickSiswaModal((siswaList) => {
      const s = siswaList[0];
      openModal(`<div class="modal-head"><h3 style="margin:0">Kirim Pesan — ${s.nama}</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
        <label>Tautan Foto/Scan Surat Siswa (unggah ke Drive lalu tempel tautan, atau isi teks di bawah)</label>
        <input id="ps-foto" placeholder="https://...">
        <label>Catatan (opsional)</label><textarea id="ps-isi" rows="2"></textarea>
        <button class="btn btn-primary btn-block" style="margin-top:14px" id="ps-submit">Kirim ke Orang Tua</button>`);
      document.getElementById('ps-submit').addEventListener('click', async () => {
        const r = await apiPost('kirimPesanKeOrtu', { nisn: s.nisn, fotoUrl: document.getElementById('ps-foto').value.trim(), isi: document.getElementById('ps-isi').value.trim() });
        if (afterApi(r)) { closeModal(); navigate('pesan'); }
      });
    });
  });

  document.querySelectorAll('.balas-btn').forEach(b => b.addEventListener('click', () => {
    openModal(`<div class="modal-head"><h3 style="margin:0">Balas Pesan</h3><button class="btn btn-ghost btn-sm" onclick="closeModal()">Tutup</button></div>
      <textarea id="balas-isi" rows="3" placeholder="Tulis balasan Anda..."></textarea>
      <button class="btn btn-primary btn-block" style="margin-top:14px" id="balas-submit">Kirim Balasan</button>`);
    document.getElementById('balas-submit').addEventListener('click', async () => {
      const isi = document.getElementById('balas-isi').value.trim();
      if (!isi) return toast('Tulis balasan terlebih dahulu.', 'error');
      const r = await apiPost('balasPesanOrtu', { nisn: b.dataset.nisn, isi });
      if (afterApi(r)) { closeModal(); navigate('pesan'); }
    });
  }));
};
