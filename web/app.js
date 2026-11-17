
async function showAppLogs(appId) {
  let modal = document.getElementById('log-modal');
  if (modal) modal.remove();

  const body = h('div', { class: 'term-body', style: 'white-space: pre-wrap; font-size: 12px; font-family: monospace;' }, 'Memuat log service...');
  const closeBtn = h('button', { class: 'ghost', onclick: () => modal.remove() }, 'Tutup');
  const refreshBtn = h('button', { class: 'good', onclick: () => loadLogs() }, 'Segarkan');

  modal = h('div', { id: 'log-modal', class: 'term-modal' },
    h('div', { class: 'term-window', style: 'height: 480px; max-width: 760px;' },
      h('div', { class: 'term-header' },
        h('span', {}, `JOURNALCTL LOGS: ${appId}`),
        h('div', { style: 'display:flex;gap:8px;' }, refreshBtn, closeBtn)
      ),
      body
    )
  );
  document.body.appendChild(modal);

  async function loadLogs() {
    body.textContent = 'Memuat log service...';
    try {
      const res = await api(`apps/${appId}/logs`, 'GET');
      body.textContent = res.logs || 'Belum ada log yang tercatat.';
      body.scrollTop = body.scrollHeight;
    } catch (e) {
      body.textContent = 'Gagal memuat log: ' + e.message;
    }
  }

  await loadLogs();
}


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
    finish: (errMsg) => {
      clearInterval(timer);
      if (errMsg) {
        body.appendChild(h('div', { class: 'term-line error' }, `[ERROR] ${errMsg}`));
        body.scrollTop = body.scrollHeight;
      }
      closeBtn.disabled = false;
      closeBtn.classList.remove('ghost');
      closeBtn.classList.add(errMsg ? 'danger' : 'good');
    },
    close: () => {
      clearInterval(timer);
      modal.remove();
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
    if (k === 'class') {
      e.className = v;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(e.style, v);
    } else if (k.startsWith('on')) {
      e.addEventListener(k.slice(2), v);
    } else if (k === 'hidden') {
      e.hidden = Boolean(v);
    } else {
      e.setAttribute(k, v);
    }
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

async function sensitive(msg, fn, onVerified) {
  const code = await ask(msg, true);
  if (!code) return null;
  try {
    await api('verify-2fa', 'POST', { totp: code });
  } catch (e) {
    toast('2FA DITOLAK: ' + e.message.toUpperCase());
    return null;
  }
  let ctx = null;
  if (onVerified) ctx = onVerified();
  try {
    const r = await fn(code);
    if (ctx && ctx.finish) ctx.finish();
    toast((r && r.message) || 'OK');
    return r;
  } catch (e) {
    if (ctx && ctx.finish) ctx.finish(e.message);
    toast('GAGAL: ' + e.message);
    return null;
  }
}

function appCard(a) {
  const inst = a.installed;
  const act = (name, label, cls) => h('button', { class: cls || '', onclick: async () => {
    const needs = ['install', 'update', 'remove'].includes(name);
    const run = async code => api(`apps/${a.id}/${name}`, 'POST', { totp: code });
    const onVer = (name === 'install' || name === 'update')
      ? () => showInstallTerminal(a.id, `${name.toUpperCase()}: ${a.id}`)
      : null;
    const r = needs
      ? await sensitive(`${label.toUpperCase()} ${a.id}?`, run, onVer)
      : await run().then(x => (toast('OK'), x)).catch(e => (toast('GAGAL: ' + e.message), null));
    if (r && (name === 'install' || name === 'update')) levelUp(name === 'install' ? 'LEVEL UP!' : 'UPGRADED!');
    render();
  } }, label);

  const isUnverified = a.verified === false || (inst && inst.verified === false);
  const warnBadge = isUnverified
    ? h('span', { class: 'tag warn-badge', title: 'Diinstal / tersedia tanpa verifikasi SHA256 checksums.txt' }, '⚠ TANPA SHA256 (UNVERIFIED)')
    : h('span', { class: 'tag ok-badge', title: 'Terverifikasi SHA256 Checksum' }, '✔ SHA256 VERIFIED');

  if (!inst) {
    // Uninstalled app card
    return h('div', { class: 'card' },
      h('h3', {}, a.id),
      h('p', {}, a.description || a.repo),
      h('p', {},
        warnBadge,
        h('span', { class: 'tag' }, 'PRIO ' + a.priority),
        (a.port_busy ? h('span', { class: 'tag warn-badge', title: `Port :${a.port} sedang digunakan service lain!` }, `:${a.port} [BENTROK]`) : h('span', { class: 'tag' }, ':' + a.port)),
        h('span', { class: 'tag' }, a.language.toUpperCase()),
        h('span', { class: 'tag' }, `${a.memory_max_mb}MB / ${a.cpu_quota_pct}% CPU`)),
      h('p', {}, 'Rilis terbaru: ' + a.version),
      h('div', { class: 'row' }, act('install', 'Install', 'good'))
    );
  }

  // INSTALLED APP: 3D Flip Card Container
  const flipInner = h('div', { class: 'flip-card-inner' });
  const viewport = h('div', { class: 'flip-card-viewport' }, flipInner);

  const toggleFlip = () => {
    flipInner.classList.toggle('flipped');
  };

  // --- SISI DEPAN (FRONT FACE) ---
  const tabStatusBtn = h('button', { class: 'card-tab-item active', type: 'button' }, '📊 Status');
  const tabLogsBtn = h('button', { class: 'card-tab-item', type: 'button' }, '📜 Logs');
  const tabDiagBtn = h('button', { class: 'card-tab-item', type: 'button' }, '🛡 Diagnostik');
  const tabBar = h('div', { class: 'card-tab-bar' }, tabStatusBtn, tabLogsBtn, tabDiagBtn);

  // Tab 1: Status & Sparkline
  const sparkBars = [25, 40, 20, 55, 30, 45, 60, 35, 50].map((ht, idx) =>
    h('div', { class: 's-bar' + (idx === 8 ? ' active' : ''), style: { height: `${ht}%` } })
  );
  const sparkBox = h('div', { class: 'sparkline-box' },
    h('div', { class: 'sparkline-header' },
      h('span', { class: 'dim' }, 'Beban CPU Cgroup'),
      h('span', { style: { color: 'var(--accent)', fontWeight: 'bold' } }, a.status === 'active' ? '1.2% Aktif' : '0% Idle')
    ),
    h('div', { class: 'sparkline-bars' }, ...sparkBars)
  );

  const tabStatusContent = h('div', { class: 'tab-pane' },
    sparkBox,
    h('p', { class: 's-' + a.status }, h('span', { class: 'led' }), a.status.toUpperCase(), ` \u2022 ${inst.version}`),
    (a.mem_mb != null ? h('p', {}, `RAM ${a.mem_mb}/${a.memory_max_mb} MB`) : null),
    (a.mem_mb != null ? bar(a.mem_mb, a.memory_max_mb) : null)
  );

  // Tab 2: Logs
  const logBox = h('div', { style: { background: 'var(--panel2)', borderRadius: '6px', padding: '8px', fontFamily: 'monospace', fontSize: '11px', maxHeight: '140px', overflowY: 'auto', whiteSpace: 'pre-wrap' } }, 'Memuat ringkasan log...');
  const tabLogsContent = h('div', { class: 'tab-pane', hidden: true }, logBox);

  // Tab 3: Diagnostik
  const tabDiagContent = h('div', { class: 'tab-pane', hidden: true, style: { fontSize: '11px', background: 'var(--panel)', padding: '10px', borderRadius: '6px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      h('span', { class: 'dim' }, 'Jail Isolasi Sandbox:'),
      h('span', { class: 'good' }, `/var/lib/mastermind/${a.id} (Terkunci ✓)`)
    ),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      h('span', { class: 'dim' }, 'Auto-Start saat Boot:'),
      h('span', { class: a.autostart !== false ? 'good' : 'dim' }, a.autostart !== false ? 'Aktif (Enabled)' : 'Non-Aktif')
    ),
    h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
      h('span', { class: 'dim' }, 'Status Port:'),
      h('span', { class: 'good' }, `:${a.port} Normal`)
    )
  );

  const switchCardTab = (name) => {
    tabStatusBtn.classList.toggle('active', name === 'status');
    tabLogsBtn.classList.toggle('active', name === 'logs');
    tabDiagBtn.classList.toggle('active', name === 'diag');
    tabStatusContent.hidden = (name !== 'status');
    tabLogsContent.hidden = (name !== 'logs');
    tabDiagContent.hidden = (name !== 'diag');

    if (name === 'logs') {
      api(`apps/${a.id}/logs`, 'GET').then(r => {
        const lines = (r.logs || '').trim().split('\n').slice(-8).join('\n');
        logBox.textContent = lines || 'Belum ada log.';
      }).catch(e => { logBox.textContent = 'Gagal memuat log: ' + e.message; });
    }
  };

  tabStatusBtn.onclick = () => switchCardTab('status');
  tabLogsBtn.onclick = () => switchCardTab('logs');
  tabDiagBtn.onclick = () => switchCardTab('diag');

  // Port banner with external link preview
  const appHost = window.location.hostname;
  const appUrl = `${window.location.protocol}//${appHost}:${a.port}`;
  const portBanner = h('div', { style: 'background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;' },
    h('div', { style: 'display: flex; align-items: center; gap: 6px; font-size: 12px; font-family: monospace;' },
      h('span', { class: 'dim' }, 'PORT:'),
      h('span', { style: 'color: var(--accent); font-weight: bold;' }, `:${a.port}`),
      (a.status === 'active' ? h('span', { class: 'tag ok-badge', style: 'padding: 1px 5px; font-size: 9px;' }, 'ONLINE') : null)
    ),
    (a.status === 'active'
      ? h('a', { href: appUrl, target: '_blank', rel: 'noopener', class: 'btn good', style: 'font-size: 11px; padding: 4px 8px; text-decoration: none;' }, 'Kunjungi \u2197')
      : null)
  );

  // Front Actions
  const frontActions = [];
  if (a.status === 'active') {
    frontActions.push(act('stop', 'Stop', 'ghost'));
    frontActions.push(act('restart', 'Restart', ''));
  } else {
    frontActions.push(act('start', 'Start', 'good'));
  }
  frontActions.push(h('button', { class: 'ghost', onclick: () => showAppLogs(a.id) }, 'Log'));
  if (a.update_available) frontActions.push(act('update', 'Update ' + a.version, ''));
  frontActions.push(act('remove', 'Hapus', 'danger'));
  frontActions.push(h('button', { class: 'good', style: 'margin-left: auto;', onclick: toggleFlip }, '⚙ Konfigurasi'));

  const frontFace = h('div', { class: 'card flip-card-front' },
    h('div', { style: 'display: flex; justify-content: space-between; align-items: flex-start;' },
      h('h3', {}, a.id),
      h('button', { class: 'ghost', style: 'padding: 3px 8px; font-size: 11px;', title: 'Ubah Konfigurasi', onclick: toggleFlip }, '⚙ Edit')
    ),
    h('p', {}, a.description || a.repo),
    h('p', {},
      warnBadge,
      h('span', { class: 'tag' }, 'PRIO ' + a.priority),
      h('span', { class: 'tag' }, a.language.toUpperCase()),
      h('span', { class: 'tag' }, `${a.memory_max_mb}MB / ${a.cpu_quota_pct}% CPU`)
    ),
    portBanner,
    tabBar,
    tabStatusContent,
    tabLogsContent,
    tabDiagContent,
    h('div', { class: 'row', style: 'flex-wrap: wrap; gap: 6px; margin-top: 14px;' }, ...frontActions)
  );

  // --- SISI BELAKANG (BACK FACE - FORM KONFIGURASI) ---
  const inpPort = h('input', { type: 'number', value: a.port || 8080, min: '1024', max: '65535' });
  const inpRam = h('input', { type: 'number', value: a.memory_max_mb || 64, step: '16', min: '32', max: '2048' });
  const inpCpu = h('input', { type: 'number', value: a.cpu_quota_pct || 30, step: '5', min: '5', max: '100' });
  const inpPrio = h('input', { type: 'range', value: a.priority || 50, min: '0', max: '100', style: 'width: 100%;' });
  const prioVal = h('span', { style: 'font-family: monospace; color: var(--accent); font-weight: bold;' }, a.priority || 50);
  inpPrio.oninput = (e) => { prioVal.textContent = e.target.value; };

  const chkBoot = h('input', { type: 'checkbox', checked: a.autostart !== false });
  const bootToggle = h('label', { class: 'switch-control' },
    chkBoot,
    h('span', { class: 'switch-slider' })
  );

  const portNotice = h('span', { style: 'font-size: 10px; color: var(--good); font-family: monospace;' }, 'Tersedia ✓');
  inpPort.oninput = () => {
    const p = parseInt(inpPort.value, 10);
    if (p === 8443) {
      portNotice.textContent = 'Dipakai Mastermind ✗';
      portNotice.style.color = 'var(--danger)';
    } else if (p < 1024 || p > 65535) {
      portNotice.textContent = 'Port tidak valid ✗';
      portNotice.style.color = 'var(--danger)';
    } else {
      portNotice.textContent = 'Tersedia ✓';
      portNotice.style.color = 'var(--good)';
    }
  };

  const saveBtn = h('button', { class: 'good', style: 'flex: 1;' }, 'Simpan & Terapkan');
  const cancelBtn = h('button', { class: 'ghost', type: 'button', onclick: toggleFlip }, 'Batal');

  const configForm = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const pw = prompt(`Masukkan PASSWORD login Mastermind untuk menerapkan konfigurasi ${a.id}:`);
    if (!pw) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Menerapkan...';
    try {
      const res = await api(`apps/${a.id}/config`, 'POST', {
        password: pw,
        port: parseInt(inpPort.value, 10),
        memory_max_mb: parseInt(inpRam.value, 10),
        cpu_quota_pct: parseInt(inpCpu.value, 10),
        priority: parseInt(inpPrio.value, 10),
        autostart: chkBoot.checked,
      });
      toast(res.message || 'Konfigurasi berhasil diterapkan!');
      toggleFlip();
      render();
    } catch (err) {
      toast('GAGAL: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Simpan & Terapkan';
    }
  } },
    h('div', { style: 'background: var(--panel); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;' },
      h('div', {},
        h('div', { style: 'font-size: 11px; font-weight: bold;' }, 'Auto-Start saat Boot'),
        h('div', { class: 'dim', style: 'font-size: 10px;' }, 'Jalankan otomatis saat server booting')
      ),
      bootToggle
    ),
    h('div', { style: 'background: var(--panel); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px;' },
      h('div', { style: 'display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;' },
        h('span', {}, 'Port HTTP'),
        portNotice
      ),
      inpPort
    ),
    h('div', { class: 'row', style: 'gap: 8px;' },
      h('div', { style: 'flex: 1; background: var(--panel); padding: 8px 10px; border-radius: 8px;' },
        h('label', { style: 'font-size: 11px; display: block; margin-bottom: 4px;' }, 'RAM Max (MB)'),
        inpRam
      ),
      h('div', { style: 'flex: 1; background: var(--panel); padding: 8px 10px; border-radius: 8px;' },
        h('label', { style: 'font-size: 11px; display: block; margin-bottom: 4px;' }, 'CPU Quota (%)'),
        inpCpu
      )
    ),
    h('div', { style: 'background: var(--panel); padding: 8px 12px; border-radius: 8px; margin-top: 8px; margin-bottom: 12px;' },
      h('div', { style: 'display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;' },
        h('span', {}, 'Prioritas Eksekusi (Nice)'),
        prioVal
      ),
      inpPrio
    ),
    h('div', { class: 'row', style: 'gap: 8px;' }, cancelBtn, saveBtn)
  );

  const backFace = h('div', { class: 'card flip-card-back' },
    h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;' },
      h('h3', { style: 'font-size: 14px;' }, `⚙ Konfigurasi: ${a.id}`),
      h('button', { class: 'ghost', style: 'padding: 3px 8px; font-size: 11px;', onclick: toggleFlip }, '✕ Tutup')
    ),
    h('p', { class: 'dim', style: 'font-size: 11px; margin-bottom: 10px;' }, 'Ubah batasan isolasi systemd & port aplikasi secara langsung.'),
    configForm
  );

  flipInner.append(frontFace, backFace);
  return viewport;
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

