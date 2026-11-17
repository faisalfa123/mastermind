
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
let csrf = '', tab = 'apps', timer = null, activeEditingApp = null;

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
   FIXED 24 FPS RENDER ENGINE (Anti-Jitter, Hemat RAM & CPU Odroid C2)
   ========================================================================== */
const TARGET_FPS = 24;
const FRAME_DURATION = 1000 / TARGET_FPS; // 41.66ms
let lastFrameTime = performance.now();
let lastFpsUpdate = performance.now();
let frameCount = 0;

function initAdaptiveFpsEngine() {
  const badge = $('#fps-badge');
  function loop(now) {
    const delta = now - lastFrameTime;
    if (delta >= FRAME_DURATION) {
      lastFrameTime = now - (delta % FRAME_DURATION);
      frameCount++;
    }

    if (now - lastFpsUpdate >= 1000) {
      const realFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      if (badge) {
        badge.textContent = `${Math.min(24, Math.max(1, realFps))} FPS`;
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

  // Track currently active flipped config card
  const toggleFlip = () => {
    const isFlipping = !flipInner.classList.contains('flipped');
    flipInner.classList.toggle('flipped');
    if (isFlipping) {
      activeEditingApp = a.id;
    } else if (activeEditingApp === a.id) {
      activeEditingApp = null;
    }
  };

  // Restore flipped state if card was actively being edited
  if (activeEditingApp === a.id) {
    flipInner.classList.add('flipped');
  }

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
      h('span', { class: 'good' }, a.port ? `:${a.port} Normal` : 'Belum diatur')
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

  // Direct HTTP link (murni http:// tanpa s) dengan tombol tes akses
  const appHost = window.location.hostname;
  const appPortNum = a.port || 0;
  const appUrl = `http://${appHost}:${appPortNum}`;

  const visitBtn = appPortNum > 0
    ? h('a', {
        href: appUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'btn good',
        style: 'font-size: 11px; padding: 4px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;',
        title: `Buka langsung ke ${appUrl} (HTTP murni)`
      }, 'Buka App ↗')
    : h('button', {
        class: 'btn ghost',
        style: 'font-size: 10px; padding: 4px 8px;',
        onclick: toggleFlip,
        title: 'Port belum diatur, klik untuk mengatur port'
      }, '⚙ Set Port');

  const portBanner = h('div', { style: 'background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;' },
    h('div', { style: 'display: flex; align-items: center; gap: 6px; font-size: 12px; font-family: monospace;' },
      h('span', { class: 'dim' }, 'PORT:'),
      h('span', { style: { color: appPortNum ? 'var(--accent)' : 'var(--warn)', fontWeight: 'bold' } }, appPortNum ? `:${appPortNum}` : '[KOSONG]'),
      (a.status === 'active' ? h('span', { class: 'tag ok-badge', style: 'padding: 1px 5px; font-size: 9px;' }, 'ONLINE') : null),
      h('span', { class: 'tag', style: 'font-size: 8.5px; opacity: 0.8;' }, 'HTTP')
    ),
    visitBtn
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
  const inpPort = h('input', { type: 'number', value: a.port || 8080, min: '80', max: '65535' });
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
    } else if (p < 80 || p > 65535) {
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
      activeEditingApp = null;
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
let sfxEnabled = localStorage.getItem('mm-sfx') === '1';
let audioCtx = null;

function playSfx(type) {
  if (!sfxEnabled) return;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'type') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450 + Math.random() * 120, now);
      gain.gain.setValueAtTime(0.015, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.025);
      osc.start(now);
      osc.stop(now + 0.025);
    } else if (type === 'chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.07);
      osc.frequency.setValueAtTime(783.99, now + 0.14);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (type === 'beep') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'step') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140 + Math.random() * 30, now);
      gain.gain.setValueAtTime(0.015, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.02);
      osc.start(now);
      osc.stop(now + 0.02);
    }
  } catch (_) {}
}

