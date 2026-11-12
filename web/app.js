'use strict';
const $ = s => document.querySelector(s);
const view = $('#view'), nav = $('#nav');
let csrf = '', tab = 'apps', timer = null;

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.className = 'show'; clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 4000); }
function levelUp(txt) { const d = h('div', { class: 'levelup' }, h('span', {}, txt)); document.body.append(d); setTimeout(() => d.remove(), 1300); }
function loading() { view.replaceChildren(h('p', { class: 'loading' }, h('i'), h('i'), h('i'))); }

async function api(path, method = 'GET', body) {
  const r = await fetch('/api/' + path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF': csrf },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== 'login') { showLogin(); throw new Error('sesi berakhir'); }
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

let authInfo = { type: 'totp' };

async function fetchAuthInfo() {
  try {
    const j = await fetch('/api/auth-info').then(r => r.json());
    if (j && j.type) authInfo = j;
  } catch (_) {}
}

function ask(msg, needTotp) {
  return new Promise(res => {
    const d = $('#dlg'), t = $('#dlgtotp');
    let promptText = msg;
    if (needTotp && authInfo.type === 'question') {
      promptText += `\n[Pertanyaan: ${authInfo.question}]`;
      t.removeAttribute('inputmode');
      t.removeAttribute('maxlength');
      t.placeholder = 'JAWABAN RAHASIA';
    } else if (needTotp) {
      t.setAttribute('inputmode', 'numeric');
      t.setAttribute('maxlength', '6');
      t.placeholder = 'KODE 2FA (6-DIGIT)';
    }
    $('#dlgmsg').textContent = promptText;
    t.hidden = !needTotp;
    t.value = '';
    d.addEventListener('close', () => res(d.returnValue === 'ok' ? (needTotp ? t.value.trim() : true) : null), { once: true });
    d.returnValue = 'cancel';
    d.showModal();
    if (needTotp) t.focus();
  });
}

async function showLogin() {
  csrf = ''; nav.hidden = true; clearInterval(timer); localStorage.removeItem('mm-apps');
  await fetchAuthInfo();
  const pw = h('input', { type: 'password', autocomplete: 'current-password', maxlength: '256', 'aria-label': 'password' });
  const user = h('input', { autocomplete: 'username', maxlength: '64', 'aria-label': 'user' });
  
  let tfInput;
  let tfLabel;
  if (authInfo.type === 'question') {
    tfLabel = `PERTANYAAN 2FA: ${authInfo.question}`;
    tfInput = h('input', { type: 'text', autocomplete: 'off', maxlength: '128', placeholder: 'Jawaban rahasia', 'aria-label': 'jawaban keamanan' });
  } else {
    tfLabel = 'KODE 2FA (6 DIGIT DARI APP)';
    tfInput = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '123456', 'aria-label': 'kode 2FA' });
  }

  const err = h('div', { class: 'err' });
  const go = async e => {
    e.preventDefault(); err.textContent = '';
    try {
      const j = await api('login', 'POST', { user: user.value, password: pw.value, two_factor: tfInput.value.trim() });
      csrf = j.csrf; pw.value = ''; tfInput.value = ''; start();
    } catch (x) { err.textContent = x.message.toUpperCase(); }
  };
  view.replaceChildren(h('form', { class: 'login card', onsubmit: go },
    h('span', { class: 'sprite bot' }), h('h2', {}, 'MASUK'),
    h('label', {}, 'USER'), user, h('label', {}, 'PASSWORD'), pw, h('label', {}, tfLabel), tfInput,
    h('div', { class: 'row' }, h('button', { type: 'submit' }, 'START')), err));
  user.focus();
}

function bar(used, max) {
  const p = Math.min(100, max ? Math.round(used * 100 / max) : 0);
  const b = h('div', { class: 'bar' + (p > 90 ? ' crit' : p > 70 ? ' warn' : '') }, h('i'));
  b.firstChild.style.width = p + '%';
  return b;
}

async function sysbar() {
  try {
    const s = await api('system');
    const used = s.mem_total_mb - s.mem_avail_mb;
    return h('div', { class: 'sys card' },
      h('div', {}, `RAM ${used}/${s.mem_total_mb} MB`, bar(used, s.mem_total_mb)),
      h('div', {}, `LOAD ${s.load}`, bar(Math.min(s.load * 25, 100), 100)),
      h('div', {}, s.temp_c == null ? 'SUHU -' : `SUHU ${s.temp_c}\u00b0C`, bar(s.temp_c || 0, 85)),
      h('div', {}, `UP ${Math.floor(s.uptime_s / 3600)} JAM`, s.lockdown ? h('span', { class: 'tag s-failed' }, 'LOCKDOWN') : null));
  } catch (_) { return null; }
}

async function sensitive(msg, fn) {
  const code = await ask(msg, true); if (!code) return;
  try { const r = await fn(code); toast(r && r.message || 'OK'); return r; } catch (e) { toast('GAGAL: ' + e.message); }
}

