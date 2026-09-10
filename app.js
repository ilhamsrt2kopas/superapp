/* ==========================================================================
   Portal SRT 2 Kota Pasuruan — app.js
   SPA vanilla JS. Backend: Google Apps Script Web App (lihat apps-script/).
   ========================================================================== */

/* ================= Tema (mode terang/gelap) ================= */
const THEME_KEY = 'srt2_theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }
applyTheme(getTheme());

const CONFIG = {
  // GANTI dengan URL deployment Web App Apps Script kamu (Deploy > New deployment > Web app)
  API_URL: 'https://script.google.com/macros/s/AKfycbwO13pWgxuG9leCONp1ntnx3qzN55YEQsh2LUXKEHrTC8pT8CXRC52k3NDALeMiguRq/exec',
  SCHOOL_NAME: 'SRT 2 Kota Pasuruan',
  TAGLINE: 'Cerdas Bersama, Tumbuh Setara',
  LOGO_URL: './icons/icon-192.png'
};

const S = {
  get session() { try { return JSON.parse(localStorage.getItem('srt2_session') || 'null'); } catch (e) { return null; } },
  set session(v) { localStorage.setItem('srt2_session', JSON.stringify(v)); },
  clear() { localStorage.removeItem('srt2_session'); }
};

/* ---------------- API helper ----------------
   Dikirim sebagai text/plain agar browser TIDAK melakukan CORS preflight
   (Apps Script Web App tidak bisa menjawab OPTIONS request). */
async function api(action, payload) {
  const body = { action, token: S.session ? S.session.token : null, payload: payload || {} };
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok && data.code === 'AUTH') { S.clear(); location.hash = '#/login'; }
    return data;
  } catch (err) {
    toast('Gagal terhubung ke server. Cek koneksi internet.');
    return { ok: false, message: 'network_error' };
  }
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Grafik batang horizontal sederhana (tanpa library) untuk menampilkan perbandingan stok barang.
function barChartHtml(items) {
  if (!items || items.length === 0) return '';
  const top = items.slice().sort((a, b) => Number(b.Stok) - Number(a.Stok)).slice(0, 6);
  const max = Math.max(1, ...top.map((x) => Number(x.Stok) || 0));
  return `<div class="bar-chart">${top.map((x) => `
    <div class="bar-chart-row">
      <span class="bar-chart-label">${x.NamaBarang}</span>
      <div class="bar-chart-track"><div class="bar-chart-fill" style="width:${Math.max(4, (Number(x.Stok) / max) * 100)}%;"></div></div>
      <span class="bar-chart-value">${x.Stok}</span>
    </div>`).join('')}</div>`;
}

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

/* ---------------- QR scanner helper (dipakai login, absensi, modal pilih siswa) ----------------
   Robust terhadap: kamera belum diizinkan, tidak ada kamera belakang, atau scanner sebelumnya
   masih aktif (harus di-stop dulu sebelum start baru, kalau tidak kamera bisa gagal muncul). */
let activeScanner = null;

async function stopActiveScanner() {
  if (!activeScanner) return;
  const s = activeScanner;
  activeScanner = null;
  try { await s.stop(); } catch (e) { /* sudah berhenti / belum sempat start */ }
  try { s.clear(); } catch (e) {}
}

async function startQrScanner(elementId, onDecode) {
  await stopActiveScanner();
  const holder = document.getElementById(elementId);
  if (!holder) return;
  holder.innerHTML = '<p style="color:#94a3b8;font-size:13px;padding:12px;">Membuka kamera...</p>';

  if (!window.isSecureContext) {
    holder.innerHTML = '<p style="color:#ef4444;font-size:13px;padding:12px;">Kamera hanya bisa diakses lewat HTTPS. Buka portal ini lewat alamat GitHub Pages (https://...), bukan file lokal.</p>';
    return;
  }
  if (!navigator.mediaDevices || typeof Html5Qrcode === 'undefined') {
    holder.innerHTML = '<p style="color:#ef4444;font-size:13px;padding:12px;">Browser ini tidak mendukung akses kamera.</p>';
    return;
  }

  const scanner = new Html5Qrcode(elementId);
  activeScanner = scanner;
  const config = { fps: 10, qrbox: 230 };

  async function tryStart(cameraIdOrConfig) {
    await scanner.start(cameraIdOrConfig, config, (text) => onDecode(text), () => {});
  }

  try {
    const cameras = await Html5Qrcode.getCameras();
    if (!cameras || cameras.length === 0) throw new Error('no-camera');
    const back = cameras.find((c) => /back|rear|environment/i.test(c.label || '')) || cameras[cameras.length - 1];
    await tryStart(back.id);
  } catch (err1) {
    try {
      await tryStart({ facingMode: 'environment' });
    } catch (err2) {
      holder.innerHTML = '';
      let pesan = 'Tidak bisa mengakses kamera. Izinkan akses kamera untuk situs ini di pengaturan browser, lalu muat ulang halaman.';
      const name = (err2 && err2.name) || (err1 && err1.name) || '';
      if (name === 'NotAllowedError') pesan = 'Akses kamera ditolak. Buka pengaturan browser → Izin situs → aktifkan Kamera untuk portal ini.';
      if (name === 'NotFoundError' || String(err1).includes('no-camera')) pesan = 'Tidak ditemukan kamera pada perangkat ini.';
      if (name === 'NotReadableError') pesan = 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain yang memakai kamera lalu coba lagi.';
      toast(pesan);
      holder.innerHTML = `<div style="padding:14px;text-align:center;"><p style="color:#ef4444;font-size:13px;">${pesan}</p><button class="btn small" id="retry-${elementId}">Coba Lagi</button></div>`;
      const retryBtn = document.getElementById('retry-' + elementId);
      if (retryBtn) retryBtn.onclick = () => startQrScanner(elementId, onDecode);
    }
  }
}

/* ---------------- Menu per role ---------------- */
function getMenu() {
  const s = S.session;
  if (!s) return [];
  if (s.role === 'orangtua') {
    return [
      { id: 'pengumuman', label: 'Pengumuman', icon: '📢' },
      { id: 'pesan', label: 'Pesan', icon: '✉️' },
      { id: 'profil', label: 'Profil', icon: '👤' }
    ];
  }
  if (s.role === 'siswa') {
    // Spesifikasi: siswa tidak bawa gadget, tapi form peminjaman menyebut admin/siswa —
    // menu siswa dibuat minimal untuk kasus akses dari komputer bersama/perpustakaan.
    return [
      { id: 'peminjaman', label: 'Peminjaman Barang', icon: '📦' },
      { id: 'rekap', label: 'Rekap Saya', icon: '🧾' }
    ];
  }
  // admin (semua sub-role: Kepala Sekolah, Guru, Pegawai, Pegawai Berwenang)
  const menu = [
    { id: 'dashboard', label: 'Dasbor', icon: '🏠' },
    { id: 'absensi', label: 'Absensi Siswa', icon: '✅' },
    { id: 'pengumuman', label: 'Buat Pengumuman', icon: '📢' },
    { id: 'perizinan', label: 'Form Perizinan Siswa', icon: '📝' },
    { id: 'konseling', label: 'Form Konseling Siswa', icon: '💬' },
    { id: 'peminjaman', label: 'Form Peminjaman Barang', icon: '📦' },
    { id: 'pengambilan', label: 'Form Pengambilan Barang', icon: '🧰' },
    { id: 'distribusi', label: 'Form Distribusi', icon: '🎁' },
    { id: 'data-siswa', label: 'Data Siswa', icon: '🎓' },
    { id: 'data-petugas', label: 'Data Petugas', icon: '🧑‍💼' },
    { id: 'data-barang', label: 'Data Barang', icon: '📋' },
    { id: 'profil', label: 'Profil', icon: '👤' },
    { id: 'rekap', label: 'Rekap Saya', icon: '🧾' },
    { id: 'pesan', label: 'Pesan', icon: '✉️' }
  ];
  if (s.roleDetail === 'Pegawai Berwenang' || s.roleDetail === 'Kepala Sekolah') {
    menu.splice(1, 0, { id: 'persetujuan', label: 'Persetujuan', icon: '✔️' });
  }
  return menu;
}

/* ---------------- Router ---------------- */
window.addEventListener('hashchange', () => { stopActiveScanner(); render(); });
window.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = S.session ? '#/dashboard' : '#/welcome';
  render();
});

