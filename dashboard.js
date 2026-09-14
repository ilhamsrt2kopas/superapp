import { CONFIG, S, api, el, qs, qsa, toast, debounce, renderQrLauncher, stopActiveScanner,
         applyTheme, getTheme, openMultiSelectModal, invalidateCache, invalidateBarangCache,
         kopSuratHtml, todayIndo, printHtml } from './shared.js';

export function mountDashboardApp() {
  window.addEventListener('hashchange', renderShell);
  if (!location.hash || location.hash === '#/welcome' || location.hash === '#/login') location.hash = '#/dashboard';
  renderShell();
}

async function doLogout() {
  await api('logout');
  S.clear();
  location.href = location.pathname; // reload bersih, kembali ke landing.js
}

function initialsOf(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase(); }

function getMenu() {
  const s = S.session;
  if (s.role === 'orangtua') return [
    { id: 'pengumuman', label: 'Pengumuman', icon: '📢' },
    { id: 'pesan', label: 'Pesan', icon: '✉️' },
    { id: 'profil', label: 'Profil', icon: '👤' }
  ];
  if (s.role === 'siswa') return [
    { id: 'peminjaman', label: 'Peminjaman Barang', icon: '📦' },
    { id: 'rekap', label: 'Rekap Saya', icon: '🧾' }
  ];
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
  if (s.roleDetail === 'Pegawai Berwenang' || s.roleDetail === 'Kepala Sekolah') menu.splice(1, 0, { id: 'persetujuan', label: 'Persetujuan', icon: '✔️' });
  return menu;
}

function renderShell() {
  const app = qs('#app');
  const route = (location.hash || '#/dashboard').replace('#/', '');
  const s = S.session;
  const menu = getMenu();
  const currentLabel = (menu.find((m) => m.id === route) || {}).label || 'Dasbor';

  app.innerHTML = '';
  const wrap = el(`
    <div class="app-shell">
      <div class="drawer-overlay" id="overlay"></div>
      <aside class="drawer" id="drawer">
        <div class="drawer-handle"></div>
        <div class="drawer-header">
          <img src="${CONFIG.LOGO_URL}" class="brand-logo">
          <div><div class="brand-name">${CONFIG.SCHOOL_NAME}</div><div class="brand-tagline">${CONFIG.TAGLINE}</div></div>
        </div>
        <nav id="menu-list" class="menu-list"></nav>
        <button class="menu-item logout-item" id="btn-logout-drawer"><span class="menu-icon">⏻</span><span>Keluar</span></button>
      </aside>
      <div class="main-col">
        <div class="topbar">
          <button class="hamburger" id="btn-menu">☰</button>
          <div class="topbar-title">${currentLabel}</div>
          <div class="user-chip">
            <div class="user-chip-name">${s.profile.Nama || s.identifier}</div>
            <div class="user-chip-sub">${s.identifier} · ${s.roleDetail || s.role}${s.kewenangan ? ' · ' + s.kewenangan : ''}</div>
          </div>
          <button class="theme-toggle" id="btn-theme">${getTheme() === 'dark' ? '☀️' : '🌙'}</button>
          <button class="logout-btn" id="btn-logout" title="Logout">⏻</button>
        </div>
        <main id="content"></main>
      </div>
    </div>`);

  const menuList = qs('#menu-list', wrap);
  menu.forEach((m) => {
    const item = el(`<div class="menu-item ${route === m.id ? 'active' : ''}"><span class="menu-icon">${m.icon}</span><span>${m.label}</span></div>`);
    item.onclick = () => { location.hash = '#/' + m.id; closeDrawer(); };
    menuList.appendChild(item);
  });

  function openDrawer() { qs('#drawer', wrap).classList.add('open'); qs('#overlay', wrap).classList.add('open'); }
  function closeDrawer() { qs('#drawer', wrap).classList.remove('open'); qs('#overlay', wrap).classList.remove('open'); }
  qs('#btn-menu', wrap).onclick = openDrawer;
  qs('#overlay', wrap).onclick = closeDrawer;
  qs('#btn-logout', wrap).onclick = doLogout;
  qs('#btn-logout-drawer', wrap).onclick = doLogout;
  qs('#btn-theme', wrap).onclick = () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    qs('#btn-theme', wrap).textContent = next === 'dark' ? '☀️' : '🌙';
  };

  app.appendChild(wrap);
  loadScreen(route, qs('#content', wrap));
}

const SCREENS = {
  dashboard: screenDashboard, absensi: screenAbsensi, pengumuman: screenPengumuman, perizinan: screenPerizinan,
  konseling: screenKonseling, peminjaman: screenPeminjaman, pengambilan: screenPengambilan, distribusi: screenDistribusi,
  'data-siswa': screenDataSiswa, 'data-petugas': screenDataPetugas, 'data-barang': screenDataBarang,
  profil: screenProfil, rekap: screenRekap, persetujuan: screenPersetujuan, pesan: screenPesan
};
async function loadScreen(route, content) {
  content.innerHTML = '<div class="card">Memuat...</div>';
  const fn = SCREENS[route];
  if (!fn) { content.innerHTML = '<div class="card">Halaman tidak ditemukan.</div>'; return; }
  await fn(content);
}