function appCard(a) {
  const inst = a.installed;
  const act = (name, label, cls) => h('button', { class: cls || '', onclick: async () => {
    const needs = ['install', 'update', 'remove'].includes(name);
    const run = async code => api(`apps/${a.id}/${name}`, 'POST', { totp: code });
    const r = needs ? await sensitive(`${label.toUpperCase()} ${a.id}?`, run) : await run().then(x => (toast('OK'), x)).catch(e => toast('GAGAL: ' + e.message));
    if (r && (name === 'install' || name === 'update')) levelUp(name === 'install' ? 'LEVEL UP!' : 'UPGRADED!');
    render();
  } }, label);
  const kids = [h('h3', {}, a.id), h('p', {}, a.description || a.repo),
    h('p', {}, h('span', { class: 'tag' }, 'PRIO ' + a.priority), h('span', { class: 'tag' }, ':' + a.port), h('span', { class: 'tag' }, a.language.toUpperCase()), h('span', { class: 'tag' }, `${a.memory_max_mb}MB/${a.cpu_quota_pct}%`))];
  if (inst) {
    kids.push(h('p', { class: 's-' + a.status }, h('span', { class: 'led' }), a.status.toUpperCase(), ` \u2022 ${inst.version}`));
    if (a.mem_mb != null) kids.push(h('p', {}, `RAM ${a.mem_mb}/${a.memory_max_mb} MB`), bar(a.mem_mb, a.memory_max_mb));
    const r = [];
    r.push(a.status === 'active' ? act('stop', 'stop', 'ghost') : act('start', 'start', 'good'));
    if (a.update_available) r.push(act('update', 'update ' + a.version, ''));
    r.push(act('remove', 'hapus', 'danger'));
    kids.push(h('div', { class: 'row' }, r));
  } else {
    kids.push(h('p', {}, 'Rilis terbaru: ' + a.version), h('div', { class: 'row' }, act('install', 'install', 'good')));
  }
  return h('div', { class: 'card' }, kids);
}

async function render() {
  document.querySelectorAll('nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  try {
    if (tab === 'apps' || tab === 'catalog') {
      let d;
      try { d = await api('apps'); localStorage.setItem('mm-apps', JSON.stringify(d)); $('#offline').hidden = true; }
      catch (e) {
        const c = localStorage.getItem('mm-apps'); if (!c || !csrf) throw e;
        d = JSON.parse(c); $('#offline').hidden = false;
      }
      const list = d.apps.filter(a => tab === 'apps' ? a.installed : !a.installed);
      const out = [await sysbar()];
      if (tab === 'apps') out.push(h('div', { class: 'row' }, h('button', { class: d.lockdown ? 'good' : 'danger', onclick: () => sensitive(d.lockdown ? 'Matikan lockdown?' : 'LOCKDOWN: hentikan semua app non-kritis?', c => api('lockdown', 'POST', { on: !d.lockdown, totp: c })).then(render) }, d.lockdown ? 'Akhiri lockdown' : 'Lockdown')));
      out.push(h('h2', {}, tab === 'apps' ? 'APLIKASI TERPASANG' : 'TERSEDIA'));
      out.push(list.length ? h('div', { class: 'grid' }, list.map(appCard)) : h('p', { class: 'loading' }, tab === 'apps' ? 'Belum ada aplikasi.' : 'Tidak ada yang baru.'));
      if (tab === 'catalog') {
        out.push(h('div', { class: 'row' }, h('button', { class: 'ghost', onclick: async () => { toast('Memindai GitHub...'); await api('refresh', 'POST').catch(e => toast(e.message)); render(); } }, 'Pindai ulang')));
        if (d.unconfigured.length) out.push(h('h2', {}, 'BELUM SIAP (TANPA .batasan.toml)'), h('table', {}, d.unconfigured.map(u => h('tr', {}, h('td', {}, u.repo), h('td', {}, u.reason)))));
      }
      view.replaceChildren(...out.filter(Boolean));
    } else if (tab === 'blacklist') {
      const d = await api('blacklist');
      view.replaceChildren(h('div', { class: 'card lock' }, h('h3', {}, '\u2620 BLACKLIST (TERKUNCI)'), h('p', {}, 'Hanya bisa dihapus lewat SSH: sudo mastermind admin blacklist-remove <id>')),
        d.items.length ? h('table', {}, h('tr', {}, h('th', {}, 'ID'), h('th', {}, 'REPO'), h('th', {}, 'ALASAN'), h('th', {}, 'SHA256')),
          d.items.map(b => h('tr', {}, h('td', {}, b.id), h('td', {}, b.repo), h('td', {}, b.reason), h('td', {}, b.sha256.slice(0, 16) + '\u2026')))) : h('p', { class: 'loading' }, 'Kosong. Aman.'));
    } else if (tab === 'audit') {
      const d = await api('audit');
      view.replaceChildren(h('div', { class: 'card' }, h('p', {}, d.intact ? '\u2714 Rantai audit utuh' : '\u2716 RANTAI AUDIT RUSAK!')),
        h('table', {}, h('tr', {}, h('th', {}, 'WAKTU'), h('th', {}, 'AKTOR'), h('th', {}, 'AKSI')),
          d.items.map(e => h('tr', {}, h('td', {}, new Date(e.ts * 1000).toLocaleString()), h('td', {}, e.actor), h('td', {}, e.action)))));
    }
  } catch (e) { if (csrf) toast(e.message); }
}

function start() {
  nav.hidden = false; loading(); render();
  clearInterval(timer); timer = setInterval(() => { if (!document.hidden && (tab === 'apps' || tab === 'catalog')) render(); }, 15000);
}

nav.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; loading(); render(); } });
$('#logout').addEventListener('click', async () => { await api('logout', 'POST').catch(() => {}); showLogin(); });
window.addEventListener('online', () => { $('#offline').hidden = true; });
window.addEventListener('offline', () => { $('#offline').hidden = false; });

(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { const j = await fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json()); if (j.csrf) { csrf = j.csrf; start(); return; } } catch (_) {}
  showLogin();
})();
