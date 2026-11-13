
function showInstallTerminal(appId, title) {
  let modal = document.getElementById('term-modal');
  if (modal) modal.remove();

  const body = h('div', { class: 'term-body' },
    h('div', { class: 'term-line info' }, `[MASTERMIND] Memulai instalasi ${appId}...`),
    h('span', { class: 'term-cursor' })
  );
  const closeBtn = h('button', { class: 'ghost', disabled: true, onclick: () => modal.remove() }, 'Tutup');
  
  modal = h('div', { id: 'term-modal', class: 'term-modal' },
    h('div', { class: 'term-window' },
      h('div', { class: 'term-header' },
        h('div', { class: 'dots' },
          h('span', { class: 'dot dot-red' }),
          h('span', { class: 'dot dot-yellow' }),
          h('span', { class: 'dot dot-green' })
        ),
        h('span', {}, title || `INSTALL CONSOLE: ${appId}`),
        h('span', { style: 'width: 40px;' })
      ),
      body,
      h('div', { class: 'term-footer' }, closeBtn)
    )
  );
  document.body.appendChild(modal);

  let timer = setInterval(async () => {
    try {
      const res = await api(`apps/${appId}/install-logs`, 'GET');
      if (res && Array.isArray(res.logs) && res.logs.length) {
        body.innerHTML = '';
        res.logs.forEach(l => {
          let cls = 'term-line';
          if (l.includes('[SUCCESS]') || l.includes('installed')) cls += ' success';
          else if (l.includes('[ERROR]') || l.includes('failed') || l.includes('blocked')) cls += ' error';
          else if (l.includes('[-]')) cls += ' info';
          body.appendChild(h('div', { class: cls }, l));
        });
        body.appendChild(h('span', { class: 'term-cursor' }));
        body.scrollTop = body.scrollHeight;

        const last = res.logs[res.logs.length - 1];
        if (last.includes('[SUCCESS]') || last.includes('[ERROR]') || last.includes('installed') || last.includes('Gagal')) {
          closeBtn.disabled = false;
          closeBtn.classList.remove('ghost');
          closeBtn.classList.add('good');
          clearInterval(timer);
        }
      }
    } catch (_) {}
  }, 600);

  return {
    finish: () => {
      closeBtn.disabled = false;
      closeBtn.classList.remove('ghost');
      closeBtn.classList.add('good');
    }
  };
}

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

/* ==========================================================================
   TEMA ZEN & INTERAKSI MATA KODAMA (MASCOT)
   ========================================================================== */
function initTheme() {
  const saved = localStorage.getItem('mm-theme') || 'matcha';
  document.documentElement.dataset.theme = saved;
  const sel = $('#theme-select');
  if (sel) {
    sel.value = saved;
    sel.addEventListener('change', () => {
      document.documentElement.dataset.theme = sel.value;
      localStorage.setItem('mm-theme', sel.value);
      if (window.MastermindScene) window.MastermindScene.setTheme(sel.value);
      toast('TEMA: ' + sel.options[sel.selectedIndex].text.toUpperCase());
    });
  }
  const animSel = $('#anim-select');
  if (animSel) {
    animSel.value = localStorage.getItem('mm-anim') || 'full';
    animSel.addEventListener('change', () => {
      if (window.MastermindScene) window.MastermindScene.setAnimMode(animSel.value);
      toast(animSel.options[animSel.selectedIndex].text.toUpperCase());
    });
  }
}

function initKodamaEyeTracking() {
  const mascots = () => document.querySelectorAll('.kodama-mascot');
  window.addEventListener('mousemove', e => {
    const list = mascots();
    if (!list.length) return;
    list.forEach(m => {
      const rect = m.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const angle = Math.atan2(dy, dx);
      const dist = Math.min(2.5, Math.hypot(dx, dy) / 25);
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      m.querySelectorAll('.pupil').forEach(p => {
        p.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      });
    });
  }, { passive: true });
}

/* ==========================================================================
   ADAPTIVE 12 - 24 FPS RENDER ENGINE (Anti-Jitter, Ramah CPU Odroid/STB)
   ========================================================================== */
let targetFps = 18;
let lastFrameTime = performance.now();
let lastFpsUpdate = performance.now();
let frameCount = 0;
let userActiveUntil = Date.now() + 5000;

['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
  window.addEventListener(evt, () => {
    userActiveUntil = Date.now() + 6000;
  }, { passive: true });
});