function render() {
  const app = qs('#app');
  const route = (location.hash || '#/welcome').replace('#/', '');
  const s = S.session;

  if (!s && route !== 'welcome' && route !== 'login') { location.hash = '#/welcome'; return; }
  if (s && (route === 'welcome' || route === 'login')) { location.hash = '#/dashboard'; return; }

  app.innerHTML = '';

  if (route === 'welcome') return app.appendChild(screenWelcome());
  if (route === 'login') return app.appendChild(screenLogin());

  // logged-in shell
  app.appendChild(screenShell(route));
}

/* ---------------- Screen: Welcome ---------------- */
function screenWelcome() {
  const wrap = el(`
    <div class="centered-screen">
      <div class="login-card">
        <img src="${CONFIG.LOGO_URL}" class="school-logo" alt="Logo Sekolah">
        <h1 class="welcome-title">Selamat datang di portal ${CONFIG.SCHOOL_NAME}</h1>
        <p class="welcome-tagline">"${CONFIG.TAGLINE}"</p>
        <a class="btn" href="#/login">Login</a>
      </div>
    </div>
  `);
  return wrap;
}

/* ---------------- Screen: Login ---------------- */
function screenLogin() {
  const wrap = el(`
    <div class="centered-screen">
      <div class="login-card">
        <img src="${CONFIG.LOGO_URL}" class="school-logo" alt="Logo Sekolah">
        <div class="login-tabs">
          <button class="active" data-tab="password">NIP &amp; Password</button>
          <button data-tab="qr">Scan QR</button>
        </div>
        <div id="login-body"></div>
      </div>
    </div>
  `);

  function showPasswordForm() {
    const body = qs('#login-body', wrap);
    body.innerHTML = '';
    body.appendChild(el(`
      <div>
        <div class="field"><label>NIP</label><input id="in-nip" type="text" inputmode="numeric"></div>
        <div class="field"><label>Password</label><input id="in-pass" type="password"></div>
        <button class="btn" id="btn-login-pass">Masuk</button>
        <p style="font-size:12px;color:var(--muted);margin-top:10px;">Khusus Kepala Sekolah / Guru / Pegawai</p>
      </div>
    `));
    qs('#btn-login-pass', body).onclick = async () => {
      const nip = qs('#in-nip', body).value.trim();
      const pass = qs('#in-pass', body).value;
      if (!nip || !pass) return toast('Lengkapi NIP dan password');
      const r = await api('login_password', { nip, password: pass });
      handleLoginResult(r);
    };
  }

  function showQrForm() {
    const body = qs('#login-body', wrap);
    body.innerHTML = '';
    body.appendChild(el(`<div id="qr-reader"></div><p style="font-size:12px;color:var(--muted);margin-top:8px;">Arahkan kamera ke kartu QR (admin/siswa/orang tua)</p>`));
    startQrScanner('qr-reader', async (text) => {
      await stopActiveScanner();
      const r = await api('login_qr', { qrText: text });
      handleLoginResult(r, () => showQrForm());
    });
  }

  async function handleLoginResult(r, retryFn) {
    if (!r.ok) { toast(r.message || 'Login gagal'); if (retryFn) setTimeout(retryFn, 1200); return; }
    S.session = r;
    location.hash = '#/dashboard';
  }

  qsa('.login-tabs button', wrap).forEach((btn) => {
    btn.onclick = async () => {
      await stopActiveScanner();
      qsa('.login-tabs button', wrap).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      btn.dataset.tab === 'password' ? showPasswordForm() : showQrForm();
    };
  });
  setTimeout(showPasswordForm, 0);
  return wrap;
}

/* ---------------- Logged-in shell (topbar + drawer + content) ---------------- */
function initialsOf(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

function screenShell(route) {
  const s = S.session;
  const menu = getMenu();
  const currentLabel = (menu.find((m) => m.id === route) || {}).label || 'Dasbor';
  const initials = initialsOf(s.profile.Nama || s.identifier);

  const wrap = el(`
    <div class="app-shell">
      <div class="drawer-overlay" id="overlay"></div>
      <aside class="drawer" id="drawer">
        <div class="drawer-header">
          <img src="${CONFIG.LOGO_URL}" class="brand-logo" alt="Logo">
          <div class="brand-text">
            <div class="brand-name">${CONFIG.SCHOOL_NAME}</div>
            <div class="brand-tagline">${CONFIG.TAGLINE}</div>
          </div>
        </div>
        <div class="drawer-profile">
          <div class="avatar-circle">${initials}</div>
          <div>
            <div class="dp-name">${s.profile.Nama || s.identifier}</div>
            <div class="dp-role">${s.roleDetail || s.role}${s.kewenangan ? ' · ' + s.kewenangan : ''}</div>
          </div>
        </div>
        <nav id="menu-list" class="menu-list"></nav>
        <button class="menu-item logout-item" id="btn-logout"><span>⏻</span><span>Keluar</span></button>
      </aside>
      <div class="main-col">
        <div class="topbar">
          <button class="hamburger" id="btn-menu">☰</button>
          <div class="topbar-title">${currentLabel}</div>
          <button class="theme-toggle" id="btn-theme" title="Ganti tema">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
          <div class="topbar-avatar" id="topbar-avatar" title="Profil">${initials}</div>
        </div>
        <main id="content"></main>
      </div>
    </div>
  `);

  const menuList = qs('#menu-list', wrap);
  menu.forEach((m) => {
    const item = el(`<div class="menu-item ${route === m.id ? 'active' : ''}"><span>${m.icon}</span><span>${m.label}</span></div>`);
    item.onclick = () => { location.hash = '#/' + m.id; closeDrawer(); };
    menuList.appendChild(item);
  });

  function openDrawer() { qs('#drawer', wrap).classList.add('open'); qs('#overlay', wrap).classList.add('open'); }
  function closeDrawer() { qs('#drawer', wrap).classList.remove('open'); qs('#overlay', wrap).classList.remove('open'); }
  qs('#btn-menu', wrap).onclick = openDrawer;
  qs('#overlay', wrap).onclick = closeDrawer;
  qs('#btn-logout', wrap).onclick = () => { S.clear(); location.hash = '#/welcome'; };
  qs('#topbar-avatar', wrap).onclick = () => { location.hash = '#/profil'; };
  qs('#btn-theme', wrap).onclick = () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    qs('#btn-theme', wrap).textContent = next === 'dark' ? '☀️' : '🌙';
  };

  const content = qs('#content', wrap);
  loadScreen(route, content);
  return wrap;
}

/* ---------------- Screen dispatcher ---------------- */
const SCREENS = {
  dashboard: screenDashboard,
  absensi: screenAbsensi,
  pengumuman: screenPengumuman,
  perizinan: screenPerizinan,
  konseling: screenKonseling,
  peminjaman: screenPeminjaman,
  pengambilan: screenPengambilan,
  distribusi: screenDistribusi,
  'data-siswa': screenDataSiswa,
  'data-petugas': screenDataPetugas,
  'data-barang': screenDataBarang,
  profil: screenProfil,
  rekap: screenRekap,
  persetujuan: screenPersetujuan,
  pesan: screenPesan
};
async function loadScreen(route, content) {
  content.innerHTML = '<div class="card">Memuat...</div>';
  const fn = SCREENS[route];
  if (!fn) { content.innerHTML = '<div class="card">Halaman tidak ditemukan.</div>'; return; }
  await fn(content);
}