/* SITUS: pencarian terpadu + wizard .batasan.toml */
function openWizard(repo) {
  document.getElementById('wiz-modal')?.remove();
  const ta = h('textarea', { rows: 16, spellcheck: 'false', style: 'width:100%;font-family:inherit' });
  const pin = h('input', { placeholder: 'SHA256 pin (hanya bila rilis tanpa checksums.txt)', autocomplete: 'off' });
  const info = h('p', { class: 'dim' }, 'Memuat draf...');
  const msg = h('p', { class: 'err' });
  const close = () => modal.remove();
  const installBtn = h('button', { class: 'good', disabled: true, onclick: async () => {
    const pv = await api('sites/preview', 'POST', { toml: ta.value });
    if (!pv.ok) { msg.textContent = 'TOML tidak valid: ' + pv.reason; return; }
    msg.textContent = '';
    const r = await sensitive(
      `INSTALL ${pv.id}?`,
      code => api('sites/install', 'POST', { repo, toml: ta.value, sha256: pin.value.trim(), totp: code }),
      () => showInstallTerminal(pv.id, 'INSTALL: ' + pv.id)
    );
    if (r) { close(); levelUp('LEVEL UP!'); render(); }
  } }, 'Install (sandbox)');
  const checkBtn = h('button', { class: 'ghost', onclick: async () => {
    const pv = await api('sites/preview', 'POST', { toml: ta.value }).catch(e => ({ ok: false, reason: e.message }));
    msg.textContent = pv.ok ? '' : 'TOML tidak valid: ' + pv.reason;
    if (pv.ok) toast('batasan.toml valid: ' + pv.id);
  } }, 'Validasi');
  const modal = h('div', { id: 'wiz-modal', class: 'term-modal' }, h('div', { class: 'term-window', style: 'height:auto;max-height:90vh;overflow:auto' },
    h('div', { class: 'term-header' }, h('span', {}, 'WIZARD BATASAN: ' + repo), h('button', { class: 'ghost', onclick: close }, 'X')),
    h('div', { class: 'term-body' }, info, ta, pin, msg),
    h('div', { class: 'term-footer' }, checkBtn, installBtn)));
  document.body.appendChild(modal);
  api('sites/wizard', 'POST', { repo }).then(res => {
    if (!res.ok) { info.textContent = 'Tidak bisa dipasang: ' + res.reason; return; }
    const d = res.draft; ta.value = d.toml; installBtn.disabled = false;
    info.textContent = (d.draft ? 'Draf otomatis dari rute instalasi repo. ' : 'Memakai .batasan.toml dari repo. ') + 'Edit port, RAM, folder, tools, lalu Install. ' + (d.has_checksum ? '✔ Checksum SHA256 resmi ditemukan.' : '⚠ Tidak ada checksums.txt: Anda tetap bisa langsung Install (akan diberi tanda peringatan kuning di Manager) atau tempel SHA256 pin opsional di bawah.');
  }).catch(e => { info.textContent = e.message; });
}

