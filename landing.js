import { CONFIG, S, api, el, qs, qsa, toast, renderQrLauncher, stopActiveScanner } from './shared.js';

function render() {
  const app = qs('#app');
  if (S.session) { boot(); return; }
  app.innerHTML = '';
  const route = (location.hash || '#/welcome').replace('#/', '');
  app.appendChild(route === 'login' ? screenLogin() : screenWelcome());
}

function screenWelcome() {
  return el(`
    <div class="centered-screen">
      <div class="login-card">
        <img src="${CONFIG.LOGO_URL}" class="school-logo" alt="Logo Sekolah">
        <h1 class="welcome-title">Selamat datang di portal ${CONFIG.SCHOOL_NAME}</h1>
        <p class="welcome-tagline">"${CONFIG.TAGLINE}"</p>
        <a class="btn" href="#/login">Login</a>
      </div>
    </div>`);
}

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
    </div>`);

  function showPasswordForm() {
    const body = qs('#login-body', wrap);
    body.innerHTML = `
      <div class="field"><label>NIP</label><input id="in-nip" type="text" inputmode="numeric"></div>
      <div class="field"><label>Password</label><input id="in-pass" type="password"></div>
      <button class="btn" id="btn-login-pass">Masuk</button>
      <p class="muted-text" style="margin-top:10px;">Sekolah Rakyat - Cerdas Bersama, Tumbuh Setara`;
    qs('#btn-login-pass', body).onclick = async () => {
      const nip = qs('#in-nip', body).value.trim();
      const pass = qs('#in-pass', body).value;
      if (!nip || !pass) return toast('Lengkapi NIP dan password');
      handleLoginResult(await api('login_password', { nip, password: pass }));
    };
  }

  function showQrForm() {
    const body = qs('#login-body', wrap);
    body.innerHTML = `<div id="qr-area"></div><p class="muted-text" style="margin-top:8px;">Tekan tombol lalu arahkan kamera ke kartu QR</p>`;
    renderQrLauncher(qs('#qr-area', body), async (text) => {
      await stopActiveScanner();
      handleLoginResult(await api('login_qr', { qrText: text }), showQrForm);
    });
  }

  async function handleLoginResult(r, retryFn) {
    if (!r.ok) { toast(r.message || 'Login gagal'); if (retryFn) setTimeout(retryFn, 1000); return; }
    S.session = r;
    boot();
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

let dashboardModule = null;
async function boot() {
  await stopActiveScanner();
  if (!dashboardModule) dashboardModule = await import('./dashboard.js'); // hanya diunduh setelah login
  dashboardModule.mountDashboardApp();
}

window.addEventListener('hashchange', () => { if (!S.session) render(); });
window.addEventListener('DOMContentLoaded', () => {
  if (S.session) { boot(); return; }
  if (!location.hash) location.hash = '#/welcome';
  render();
});