/* ================= DASHBOARD ================= */
async function screenDashboard(content) {
  const r = await api('get_dashboard');
  if (!r.ok) return (content.innerHTML = `<div class="card">Gagal memuat dasbor: ${r.message}</div>`);
  content.innerHTML = '';
  const totalSiswa = r.totalSiswa || (r.siswaTidakHadir.length + 1);
  const hadirCount = Math.max(0, totalSiswa - r.siswaTidakHadir.length);
  const persenHadir = totalSiswa ? Math.round((hadirCount / totalSiswa) * 100) : 0;

  content.appendChild(el(`
    <div class="stat-grid">
      <div class="stat-card accent">
        <div class="stat-icon">🎓</div><div class="stat-number">${persenHadir}%</div><div class="stat-label">Kehadiran Hari Ini (${hadirCount}/${totalSiswa})</div>
        <div class="progress-track"><div class="progress-fill" style="width:${persenHadir}%;"></div></div>
      </div>
      <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-number">${r.peminjamanHariIni.length}</div><div class="stat-label">Peminjaman Hari Ini</div></div>
      <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-number">${r.perizinanAktif.length}</div><div class="stat-label">Perizinan Aktif</div></div>
      <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-number">${r.stokBarang.length}</div><div class="stat-label">Jenis Barang Tersedia</div></div>
    </div>
    <div class="card"><h3>🚫 Siswa Tidak Hadir (${r.siswaTidakHadir.length})</h3>
      ${r.siswaTidakHadir.slice(0, 15).map((x) => `<div class="list-row"><span>${x.Nama}</span><span class="badge bad">${x.Kelas || ''}</span></div>`).join('') || '<div class="empty-state"><div class="empty-icon">✅</div><p>Semua siswa hadir</p></div>'}
    </div>
    <div class="card"><h3>📦 Peminjaman Barang Hari Ini (${r.peminjamanHariIni.length})</h3>
      ${r.peminjamanHariIni.map((x) => `<div class="list-row"><span>${x.Peminjam}</span><span class="badge warn">${x.Status}</span></div>`).join('') || '<div class="empty-state"><div class="empty-icon">📦</div><p>Belum ada peminjaman hari ini</p></div>'}
    </div>
    <div class="card"><h3>📝 Perizinan Siswa Aktif (${r.perizinanAktif.length})</h3>
      ${r.perizinanAktif.map((x) => `<div class="list-row"><span>${x.DaftarNamaSiswa}</span><span class="badge ok">s/d ${x.TglKembali}</span></div>`).join('') || '<div class="empty-state"><div class="empty-icon">📝</div><p>Tidak ada perizinan aktif</p></div>'}
    </div>
    <div class="card"><h3>📋 Stok Barang Tersedia</h3>
      ${barChartHtml(r.stokBarang)}
      ${r.stokBarang.map((x) => `<div class="list-row"><span>${x.NamaBarang}</span><span>${x.Stok}</span></div>`).join('') || '<div class="empty-state"><div class="empty-icon">📋</div><p>Belum ada data barang</p></div>'}
    </div>
  `));
}

/* ================= ABSENSI (continuous QR scan) ================= */
async function screenAbsensi(content) {
  content.innerHTML = '';
  const card = el(`
    <div class="card">
      <h3>Absensi Siswa — Scan QR Berturut-turut</h3>
      <div class="field"><label>Sesi</label>
        <select id="sesi-select"><option value="1">Sesi 1</option><option value="2">Sesi 2</option><option value="3">Sesi 3</option><option value="4">Sesi 4</option></select>
      </div>
      <div id="qr-reader" style="max-width:340px;"></div>
      <div id="scan-result" style="margin-top:12px;"></div>
    </div>
    <div class="card"><h3>Riwayat Hari Ini</h3><div id="riwayat"></div></div>
  `);
  content.appendChild(card);

  async function refreshRiwayat() {
    const r = await api('absensi_list', {});
    const box = qs('#riwayat', card);
    box.innerHTML = (r.data || []).slice().reverse().slice(0, 30).map((a) =>
      `<div class="list-row"><span>${a.NamaSiswa} (Sesi ${a.Sesi})</span><span class="badge ${a.Status === 'Hadir' ? 'ok' : 'warn'}">${a.Status}</span></div>`
    ).join('') || '<p style="color:var(--muted)">Belum ada data</p>';
  }
  refreshRiwayat();

  let busy = false;
  startQrScanner('qr-reader', async (text) => {
    if (busy) return;
    busy = true;
    const sesi = qs('#sesi-select', card).value;
    const r = await api('absensi_scan', { qrText: text, sesi });
    const box = qs('#scan-result', card);
    if (r.ok) {
      box.innerHTML = `<div class="badge ok" style="font-size:14px;padding:8px 14px;">✅ ${r.nama} — ${r.message}</div>`;
    } else if (r.butuhKeterangan) {
      box.innerHTML = `<div class="badge bad" style="font-size:13px;padding:8px 14px;">⚠️ ${r.message}</div>`;
      renderKeteranganForm(box, text, r.sesiTertinggal);
    } else {
      box.innerHTML = `<div class="badge bad" style="font-size:13px;padding:8px 14px;">${r.message}</div>`;
    }
    refreshRiwayat();
    setTimeout(() => { busy = false; }, 1200);
  });
}

function renderKeteranganForm(box, qrText, sesi) {
  const nisn = qrText.split(' - ')[0].trim();
  const form = el(`
    <div class="field"><label>Keterangan untuk Sesi ${sesi}</label>
      <select id="ket-status"><option value="Izin">Izin</option><option value="Sakit">Sakit</option><option value="Alpa">Alpa</option></select>
    </div>
    <div class="field"><textarea id="ket-teks" placeholder="Keterangan tambahan (opsional)"></textarea></div>
    <button class="btn small" id="btn-simpan-ket">Simpan Keterangan</button>
  `);
  box.appendChild(form);
  qs('#btn-simpan-ket', box).onclick = async () => {
    const status = qs('#ket-status', box).value;
    const teks = qs('#ket-teks', box).value;
    const r = await api('absensi_isi_keterangan', { nisn, sesi, status, keterangan: teks });
    toast(r.ok ? 'Keterangan tersimpan, sesi berikutnya terbuka' : r.message);
  };
}

/* ================= PENGUMUMAN ================= */
async function screenPengumuman(content) {
  const s = S.session;
  content.innerHTML = '';
  if (s.role !== 'orangtua') {
    content.appendChild(el(`
      <div class="card">
        <h3>Buat Pengumuman</h3>
        <div class="field"><label>Judul Pengumuman</label><input id="p-judul"></div>
        <div class="field"><label>Isi Pengumuman</label><textarea id="p-isi" rows="4"></textarea></div>
        <div class="field"><label>Scan Pengumuman (opsional, tempel URL gambar/PDF)</label><input id="p-lampiran" placeholder="https://..."></div>
        <button class="btn" id="btn-buat-peng">Simpan Draft</button>
      </div>
    `));
    qs('#btn-buat-peng', content).onclick = async () => {
      const judul = qs('#p-judul', content).value.trim();
      const isi = qs('#p-isi', content).value.trim();
      if (!judul || !isi) return toast('Judul dan isi wajib diisi');
      const r = await api('pengumuman_create', { judul, isi, lampiranURL: qs('#p-lampiran', content).value.trim() });
      if (r.ok) { toast('Draft tersimpan. Ajukan ke Humas dari daftar di bawah.'); loadScreen('pengumuman', content); }
    };
  }

  const list = await api('pengumuman_list');
  const box = el(`<div class="card"><h3>Daftar Pengumuman</h3><div id="peng-list"></div></div>`);
  content.appendChild(box);
  const listBox = qs('#peng-list', box);
  (list.data || []).slice().reverse().forEach((p) => {
    const statusBadge = { Draft: 'warn', Diajukan: 'warn', Terbit: 'ok', Ditolak: 'bad' }[p.Status] || 'warn';
    const row = el(`
      <div class="list-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;">
          <strong>${p.Judul}</strong><span class="badge ${statusBadge}">${p.Status}</span>
        </div>
        <p style="margin:6px 0;font-size:13.5px;color:var(--text);">${p.Isi}</p>
        ${p.Status === 'Draft' && s.role !== 'orangtua' ? `<button class="btn small" data-ajukan="${p.ID}">Ajukan ke Humas</button>` : ''}
      </div>
    `);
    listBox.appendChild(row);
  });
  qsa('[data-ajukan]', listBox).forEach((btn) => {
    btn.onclick = async () => { await api('pengumuman_ajukan', { id: btn.dataset.ajukan }); loadScreen('pengumuman', content); };
  });
}