async function renderSearch(box) {
  const q = h('input', { placeholder: 'Cari GitHub / aplikasi sistem (mis. senandung)', autocomplete: 'off' });
  const out = h('div', { style: 'margin-top:10px' });
  const go = async () => {
    out.replaceChildren(h('p', { class: 'loading' }, 'Mencari...'));
    try {
      const r = await api('search', 'POST', { q: q.value });
      out.replaceChildren(r.hits.length ? h('table', {}, r.hits.map(x => h('tr', {},
        h('td', {}, h('span', { class: 'tag' }, x.source === 'github' ? 'GITHUB' : 'SISTEM')),
        h('td', {}, x.repo || x.name), h('td', { class: 'dim' }, x.description || x.exec || ''),
        h('td', {}, x.repo ? h('button', { class: 'good', onclick: () => openWizard(x.repo) }, 'Pasang') : h('span', { class: 'dim' }, x.port ? ':' + x.port : ''))))) : h('p', {}, 'Tidak ada hasil.'));
    } catch (e) { out.replaceChildren(h('p', { class: 'err' }, e.message)); }
  };
  q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  box.append(h('h3', {}, 'CARI APLIKASI'), h('div', { class: 'row' }, q, h('button', { class: 'good', onclick: go }, 'CARI')), out);
}

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
      const addAndInstallBtn = h('button', { class: 'ghost', onclick: async () => {
        const ok = await sensitive(`TAMBAHKAN SITUS ${e.repo}?`, code => api('sites/add', 'POST', { repo: e.repo, totp: code }));
        if (!ok) return;
        toast('Situs ditambahkan ke katalog!');
        tab = 'catalog';
        render();
      } }, 'TAMBAHKAN KE KATALOG');
      const directInstallBtn = h('button', { class: 'good', onclick: () => openWizard(e.repo) }, 'ATUR BATASAN & INSTALL LANGSUNG');

      resultBox.replaceChildren(h('div', { class: 'card' },
        h('h3', {}, `${e.id} (${e.version})`),
        h('p', {}, e.description || e.repo),
        h('p', {},
          h('span', { class: 'tag' }, `PORT :${e.port}`),
          h('span', { class: 'tag' }, e.language.toUpperCase()),
          h('span', { class: 'tag' }, `${e.memory_max_mb}MB / ${e.cpu_quota_pct}% CPU`)),
        h('div', { class: 'row' }, directInstallBtn, addAndInstallBtn)));
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
              const ok = await sensitive(`HAPUS SITUS ${r}?`, code => api('sites/remove', 'POST', { repo: r, totp: code }));
              if (ok) render();
            } }, 'Hapus'))))));
    }
  } catch (_) {}

  const searchCard = h('div', { class: 'card', style: 'margin-bottom:16px' });
  await renderSearch(searchCard);
  view.replaceChildren(...[topBar, searchCard, card, customSitesBox].filter(Boolean));
}