function initAdaptiveFpsEngine() {
  const badge = $('#fps-badge');
  function loop(now) {
    // Kurangi ke 12 FPS saat diam/idle untuk hemat daya SBC, naik ke 24 FPS saat ada interaksi aktif
    const isActive = Date.now() < userActiveUntil;
    targetFps = isActive ? 24 : 12;
    const interval = 1000 / targetFps;

    const delta = now - lastFrameTime;
    if (delta >= interval) {
      lastFrameTime = now - (delta % interval);
      frameCount++;
    }

    if (now - lastFpsUpdate >= 1000) {
      const realFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      if (badge) {
        badge.textContent = `${Math.min(24, Math.max(10, realFps))} FPS`;
      }
      frameCount = 0;
      lastFpsUpdate = now;
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/* ==========================================================================
   API & AUTHENTICATION
   ========================================================================== */
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

  const kodamaLogo = h('div', { class: 'kodama-mascot' },
    h('div', { class: 'kodama-caping' }),
    h('div', { class: 'kodama-head' },
      h('div', { class: 'kodama-eye left' }, h('span', { class: 'pupil' })),
      h('div', { class: 'kodama-eye right' }, h('span', { class: 'pupil' })),
      h('div', { class: 'kodama-mouth' })),
    h('div', { class: 'kodama-shell' }, h('span', { class: 'shell-prompt' }, '>_')));

  view.replaceChildren(h('form', { class: 'login card', onsubmit: go },
    kodamaLogo, h('h2', {}, 'MASUK KE MASTERMIND'),
    h('label', {}, 'USER'), user, h('label', {}, 'PASSWORD'), pw, h('label', {}, tfLabel), tfInput,
    h('div', { class: 'row' }, h('button', { type: 'submit' }, 'MASUK')), err));
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
    let term = null;
    if (name === 'install' || name === 'update') {
      term = showInstallTerminal(a.id, `${name.toUpperCase()}: ${a.id}`);
    }
    const r = needs ? await sensitive(`${label.toUpperCase()} ${a.id}?`, run) : await run().then(x => (toast('OK'), x)).catch(e => toast('GAGAL: ' + e.message));
    if (term) term.finish();
    if (r && (name === 'install' || name === 'update')) levelUp(name === 'install' ? 'LEVEL UP!' : 'UPGRADED!');
    render();
  } }, label);

  const kids = [
    h('h3', {}, a.id),
    h('p', {}, a.description || a.repo),
    h('p', {},
      h('span', { class: 'tag' }, 'PRIO ' + a.priority),
      h('span', { class: 'tag' }, ':' + a.port),
      h('span', { class: 'tag' }, a.language.toUpperCase()),
      h('span', { class: 'tag' }, `${a.memory_max_mb}MB / ${a.cpu_quota_pct}% CPU`))
  ];

  if (inst) {
    kids.push(h('p', { class: 's-' + a.status }, h('span', { class: 'led' }), a.status.toUpperCase(), ` \u2022 ${inst.version}`));
    if (a.mem_mb != null) kids.push(h('p', {}, `RAM ${a.mem_mb}/${a.memory_max_mb} MB`), bar(a.mem_mb, a.memory_max_mb));
    const r = [];
    if (a.status === 'active') {
      r.push(act('stop', 'Stop', 'ghost'));
      r.push(act('restart', 'Restart', ''));
    } else {
      r.push(act('start', 'Start', 'good'));
    }
    if (a.update_available) r.push(act('update', 'Update ' + a.version, ''));
    r.push(act('remove', 'Hapus', 'danger'));
    kids.push(h('div', { class: 'row' }, r));
  } else {
    kids.push(h('p', {}, 'Rilis terbaru: ' + a.version), h('div', { class: 'row' }, act('install', 'Install', 'good')));
  }
  return h('div', { class: 'card' }, kids);
}

/* ==========================================================================
   RACIK BATASAN WIZARD (Interactive .batasan.toml Generator)
   ========================================================================== */