/* ================= PERIZINAN SISWA ================= */
let perizinanSiswaTerpilih = [];
async function screenPerizinan(content) {
  perizinanSiswaTerpilih = [];
  content.innerHTML = '';
  const siswaRes = await api('siswa_list');
  const siswaAll = siswaRes.data || [];

  const form = el(`
    <div class="card">
      <h3>Form Perizinan Siswa</h3>
      <div class="field"><label>Cari & pilih siswa (bisa lebih dari 1)</label>
        <input class="search-box" id="cari-siswa" placeholder="Ketik nama/NISN, atau scan QR...">
        <button class="btn small secondary" id="btn-scan-izin" type="button">📷 Scan QR Siswa</button>
      </div>
      <div id="chip-siswa"></div>
      <div class="grid-2">
        <div class="field"><label>Tanggal Mulai</label><input type="date" id="izin-tgl-mulai"></div>
        <div class="field"><label>Jam Mulai</label><input type="time" id="izin-jam-mulai"></div>
        <div class="field"><label>Tanggal Kembali</label><input type="date" id="izin-tgl-kembali"></div>
        <div class="field"><label>Jam Kembali</label><input type="time" id="izin-jam-kembali"></div>
      </div>
      <div class="field"><label>Keperluan Izin</label><textarea id="izin-keperluan" rows="3"></textarea></div>
      <p style="font-size:12px;color:var(--muted);">Catatan: siswa yang dipilih di atas akan diajukan dalam SATU pengajuan dengan rincian yang sama — mempersingkat proses jika keperluan & waktunya identik.</p>
      <button class="btn" id="btn-ajukan-izin">Ajukan ke Kepala UKS</button>
    </div>
  `);
  content.appendChild(form);

  const searchInput = qs('#cari-siswa', form);
  const suggestBox = el('<div class="card" style="display:none;max-height:220px;overflow-y:auto;"></div>');
  form.insertBefore(suggestBox, qs('.grid-2', form));

  function renderChips() {
    const box = qs('#chip-siswa', form);
    box.innerHTML = perizinanSiswaTerpilih.map((s) => `<span class="chip">${s.nama}<button data-remove="${s.nisn}">×</button></span>`).join('');
    qsa('[data-remove]', box).forEach((b) => b.onclick = () => {
      perizinanSiswaTerpilih = perizinanSiswaTerpilih.filter((x) => x.nisn !== b.dataset.remove);
      renderChips();
    });
  }
  function addSiswa(nisn, nama) {
    if (!perizinanSiswaTerpilih.find((s) => s.nisn === nisn)) perizinanSiswaTerpilih.push({ nisn, nama });
    renderChips();
    searchInput.value = ''; suggestBox.style.display = 'none';
  }
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    if (!q) { suggestBox.style.display = 'none'; return; }
    const matches = siswaAll.filter((s) => (s.Nama + s.NISN + s.Kelas).toLowerCase().includes(q)).slice(0, 8);
    suggestBox.innerHTML = matches.map((s) => `<div class="list-row" data-pick="${s.NISN}" data-nama="${s.Nama}" style="cursor:pointer;"><span>${s.Nama}</span><span style="color:var(--muted)">${s.Kelas || ''}</span></div>`).join('') || '<p style="color:var(--muted);padding:8px;">Tidak ditemukan</p>';
    suggestBox.style.display = 'block';
    qsa('[data-pick]', suggestBox).forEach((r) => r.onclick = () => addSiswa(r.dataset.pick, r.dataset.nama));
  });

  qs('#btn-scan-izin', form).onclick = () => openQrScanModal((text) => {
    const nisn = text.split(' - ')[0].trim();
    const nama = text.split(' - ').slice(1).join(' - ').trim();
    addSiswa(nisn, nama || nisn);
  });

  qs('#btn-ajukan-izin', form).onclick = async () => {
    if (perizinanSiswaTerpilih.length === 0) return toast('Pilih minimal 1 siswa');
    const payload = {
      daftarSiswa: perizinanSiswaTerpilih,
      tglMulai: qs('#izin-tgl-mulai', form).value, jamMulai: qs('#izin-jam-mulai', form).value,
      tglKembali: qs('#izin-tgl-kembali', form).value, jamKembali: qs('#izin-jam-kembali', form).value,
      keperluan: qs('#izin-keperluan', form).value
    };
    if (!payload.tglMulai || !payload.tglKembali || !payload.keperluan) return toast('Lengkapi semua isian');
    const r = await api('perizinan_create', payload);
    if (r.ok) { toast('Pengajuan izin terkirim ke Kepala UKS'); loadScreen('perizinan', content); }
  };

  // daftar + cetak
  const listRes = await api('perizinan_list');
  const listCard = el(`<div class="card"><h3>Riwayat Perizinan</h3><div id="izin-list"></div></div>`);
  content.appendChild(listCard);
  const listBox = qs('#izin-list', listCard);
  (listRes.data || []).slice().reverse().forEach((rec) => {
    const badge = { Diajukan: 'warn', Disetujui: 'ok', Ditolak: 'bad' }[rec.Status] || 'warn';
    const row = el(`
      <div class="list-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;">
          <strong>${rec.DaftarNamaSiswa}</strong><span class="badge ${badge}">${rec.Status}</span>
        </div>
        <p style="margin:6px 0;font-size:13px;">${rec.Keperluan} · ${rec.TglMulai} → ${rec.TglKembali}</p>
        ${rec.Status === 'Disetujui' ? `<button class="btn small" data-cetak="${rec.ID}">🖨️ Cetak Surat (per siswa)</button>` : ''}
      </div>
    `);
    listBox.appendChild(row);
  });
  qsa('[data-cetak]', listBox).forEach((btn) => btn.onclick = () => cetakPerizinan(btn.dataset.cetak));
}

async function cetakPerizinan(id) {
  const r = await api('perizinan_print_data', { id });
  if (!r.ok) return toast(r.message);
  const sheets = r.lembar.map((L) => `
    <div class="print-sheet page-break">
      ${kopSuratHtml()}
      <p class="surat-nomor">SURAT IZIN SISWA<br>Nomor: ${L.nomorSurat}</p>
      <p>Yang bertanda tangan di bawah ini, Kepala UKS ${CONFIG.SCHOOL_NAME}, memberikan izin kepada:</p>
      <table style="width:100%;margin:10px 0;">
        <tr><td style="width:150px;">Nama</td><td>: ${L.nama}</td></tr>
        <tr><td>NISN</td><td>: ${L.nisn}</td></tr>
        <tr><td>Kelas / Jenjang</td><td>: ${L.kelas || ''} / ${L.jenjang || ''}</td></tr>
        <tr><td>Keperluan</td><td>: ${L.keperluan}</td></tr>
        <tr><td>Waktu Mulai</td><td>: ${L.tglMulai} ${L.jamMulai}</td></tr>
        <tr><td>Rencana Kembali</td><td>: ${L.tglKembali} ${L.jamKembali}</td></tr>
      </table>
      <div class="ttd-block">
        <div class="ttd-col"></div>
        <div class="ttd-col">
          <p>Pasuruan, ${todayIndo()}<br>${L.ttdJabatan},</p>
          <div class="qr-slot" data-qr="${L.ttdQrPayload}"></div>
          <p><strong>${L.ttdNama}</strong></p>
        </div>
      </div>
    </div>
  `).join('');
  printHtml(sheets);
}