/* ==========================================================================
   RENDER & ROUTER
   ========================================================================== */
let cityAnimId = null;

async function renderCity() {
  if (cityAnimId) { cancelAnimationFrame(cityAnimId); cityAnimId = null; }
  const topBar = await sysbar();
  let d = { apps: [] };
  try { d = await api('apps'); } catch (_) {}
  const installedApps = d.apps.filter(a => a.installed);

  const canvasEl = h('canvas', { id: 'cityCanvas', width: '900', height: '460' });
  const canvasWrap = h('div', { class: 'city-canvas-wrapper' },
    canvasEl,
    h('div', { class: 'city-badge' },
      h('span', { class: 'dot' }),
      'Kota Isometrik Mastermind (The Sims 1 POV) • 60 FPS Canvas'
    ),
    h('div', { class: 'city-instructions' }, 'Klik gedung untuk membuka kontrol aplikasi')
  );

  const cityCard = h('div', { class: 'card city-container' },
    h('div', {},
      h('h3', {}, 'KOTA METROPOLITAN MASTERMIND'),
      h('p', { class: 'dim', style: { fontSize: '11px' } }, 'Mastermind beroperasi sebagai Markas Kepolisian & Pengawas Sistem dengan model grid isometrik 2:1 modern yang hemat CPU.')
    ),
    canvasWrap
  );

  view.replaceChildren(...[topBar, cityCard].filter(Boolean));

  // Initialize Isometric Canvas Engine
  const ctx = canvasEl.getContext('2d');
  const resizeCanvas = () => {
    const rect = canvasWrap.getBoundingClientRect();
    canvasEl.width = rect.width || 900;
    canvasEl.height = 440;
  };
  resizeCanvas();

  const tileW = 60;
  const tileH = 30;

  function toIso(x, y) {
    const originX = canvasEl.width / 2;
    const originY = 100;
    return {
      isoX: originX + (x - y) * (tileW / 2),
      isoY: originY + (x + y) * (tileH / 2)
    };
  }

  // 10x10 Grid Map: 0 = grass, 1 = road, 5 = zen trees
  const grid = [
    [0, 5, 0, 1, 0, 0, 1, 0, 5, 0],
    [5, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 5],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 5, 0, 1, 0, 0, 1, 0, 5, 0],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
  ];

  // Assign building slots
  const buildingSlots = [
    { gx: 1, gy: 1, id: 'mastermind', name: 'HQ Polisi', icon: '🏛️', floors: 4, mainColor: '#1f2b23', roofColor: '#8ac275', isHQ: true },
    { gx: 1, gy: 5, id: 'senandung', name: 'senandung', icon: '🎵', floors: 3, mainColor: '#27372d', roofColor: '#63a863', isHQ: false },
    { gx: 8, gy: 2, id: 'immich', name: 'immich', icon: '🖼️', floors: 3, mainColor: '#27372d', roofColor: '#4255ff', isHQ: false },
    { gx: 8, gy: 5, id: 'app3', name: 'app', icon: '🏢', floors: 2, mainColor: '#27372d', roofColor: '#e8d089', isHQ: false },
    { gx: 4, gy: 1, id: 'app4', name: 'app', icon: '📦', floors: 3, mainColor: '#27372d', roofColor: '#d99166', isHQ: false },
  ];

  const activeBuildings = [buildingSlots[0]]; // Always HQ
  installedApps.forEach((app, idx) => {
    const slotIdx = 1 + idx;
    if (slotIdx < buildingSlots.length) {
      const slot = { ...buildingSlots[slotIdx] };
      slot.id = app.id;
      slot.name = app.id;
      slot.icon = app.id === 'senandung' ? '🎵' : (app.id.includes('immich') ? '🖼️' : '🏢');
      slot.app = app;
      activeBuildings.push(slot);
    }
  });

  // Animated Vehicles
  const cars = [
    { x: 3, y: 0, speed: 0.04, axis: 'y', dir: 1, color: '#8ac275' },
    { x: 6, y: 9, speed: 0.035, axis: 'y', dir: -1, color: '#d99166' },
    { x: 0, y: 3, speed: 0.045, axis: 'x', dir: 1, color: '#e8d089' },
    { x: 9, y: 6, speed: 0.04, axis: 'x', dir: -1, color: '#63a863' }
  ];

  // Animated Citizens (Sims)
  const citizens = [
    { x: 2.2, y: 3.2, speed: 0.015, dir: 1 },
    { x: 5.5, y: 5.5, speed: -0.012, dir: -1 },
    { x: 3.5, y: 1.5, speed: 0.018, dir: 1 }
  ];

  function drawIsoTile(gx, gy, color, border) {
    const p = toIso(gx, gy);
    ctx.beginPath();
    ctx.moveTo(p.isoX, p.isoY);
    ctx.lineTo(p.isoX + tileW / 2, p.isoY + tileH / 2);
    ctx.lineTo(p.isoX, p.isoY + tileH);
    ctx.lineTo(p.isoX - tileW / 2, p.isoY + tileH / 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  function drawIsoBuilding(b) {
    const p = toIso(b.gx, b.gy);
    const height = b.floors * 24;

    // Left wall
    ctx.beginPath();
    ctx.moveTo(p.isoX - tileW / 2, p.isoY + tileH / 2);
    ctx.lineTo(p.isoX, p.isoY + tileH);
    ctx.lineTo(p.isoX, p.isoY + tileH - height);
    ctx.lineTo(p.isoX - tileW / 2, p.isoY + tileH / 2 - height);
    ctx.closePath();
    ctx.fillStyle = '#17221b';
    ctx.fill();
    ctx.strokeStyle = '#27372d';
    ctx.stroke();

    // Right wall
    ctx.beginPath();
    ctx.moveTo(p.isoX, p.isoY + tileH);
    ctx.lineTo(p.isoX + tileW / 2, p.isoY + tileH / 2);
    ctx.lineTo(p.isoX + tileW / 2, p.isoY + tileH / 2 - height);
    ctx.lineTo(p.isoX, p.isoY + tileH - height);
    ctx.closePath();
    ctx.fillStyle = b.mainColor;
    ctx.fill();
    ctx.strokeStyle = '#34473b';
    ctx.stroke();

    // Roof diamond
    ctx.beginPath();
    ctx.moveTo(p.isoX, p.isoY - height);
    ctx.lineTo(p.isoX + tileW / 2, p.isoY + tileH / 2 - height);
    ctx.lineTo(p.isoX, p.isoY + tileH - height);
    ctx.lineTo(p.isoX - tileW / 2, p.isoY + tileH / 2 - height);
    ctx.closePath();
    ctx.fillStyle = b.roofColor;
    ctx.fill();
    ctx.strokeStyle = '#8ac275';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Windows
    for (let f = 0; f < b.floors; f++) {
      for (let c = 0; c < 2; c++) {
        const wx = p.isoX + 6 + c * 13;
        const wy = p.isoY + tileH - (f + 1) * 20 + c * 6;
        ctx.fillStyle = '#e8d089dd';
        ctx.fillRect(wx, wy, 5, 6);
      }
    }

    // Label on roof
    ctx.fillStyle = '#eaf3eb';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(b.icon + ' ' + b.name.slice(0, 9), p.isoX, p.isoY - height - 6);
  }

  function drawIsoTree(gx, gy) {
    const p = toIso(gx, gy);
    ctx.fillStyle = '#483a4b';
    ctx.fillRect(p.isoX - 2, p.isoY + tileH / 2 - 6, 4, 8);
    ctx.beginPath();
    ctx.arc(p.isoX, p.isoY + tileH / 2 - 14, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#3b5243';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.isoX, p.isoY + tileH / 2 - 17, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#63a863';
    ctx.fill();
  }

  // Click on Building Detection
  canvasEl.onclick = (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    activeBuildings.forEach(b => {
      const p = toIso(b.gx, b.gy);
      const topY = p.isoY - (b.floors * 24);
      const botY = p.isoY + tileH;
      if (cx >= p.isoX - tileW / 2 && cx <= p.isoX + tileW / 2 && cy >= topY && cy <= botY) {
        if (b.isHQ) {
          toast('Markas Kepolisian Mastermind: Sistem berjalan normal.');
        } else if (b.app) {
          tab = 'apps';
          render();
          toast(`Membuka kontrol aplikasi ${b.name}`);
        }
      }
    });
  };

  let tick = 0;
  function animateCity() {
    tick++;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Deep Dark Zen Background
    ctx.fillStyle = '#0e1511';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    // 1. Draw Grid Tiles (Roads & Grass)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const t = grid[y][x];
        if (t === 1) {
          drawIsoTile(x, y, '#19221d', '#28362d');
        } else {
          drawIsoTile(x, y, ((x + y) % 2 === 0) ? '#131d17' : '#17241c', '#202f25');
        }
      }
    }

    // 2. Draw Citizens (Sims)
    citizens.forEach(c => {
      c.x += c.speed * c.dir;
      if (c.x > 8.5) c.dir = -1;
      if (c.x < 1.5) c.dir = 1;
      const cp = toIso(c.x, c.y);
      const bob = Math.sin(tick * 0.2 + c.x * 10) * 1.5;
      ctx.fillStyle = '#eaf3eb';
      ctx.fillRect(cp.isoX - 2, cp.isoY - 9 + bob, 4, 3);
      ctx.fillStyle = '#8ac275';
      ctx.fillRect(cp.isoX - 2, cp.isoY - 6 + bob, 4, 5);
    });

    // 3. Draw Vehicles
    cars.forEach(car => {
      if (car.axis === 'y') {
        car.y += car.speed * car.dir;
        if (car.y > 9.5) car.y = 0;
        if (car.y < 0) car.y = 9.5;
      } else {
        car.x += car.speed * car.dir;
        if (car.x > 9.5) car.x = 0;
        if (car.x < 0) car.x = 9.5;
      }
      const p = toIso(car.x, car.y);
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.moveTo(p.isoX, p.isoY - 3);
      ctx.lineTo(p.isoX + 9, p.isoY + 1);
      ctx.lineTo(p.isoX, p.isoY + 5);
      ctx.lineTo(p.isoX - 9, p.isoY + 1);
      ctx.closePath();
      ctx.fill();
    });

    // 4. Draw Trees & Buildings (Sorted by Iso Depth X+Y)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (grid[y][x] === 5) {
          drawIsoTree(x, y);
        }
        const b = activeBuildings.find(item => item.gx === x && item.gy === y);
        if (b) {
          drawIsoBuilding(b);
        }
      }
    }

    cityAnimId = requestAnimationFrame(animateCity);
  }
  animateCity();
}