/* ================= DASHBOARD — ringkas dulu, detail menyusul ================= */
async function screenDashboard(content) {
  const r = await api('dashboard_summary');
  if (!r.ok) { content.innerHTML = `<div class="card">Gagal memuat dasbor: ${r.message} <button class="btn small" id="retry-dash">Coba Lagi</button></div>`; qs('#retry-dash', content).onclick = () => loadScreen('dashboard', content); return; }
  const hadir = Math.max(0, r.totalSiswa - r.siswaTidakHadir.length);
  const persen = r.totalSiswa ? Math.round((hadir / r.totalSiswa) * 100) : 0;
  const items = r.stokBarang.slice().sort((a, b) => Number(b.Stok) - Number(a.Stok)).slice(0, 6);
  const max = Math.max(1, ...items.map((x) => Number(x.Stok) || 0));

  content.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card accent"><div class="stat-number">${persen}%</div><div class="stat-label">Kehadiran (${hadir}/${r.totalSiswa})</div><div class="progress-track"><div class="progress-fill" style="width:${persen}%;"></div></div></div>
      <div class="stat-card"><div class="stat-number">${r.peminjamanHariIni.length}</div><div class="stat-label">Peminjaman Hari Ini</div></div>
      <div class="stat-card"><div class="stat-number">${r.perizinanAktif.length}</div><div class="stat-label">Perizinan Aktif</div></div>
      <div class="stat-card"><div class="stat-number">${r.stokBarang.length}</div><div class="stat-label">Jenis Barang</div></div>
    </div>
    <div class="card"><h3>🚫 Siswa Tidak Hadir</h3>${r.siswaTidakHadir.slice(0, 15).map((x) => `<div class="list-row"><span>${x.Nama}</span><span class="badge bad">${x.Kelas || ''}</span></div>`).join('') || '<div class="empty-state"><div class="empty-icon">✅</div><p>Semua siswa hadir</p></div>'}</div>
    <div class="card"><h3>📦 Peminjaman Hari Ini</h3>${r.peminjamanHariIni.map((x) => `<div class="list-row"><span>${x.Peminjam}</span><span class="badge warn">${x.Status}</span></div>`).join('') || '<div class="empty-state"><div class="empty-icon">📦</div><p>Belum ada</p></div>'}</div>
    <div class="card"><h3>📝 Perizinan Aktif</h3>${r.perizinanAktif.map((x) => `<div class="list-row"><span>${x.DaftarNamaSiswa}</span><span class="badge ok">s/d ${x.TglKembali}</span></div>`).join('') || '<div class="empty-state"><div class="empty-icon">📝</div><p>Tidak ada</p></div>'}</div>
    <div class="card"><h3>📋 Stok Barang</h3><div class="bar-chart">${items.map((x) => `<div class="bar-chart-row"><span class="bar-chart-label">${x.NamaBarang}</span><div class="bar-chart-track"><div class="bar-chart-fill" style="width:${Math.max(4, (x.Stok / max) * 100)}%;"></div></div><span class="bar-chart-value">${x.Stok}</span></div>`).join('')}</div></div>`;
}

/* ================= ABSENSI — QR & manual (tanpa QR) ================= */
async function screenAbsensi(content) {
  content.innerHTML = `
    <div class="card">
      <h3>Absensi Siswa</h3>
      <div class="field"><label>Sesi</label><select id="sesi-select"><option value="1">Sesi 1</option><option value="2">Sesi 2</option><option value="3">Sesi 3</option><option value="4">Sesi 4</option></select></div>
      <div class="login-tabs"><button class="active" data-mode="qr">Scan QR</button><button data-mode="manual">Pilih Manual</button></div>
      <div id="absen-body"></div>
      <div id="scan-result" style="margin-top:10px;"></div>
    </div>
    <div class="card"><h3>Riwayat Hari Ini</h3><div id="riwayat"></div></div>`;

  async function refreshRiwayat() {
    const r = await api('absensi_list', {});
    qs('#riwayat', content).innerHTML = (r.data || []).slice().reverse().slice(0, 30).map((a) =>
      `<div class="list-row"><span>${a.NamaSiswa} (Sesi ${a.Sesi})</span><span class="badge ${a.Status === 'Hadir' ? 'ok' : 'warn'}">${a.Status}</span></div>`
    ).join('') || '<div class="empty-state"><p>Belum ada data</p></div>';
  }
  refreshRiwayat();

  function tampilHasil(r) {
    const box = qs('#scan-result', content);
    if (r.ok) box.innerHTML = `<div class="badge ok" style="font-size:13px;padding:8px 14px;">✅ ${r.nama} — ${r.message}</div>`;
    else if (r.butuhKeterangan) {
      box.innerHTML = `<div class="badge bad" style="font-size:12.5px;padding:8px 14px;">⚠️ ${r.message}</div>`;
      renderKeteranganForm(box, r);
    } else box.innerHTML = `<div class="badge bad" style="font-size:12.5px;padding:8px 14px;">${r.message}</div>`;
    refreshRiwayat();
  }

  function renderKeteranganForm(box, r) {
    const form = el(`
      <div class="field"><label>Keterangan Sesi ${r.sesiTertinggal}</label><select id="ket-status"><option value="Izin">Izin</option><option value="Sakit">Sakit</option><option value="Alpa">Alpa</option></select></div>
      <button class="btn small" id="btn-simpan-ket">Simpan</button>`);
    box.appendChild(form);
    qs('#btn-simpan-ket', box).onclick = async () => {
      const status = qs('#ket-status', box).value;
      const rr = await api('absensi_isi_keterangan', { nisn: r._nisn, sesi: r.sesiTertinggal, status, keterangan: '' });
      toast(rr.ok ? 'Keterangan tersimpan' : rr.message);
    };
  }

  async function showQrMode() {
    const body = qs('#absen-body', content);
    body.innerHTML = `<div id="qr-area"></div>`;
    renderQrLauncher(qs('#qr-area', body), async (text) => {
      const nisn = text.split(' - ')[0].trim();
      const sesi = qs('#sesi-select', content).value;
      const r = await api('absensi_scan', { qrText: text, sesi });
      r._nisn = nisn;
      tampilHasil(r);
    });
  }

  let siswaCache = null;
  async function showManualMode() {
    const body = qs('#absen-body', content);
    body.innerHTML = `<input class="search-box" id="cari-manual" placeholder="Cari nama/NISN..."><div id="manual-list" style="max-height:280px;overflow-y:auto;"></div>`;
    if (!siswaCache) siswaCache = (await api('siswa_list')).data || [];
    function renderList(q = '') {
      const filtered = siswaCache.filter((s) => (s.Nama + s.NISN + s.Kelas).toLowerCase().includes(q.toLowerCase())).slice(0, 40);
      qs('#manual-list', body).innerHTML = filtered.map((s) => `
        <div class="list-row"><span>${s.Nama} <span class="muted-text">(${s.Kelas || '-'})</span></span><button class="btn small" data-manual-nisn="${s.NISN}" data-manual-nama="${s.Nama}">Hadir</button></div>`).join('');
      qsa('[data-manual-nisn]', body).forEach((btn) => btn.onclick = async () => {
        const sesi = qs('#sesi-select', content).value;
        const r = await api('absensi_manual', { nisn: btn.dataset.manualNisn, nama: btn.dataset.manualNama, sesi });
        r._nisn = btn.dataset.manualNisn;
        tampilHasil(r);
      });
    }
    renderList();
    qs('#cari-manual', body).addEventListener('input', debounce((e) => renderList(e.target.value), 150));
  }

  qsa('.login-tabs button', content).forEach((btn) => {
    btn.onclick = async () => {
      await stopActiveScanner();
      qsa('.login-tabs button', content).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      btn.dataset.mode === 'qr' ? showQrMode() : showManualMode();
    };
  });
  showQrMode();
}

/* ================= PENGUMUMAN ================= */
async function screenPengumuman(content) {
  const s = S.session;
  content.innerHTML = '';
  if (s.role !== 'orangtua') {
    content.appendChild(el(`
      <div class="card"><h3>Buat Pengumuman</h3>
        <div class="field"><label>Judul</label><input id="p-judul"></div>
        <div class="field"><label>Isi</label><textarea id="p-isi" rows="4"></textarea></div>
        <div class="field"><label>URL Scan Pengumuman (opsional)</label><input id="p-lampiran" placeholder="https://..."></div>
        <button class="btn" id="btn-buat-peng">Simpan Draft</button>
      </div>`));
    qs('#btn-buat-peng', content).onclick = async () => {
      const judul = qs('#p-judul', content).value.trim(), isi = qs('#p-isi', content).value.trim();
      if (!judul || !isi) return toast('Judul dan isi wajib diisi');
      const r = await api('pengumuman_create', { judul, isi, lampiranURL: qs('#p-lampiran', content).value.trim() });
      if (r.ok) { toast('Draft tersimpan'); loadScreen('pengumuman', content); }
    };
  }
  const list = await api('pengumuman_list');
  const box = el(`<div class="card"><h3>Daftar Pengumuman</h3><div id="peng-list"></div></div>`);
  content.appendChild(box);
  const listBox = qs('#peng-list', box);
  (list.data || []).slice().reverse().forEach((p) => {
    const badge = { Draft: 'warn', Diajukan: 'warn', Terbit: 'ok', Ditolak: 'bad' }[p.Status] || 'warn';
    listBox.appendChild(el(`
      <div class="list-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;"><strong>${p.Judul}</strong><span class="badge ${badge}">${p.Status}</span></div>
        <p style="margin:6px 0;font-size:13px;">${p.Isi}</p>
        ${p.Status === 'Draft' && s.role !== 'orangtua' ? `<button class="btn small" data-ajukan="${p.ID}">Ajukan ke Humas</button>` : ''}
      </div>`));
  });
  qsa('[data-ajukan]', listBox).forEach((btn) => btn.onclick = async () => { await api('pengumuman_ajukan', { id: btn.dataset.ajukan }); loadScreen('pengumuman', content); });
}

/* ================= Helper: buka picker siswa dikelompokkan per Jenjang ================= */
async function pickSiswa({ multiple = true, title = 'Pilih Siswa' } = {}) {
  const r = await api('siswa_list');
  const byJenjang = {};
  (r.data || []).forEach((s) => { (byJenjang[s.Jenjang || 'Lainnya'] = byJenjang[s.Jenjang || 'Lainnya'] || []).push(s); });
  const groups = Object.keys(byJenjang).map((j) => ({ name: j, items: byJenjang[j].map((s) => ({ id: s.NISN, label: `${s.Nama} (${s.Kelas || '-'})`, raw: s })) }));
  return new Promise((resolve) => openMultiSelectModal({ title, groups, multiple, onConfirm: (sel) => resolve(sel.map((x) => ({ nisn: x.id, nama: x.raw.Nama }))) }));
}
// Helper: buka picker barang dikelompokkan per Kategori (tipe: 'pinjam' | 'ambil')
async function pickBarang({ tipe = 'pinjam', title = 'Pilih Barang' } = {}) {
  const r = await api(tipe === 'pinjam' ? 'barang_list_pinjam' : 'barang_list_ambil');
  const byKat = {};
  (r.data || []).forEach((b) => { (byKat[b.Kategori || 'Lainnya'] = byKat[b.Kategori || 'Lainnya'] || []).push(b); });
  const groups = Object.keys(byKat).map((k) => ({ name: k, items: byKat[k].map((b) => ({ id: b.KodeBarang, label: `${b.NamaBarang} (stok: ${b.Stok})`, raw: b })) }));
  return new Promise((resolve) => openMultiSelectModal({ title, groups, multiple: true, onConfirm: (sel) => resolve(sel.map((x) => ({ kode: x.id, nama: x.raw.NamaBarang, stok: Number(x.raw.Stok) }))) }));
}

/* ================= PERIZINAN SISWA ================= */
async function screenPerizinan(content) {
  let siswaTerpilih = [];
  content.innerHTML = `
    <div class="card">
      <h3>Form Perizinan Siswa</h3>
      <button class="btn small secondary" id="btn-pilih-siswa">👥 Pilih Siswa</button>
      <div id="chip-siswa" style="margin:8px 0;"></div>
      <div class="grid-2">
        <div class="field"><label>Tanggal Mulai</label><input type="date" id="izin-tgl-mulai"></div>
        <div class="field"><label>Jam Mulai</label><input type="time" id="izin-jam-mulai"></div>
        <div class="field"><label>Tanggal Kembali</label><input type="date" id="izin-tgl-kembali"></div>
        <div class="field"><label>Jam Kembali</label><input type="time" id="izin-jam-kembali"></div>
      </div>
      <div class="field"><label>Keperluan</label><textarea id="izin-keperluan" rows="3"></textarea></div>
      <p class="muted-text">Siswa yang dipilih diajukan dalam satu pengajuan dengan rincian yang sama.</p>
      <button class="btn" id="btn-ajukan-izin">Ajukan ke Kepala UKS</button>
    </div>
    <div class="card"><h3>Riwayat Perizinan</h3><div id="izin-list"></div></div>`;

  function renderChips() { qs('#chip-siswa', content).innerHTML = siswaTerpilih.map((s) => `<span class="chip">${s.nama}</span>`).join(''); }
  qs('#btn-pilih-siswa', content).onclick = async () => { siswaTerpilih = await pickSiswa({ title: 'Pilih Siswa untuk Diizinkan' }); renderChips(); };

  qs('#btn-ajukan-izin', content).onclick = async () => {
    if (siswaTerpilih.length === 0) return toast('Pilih minimal 1 siswa');
    const payload = {
      daftarSiswa: siswaTerpilih, tglMulai: qs('#izin-tgl-mulai', content).value, jamMulai: qs('#izin-jam-mulai', content).value,
      tglKembali: qs('#izin-tgl-kembali', content).value, jamKembali: qs('#izin-jam-kembali', content).value, keperluan: qs('#izin-keperluan', content).value
    };
    if (!payload.tglMulai || !payload.tglKembali || !payload.keperluan) return toast('Lengkapi semua isian');
    const r = await api('perizinan_create', payload);
    if (r.ok) { toast('Pengajuan izin terkirim'); loadScreen('perizinan', content); }
  };

  const listRes = await api('perizinan_list');
  const listBox = qs('#izin-list', content);
  (listRes.data || []).slice().reverse().forEach((rec) => {
    const badge = { Diajukan: 'warn', Disetujui: 'ok', Ditolak: 'bad' }[rec.Status] || 'warn';
    listBox.appendChild(el(`
      <div class="list-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;"><strong>${rec.DaftarNamaSiswa}</strong><span class="badge ${badge}">${rec.Status}</span></div>
        <p style="margin:6px 0;font-size:12.5px;">${rec.Keperluan} · ${rec.TglMulai} → ${rec.TglKembali}</p>
        ${rec.Status === 'Disetujui' ? `<button class="btn small" data-cetak="${rec.ID}">🖨️ Cetak</button>` : ''}
      </div>`));
  });
  qsa('[data-cetak]', listBox).forEach((btn) => btn.onclick = () => cetakPerizinan(btn.dataset.cetak));
}

async function cetakPerizinan(id) {
  let r = await api('perizinan_print_data', { id });
  if (!r.ok && r.butuhNomorSurat) {
    const nomorSurat = prompt('Masukkan nomor surat untuk pengajuan ini:');
    if (!nomorSurat) return;
    r = await api('perizinan_print_data', { id, nomorSurat });
  }
  if (!r.ok) return toast(r.message);
  const sheets = r.lembar.map((L) => `
    <div class="print-sheet page-break">
      ${kopSuratHtml()}
      <p class="surat-nomor">SURAT IZIN SISWA<br>Nomor: ${L.nomorSurat}</p>
      <table style="width:100%;margin:10px 0;">
        <tr><td style="width:150px;">Nama</td><td>: ${L.nama}</td></tr><tr><td>NISN</td><td>: ${L.nisn}</td></tr>
        <tr><td>Kelas / Jenjang</td><td>: ${L.kelas || ''} / ${L.jenjang || ''}</td></tr>
        <tr><td>Keperluan</td><td>: ${L.keperluan}</td></tr>
        <tr><td>Waktu Mulai</td><td>: ${L.tglMulai} ${L.jamMulai}</td></tr>
        <tr><td>Rencana Kembali</td><td>: ${L.tglKembali} ${L.jamKembali}</td></tr>
      </table>
      <div class="ttd-block"><div class="ttd-col"></div>
        <div class="ttd-col"><p>Pasuruan, ${todayIndo()}<br>${L.ttdJabatan},</p><div data-qr="${L.ttdQrPayload}"></div><p><strong>${L.ttdNama}</strong></p></div>
      </div>
    </div>`).join('');
  await printHtml(sheets);
}

/* ================= KONSELING SISWA ================= */
async function screenKonseling(content) {
  let siswaTerpilih = [];
  content.innerHTML = `
    <div class="card">
      <h3>Form Konseling Siswa</h3>
      <button class="btn small secondary" id="btn-pilih-siswa-k">👥 Pilih Siswa</button>
      <div id="chip-siswa-k" style="margin:8px 0;"></div>
      <div class="field"><label>Rincian Masalah</label><textarea id="k-masalah" rows="3"></textarea></div>
      <div class="field"><label>Dampak yang Dirasakan</label><textarea id="k-dampak" rows="2"></textarea></div>
      <div class="field"><label>Solusi</label><textarea id="k-solusi" rows="2"></textarea></div>
      <button class="btn" id="btn-simpan-kons">Simpan Laporan</button>
    </div>
    <div class="card"><h3>Riwayat Konseling</h3><div id="kons-list"></div></div>`;

  function renderChips() { qs('#chip-siswa-k', content).innerHTML = siswaTerpilih.map((s) => `<span class="chip">${s.nama}</span>`).join(''); }
  qs('#btn-pilih-siswa-k', content).onclick = async () => { siswaTerpilih = await pickSiswa({ title: 'Pilih Siswa untuk Konseling' }); renderChips(); };

  qs('#btn-simpan-kons', content).onclick = async () => {
    if (siswaTerpilih.length === 0) return toast('Pilih minimal 1 siswa');
    const r = await api('konseling_create', { daftarSiswa: siswaTerpilih, rincianMasalah: qs('#k-masalah', content).value, dampakDirasakan: qs('#k-dampak', content).value, solusi: qs('#k-solusi', content).value });
    if (r.ok) { toast('Laporan tersimpan'); loadScreen('konseling', content); }
  };

  const listRes = await api('konseling_list');
  const listBox = qs('#kons-list', content);
  (listRes.data || []).slice().reverse().forEach((rec) => {
    listBox.appendChild(el(`
      <div class="list-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;"><strong>${rec.NamaSiswa}</strong><span class="badge ${rec.StatusSelesai === 'Selesai' ? 'ok' : 'warn'}">${rec.StatusSelesai}</span></div>
        <p style="margin:6px 0;font-size:12.5px;">${rec.RincianMasalah}</p>
        <div>${rec.StatusSelesai !== 'Selesai' ? `<button class="btn small" data-selesai="${rec.ID}">Tandai Selesai</button>` : `<button class="btn small" data-cetak-kons="${rec.ID}">🖨️ Cetak</button>`}</div>
      </div>`));
  });
  qsa('[data-selesai]', listBox).forEach((b) => b.onclick = async () => { await api('konseling_selesai', { id: b.dataset.selesai }); loadScreen('konseling', content); });
  qsa('[data-cetak-kons]', listBox).forEach((b) => b.onclick = () => cetakKonseling(b.dataset.cetakKons));
}

async function cetakKonseling(id) {
  let r = await api('konseling_print_data', { id });
  if (!r.ok && r.butuhNomorSurat) {
    const nomorSurat = prompt('Masukkan nomor surat untuk laporan ini:');
    if (!nomorSurat) return;
    r = await api('konseling_print_data', { id, nomorSurat });
  }
  if (!r.ok) return toast(r.message);
  const html = `
    <div class="print-sheet">
      ${kopSuratHtml()}
      <p class="surat-nomor">LAPORAN KONSELING SISWA<br>Nomor: ${r.nomorSurat}</p>
      <table style="width:100%;margin:10px 0;"><tr><td style="width:150px;">Nama Siswa</td><td>: ${r.nama}</td></tr><tr><td>NISN</td><td>: ${r.nisn}</td></tr></table>
      <p><strong>Rincian Masalah:</strong> ${r.rincianMasalah}</p><p><strong>Dampak:</strong> ${r.dampakDirasakan}</p><p><strong>Solusi:</strong> ${r.solusi}</p>
      <div class="ttd-block">
        <div class="ttd-col"><p>Siswa,</p><div data-qr="${r.ttdSiswaQrPayload}"></div><p><strong>${r.nama}</strong></p></div>
        <div class="ttd-col"><p>Pasuruan, ${todayIndo()}<br>${r.ttdAdminJabatan || 'Guru/Pegawai'},</p><div data-qr="${r.ttdAdminQrPayload}"></div><p><strong>${r.ttdAdminNama}</strong></p></div>
      </div>
    </div>`;
  await printHtml(html);
}

/* ================= PEMINJAMAN / PENGAMBILAN / DISTRIBUSI ================= */
async function screenPeminjaman(content) {
  let barangTerpilih = [];
  content.innerHTML = `
    <div class="card">
      <h3>Form Peminjaman Barang</h3>
      <button class="btn small secondary" id="btn-pilih-barang">📦 Pilih Barang</button>
      <div id="qty-barang" style="margin:10px 0;"></div>
      <div class="field"><label>Rencana Tanggal & Waktu Kembali</label><input type="datetime-local" id="pjm-kembali"></div>
      <div class="field"><label>Tujuan Penggunaan</label><textarea id="pjm-tujuan" rows="2"></textarea></div>
      <button class="btn" id="btn-ajukan-pjm">Ajukan ke Sarpras</button>
    </div>
    <div class="card"><h3>Riwayat Peminjaman</h3><div id="pjm-list"></div></div>`;

  function renderQty() {
    qs('#qty-barang', content).innerHTML = barangTerpilih.map((b) => `
      <div class="list-row"><span>${b.nama}</span><input type="number" min="1" max="${b.stok}" value="1" style="width:64px;" data-kode="${b.kode}"></div>`).join('');
  }
  qs('#btn-pilih-barang', content).onclick = async () => { barangTerpilih = await pickBarang({ tipe: 'pinjam', title: 'Pilih Barang untuk Dipinjam' }); renderQty(); };

  qs('#btn-ajukan-pjm', content).onclick = async () => {
    if (barangTerpilih.length === 0) return toast('Pilih minimal 1 barang');
    const items = barangTerpilih.map((b) => ({ kode: b.kode, nama: b.nama, jumlah: Number(qs(`input[data-kode="${b.kode}"]`, content).value) || 1 }));
    const r = await api('peminjaman_create', { daftarBarang: items, rencanaKembali: qs('#pjm-kembali', content).value, tujuanPenggunaan: qs('#pjm-tujuan', content).value });
    if (r.ok) { toast('Pengajuan terkirim ke Sarpras'); invalidateBarangCache(); loadScreen('peminjaman', content); }
  };

  const listRes = await api('peminjaman_list');
  const listBox = qs('#pjm-list', content);
  (listRes.data || []).slice().reverse().forEach((rec) => {
    const badge = { Diajukan: 'warn', Disetujui: 'ok', Ditolak: 'bad' }[rec.Status] || 'warn';
    listBox.appendChild(el(`
      <div class="list-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;"><strong>${rec.ID}</strong><span class="badge ${badge}">${rec.Status} · ${rec.StatusKembali || ''}</span></div>
        <p style="font-size:12.5px;">${(rec.DaftarBarang || []).map((b) => b.nama + ' x' + b.jumlah).join(', ')}</p>
        ${rec.Status === 'Disetujui' && rec.StatusKembali !== 'Lunas' ? `<button class="btn small" data-kembalikan="${rec.ID}">Kembalikan</button>` : ''}
        ${rec.Status === 'Disetujui' ? `<button class="btn small secondary" data-cetak-pjm="${rec.ID}">🖨️ Cetak</button>` : ''}
      </div>`));
  });
  qsa('[data-kembalikan]', listBox).forEach((b) => b.onclick = () => modalKembalikanBarang(b.dataset.kembalikan, content));
  qsa('[data-cetak-pjm]', listBox).forEach((b) => b.onclick = () => cetakPeminjaman(b.dataset.cetakPjm));
}

function modalKembalikanBarang(id, content) {
  const overlay = el(`<div class="modal-overlay"><div class="modal-box"><h3>Pengembalian Barang</h3><div id="kembali-fields"></div>
    <button class="btn" id="btn-simpan-kembali">Simpan</button><button class="btn secondary" id="btn-batal-kembali">Batal</button></div></div>`);
  document.body.appendChild(overlay);
  api('peminjaman_list').then((r) => {
    const rec = (r.data || []).find((x) => x.ID === id);
    if (!rec) return;
    qs('#kembali-fields', overlay).innerHTML = (rec.DaftarBarang || []).map((b) =>
      `<div class="list-row"><span>${b.nama} (sisa: ${b.jumlah - (b.sudahKembali || 0)})</span><input type="number" min="0" max="${b.jumlah - (b.sudahKembali || 0)}" data-kode="${b.kode}" style="width:64px;"></div>`).join('');
  });
  qs('#btn-batal-kembali', overlay).onclick = () => overlay.remove();
  qs('#btn-simpan-kembali', overlay).onclick = async () => {
    const items = qsa('input[data-kode]', overlay).filter((i) => Number(i.value) > 0).map((i) => ({ kode: i.dataset.kode, jumlahKembali: Number(i.value) }));
    const r = await api('peminjaman_kembalikan', { id, pengembalian: items });
    overlay.remove();
    if (r.ok) { toast(r.lunas ? 'Barang kembali sepenuhnya' : 'Sebagian tercatat kembali'); invalidateBarangCache(); loadScreen('peminjaman', content); }
  };
}

async function cetakPeminjaman(id) {
  let r = await api('peminjaman_print_data', { id });
  if (!r.ok && r.butuhNomorSurat) {
    const nomorSurat = prompt('Masukkan nomor surat:');
    if (!nomorSurat) return;
    r = await api('peminjaman_print_data', { id, nomorSurat });
  }
  if (!r.ok) return toast(r.message);
  const html = `
    <div class="print-sheet">
      ${kopSuratHtml()}
      <p class="surat-nomor">BUKTI PEMINJAMAN BARANG<br>Nomor: ${r.nomorSurat}</p>
      <p><strong>Peminjam:</strong> ${r.peminjam}</p>
      <table style="width:100%;margin:10px 0;"><tr><th>Barang</th><th>Jumlah</th></tr>${r.daftarBarang.map((b) => `<tr><td>${b.nama}</td><td>${b.jumlah}</td></tr>`).join('')}</table>
      <p>Tujuan: ${r.tujuanPenggunaan}</p><p>Pinjam: ${r.tglPinjam} · Rencana Kembali: ${r.rencanaKembali}${r.tglKembaliAktual ? ' · Kembali: ' + r.tglKembaliAktual : ''}</p>
      <div class="ttd-block">
        <div class="ttd-col"><p>Peminjam,</p><div data-qr="${r.ttdPeminjamQrPayload}"></div><p><strong>${r.peminjam}</strong></p></div>
        <div class="ttd-col"><p>Pasuruan, ${todayIndo()}<br>Sarpras,</p><div data-qr="${r.ttdSarprasQrPayload}"></div><p><strong>${r.ttdSarprasNama}</strong></p></div>
      </div>
    </div>`;
  await printHtml(html);
}

async function screenPengambilan(content) {
  let barangTerpilih = [];
  content.innerHTML = `<div class="card"><h3>Form Pengambilan Barang</h3><button class="btn small secondary" id="btn-pilih-ambil">📦 Pilih Barang</button><div id="qty-ambil" style="margin:10px 0;"></div><button class="btn" id="btn-ambil">Ambil Barang</button></div>`;
  function renderQty() { qs('#qty-ambil', content).innerHTML = barangTerpilih.map((b) => `<div class="list-row"><span>${b.nama}</span><input type="number" min="1" max="${b.stok}" value="1" style="width:64px;" data-kode="${b.kode}"></div>`).join(''); }
  qs('#btn-pilih-ambil', content).onclick = async () => { barangTerpilih = await pickBarang({ tipe: 'ambil', title: 'Pilih Barang untuk Diambil' }); renderQty(); };
  qs('#btn-ambil', content).onclick = async () => {
    if (barangTerpilih.length === 0) return toast('Pilih minimal 1 barang');
    const items = barangTerpilih.map((b) => ({ kode: b.kode, jumlah: Number(qs(`input[data-kode="${b.kode}"]`, content).value) || 1 }));
    const r = await api('pengambilan_create', { daftarBarang: items });
    if (r.ok) { toast('Barang berhasil diambil'); invalidateBarangCache(); loadScreen('pengambilan', content); } else toast(r.message);
  };
}

async function screenDistribusi(content) {
  let siswaTerpilih = [], barangTerpilih = [];
  content.innerHTML = `
    <div class="card">
      <h3>Form Distribusi Barang</h3>
      <button class="btn small secondary" id="btn-pilih-siswa-d">👥 Pilih Siswa Penerima</button>
      <div id="chip-siswa-d" style="margin:8px 0;"></div>
      <button class="btn small secondary" id="btn-pilih-barang-d">📦 Pilih Barang</button>
      <div id="jumlah-per-anak" style="margin-top:10px;"></div>
      <button class="btn" id="btn-bagikan">Bagikan Barang</button>
    </div>`;
  function renderJumlah() {
    qs('#jumlah-per-anak', content).innerHTML = siswaTerpilih.map((s) => `
      <div class="card card-sub"><strong>${s.nama}</strong>
        ${barangTerpilih.map((b) => `<div class="list-row"><span>${b.nama}</span><input type="number" min="0" max="${b.stok}" style="width:60px;" data-nisn="${s.nisn}" data-kode="${b.kode}"></div>`).join('')}
      </div>`).join('');
  }
  qs('#btn-pilih-siswa-d', content).onclick = async () => { siswaTerpilih = await pickSiswa({ title: 'Pilih Siswa Penerima' }); qs('#chip-siswa-d', content).innerHTML = siswaTerpilih.map((s) => `<span class="chip">${s.nama}</span>`).join(''); renderJumlah(); };
  qs('#btn-pilih-barang-d', content).onclick = async () => { barangTerpilih = await pickBarang({ tipe: 'ambil', title: 'Pilih Barang untuk Dibagikan' }); renderJumlah(); };
  qs('#btn-bagikan', content).onclick = async () => {
    if (siswaTerpilih.length === 0) return toast('Pilih minimal 1 siswa');
    const perAnak = {};
    siswaTerpilih.forEach((s) => { perAnak[s.nisn] = qsa(`input[data-nisn="${s.nisn}"]`, content).filter((i) => Number(i.value) > 0).map((i) => ({ kode: i.dataset.kode, jumlah: Number(i.value) })); });
    const r = await api('distribusi_create', { daftarSiswa: siswaTerpilih, daftarBarangPerAnak: perAnak });
    if (r.ok) { toast('Barang berhasil dibagikan'); invalidateBarangCache(); loadScreen('distribusi', content); } else toast(r.message);
  };
}

/* ================= DATA SISWA / PETUGAS / BARANG — tanpa QR ================= */
async function screenDataSiswa(content) {
  const r = await api('siswa_list');
  const data = r.data || [];
  content.innerHTML = `<div class="card"><h3>Data Siswa</h3><input class="search-box" id="cari-siswa-data" placeholder="Cari...">
    <div class="table-wrap"><table><thead><tr><th>NISN</th><th>Nama</th><th>Jenjang</th><th>Kelas</th><th>Alamat</th><th>No HP Wali</th></tr></thead><tbody id="tb-siswa"></tbody></table></div></div>`;
  function renderRows(list) {
    qs('#tb-siswa', content).innerHTML = list.map((s) => `<tr><td>${s.NISN}</td><td>${s.Nama}</td><td>${s.Jenjang || ''}</td><td>${s.Kelas || ''}</td><td>${s.Alamat || ''}</td><td>${s.NoHPWali || ''}</td></tr>`).join('');
  }
  renderRows(data);
  qs('#cari-siswa-data', content).addEventListener('input', debounce((e) => renderRows(data.filter((s) => Object.values(s).join(' ').toLowerCase().includes(e.target.value.toLowerCase()))), 150));
}
async function screenDataPetugas(content) {
  const r = await api('petugas_list');
  const data = r.data || [];
  content.innerHTML = `<div class="card"><h3>Data Petugas</h3><input class="search-box" id="cari-petugas" placeholder="Cari...">
    <div class="table-wrap"><table><thead><tr><th>NIP</th><th>Nama</th><th>Jabatan</th><th>No HP</th></tr></thead><tbody id="tb-petugas"></tbody></table></div></div>`;
  function renderRows(list) { qs('#tb-petugas', content).innerHTML = list.map((p) => `<tr><td>${p.NIP}</td><td>${p.Nama}</td><td>${p.Jabatan || p.Role}</td><td>${p.NoHP || ''}</td></tr>`).join(''); }
  renderRows(data);
  qs('#cari-petugas', content).addEventListener('input', debounce((e) => renderRows(data.filter((p) => Object.values(p).join(' ').toLowerCase().includes(e.target.value.toLowerCase()))), 150));
}
async function screenDataBarang(content) {
  const r = await api('barang_list');
  const data = r.data || [];
  content.innerHTML = `<div class="card"><h3>Data Barang</h3><input class="search-box" id="cari-barang" placeholder="Cari...">
    <div class="table-wrap"><table><thead><tr><th>Kategori</th><th>Nama Barang</th><th>Stok</th><th>Pinjam</th><th>Ambil</th></tr></thead><tbody id="tb-barang"></tbody></table></div></div>`;
  function renderRows(list) { qs('#tb-barang', content).innerHTML = list.map((b) => `<tr><td>${b.Kategori}</td><td>${b.NamaBarang}</td><td>${b.Stok}</td><td>${b.BolehDipinjam}</td><td>${b.BolehDiambil}</td></tr>`).join(''); }
  renderRows(data);
  qs('#cari-barang', content).addEventListener('input', debounce((e) => renderRows(data.filter((b) => Object.values(b).join(' ').toLowerCase().includes(e.target.value.toLowerCase()))), 150));
}

/* ================= PROFIL — tanpa QR ================= */
async function screenProfil(content) {
  const s = S.session;
  content.innerHTML = `
    <div class="card"><h3>Profil</h3>
      <p><strong>Nama:</strong> ${s.profile.Nama}</p><p><strong>Identitas:</strong> ${s.identifier}</p>
      <p><strong>Jabatan/Role:</strong> ${s.roleDetail || s.role} ${s.kewenangan ? '(' + s.kewenangan + ')' : ''}</p>
    </div>
    ${s.role === 'admin' ? `<div class="card"><h3>Ganti Password</h3>
      <div class="field"><label>Password Lama</label><input type="password" id="pass-lama"></div>
      <div class="field"><label>Password Baru</label><input type="password" id="pass-baru"></div>
      <button class="btn" id="btn-ganti-pass">Simpan</button></div>` : `<div class="card"><p class="muted-text">Akun ini login menggunakan QR saja.</p></div>`}`;
  if (qs('#btn-ganti-pass', content)) qs('#btn-ganti-pass', content).onclick = async () => {
    const r = await api('change_password', { oldPass: qs('#pass-lama', content).value, newPass: qs('#pass-baru', content).value });
    toast(r.ok ? 'Password berhasil diubah' : r.message);
  };
}

/* ================= REKAP & PERSETUJUAN ================= */
async function screenRekap(content) {
  const r = await api('rekap_saya');
  content.innerHTML = `
    <div class="card"><h3>Peminjaman (${(r.peminjaman || []).length})</h3>${(r.peminjaman || []).map((x) => `<div class="list-row"><span>${x.ID}</span><span class="badge ${x.Status === 'Disetujui' ? 'ok' : 'warn'}">${x.Status}</span></div>`).join('') || '<div class="empty-state"><p>Belum ada</p></div>'}</div>
    <div class="card"><h3>Perizinan (${(r.perizinan || []).length})</h3>${(r.perizinan || []).map((x) => `<div class="list-row"><span>${x.DaftarNamaSiswa}</span><span class="badge ${x.Status === 'Disetujui' ? 'ok' : 'warn'}">${x.Status}</span></div>`).join('') || '<div class="empty-state"><p>Belum ada</p></div>'}</div>
    <div class="card"><h3>Konseling (${(r.konseling || []).length})</h3>${(r.konseling || []).map((x) => `<div class="list-row"><span>${x.NamaSiswa}</span><span class="badge ${x.StatusSelesai === 'Selesai' ? 'ok' : 'warn'}">${x.StatusSelesai}</span></div>`).join('') || '<div class="empty-state"><p>Belum ada</p></div>'}</div>`;
}

async function screenPersetujuan(content) {
  const r = await api('persetujuan_list');
  content.innerHTML = '';
  const buatBlok = (judul, items, tipe) => {
    const box = el(`<div class="card"><h3>${judul} (${items.length})</h3><div id="blok-${tipe}"></div></div>`);
    const inner = qs(`#blok-${tipe}`, box);
    items.forEach((it) => {
      const label = tipe === 'perizinan' ? it.DaftarNamaSiswa : tipe === 'peminjaman' ? it.Peminjam : it.Judul;
      inner.appendChild(el(`<div class="list-row" style="flex-direction:column;align-items:flex-start;"><strong>${label}</strong>
        <div><button class="btn small" data-setuju="${it.ID}" data-tipe="${tipe}">Setujui</button><button class="btn small danger" data-tolak="${it.ID}" data-tipe="${tipe}">Tolak</button></div></div>`));
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

/* ================= PESAN ================= */
async function screenPesan(content) {
  const s = S.session;
  content.innerHTML = '';
  if (s.role !== 'orangtua') {
    content.appendChild(el(`<div class="card"><h3>Kirim Pesan/Surat ke Orang Tua</h3>
      <button class="btn small secondary" id="btn-pilih-siswa-pesan">👤 Pilih Siswa</button>
      <div id="chip-siswa-pesan" style="margin:8px 0;"></div>
      <div class="field"><label>URL Foto/Scan Surat</label><input id="pesan-foto" placeholder="https://..."></div>
      <button class="btn" id="btn-kirim-pesan">Kirim ke Orang Tua</button></div>`));
    let siswaTerpilih = null;
    qs('#btn-pilih-siswa-pesan', content).onclick = async () => {
      const sel = await pickSiswa({ multiple: false, title: 'Pilih Siswa' });
      siswaTerpilih = sel[0] || null;
      qs('#chip-siswa-pesan', content).innerHTML = siswaTerpilih ? `<span class="chip">${siswaTerpilih.nama}</span>` : '';
    };
    qs('#btn-kirim-pesan', content).onclick = async () => {
      const foto = qs('#pesan-foto', content).value.trim();
      if (!siswaTerpilih) return toast('Pilih siswa dahulu');
      if (!foto) return toast('Tempel URL foto surat');
      const r = await api('pesan_create', { nisn: siswaTerpilih.nisn, fotoSuratURL: foto });
      if (r.ok) { toast('Pesan terkirim'); loadScreen('pesan', content); }
    };
  }
  const listRes = await api('pesan_list');
  const listCard = el(`<div class="card"><h3>${s.role === 'orangtua' ? 'Pesan dari Anak Anda' : 'Riwayat Pesan Terkirim'}</h3><div id="pesan-list"></div></div>`);
  content.appendChild(listCard);
  const box = qs('#pesan-list', listCard);
  (listRes.data || []).slice().reverse().forEach((m) => {
    box.appendChild(el(`
      <div class="card card-sub">
        <strong>${m.NamaSiswa}</strong> <span class="muted-text">${m.TglKirim}</span>
        <div><a href="${m.FotoSuratURL}" target="_blank">Lihat surat</a></div>
        ${m.BalasanOrangTua ? `<p class="bubble-reply">💬 ${m.BalasanOrangTua}</p>` :
          (s.role === 'orangtua' ? `<div style="margin-top:8px;"><textarea data-balas-input="${m.ID}" rows="2" placeholder="Tulis balasan..."></textarea><button class="btn small" data-balas-btn="${m.ID}">Kirim Balasan</button></div>` :
          `<p class="muted-text">Menunggu balasan orang tua</p>`)}
      </div>`));
  });
  qsa('[data-balas-btn]', box).forEach((b) => b.onclick = async () => {
    const teks = qs(`[data-balas-input="${b.dataset.balasBtn}"]`, box).value.trim();
    if (!teks) return toast('Tulis balasan dahulu');
    const r = await api('pesan_balas', { id: b.dataset.balasBtn, teks });
    if (r.ok) { toast('Balasan terkirim'); loadScreen('pesan', content); }
  });
}