/* ================= KONSELING SISWA ================= */
let konselingSiswaTerpilih = [];
async function screenKonseling(content) {
  konselingSiswaTerpilih = [];
  content.innerHTML = '';
  const siswaRes = await api('siswa_list');
  const siswaAll = siswaRes.data || [];

  const form = el(`
    <div class="card">
      <h3>Form Konseling Siswa</h3>
      <div class="field"><label>Cari & pilih siswa</label>
        <input class="search-box" id="cari-siswa-k" placeholder="Ketik nama/NISN...">
        <button class="btn small secondary" id="btn-scan-kons" type="button">📷 Scan QR Siswa</button>
      </div>
      <div id="chip-siswa-k"></div>
      <div class="field"><label>Rincian Masalah</label><textarea id="k-masalah" rows="3"></textarea></div>
      <div class="field"><label>Dampak yang Dirasakan</label><textarea id="k-dampak" rows="2"></textarea></div>
      <div class="field"><label>Solusi</label><textarea id="k-solusi" rows="2"></textarea></div>
      <button class="btn" id="btn-simpan-kons">Simpan Laporan Konseling</button>
    </div>
  `);
  content.appendChild(form);
  const searchInput = qs('#cari-siswa-k', form);
  const suggestBox = el('<div class="card" style="display:none;max-height:220px;overflow-y:auto;"></div>');
  form.insertBefore(suggestBox, qs('#k-masalah', form).closest('.field'));

  function renderChips() {
    const box = qs('#chip-siswa-k', form);
    box.innerHTML = konselingSiswaTerpilih.map((s) => `<span class="chip">${s.nama}<button data-remove="${s.nisn}">×</button></span>`).join('');
    qsa('[data-remove]', box).forEach((b) => b.onclick = () => { konselingSiswaTerpilih = konselingSiswaTerpilih.filter((x) => x.nisn !== b.dataset.remove); renderChips(); });
  }
  function addSiswa(nisn, nama) {
    if (!konselingSiswaTerpilih.find((s) => s.nisn === nisn)) konselingSiswaTerpilih.push({ nisn, nama });
    renderChips(); searchInput.value = ''; suggestBox.style.display = 'none';
  }
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    if (!q) { suggestBox.style.display = 'none'; return; }
    const matches = siswaAll.filter((s) => (s.Nama + s.NISN).toLowerCase().includes(q)).slice(0, 8);
    suggestBox.innerHTML = matches.map((s) => `<div class="list-row" data-pick="${s.NISN}" data-nama="${s.Nama}" style="cursor:pointer;"><span>${s.Nama}</span><span>${s.Kelas || ''}</span></div>`).join('');
    suggestBox.style.display = 'block';
    qsa('[data-pick]', suggestBox).forEach((r) => r.onclick = () => addSiswa(r.dataset.pick, r.dataset.nama));
  });
  qs('#btn-scan-kons', form).onclick = () => openQrScanModal((text) => {
    const nisn = text.split(' - ')[0].trim(); const nama = text.split(' - ').slice(1).join(' - ').trim();
    addSiswa(nisn, nama || nisn);
  });
  qs('#btn-simpan-kons', form).onclick = async () => {
    if (konselingSiswaTerpilih.length === 0) return toast('Pilih minimal 1 siswa');
    const r = await api('konseling_create', {
      daftarSiswa: konselingSiswaTerpilih,
      rincianMasalah: qs('#k-masalah', form).value, dampakDirasakan: qs('#k-dampak', form).value, solusi: qs('#k-solusi', form).value
    });
    if (r.ok) { toast('Laporan konseling tersimpan'); loadScreen('konseling', content); }
  };

  const listRes = await api('konseling_list');
  const listCard = el(`<div class="card"><h3>Riwayat Konseling</h3><div id="kons-list"></div></div>`);
  content.appendChild(listCard);
  const listBox = qs('#kons-list', listCard);
  (listRes.data || []).slice().reverse().forEach((rec) => {
    const row = el(`
      <div class="list-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;"><strong>${rec.NamaSiswa}</strong>
          <span class="badge ${rec.StatusSelesai === 'Selesai' ? 'ok' : 'warn'}">${rec.StatusSelesai}</span></div>
        <p style="margin:6px 0;font-size:13px;">${rec.RincianMasalah}</p>
        <div>
          ${rec.StatusSelesai !== 'Selesai' ? `<button class="btn small" data-selesai="${rec.ID}">Tandai Selesai</button>` : `<button class="btn small" data-cetak-kons="${rec.ID}">🖨️ Cetak</button>`}
        </div>
      </div>
    `);
    listBox.appendChild(row);
  });
  qsa('[data-selesai]', listBox).forEach((b) => b.onclick = async () => { await api('konseling_selesai', { id: b.dataset.selesai }); loadScreen('konseling', content); });
  qsa('[data-cetak-kons]', listBox).forEach((b) => b.onclick = () => cetakKonseling(b.dataset.cetakKons));
}

async function cetakKonseling(id) {
  const r = await api('konseling_print_data', { id });
  if (!r.ok) return toast(r.message);
  const html = `
    <div class="print-sheet">
      ${kopSuratHtml()}
      <p class="surat-nomor">LAPORAN KONSELING SISWA<br>Nomor: ${r.nomorSurat}</p>
      <table style="width:100%;margin:10px 0;"><tr><td style="width:150px;">Nama Siswa</td><td>: ${r.nama}</td></tr><tr><td>NISN</td><td>: ${r.nisn}</td></tr></table>
      <p><strong>Rincian Masalah:</strong> ${r.rincianMasalah}</p>
      <p><strong>Dampak yang Dirasakan:</strong> ${r.dampakDirasakan}</p>
      <p><strong>Solusi:</strong> ${r.solusi}</p>
      <div class="ttd-block">
        <div class="ttd-col"><p>Siswa,</p><div class="qr-slot" data-qr="${r.ttdSiswaQrPayload}"></div><p><strong>${r.nama}</strong></p></div>
        <div class="ttd-col"><p>Pasuruan, ${todayIndo()}<br>${r.ttdAdminJabatan || 'Guru/Pegawai'},</p><div class="qr-slot" data-qr="${r.ttdAdminQrPayload}"></div><p><strong>${r.ttdAdminNama}</strong></p></div>
      </div>
    </div>`;
  printHtml(html);
}

/* ================= PEMINJAMAN / PENGAMBILAN / DISTRIBUSI BARANG ================= */
let barangTerpilihPinjam = [];
async function screenPeminjaman(content) {
  barangTerpilihPinjam = [];
  content.innerHTML = '';
  const barangRes = await api('barang_list');
  const kategoriMap = {};
  (barangRes.data || []).forEach((b) => { (kategoriMap[b.Kategori] = kategoriMap[b.Kategori] || []).push(b); });

  const form = el(`
    <div class="card">
      <h3>Form Peminjaman Barang</h3>
      <div id="kategori-barang"></div>
      <div id="chip-barang" style="margin:10px 0;"></div>
      <div class="field"><label>Rencana Tanggal & Waktu Kembali</label><input type="datetime-local" id="pjm-kembali"></div>
      <div class="field"><label>Tujuan Penggunaan</label><textarea id="pjm-tujuan" rows="2"></textarea></div>
      <button class="btn" id="btn-ajukan-pjm">Ajukan ke Sarpras</button>
    </div>
  `);
  content.appendChild(form);
  const katBox = qs('#kategori-barang', form);
  Object.keys(kategoriMap).forEach((kat) => {
    const sec = el(`<div style="margin-bottom:10px;"><strong>${kat}</strong></div>`);
    kategoriMap[kat].forEach((b) => {
      const row = el(`<div class="list-row"><span>${b.NamaBarang} (stok: ${b.Stok})</span><input type="number" min="0" max="${b.Stok}" style="width:70px;" data-kode="${b.KodeBarang}" data-nama="${b.NamaBarang}"></div>`);
      sec.appendChild(row);
    });
    katBox.appendChild(sec);
  });
  qs('#btn-ajukan-pjm', form).onclick = async () => {
    const items = qsa('input[data-kode]', form).filter((i) => Number(i.value) > 0)
      .map((i) => ({ kode: i.dataset.kode, nama: i.dataset.nama, jumlah: Number(i.value) }));
    if (items.length === 0) return toast('Pilih minimal 1 barang dengan jumlah > 0');
    const r = await api('peminjaman_create', {
      daftarBarang: items, rencanaKembali: qs('#pjm-kembali', form).value, tujuanPenggunaan: qs('#pjm-tujuan', form).value
    });
    if (r.ok) { toast('Pengajuan peminjaman terkirim ke Sarpras'); loadScreen('peminjaman', content); }
  };

  const listRes = await api('peminjaman_list');
  const listCard = el(`<div class="card"><h3>Riwayat Peminjaman</h3><div id="pjm-list"></div></div>`);
  content.appendChild(listCard);
  const listBox = qs('#pjm-list', listCard);
  (listRes.data || []).slice().reverse().forEach((rec) => {
    const badge = { Diajukan: 'warn', Disetujui: 'ok', Ditolak: 'bad' }[rec.Status] || 'warn';
    const row = el(`
      <div class="list-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;"><strong>${rec.ID}</strong><span class="badge ${badge}">${rec.Status} · ${rec.StatusKembali || ''}</span></div>
        <p style="font-size:13px;">${(rec.DaftarBarang || []).map((b) => b.nama + ' x' + b.jumlah).join(', ')}</p>
        <p style="font-size:12px;color:var(--muted);">Kembali rencana: ${rec.RencanaKembali}</p>
        ${rec.Status === 'Disetujui' && rec.StatusKembali !== 'Lunas' ? `<button class="btn small" data-kembalikan="${rec.ID}">Kembalikan Barang</button>` : ''}
        ${rec.Status === 'Disetujui' ? `<button class="btn small secondary" data-cetak-pjm="${rec.ID}">🖨️ Cetak</button>` : ''}
      </div>
    `);
    listBox.appendChild(row);
  });
  qsa('[data-kembalikan]', listBox).forEach((b) => b.onclick = () => modalKembalikanBarang(b.dataset.kembalikan, content));
  qsa('[data-cetak-pjm]', listBox).forEach((b) => b.onclick = () => cetakPeminjaman(b.dataset.cetakPjm));
}