function renderCreator() {
  const form = h('div', { class: 'creator-form card' });
  const preview = h('div', { class: 'creator-preview card' });

  let cfg = {
    id: 'myapp',
    repo: 'faisalfa123/myapp',
    bin_name: 'myapp',
    description: 'Aplikasi layanan mandiri hemat sumber daya',
    language: 'rust',
    port: 8080,
    priority: 5,
    memory_max_mb: 48,
    cpu_quota_pct: 35,
    read_only_paths: ['/etc/myapp'],
    read_write_paths: ['/var/lib/myapp']
  };

  const previewArea = h('textarea', { readonly: 'readonly', spellcheck: 'false' });

  function updatePreview() {
    previewArea.value = [
      `# Mastermind Isolation Manifest (<id>.batasan.toml)`,
      `# Ringan, aman, native cgroups & systemd isolation (tanpa docker bloat)`,
      ``,
      `id = "${cfg.id}"`,
      `repo = "${cfg.repo}"`,
      `bin_name = "${cfg.bin_name}"`,
      `description = "${cfg.description}"`,
      `language = "${cfg.language}"`,
      `port = ${cfg.port}`,
      `priority = ${cfg.priority}`,
      `memory_max_mb = ${cfg.memory_max_mb}`,
      `cpu_quota_pct = ${cfg.cpu_quota_pct}`,
      `read_only_paths = [${cfg.read_only_paths.map(p => `"${p}"`).join(', ')}]`,
      `read_write_paths = [${cfg.read_write_paths.map(p => `"${p}"`).join(', ')}]`,
      ``,
      `[auto_alive]`,
      `restart = "always"`,
      `restart_sec = 3`,
      `burst_limit = 5`,
    ].join('\n');
  }

  const idIn = h('input', { value: cfg.id, maxlength: '32', oninput: e => { cfg.id = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); e.target.value = cfg.id; updatePreview(); } });
  const repoIn = h('input', { value: cfg.repo, oninput: e => { cfg.repo = e.target.value; updatePreview(); } });
  const binIn = h('input', { value: cfg.bin_name, oninput: e => { cfg.bin_name = e.target.value; updatePreview(); } });
  const descIn = h('input', { value: cfg.description, oninput: e => { cfg.description = e.target.value; updatePreview(); } });
  
  const langSel = h('select', { onchange: e => { cfg.language = e.target.value; updatePreview(); } },
    h('option', { value: 'rust' }, 'Rust (Native ELF)'),
    h('option', { value: 'go' }, 'Go (Static Binary)'),
    h('option', { value: 'python' }, 'Python (Standalone)'),
    h('option', { value: 'nodejs' }, 'Node.js (Bun / Node)'),
    h('option', { value: 'c' }, 'C / C++ (Native)'));

  const portIn = h('input', { type: 'number', min: '1024', max: '65535', value: cfg.port, oninput: e => { cfg.port = parseInt(e.target.value) || 8080; updatePreview(); } });
  
  const memVal = h('span', { class: 'slider-val' }, `${cfg.memory_max_mb} MB`);
  const memIn = h('input', { type: 'range', min: '16', max: '512', step: '8', value: cfg.memory_max_mb, oninput: e => { cfg.memory_max_mb = parseInt(e.target.value); memVal.textContent = `${cfg.memory_max_mb} MB`; updatePreview(); } });

  const cpuVal = h('span', { class: 'slider-val' }, `${cfg.cpu_quota_pct}%`);
  const cpuIn = h('input', { type: 'range', min: '10', max: '100', step: '5', value: cfg.cpu_quota_pct, oninput: e => { cfg.cpu_quota_pct = parseInt(e.target.value); cpuVal.textContent = `${cfg.cpu_quota_pct}%`; updatePreview(); } });

  const prioIn = h('input', { type: 'number', min: '1', max: '10', value: cfg.priority, oninput: e => { cfg.priority = parseInt(e.target.value) || 5; updatePreview(); } });
  const rwIn = h('input', { value: cfg.read_write_paths.join(', '), oninput: e => { cfg.read_write_paths = e.target.value.split(',').map(s => s.trim()).filter(Boolean); updatePreview(); } });
  const roIn = h('input', { value: cfg.read_only_paths.join(', '), oninput: e => { cfg.read_only_paths = e.target.value.split(',').map(s => s.trim()).filter(Boolean); updatePreview(); } });

  form.append(
    h('h3', {}, 'RACIK BATASAN ISOLASI'),
    h('p', { class: 'dim' }, 'Buat konfigurasi isolasi sistem native tanpa bloat Docker container.'),
    h('label', {}, 'ID APLIKASI (Alfanumerik)'), idIn,
    h('label', {}, 'GITHUB REPOSITORY (owner/repo)'), repoIn,
    h('label', {}, 'NAMA BINARY EXEC'), binIn,
    h('label', {}, 'DESKRIPSI'), descIn,
    h('label', {}, 'BAHASA / RUNTIME'), langSel,
    h('label', {}, 'PORT BINDING (LAN/Local)'), portIn,
    h('label', {}, 'BATAS RAM (MemoryMax): ', memVal), memIn,
    h('label', {}, 'BATAS CPU (CPUQuota): ', cpuVal), cpuIn,
    h('label', {}, 'PRIORITAS AUTO-KILL OOM (1=Rendah, 10=Kritis)'), prioIn,
    h('label', {}, 'PATH AKSES BACA & TULIS (dipisah koma)'), rwIn,
    h('label', {}, 'PATH AKSES HANYA BACA (dipisah koma)'), roIn
  );

  const copyBtn = h('button', { class: 'good', onclick: () => {
    navigator.clipboard.writeText(previewArea.value).then(() => toast('BERHASIL DISALIN KE CLIPBOARD!')).catch(() => toast('Gagal menyalin'));
  } }, 'SALIN TOML');

  const downloadBtn = h('button', { class: 'ghost', onclick: () => {
    const blob = new Blob([previewArea.value], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cfg.id}.batasan.toml`;
    a.click();
    toast(`MENGUNDUH ${cfg.id}.batasan.toml`);
  } }, 'UNDUH FILE');

  preview.append(
    h('h3', {}, 'PRATINJAU .batasan.toml'),
    h('p', { class: 'dim' }, 'Simpan file ini di root repo GitHub rilis Anda agar Mastermind dapat mendeteksi.'),
    previewArea,
    h('div', { class: 'row' }, copyBtn, downloadBtn)
  );

  updatePreview();

  const wrap = h('div', { class: 'creator-container' }, form, preview);
  return wrap;
}

/* ==========================================================================
   SITUS VIEW (Install by Site / Custom GitHub Repo)
   ========================================================================== */
async function renderSites() {
  const topBar = await sysbar();
  const card = h('div', { class: 'card' });
  const repoInput = h('input', { placeholder: 'faisalfa123/Senandung atau https://github.com/...', autocomplete: 'off' });
  const resultBox = h('div', { class: 'sites-result', style: 'margin-top:14px' });

  const inspectBtn = h('button', { class: 'good', onclick: async () => {
    const val = repoInput.value.trim();
    if (!val) { toast('Masukkan nama repo atau URL GitHub'); return; }
    resultBox.replaceChildren(h('p', { class: 'loading' }, 'Memeriksa repo...'));
    try {
      const res = await api('sites/inspect', 'POST', { repo: val });
      if (!res.ok) {
        resultBox.replaceChildren(h('div', { class: 'card lock' },
          h('h4', {}, 'BELUM BISA DIINSTALL LANGSUNG'),
          h('p', {}, `Alasan: ${res.reason}`),
          h('p', { class: 'dim' }, 'Solusi: Buat file .batasan.toml di menu "RACIK BATASAN", lalu tambahkan ke rilis repo GitHub Anda.')));
        return;
      }
      const e = res.entry;
      const addAndInstallBtn = h('button', { class: 'good', onclick: async () => {
        await sensitive(`TAMBAHKAN SITUS ${e.repo}?`, code => api('sites/add', 'POST', { repo: e.repo, totp: code }));
        toast('Situs ditambahkan ke katalog!');
        tab = 'catalog';
        render();
      } }, 'TAMBAHKAN KE KATALOG');

      resultBox.replaceChildren(h('div', { class: 'card' },
        h('h3', {}, `${e.id} (${e.version})`),
        h('p', {}, e.description || e.repo),
        h('p', {},
          h('span', { class: 'tag' }, `PORT :${e.port}`),
          h('span', { class: 'tag' }, e.language.toUpperCase()),
          h('span', { class: 'tag' }, `${e.memory_max_mb}MB / ${e.cpu_quota_pct}% CPU`)),
        h('div', { class: 'row' }, addAndInstallBtn)));
    } catch (err) {
      resultBox.replaceChildren(h('p', { class: 'err' }, err.message.toUpperCase()));
    }
  } }, 'PERIKSA REPO');

  card.append(
    h('h3', {}, 'PASANG APLIKASI DARI SITUS / REPO GITHUB'),
    h('p', { class: 'dim' }, 'Masukkan alamat repository GitHub publik (misal: faisalfa123/Senandung atau https://github.com/faisalfa123/DompetMungil)'),
    h('div', { class: 'row' }, repoInput, inspectBtn),
    resultBox
  );

  // List of active custom sites
  let customSitesBox = h('div');
  try {
    const s = await api('sites');
    if (s.sites && s.sites.length) {
      customSitesBox = h('div', { class: 'card', style: 'margin-top:16px' },
        h('h3', {}, 'DAFTAR SITUS TERDAFTAR'),
        h('table', {},
          h('tr', {}, h('th', {}, 'REPOSITORY'), h('th', {}, 'AKSI')),
          s.sites.map(r => h('tr', {},
            h('td', {}, r),
            h('td', {}, h('button', { class: 'danger', onclick: async () => {
              await sensitive(`HAPUS SITUS ${r}?`, code => api('sites/remove', 'POST', { repo: r, totp: code }));
              render();
            } }, 'Hapus'))))));
    }
  } catch (_) {}

  view.replaceChildren(...[topBar, card, customSitesBox].filter(Boolean));
}

/* ==========================================================================
   RENDER & ROUTER
   ========================================================================== */
async function render() {
  document.querySelectorAll('nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  try {
    if (tab === 'sites') {
      await renderSites();
      return;
    }

    if (tab === 'creator') {
      const topBar = await sysbar();
      const creatorEl = renderCreator();
      view.replaceChildren(...[topBar, creatorEl].filter(Boolean));
      return;
    }

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
  initTheme();
  initKodamaEyeTracking();
  initAdaptiveFpsEngine();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { const j = await fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json()); if (j.csrf) { csrf = j.csrf; start(); return; } } catch (_) {}
  showLogin();
})();