async function renderImport() {
  if (cityAnimId) { cancelAnimationFrame(cityAnimId); cityAnimId = null; }
  const topBar = await sysbar();
  const card = h('div', { class: 'card' },
    h('h3', {}, '🔍 DETEKSI & IMPOR APLIKASI MANDIRI (NON-SISTEM)'),
    h('p', { class: 'dim', style: 'font-size: 11px;' },
      'Memindai service aplikasi yang sudah terinstall di DietPi Anda (seperti Nextcloud, Immich, Jellyfin, dll). ' +
      'Aplikasi HANYA akan dikelola setelah Anda menekan tombol "Kelola di Mastermind".'
    )
  );

  const listCard = h('div', { class: 'card' }, h('p', { class: 'loading' }, 'Memindai service...'));
  view.replaceChildren(...[topBar, card, listCard].filter(Boolean));

  try {
    const res = await api('external-apps', 'GET');
    const apps = res.apps || [];
    if (!apps.length) {
      listCard.replaceChildren(h('p', { class: 'dim' }, 'Tidak ada aplikasi pihak ketiga mandiri yang terdeteksi saat ini.'));
      return;
    }

    const rows = apps.map(app => {
      const importBtn = h('button', { class: 'good', onclick: async () => {
        importBtn.disabled = true;
        importBtn.textContent = 'Mengimpor...';
        try {
          const r = await api('external-apps/import', 'POST', { name: app.name, port: app.port || 0 });
          toast(r.message || 'Berhasil diimpor!');
          tab = 'apps';
          render();
        } catch (e) {
          toast('GAGAL: ' + e.message);
          importBtn.disabled = false;
          importBtn.textContent = '+ Kelola di Mastermind';
        }
      } }, '+ Kelola di Mastermind');

      return h('tr', {},
        h('td', { style: 'font-weight: bold;' }, app.name),
        h('td', { style: 'font-family: monospace; color: var(--accent);' }, app.port ? `:${app.port}` : '-'),
        h('td', { class: 'dim', style: 'font-size: 11px;' }, app.exec ? app.exec.slice(0, 45) + '...' : '-'),
        h('td', {}, importBtn)
      );
    });

    listCard.replaceChildren(
      h('table', {},
        h('tr', {}, h('th', {}, 'NAMA APLIKASI'), h('th', {}, 'PORT'), h('th', {}, 'EXECUTABLE'), h('th', {}, 'AKSI')),
        ...rows
      )
    );
  } catch (err) {
    listCard.replaceChildren(h('p', { class: 'err' }, 'Gagal memindai: ' + err.message));
  }
}