function modalKembalikanBarang(id, content) {
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal-box">
        <h3>Pengembalian Barang</h3>
        <div class="field"><label>Barang & jumlah kembali (kosongkan jika belum kembali semua)</label><div id="kembali-fields"></div></div>
        <div class="field"><label>Keterangan keterlambatan (jika melewati rencana kembali)</label><textarea id="ket-telat"></textarea></div>
        <button class="btn" id="btn-simpan-kembali">Simpan</button>
        <button class="btn secondary" id="btn-batal-kembali">Batal</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  api('peminjaman_list').then((r) => {
    const rec = (r.data || []).find((x) => x.ID === id);
    if (!rec) return;
    qs('#kembali-fields', overlay).innerHTML = (rec.DaftarBarang || []).map((b) =>
      `<div class="list-row"><span>${b.nama} (sisa: ${b.jumlah - (b.sudahKembali || 0)})</span><input type="number" min="0" max="${b.jumlah - (b.sudahKembali || 0)}" data-kode="${b.kode}" style="width:70px;"></div>`
    ).join('');
  });
  qs('#btn-batal-kembali', overlay).onclick = () => overlay.remove();
  qs('#btn-simpan-kembali', overlay).onclick = async () => {
    const items = qsa('input[data-kode]', overlay).filter((i) => Number(i.value) > 0).map((i) => ({ kode: i.dataset.kode, jumlahKembali: Number(i.value) }));
    const r = await api('peminjaman_kembalikan', { id, pengembalian: items, keteranganTerlambat: qs('#ket-telat', overlay).value });
    overlay.remove();
    if (r.ok) { toast(r.lunas ? 'Barang kembali sepenuhnya' : 'Sebagian barang tercatat kembali'); loadScreen('peminjaman', content); }
  };
}

async function cetakPeminjaman(id) {
  const r = await api('peminjaman_print_data', { id });
  if (!r.ok) return toast(r.message);
  const html = `
    <div class="print-sheet">
      ${kopSuratHtml()}
      <p class="surat-nomor">BUKTI PEMINJAMAN BARANG<br>Nomor: ${r.nomorSurat}</p>
      <p><strong>Peminjam:</strong> ${r.peminjam}</p>
      <table style="width:100%;margin:10px 0;"><tr><th>Barang</th><th>Jumlah</th></tr>
      ${r.daftarBarang.map((b) => `<tr><td>${b.nama}</td><td>${b.jumlah}</td></tr>`).join('')}</table>
      <p>Tujuan: ${r.tujuanPenggunaan}</p>
      <p>Tanggal Pinjam: ${r.tglPinjam} · Rencana Kembali: ${r.rencanaKembali} ${r.tglKembaliAktual ? '· Kembali Aktual: ' + r.tglKembaliAktual : ''}</p>
      ${r.keteranganTerlambat ? `<p><em>Keterangan keterlambatan: ${r.keteranganTerlambat}</em></p>` : ''}
      <div class="ttd-block">
        <div class="ttd-col"><p>Peminjam,</p><div class="qr-slot" data-qr="${r.ttdPeminjamQrPayload}"></div><p><strong>${r.peminjam}</strong></p></div>
        <div class="ttd-col"><p>Pasuruan, ${todayIndo()}<br>Sarpras,</p><div class="qr-slot" data-qr="${r.ttdSarprasQrPayload}"></div><p><strong>${r.ttdSarprasNama}</strong></p></div>
      </div>
    </div>`;
  printHtml(html);
}

async function screenPengambilan(content) {
  content.innerHTML = '';
  const barangRes = await api('barang_list');
  const kategoriMap = {};
  (barangRes.data || []).forEach((b) => { (kategoriMap[b.Kategori] = kategoriMap[b.Kategori] || []).push(b); });
  const form = el(`<div class="card"><h3>Form Pengambilan Barang</h3><div id="kategori-ambil"></div><button class="btn" id="btn-ambil">Ambil Barang</button></div>`);
  content.appendChild(form);
  const box = qs('#kategori-ambil', form);
  Object.keys(kategoriMap).forEach((kat) => {
    const sec = el(`<div style="margin-bottom:10px;"><strong>${kat}</strong></div>`);
    kategoriMap[kat].forEach((b) => sec.appendChild(el(`<div class="list-row"><span>${b.NamaBarang} (stok: ${b.Stok})</span><input type="number" min="0" max="${b.Stok}" style="width:70px;" data-kode="${b.KodeBarang}"></div>`)));
    box.appendChild(sec);
  });
  qs('#btn-ambil', form).onclick = async () => {
    const items = qsa('input[data-kode]', form).filter((i) => Number(i.value) > 0).map((i) => ({ kode: i.dataset.kode, jumlah: Number(i.value) }));
    if (items.length === 0) return toast('Pilih minimal 1 barang');
    const r = await api('pengambilan_create', { daftarBarang: items });
    if (r.ok) { toast('Barang berhasil diambil'); loadScreen('pengambilan', content); }
  };
}

let distribusiSiswa = [];
async function screenDistribusi(content) {
  distribusiSiswa = [];
  content.innerHTML = '';
  const [siswaRes, barangRes] = await Promise.all([api('siswa_list'), api('barang_list')]);
  const siswaAll = siswaRes.data || [];
  const barangAll = barangRes.data || [];

  const form = el(`
    <div class="card">
      <h3>Form Distribusi Barang</h3>
      <div class="field"><label>Cari & pilih siswa penerima</label><input class="search-box" id="cari-siswa-dist"></div>
      <div id="chip-siswa-dist"></div>
      <div id="jumlah-per-anak"></div>
      <button class="btn" id="btn-bagikan">Bagikan Barang</button>
    </div>
  `);
  content.appendChild(form);
  const searchInput = qs('#cari-siswa-dist', form);
  const suggestBox = el('<div class="card" style="display:none;max-height:200px;overflow-y:auto;"></div>');
  form.insertBefore(suggestBox, qs('#jumlah-per-anak', form));

  function renderJumlahFields() {
    const box = qs('#jumlah-per-anak', form);
    box.innerHTML = distribusiSiswa.map((s) => `
      <div class="card" style="background:#f8fafc;">
        <strong>${s.nama}</strong>
        ${barangAll.map((b) => `<div class="list-row"><span>${b.NamaBarang}</span><input type="number" min="0" max="${b.Stok}" style="width:60px;" data-nisn="${s.nisn}" data-kode="${b.KodeBarang}"></div>`).join('')}
      </div>`).join('');
  }
  function renderChips() {
    qs('#chip-siswa-dist', form).innerHTML = distribusiSiswa.map((s) => `<span class="chip">${s.nama}<button data-remove="${s.nisn}">×</button></span>`).join('');
    qsa('[data-remove]', form).forEach((b) => b.onclick = () => { distribusiSiswa = distribusiSiswa.filter((x) => x.nisn !== b.dataset.remove); renderChips(); renderJumlahFields(); });
  }
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    if (!q) { suggestBox.style.display = 'none'; return; }
    const m = siswaAll.filter((s) => (s.Nama + s.NISN).toLowerCase().includes(q)).slice(0, 8);
    suggestBox.innerHTML = m.map((s) => `<div class="list-row" data-pick="${s.NISN}" data-nama="${s.Nama}" style="cursor:pointer;">${s.Nama}</div>`).join('');
    suggestBox.style.display = 'block';
    qsa('[data-pick]', suggestBox).forEach((r) => r.onclick = () => {
      if (!distribusiSiswa.find((s) => s.nisn === r.dataset.pick)) distribusiSiswa.push({ nisn: r.dataset.pick, nama: r.dataset.nama });
      renderChips(); renderJumlahFields(); searchInput.value = ''; suggestBox.style.display = 'none';
    });
  });
  qs('#btn-bagikan', form).onclick = async () => {
    if (distribusiSiswa.length === 0) return toast('Pilih minimal 1 siswa');
    const perAnak = {};
    distribusiSiswa.forEach((s) => {
      perAnak[s.nisn] = qsa(`input[data-nisn="${s.nisn}"]`, form).filter((i) => Number(i.value) > 0).map((i) => ({ kode: i.dataset.kode, jumlah: Number(i.value) }));
    });
    const r = await api('distribusi_create', { daftarSiswa: distribusiSiswa, daftarBarangPerAnak: perAnak });
    if (r.ok) { toast('Barang berhasil dibagikan'); loadScreen('distribusi', content); }
  };
}