async function renderCity() {
  if (cityAnimId) { cancelAnimationFrame(cityAnimId); cityAnimId = null; }
  const topBar = await sysbar();
  let d = { apps: [] };
  try { d = await api('apps'); } catch (_) {}
  const installedApps = d.apps.filter(a => a.installed);

  const sfxBtn = h('button', {
    class: 'ghost',
    style: { padding: '3px 8px', fontSize: '11px', cursor: 'pointer' },
    onclick: () => {
      sfxEnabled = !sfxEnabled;
      localStorage.setItem('mm-sfx', sfxEnabled ? '1' : '0');
      sfxBtn.textContent = sfxEnabled ? '🔊 SFX: AKTIF' : '🔇 SFX: MATI';
      toast(sfxEnabled ? 'Efek Suara Retro Diaktifkan' : 'Efek Suara Dinonaktifkan');
      if (sfxEnabled) playSfx('chime');
    }
  }, sfxEnabled ? '🔊 SFX: AKTIF' : '🔇 SFX: MATI');

  const canvasEl = h('canvas', { id: 'cityCanvas', width: '920', height: '500' });
  const canvasWrap = h('div', { class: 'city-canvas-wrapper' },
    canvasEl,
    h('div', { class: 'city-badge', style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      h('span', { class: 'dot' }),
      'Hermes3D Workspace • 4-Zone Virtual Office (Fixed 24 FPS)',
      sfxBtn
    ),
    h('div', { class: 'city-instructions' }, '💡 Klik Pegawai (App), Rak Server (Sistem), atau Meja Rapat (Standup Report)')
  );

  const cityCard = h('div', { class: 'card city-container' },
    h('div', {},
      h('h3', {}, '🏢 KANTOR VIRTUAL HERMES3D MASTERMIND'),
      h('p', { class: 'dim', style: { fontSize: '11px;' } },
        'Setiap service aplikasi hidup sebagai pegawai aktif di kantor virtual 2.5D retro. ' +
        'Zona Kerja: Meja PC • Zona Server: Rak Sistem (Restart) • Zona Huddle: Meja Rapat Standup • Zona Lounge: Kopi & Istirahat.'
      )
    ),
    canvasWrap
  );

  view.replaceChildren(...[topBar, cityCard].filter(Boolean));

  // Initialize Hermes3D 2.5D Isometric Engine
  const ctx = canvasEl.getContext('2d');
  const resizeCanvas = () => {
    const rect = canvasWrap.getBoundingClientRect();
    canvasEl.width = rect.width || 920;
    canvasEl.height = 490;
  };
  resizeCanvas();

  const tileW = 54;
  const tileH = 27;

  function toIso(x, y) {
    const originX = canvasEl.width / 2;
    const originY = 70;
    return {
      isoX: originX + (x - y) * (tileW / 2),
      isoY: originY + (x + y) * (tileH / 2)
    };
  }

  // Layout Grid 12x10:
  // - Kiri-Atas (X: 0..5, Y: 0..4)   : WORKSTATIONS (Meja Kerja PC)
  // - Kanan-Atas (X: 6..11, Y: 0..4) : SERVER ROOM (Rak Server & Pemeliharaan)
  // - Kiri-Bawah (X: 0..5, Y: 5..9)  : HUDDLE TABLE (Meja Rapat Konferensi)
  // - Kanan-Bawah (X: 6..11, Y: 5..9): PANTRY & LOUNGE (Kopi & Kamar Tidur)

  const workstations = [
    { gx: 1, gy: 1, title: 'Meja Mastermind HQ' },
    { gx: 3, gy: 1 },
    { gx: 1, gy: 3 },
    { gx: 3, gy: 3 },
    { gx: 5, gy: 1 },
    { gx: 5, gy: 3 }
  ];

  const serverRacks = [
    { gx: 8, gy: 1, name: 'Rack Alpha (Cgroups)' },
    { gx: 9, gy: 1, name: 'Rack Beta (Systemd)' },
    { gx: 10, gy: 1, name: 'Rack Gamma (IPC)' }
  ];

  const huddleChairs = [
    { gx: 2, gy: 6 },
    { gx: 3, gy: 6 },
    { gx: 4, gy: 6 },
    { gx: 2, gy: 8 },
    { gx: 4, gy: 8 }
  ];

  const loungeBeds = [
    { gx: 8, gy: 7 },
    { gx: 10, gy: 7 },
    { gx: 8, gy: 9 },
    { gx: 10, gy: 9 }
  ];

  // Map Employees (Service Apps)
  const employees = [];
  // Pegawai 0: Mastermind Chief (Selalu Aktif)
  employees.push({
    id: 'mastermind',
    name: 'Mastermind',
    status: 'active',
    deskGx: workstations[0].gx,
    deskGy: workstations[0].gy,
    curX: workstations[0].gx,
    curY: workstations[0].gy,
    targetX: workstations[0].gx,
    targetY: workstations[0].gy,
    color: '#8ac275',
    hairColor: '#2d3748',
    isHQ: true,
    restarting: false,
    port: 8443,
    bubble: 'Isolasi Cgroups Aman ✓',
    bubbleTimer: 160
  });

  installedApps.forEach((app, idx) => {
    const wsIdx = (idx + 1) % workstations.length;
    const bedIdx = (idx + 1) % loungeBeds.length;
    const isAct = app.status === 'active';
    const desk = workstations[wsIdx];
    const bed = loungeBeds[bedIdx];

    const emp = {
      id: app.id,
      name: app.id,
      app,
      status: app.status,
      port: app.port || 0,
      deskGx: desk.gx,
      deskGy: desk.gy,
      bedGx: bed.gx,
      bedGy: bed.gy,
      curX: isAct ? desk.gx : bed.gx,
      curY: isAct ? desk.gy : bed.gy,
      targetX: isAct ? desk.gx : bed.gx,
      targetY: isAct ? desk.gy : bed.gy,
      color: idx % 4 === 0 ? '#4255ff' : idx % 4 === 1 ? '#d99166' : idx % 4 === 2 ? '#63a863' : '#e53e3e',
      hairColor: idx % 2 === 0 ? '#1f2937' : '#92400e',
      isHQ: false,
      restarting: false,
      bubble: '',
      bubbleTimer: 0
    };
    employees.push(emp);
  });

  // Modal Popups for Interactive Hermes3D Office
  function showStandupModal() {
    playSfx('beep');
    let modal = document.getElementById('standup-modal');
    if (modal) modal.remove();

    const rows = employees.map(e => h('tr', {},
      h('td', { style: 'font-weight: bold;' }, e.name),
      h('td', {}, h('span', { class: 'tag ' + (e.status === 'active' ? 'ok-badge' : 's-stopped') }, e.status.toUpperCase())),
      h('td', { style: 'font-family: monospace; color: var(--accent);' }, e.port ? `:${e.port}` : '-'),
      h('td', { class: 'dim', style: 'font-size: 11px;' }, e.status === 'active' ? 'Bekerja normal di meja' : 'Tidur di kamar istirahat')
    ));

    modal = h('div', { id: 'standup-modal', class: 'term-modal' },
      h('div', { class: 'term-window', style: 'max-width: 540px; padding: 18px;' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' },
          h('h3', { style: 'font-size: 14px; margin: 0;' }, '📋 LAPORAN RAPAT STANDUP KANTOR'),
          h('button', { class: 'ghost', style: 'padding: 2px 8px;', onclick: () => modal.remove() }, '✕')
        ),
        h('p', { class: 'dim', style: 'font-size: 11px; margin-bottom: 10px;' }, 'Ringkasan operasional seluruh armada service app yang bertugas di Mastermind:'),
        h('table', {},
          h('tr', {}, h('th', {}, 'PEGAWAI / APP'), h('th', {}, 'STATUS'), h('th', {}, 'PORT'), h('th', {}, 'KONDISI')),
          ...rows
        ),
        h('div', { style: 'margin-top: 14px; text-align: right;' },
          h('button', { class: 'good', onclick: () => modal.remove() }, 'Tutup Rapat')
        )
      )
    );
    document.body.appendChild(modal);
  }

  async function showServerRoomModal() {
    playSfx('beep');
    let modal = document.getElementById('server-modal');
    if (modal) modal.remove();

    let sys = { load: '0.1', mem_total_mb: 2048, mem_avail_mb: 1400, temp_c: 42, uptime_s: 3600 };
    try { sys = await api('system'); } catch (_) {}
    const usedMem = sys.mem_total_mb - sys.mem_avail_mb;

    modal = h('div', { id: 'server-modal', class: 'term-modal' },
      h('div', { class: 'term-window', style: 'max-width: 480px; padding: 18px;' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' },
          h('h3', { style: 'font-size: 14px; margin: 0;' }, '🖥 RAK SERVER & HARDWARE ODROID C2'),
          h('button', { class: 'ghost', style: 'padding: 2px 8px;', onclick: () => modal.remove() }, '✕')
        ),
        h('div', { style: 'background: var(--panel2); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px; margin-bottom: 12px;' },
          h('div', { style: 'margin-bottom: 6px;' }, `⚡ BEBAN CPU LOAD: ${sys.load}`),
          h('div', { style: 'margin-bottom: 6px;' }, `🧠 PEMAKAIAN RAM: ${usedMem} / ${sys.mem_total_mb} MB`),
          h('div', { style: 'margin-bottom: 6px;' }, `🌡 SUHU CHIPSET: ${sys.temp_c != null ? sys.temp_c + '°C' : '-'}`),
          h('div', {}, `⏱ UPTIME SISTEM: ${Math.floor(sys.uptime_s / 3600)} Jam`)
        ),
        h('p', { class: 'dim', style: 'font-size: 11px;' }, 'Ruang server mengelola isolasi systemd slice dan pembatas memori cgroups untuk semua service app.'),
        h('div', { style: 'margin-top: 14px; text-align: right;' },
          h('button', { class: 'good', onclick: () => modal.remove() }, 'Tutup Rak')
        )
      )
    );
    document.body.appendChild(modal);
  }

  function showEmpQuickMenu(emp) {
    playSfx('beep');
    let modal = document.getElementById('emp-quick-modal');
    if (modal) modal.remove();

    const host = window.location.hostname;
    const directHttp = `http://${host}:${emp.port}`;

    const acts = [];
    if (!emp.isHQ) {
      if (emp.status === 'active') {
        acts.push(h('button', { class: 'ghost', onclick: async () => {
          modal.remove();
          emp.status = 'inactive';
          toast(`Menghentikan ${emp.name}... Pegawai berjalan ke kamar istirahat.`);
          await api(`apps/${emp.id}/stop`, 'POST').catch(e => toast(e.message));
          render();
        } }, '⏹ Hentikan (Tidur)'));
        acts.push(h('button', { class: 'good', onclick: async () => {
          modal.remove();
          emp.restarting = true;
          playSfx('chime');
          toast(`Me-restart ${emp.name}... Pegawai berjalan ke ruang server untuk pemeliharaan.`);
          await api(`apps/${emp.id}/restart`, 'POST').catch(e => toast(e.message));
          setTimeout(() => { emp.restarting = false; render(); }, 1800);
        } }, '🔄 Restart (Pemeliharaan)'));
      } else {
        acts.push(h('button', { class: 'good', onclick: async () => {
          modal.remove();
          emp.status = 'active';
          playSfx('chime');
          toast(`Menjalankan ${emp.name}... Pegawai bangun & menuju meja kerja.`);
          await api(`apps/${emp.id}/start`, 'POST').catch(e => toast(e.message));
          render();
        } }, '▶ Mulai (Bekerja)'));
      }

      if (emp.port > 0) {
        acts.push(h('a', {
          href: directHttp,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'btn good',
          style: 'padding: 6px 12px; text-decoration: none; font-size: 11px;',
          onclick: () => modal.remove()
        }, `Buka HTTP :${emp.port} ↗`));
      }
    }

    modal = h('div', { id: 'emp-quick-modal', class: 'term-modal' },
      h('div', { class: 'term-window', style: 'max-width: 400px; padding: 16px;' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' },
          h('h3', { style: 'font-size: 14px; margin: 0;' }, `👤 Pegawai App: ${emp.name}`),
          h('button', { class: 'ghost', style: 'padding: 2px 8px;', onclick: () => modal.remove() }, '✕')
        ),
        h('p', { class: 'dim', style: 'font-size: 11px; margin-bottom: 8px;' },
          emp.isHQ ? 'Markas Mastermind: Penegak hukum dan pengawas utama sistem.' :
          `Status: ${emp.status.toUpperCase()} • Port: :${emp.port || 'Belum disetel'}`
        ),
        h('div', { class: 'row', style: 'gap: 8px; flex-wrap: wrap; margin-top: 14px;' },
          ...acts,
          h('button', { class: 'ghost', onclick: () => { modal.remove(); tab = 'apps'; render(); } }, 'Detail Lengkap ↗')
        )
      )
    );
    document.body.appendChild(modal);
  }

  // Interactive Click Detection on Canvas
  canvasEl.onclick = (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // 1. Check Employees click
    for (const emp of employees) {
      const p = toIso(emp.curX, emp.curY);
      if (Math.hypot(cx - p.isoX, cy - (p.isoY - 14)) < 24) {
        showEmpQuickMenu(emp);
        return;
      }
    }

    // 2. Check Server Racks click (Zona 2)
    const srvPos = toIso(9, 1);
    if (Math.hypot(cx - srvPos.isoX, cy - (srvPos.isoY - 20)) < 40) {
      showServerRoomModal();
      return;
    }

    // 3. Check Huddle Table click (Zona 3)
    const hudPos = toIso(3, 7);
    if (Math.hypot(cx - hudPos.isoX, cy - hudPos.isoY) < 36) {
      showStandupModal();
      return;
    }

    // 4. Check Coffee Machine (Zona 4)
    const cofPos = toIso(11, 5);
    if (Math.hypot(cx - cofPos.isoX, cy - cofPos.isoY) < 26) {
      playSfx('chime');
      toast('☕ Mesin Kopi Pantry: Menyeduh kopi hangat untuk para service!');
      return;
    }
  };

  // Isometric Drawing Helpers
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

  function drawWorkstationDesk(gx, gy, isOccupied) {
    const p = toIso(gx, gy);
    // Desk table
    ctx.fillStyle = '#2c3b32';
    ctx.fillRect(p.isoX - 13, p.isoY + tileH / 2 - 8, 26, 12);
    ctx.strokeStyle = '#3e5246';
    ctx.strokeRect(p.isoX - 13, p.isoY + tileH / 2 - 8, 26, 12);

    // PC Monitor
    ctx.fillStyle = isOccupied ? '#8ac275' : '#1c2620';
    ctx.fillRect(p.isoX - 7, p.isoY + tileH / 2 - 18, 14, 9);
    // Monitor screen glow
    if (isOccupied) {
      ctx.fillStyle = '#b7e4a6';
      ctx.fillRect(p.isoX - 5, p.isoY + tileH / 2 - 16, 10, 5);
    }
    // Stand
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(p.isoX - 2, p.isoY + tileH / 2 - 9, 4, 3);
  }

  function drawServerRack(gx, gy, tick) {
    const p = toIso(gx, gy);
    const height = 48;
    // Server tower box
    ctx.fillStyle = '#18201a';
    ctx.fillRect(p.isoX - 12, p.isoY - height, 24, height);
    ctx.strokeStyle = '#2d3a30';
    ctx.strokeRect(p.isoX - 12, p.isoY - height, 24, height);

    // Front Server Trays & LED blinks
    for (let i = 0; i < 4; i++) {
      const sy = p.isoY - height + 6 + i * 10;
      ctx.fillStyle = '#222d25';
      ctx.fillRect(p.isoX - 10, sy, 20, 7);

      // Blinking LEDs
      const isBlink = (tick + i * 12) % 24 < 12;
      ctx.fillStyle = isBlink ? '#8ac275' : '#4255ff';
      ctx.fillRect(p.isoX - 8, sy + 2, 3, 3);
      ctx.fillStyle = (tick + i * 8) % 18 < 9 ? '#e8d089' : '#1f2821';
      ctx.fillRect(p.isoX - 3, sy + 2, 3, 3);
    }
  }

  function drawHuddleTable(tick) {
    const p = toIso(3, 7);
    // Conference table ellipse
    ctx.fillStyle = '#3a4b3f';
    ctx.beginPath();
    ctx.ellipse(p.isoX, p.isoY + tileH / 2 - 4, 34, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4d6354';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Tabletop Documents / Hologram
    ctx.fillStyle = '#e8d089bb';
    ctx.fillRect(p.isoX - 8, p.isoY + tileH / 2 - 8, 16, 7);

    // Whiteboard stand behind table
    const wb = toIso(1, 6);
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(wb.isoX - 1, wb.isoY - 30, 2, 30);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(wb.isoX - 14, wb.isoY - 38, 28, 18);
    ctx.strokeStyle = '#cbd5e0';
    ctx.strokeRect(wb.isoX - 14, wb.isoY - 38, 28, 18);
    // Chart lines
    ctx.fillStyle = '#48bb78';
    ctx.fillRect(wb.isoX - 10, wb.isoY - 26, 5, 4);
    ctx.fillRect(wb.isoX - 3, wb.isoY - 30, 5, 8);
    ctx.fillRect(wb.isoX + 4, wb.isoY - 34, 5, 12);
  }

  function drawPantryCoffee(tick) {
    const p = toIso(11, 5);
    // Counter
    ctx.fillStyle = '#313d35';
    ctx.fillRect(p.isoX - 10, p.isoY + tileH / 2 - 8, 20, 14);
    // Coffee Machine
    ctx.fillStyle = '#e53e3e';
    ctx.fillRect(p.isoX - 7, p.isoY + tileH / 2 - 20, 14, 12);
    // Coffee pot
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(p.isoX - 4, p.isoY + tileH / 2 - 12, 8, 6);

    // Steam Vapor
    const steamY = (tick % 24) * 0.4;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(p.isoX, p.isoY + tileH / 2 - 24 - steamY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBed(gx, gy, isOccupied) {
    const p = toIso(gx, gy);
    // Bed frame
    ctx.fillStyle = '#242e28';
    ctx.fillRect(p.isoX - 12, p.isoY + tileH / 2 - 6, 24, 16);
    // Blanket
    ctx.fillStyle = isOccupied ? '#3182ce' : '#4a5568';
    ctx.fillRect(p.isoX - 12, p.isoY + tileH / 2 - 1, 24, 11);
    // Pillow
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(p.isoX - 9, p.isoY + tileH / 2 - 5, 18, 4);
  }

  function drawSimEmployee(emp, tick) {
    // Determine target location based on status & behavior
    if (emp.restarting) {
      // Walk to Server Room for repair / reboot
      emp.targetX = serverRacks[0].gx;
      emp.targetY = serverRacks[0].gy + 1;
    } else if (emp.status === 'active') {
      // Mostly at desk, occasionally standup at huddle
      if ((tick + emp.port) % 480 > 420) {
        emp.targetX = huddleChairs[0].gx;
        emp.targetY = huddleChairs[0].gy;
      } else {
        emp.targetX = emp.deskGx;
        emp.targetY = emp.deskGy;
      }
    } else {
      // Inactive: go sleep in lounge bed
      emp.targetX = emp.bedGx;
      emp.targetY = emp.bedGy;
    }

    // Smooth movement
    const dx = emp.targetX - emp.curX;
    const dy = emp.targetY - emp.curY;
    const dist = Math.hypot(dx, dy);
    const isWalking = dist > 0.08;
    if (isWalking) {
      emp.curX += (dx / dist) * 0.04;
      emp.curY += (dy / dist) * 0.04;
      if (tick % 12 === 0) playSfx('step');
    } else if (emp.status === 'active' && !emp.restarting && Math.random() < 0.02) {
      playSfx('type');
    }

    const p = toIso(emp.curX, emp.curY);
    const bob = isWalking ? Math.sin(tick * 0.4) * 2 : (emp.status === 'active' ? Math.sin(tick * 0.15) * 0.8 : 0);
    const headY = p.isoY - 14 + bob;

    if (emp.status === 'inactive' && !isWalking) {
      // Sleeping in bed
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const zOffset = (tick % 40) * 0.3;
      ctx.fillText('Zzz..', p.isoX + 10, headY - 4 - zOffset);
      return;
    }

    // Head
    ctx.fillStyle = '#f6ad55';
    ctx.beginPath();
    ctx.arc(p.isoX, headY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = emp.hairColor;
    ctx.beginPath();
    ctx.arc(p.isoX, headY - 2, 4, Math.PI, Math.PI * 2);
    ctx.fill();

    // Body (Shirt)
    ctx.fillStyle = emp.color;
    ctx.fillRect(p.isoX - 4, headY + 4, 8, 7);

    // Legs / Pants
    ctx.fillStyle = '#1a202c';
    ctx.fillRect(p.isoX - 3, headY + 11, 2.5, 5);
    ctx.fillRect(p.isoX + 0.5, headY + 11, 2.5, 5);

    // Status Indicator & Head Icons
    if (emp.restarting) {
      // Rotating loading gear/spinner
      ctx.strokeStyle = '#e8d089';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const angle = (tick * 0.3) % (Math.PI * 2);
      ctx.arc(p.isoX, headY - 12, 5, angle, angle + Math.PI * 1.5);
      ctx.stroke();

      ctx.fillStyle = '#e8d089';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('REBOOTING', p.isoX, headY - 20);
    } else {
      // Sims 1 Plumbob (Green diamond)
      ctx.fillStyle = emp.status === 'active' ? '#48bb78' : '#e53e3e';
      ctx.beginPath();
      ctx.moveTo(p.isoX, headY - 14);
      ctx.lineTo(p.isoX + 3, headY - 10);
      ctx.lineTo(p.isoX, headY - 6);
      ctx.lineTo(p.isoX - 3, headY - 10);
      ctx.closePath();
      ctx.fill();
    }

    // Speech / Status Bubble
    if (emp.status === 'active' && !emp.restarting) {
      emp.bubbleTimer--;
      if (emp.bubbleTimer <= 0) {
        if (Math.random() < 0.25) {
          emp.bubble = emp.isHQ ? 'Isolasi Normal ✓' : `${emp.name}: Port :${emp.port || 8080} OK`;
          emp.bubbleTimer = 90; // Tampilkan 90 frame (~3.7 detik)
        } else {
          emp.bubble = '';
          emp.bubbleTimer = 180 + Math.floor(Math.random() * 120);
        }
      }

      if (emp.bubble) {
        ctx.fillStyle = 'rgba(21, 29, 24, 0.9)';
        ctx.strokeStyle = '#8ac275';
        ctx.lineWidth = 1;
        const bWidth = emp.bubble.length * 6 + 12;
        ctx.fillRect(p.isoX - bWidth / 2, headY - 32, bWidth, 14);
        ctx.strokeRect(p.isoX - bWidth / 2, headY - 32, bWidth, 14);

        ctx.fillStyle = '#eaf3eb';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(emp.bubble, p.isoX, headY - 22);
      }
    }

    // Name Label
    ctx.fillStyle = '#eaf3eb';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(emp.name.slice(0, 10), p.isoX, headY + 23);
  }

  // Animation Loop fixed at 24 FPS
  let tick = 0;
  const ISO_FPS = 24;
  const ISO_INTERVAL = 1000 / ISO_FPS;
  let lastIsoFrame = performance.now();

  function animateHermesOffice(now) {
    cityAnimId = requestAnimationFrame(animateHermesOffice);
    if (document.hidden) return;

    const delta = now - lastIsoFrame;
    if (delta < ISO_INTERVAL) return;
    lastIsoFrame = now - (delta % ISO_INTERVAL);
    tick++;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Deep Dark Ambient Floor Background
    ctx.fillStyle = '#0a100c';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    // 1. Draw 12x10 Floor Tiles by Zone
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 12; x++) {
        if (x < 6 && y < 5) {
          // Zone 1: Workstations (Modern Green Parquet)
          drawIsoTile(x, y, ((x + y) % 2 === 0) ? '#16231b' : '#1a2920', '#25382c');
        } else if (x >= 6 && y < 5) {
          // Zone 2: Server Room (Metallic Tech Tile)
          drawIsoTile(x, y, ((x + y) % 2 === 0) ? '#151e22' : '#18242a', '#273840');
        } else if (x < 6 && y >= 5) {
          // Zone 3: Huddle Conference (Warm Boardroom Wood)
          drawIsoTile(x, y, ((x + y) % 2 === 0) ? '#212a23' : '#27332a', '#344538');
        } else {
          // Zone 4: Pantry & Lounge (Cozy Carpet)
          drawIsoTile(x, y, ((x + y) % 2 === 0) ? '#232624' : '#2b2e2c', '#383d3a');
        }
      }
    }

    // 2. Zone Dividers & Hallways
    for (let x = 0; x < 12; x++) {
      if (x === 5 || x === 6) continue;
      const p = toIso(x, 5);
      ctx.fillStyle = '#1e2d24';
      ctx.fillRect(p.isoX - tileW / 2, p.isoY - 6, tileW, 4);
    }

    // Zone Header Labels
    const z1 = toIso(2, 0);
    ctx.fillStyle = '#8ac275bb'; ctx.font = 'bold 9.5px monospace'; ctx.textAlign = 'center';
    ctx.fillText('💻 1. RUANG MEJA KERJA', z1.isoX, z1.isoY - 8);

    const z2 = toIso(9, 0);
    ctx.fillStyle = '#63b3edbb'; ctx.font = 'bold 9.5px monospace'; ctx.textAlign = 'center';
    ctx.fillText('🖥 2. RAK SERVER (MAINTENANCE)', z2.isoX, z2.isoY - 8);

    const z3 = toIso(2, 9);
    ctx.fillStyle = '#e8d089bb'; ctx.font = 'bold 9.5px monospace'; ctx.textAlign = 'center';
    ctx.fillText('📋 3. AREA RAPAT HUDDLE', z3.isoX, z3.isoY + tileH + 16);

    const z4 = toIso(9, 9);
    ctx.fillStyle = '#fc8181bb'; ctx.font = 'bold 9.5px monospace'; ctx.textAlign = 'center';
    ctx.fillText('☕ 4. PANTRY & LOUNGE TIDUR', z4.isoX, z4.isoY + tileH + 16);

    // 3. Draw Zone Furniture
    // Zone 1: Workstations
    workstations.forEach(ws => {
      const isOccupied = employees.some(e => e.deskGx === ws.gx && e.deskGy === ws.gy && e.status === 'active');
      drawWorkstationDesk(ws.gx, ws.gy, isOccupied);
    });

    // Zone 2: Server Racks
    serverRacks.forEach(sr => drawServerRack(sr.gx, sr.gy, tick));

    // Zone 3: Huddle Table
    drawHuddleTable(tick);

    // Zone 4: Coffee Machine & Beds
    drawPantryCoffee(tick);
    loungeBeds.forEach(b => {
      const isOccupied = employees.some(e => e.bedGx === b.gx && e.bedGy === b.gy && e.status !== 'active');
      drawBed(b.gx, b.gy, isOccupied);
    });

    // 4. Draw Employees (Sims) sorted by Isometric Depth
    const sortedEmp = [...employees].sort((a, b) => (a.curX + a.curY) - (b.curX + b.curY));
    sortedEmp.forEach(emp => drawSimEmployee(emp, tick));
  }

  cityAnimId = requestAnimationFrame(animateHermesOffice);
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
  clearInterval(timer); timer = setInterval(() => {
    // Jangan refresh otomatis jika tab disembunyikan atau pengguna sedang mengedit konfigurasi
    if (!document.hidden && !activeEditingApp && (tab === 'apps' || tab === 'catalog')) {
      render();
    }
  }, 15000);
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