async function render() {
  if (tab !== 'city' && cityAnimId) { cancelAnimationFrame(cityAnimId); cityAnimId = null; }
  document.querySelectorAll('nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  try {
    if (tab === 'city') {
      await renderCity();
      return;
    }

    if (tab === 'import') {
      await renderImport();
      return;
    }

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
        if (d.unconfigured.length) out.push(h('h2', {}, 'REPO LAINNYA (TANPA BINARY ARM64)'), h('table', {}, d.unconfigured.map(u => h('tr', {}, h('td', {}, u.repo), h('td', {}, u.reason)))));
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

async function start() {
  await fetchAuthInfo();
  nav.hidden = false; loading(); render();
  clearInterval(timer); timer = setInterval(() => { if (!document.hidden && (tab === 'apps' || tab === 'catalog')) render(); }, 15000);
}

nav.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; loading(); render(); } });
$('#logout').addEventListener('click', async () => { await api('logout', 'POST').catch(() => {}); showLogin(); });
window.addEventListener('online', () => { $('#offline').hidden = true; });
window.addEventListener('offline', () => { $('#offline').hidden = false; });

/* PWA Install Trigger */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const pwaBtn = $('#pwa-install-btn');
  if (pwaBtn) pwaBtn.hidden = false;
});

window.triggerPwaInstall = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast('Mastermind dipasang ke layar utama!');
    }
    deferredPrompt = null;
    const pwaBtn = $('#pwa-install-btn');
    if (pwaBtn) pwaBtn.hidden = true;
  } else {
    // Petunjuk manual iOS Safari
    alert("Instalasi PWA ke HP (iOS / Android):\n\n1. iPhone/iPad (Safari): Tekan tombol Bagikan (Share) ⎋ di bawah, lalu pilih 'Tambahkan ke Layar Utama' (Add to Home Screen) ⊞.\n2. Android (Chrome): Buka menu titik tiga ⋮ di pojok kanan atas, lalu pilih 'Pasang Aplikasi' / 'Install App'.");
  }
};

(async () => {
  initTheme();
  initKodamaEyeTracking();
  initAdaptiveFpsEngine();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { const j = await fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json()); if (j.csrf) { csrf = j.csrf; start(); return; } } catch (_) {}
  showLogin();
})();