/* ================= DATA SISWA / PETUGAS / BARANG ================= */
async function screenDataSiswa(content) {
  content.innerHTML = '';
  const r = await api('siswa_list');
  const data = r.data || [];
  const wrap = el(`
    <div class="card">
      <h3>Data Siswa</h3>
      <input class="search-box" id="cari-siswa-data" placeholder="Cari (semua kolom)...">
      <button class="btn small secondary" id="btn-print-siswa">🖨️ Cetak Daftar (hasil filter)</button>
      <div class="table-wrap"><table id="tabel-siswa"><thead><tr>
        <th>NISN</th><th>Nama</th><th>Jenjang</th><th>Kelas</th><th>TTL</th><th>Alamat</th><th>No HP Wali</th><th>QR</th>
      </tr></thead><tbody></tbody></table></div>
    </div>
  `);
  content.appendChild(wrap);
  function renderRows(list) {
    qs('tbody', wrap).innerHTML = list.map((s) => `
      <tr><td>${s.NISN}</td><td>${s.Nama}</td><td>${s.Jenjang || ''}</td><td>${s.Kelas || ''}</td>
      <td>${s.TempatLahir || ''}, ${s.TanggalLahir || ''}</td><td>${s.Alamat || ''}</td><td>${s.NoHPWali || ''}</td>
      <td><button class="btn small" data-qr-siswa="${s.NISN}" data-nama-siswa="${s.Nama}">QR</button></td></tr>
    `).join('');
    qsa('[data-qr-siswa]', wrap).forEach((b) => b.onclick = () => tampilkanQrModal(b.dataset.qrSiswa + ' - ' + b.dataset.namaSiswa, b.dataset.namaSiswa));
  }
  renderRows(data);
  qs('#cari-siswa-data', wrap).addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderRows(data.filter((s) => Object.values(s).join(' ').toLowerCase().includes(q)));
  });
  qs('#btn-print-siswa', wrap).onclick = () => {
    const rows = qsa('tbody tr', wrap).map((tr) => `<tr>${tr.innerHTML.replace(/<td>(<button[^]*?<\/button>)<\/td>/, '<td></td>')}</tr>`).join('');
    printHtml(`<div class="print-sheet"><h3>Daftar Siswa — ${CONFIG.SCHOOL_NAME}</h3><table style="width:100%;border-collapse:collapse;" border="1" cellpadding="4">
      <tr><th>NISN</th><th>Nama</th><th>Jenjang</th><th>Kelas</th><th>TTL</th><th>Alamat</th><th>No HP Wali</th></tr>${rows}</table></div>`);
  };
}

async function screenDataPetugas(content) {
  content.innerHTML = '';
  const r = await api('petugas_list');
  const data = r.data || [];
  const wrap = el(`
    <div class="card"><h3>Data Petugas</h3>
      <input class="search-box" id="cari-petugas" placeholder="Cari (semua kolom)...">
      <div class="table-wrap"><table><thead><tr><th>NIP/NIK</th><th>Nama</th><th>Jabatan</th><th>No HP</th></tr></thead><tbody id="tb-petugas"></tbody></table></div>
    </div>`);
  content.appendChild(wrap);
  function renderRows(list) {
    qs('#tb-petugas', wrap).innerHTML = list.map((p) => `<tr><td>${p.NIP}</td><td>${p.Nama}</td><td>${p.Jabatan || p.Role}</td><td>${p.NoHP || ''}</td></tr>`).join('');
  }
  renderRows(data);
  qs('#cari-petugas', wrap).addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderRows(data.filter((p) => Object.values(p).join(' ').toLowerCase().includes(q)));
  });
}

async function screenDataBarang(content) {
  content.innerHTML = '';
  const r = await api('barang_list');
  const data = r.data || [];
  const wrap = el(`
    <div class="card"><h3>Data Barang</h3>
      <input class="search-box" id="cari-barang" placeholder="Cari (semua kolom)...">
      <div class="table-wrap"><table><thead><tr><th>Kategori</th><th>Jenis</th><th>Nama Barang</th><th>Stok</th></tr></thead><tbody id="tb-barang"></tbody></table></div>
    </div>`);
  content.appendChild(wrap);
  function renderRows(list) {
    qs('#tb-barang', wrap).innerHTML = list.map((b) => `<tr><td>${b.Kategori}</td><td>${b.JenisBarang}</td><td>${b.NamaBarang}</td><td>${b.Stok}</td></tr>`).join('');
  }
  renderRows(data);
  qs('#cari-barang', wrap).addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderRows(data.filter((b) => Object.values(b).join(' ').toLowerCase().includes(q)));
  });
}

/* ================= PROFIL ================= */
async function screenProfil(content) {
  const s = S.session;
  content.innerHTML = '';
  content.appendChild(el(`
    <div class="card">
      <h3>Profil</h3>
      <p><strong>Nama:</strong> ${s.profile.Nama}</p>
      <p><strong>Identitas:</strong> ${s.identifier}</p>
      <p><strong>Jabatan/Role:</strong> ${s.roleDetail || s.role} ${s.kewenangan ? '(' + s.kewenangan + ')' : ''}</p>
      ${s.role !== 'siswa' ? `<button class="btn small" id="btn-print-kartu">🖨️ Cetak Kartu Login</button>` : ''}
    </div>
    ${s.role === 'admin' ? `
    <div class="card">
      <h3>Ganti Password</h3>
      <div class="field"><label>Password Lama</label><input type="password" id="pass-lama"></div>
      <div class="field"><label>Password Baru</label><input type="password" id="pass-baru"></div>
      <button class="btn" id="btn-ganti-pass">Simpan</button>
    </div>` : `
    <div class="card"><p style="color:var(--muted);font-size:13.5px;">Akun ini login menggunakan QR saja, tidak memakai password.</p></div>`}
  `));
  if (qs('#btn-ganti-pass', content)) {
    qs('#btn-ganti-pass', content).onclick = async () => {
      const r = await api('change_password', { oldPass: qs('#pass-lama', content).value, newPass: qs('#pass-baru', content).value });
      toast(r.ok ? 'Password berhasil diubah' : r.message);
    };
  }
  if (qs('#btn-print-kartu', content)) {
    qs('#btn-print-kartu', content).onclick = () => {
      const qrPayload = s.identifier + ' - ' + s.profile.Nama;
      printHtml(`
        <div class="print-sheet" style="width:90mm;min-height:55mm;">
          <div style="display:flex;gap:10px;align-items:center;">
            <img src="${CONFIG.LOGO_URL}" style="width:40px;height:40px;">
            <div><strong style="font-size:12px;">${CONFIG.SCHOOL_NAME}</strong></div>
          </div>
          <p style="margin:8px 0 2px;"><strong>${s.profile.Nama}</strong></p>
          <p style="margin:0;font-size:12px;">${s.identifier} — ${s.roleDetail || s.role}</p>
          <div class="qr-slot" data-qr="${qrPayload}" style="margin-top:8px;"></div>
        </div>`);
    };
  }
}

/* ================= REKAP SAYA ================= */
async function screenRekap(content) {
  const r = await api('rekap_saya');
  content.innerHTML = '';
  content.appendChild(el(`
    <div class="card"><h3>Peminjaman (${(r.peminjaman || []).length})</h3>${(r.peminjaman || []).map((x) => `<div class="list-row"><span>${x.ID}</span><span class="badge ${x.Status === 'Disetujui' ? 'ok' : 'warn'}">${x.Status}</span></div>`).join('') || '<p style="color:var(--muted)">Belum ada</p>'}</div>
    <div class="card"><h3>Pengambilan (${(r.pengambilan || []).length})</h3>${(r.pengambilan || []).map((x) => `<div class="list-row"><span>${x.ID}</span><span>${x.Tanggal}</span></div>`).join('') || '<p style="color:var(--muted)">Belum ada</p>'}</div>
    <div class="card"><h3>Perizinan (${(r.perizinan || []).length})</h3>${(r.perizinan || []).map((x) => `<div class="list-row"><span>${x.DaftarNamaSiswa}</span><span class="badge ${x.Status === 'Disetujui' ? 'ok' : 'warn'}">${x.Status}</span></div>`).join('') || '<p style="color:var(--muted)">Belum ada</p>'}</div>
    <div class="card"><h3>Konseling (${(r.konseling || []).length})</h3>${(r.konseling || []).map((x) => `<div class="list-row"><span>${x.NamaSiswa}</span><span class="badge ${x.StatusSelesai === 'Selesai' ? 'ok' : 'warn'}">${x.StatusSelesai}</span></div>`).join('') || '<p style="color:var(--muted)">Belum ada</p>'}</div>
  `));
}

/* ================= PERSETUJUAN (khusus Pegawai Berwenang) ================= */
async function screenPersetujuan(content) {
  const r = await api('persetujuan_list');
  content.innerHTML = '';
  const buatBlok = (judul, items, tipe) => {
    const box = el(`<div class="card"><h3>${judul} (${items.length})</h3><div id="blok-${tipe}"></div></div>`);
    const inner = qs(`#blok-${tipe}`, box);
    items.forEach((it) => {
      const label = tipe === 'perizinan' ? it.DaftarNamaSiswa : tipe === 'peminjaman' ? it.Peminjam : it.Judul;
      const row = el(`<div class="list-row" style="flex-direction:column;align-items:flex-start;"><strong>${label}</strong>
        <div><button class="btn small" data-setuju="${it.ID}" data-tipe="${tipe}">Setujui</button>
        <button class="btn small danger" data-tolak="${it.ID}" data-tipe="${tipe}">Tolak</button></div></div>`);
      inner.appendChild(row);
    });
    content.appendChild(box);
  };
  buatBlok('Perizinan Menunggu Persetujuan', r.perizinan || [], 'perizinan');
  buatBlok('Peminjaman Menunggu Persetujuan', r.peminjaman || [], 'peminjaman');
  buatBlok('Pengumuman Menunggu Penerbitan', r.pengumuman || [], 'pengumuman');

  const actionMap = { perizinan: 'perizinan_approve', peminjaman: 'peminjaman_approve', pengumuman: 'pengumuman_approve' };
  qsa('[data-setuju]', content).forEach((b) => b.onclick = async () => { await api(actionMap[b.dataset.tipe], { id: b.dataset.setuju, setuju: true }); loadScreen('persetujuan', content); });
  qsa('[data-tolak]', content).forEach((b) => b.onclick = async () => { await api(actionMap[b.dataset.tipe], { id: b.dataset.tolak, setuju: false, catatan: 'Ditolak' }); loadScreen('persetujuan', content); });
}

/* ================= PESAN (admin <-> orang tua) ================= */
async function screenPesan(content) {
  const s = S.session;
  content.innerHTML = '';
  if (s.role !== 'orangtua') {
    const siswaRes = await api('siswa_list');
    const form = el(`
      <div class="card">
        <h3>Kirim Pesan/Surat ke Orang Tua</h3>
        <div class="field"><label>Pilih Siswa</label><select id="pesan-siswa">${(siswaRes.data || []).map((x) => `<option value="${x.NISN}">${x.Nama}</option>`).join('')}</select></div>
        <div class="field"><label>URL Foto/Scan Surat</label><input id="pesan-foto" placeholder="https://... (unggah dulu ke Drive lalu tempel link)"></div>
        <button class="btn" id="btn-kirim-pesan">Kirim ke Orang Tua</button>
      </div>`);
    content.appendChild(form);
    qs('#btn-kirim-pesan', form).onclick = async () => {
      const nisn = qs('#pesan-siswa', form).value; const foto = qs('#pesan-foto', form).value.trim();
      if (!foto) return toast('Tempel URL foto surat terlebih dahulu');
      const r = await api('pesan_create', { nisn, fotoSuratURL: foto });
      if (r.ok) { toast('Pesan terkirim ke orang tua'); loadScreen('pesan', content); }
    };
  }

  const listRes = await api('pesan_list');
  const listCard = el(`<div class="card"><h3>${s.role === 'orangtua' ? 'Pesan dari Anak Anda' : 'Riwayat Pesan Terkirim'}</h3><div id="pesan-list"></div></div>`);
  content.appendChild(listCard);
  const box = qs('#pesan-list', listCard);
  (listRes.data || []).slice().reverse().forEach((m) => {
    const row = el(`
      <div class="card" style="background:#f8fafc;">
        <strong>${m.NamaSiswa}</strong> <span style="font-size:12px;color:var(--muted);">${m.TglKirim}</span>
        <div><a href="${m.FotoSuratURL}" target="_blank">Lihat surat</a></div>
        ${m.BalasanOrangTua ? `<p style="margin-top:8px;background:#e0e7ff;padding:8px;border-radius:8px;">💬 ${m.BalasanOrangTua}</p>` :
          (s.role === 'orangtua' ? `<div style="margin-top:8px;"><textarea data-balas-input="${m.ID}" rows="2" placeholder="Tulis balasan..."></textarea><button class="btn small" data-balas-btn="${m.ID}">Kirim Balasan</button></div>` :
          `<p style="color:var(--muted);font-size:13px;">Menunggu balasan orang tua</p>`)}
      </div>`);
    box.appendChild(row);
  });
  qsa('[data-balas-btn]', box).forEach((b) => b.onclick = async () => {
    const teks = qs(`[data-balas-input="${b.dataset.balasBtn}"]`, box).value.trim();
    if (!teks) return toast('Tulis balasan terlebih dahulu');
    const r = await api('pesan_balas', { id: b.dataset.balasBtn, teks });
    if (r.ok) { toast('Balasan terkirim'); loadScreen('pesan', content); }
  });
}

/* ---------------- Helper: QR scan modal (dipakai fitur pilih siswa via QR) ---------------- */
function openQrScanModal(onResult) {
  const overlay = el(`<div class="modal-overlay"><div class="modal-box"><h3>Scan QR Siswa</h3><div id="modal-qr-reader"></div><button class="btn secondary" id="btn-tutup-scan" style="margin-top:10px;">Tutup</button></div></div>`);
  document.body.appendChild(overlay);
  startQrScanner('modal-qr-reader', async (text) => {
    await stopActiveScanner();
    overlay.remove();
    onResult(text);
  });
  qs('#btn-tutup-scan', overlay).onclick = async () => { await stopActiveScanner(); overlay.remove(); };
}

function tampilkanQrModal(payload, label) {
  const overlay = el(`<div class="modal-overlay"><div class="modal-box" style="text-align:center;"><h3>QR — ${label}</h3><div id="modal-qr-out" style="display:flex;justify-content:center;margin:14px 0;"></div><button class="btn secondary" id="btn-tutup-qr">Tutup</button></div></div>`);
  document.body.appendChild(overlay);
  new QRCode(qs('#modal-qr-out', overlay), { text: payload, width: 200, height: 200 });
  qs('#btn-tutup-qr', overlay).onclick = () => overlay.remove();
}

/* ---------------- Helper: cetak A4 ---------------- */
function kopSuratHtml() {
  return `
    <div class="kop-surat">
      <img src="${CONFIG.LOGO_URL}">
      <div class="kop-text">
        <h2>${CONFIG.SCHOOL_NAME}</h2>
        <p>Sekolah Berasrama · "${CONFIG.TAGLINE}"</p>
        <p>Kota Pasuruan, Jawa Timur</p>
      </div>
    </div>`;
}
function todayIndo() {
  return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
function printHtml(innerHtml) {
  const area = qs('#print-area');
  area.innerHTML = innerHtml;
  // render semua slot QR tanda tangan yang ditandai data-qr
  qsa('[data-qr]', area).forEach((slot) => { new QRCode(slot, { text: slot.dataset.qr, width: 90, height: 90 }); });
  setTimeout(() => window.print(), 200);
}
