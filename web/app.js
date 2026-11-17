
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

let office3DActive = true;
let threeRenderer = null;

async function renderCity() {
  if (cityAnimId) { cancelAnimationFrame(cityAnimId); cityAnimId = null; }
  if (threeRenderer) {
    try { threeRenderer.dispose(); } catch (_) {}
    threeRenderer = null;
  }
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

  const container3D = h('div', { id: 'office3d-container', style: { width: '100%', height: '520px', position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#0a100c' } });
  const canvasWrap = h('div', { class: 'city-canvas-wrapper', style: { position: 'relative' } },
    container3D,
    h('div', { class: 'city-badge', style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      h('span', { class: 'dot' }),
      'Hermes3D Workspace • True 3D WebGL (Orbit & Zoom) • 24 FPS Fixed',
      sfxBtn
    ),
    h('div', { class: 'city-instructions' }, '🖱️ Putar: Klik & Tarik Mouse • Zoom: Scroll • Klik Pegawai / Server / Meja Rapat')
  );

  const cityCard = h('div', { class: 'card city-container' },
    h('div', {},
      h('h3', {}, '🏢 KANTOR VIRTUAL HERMES3D MASTERMIND (TRUE 3D)'),
      h('p', { class: 'dim', style: { fontSize: '11px;' } },
        'Kantor 3D sejati berbasis WebGL (Three.js) yang dirender 100% di browser Anda (Beban CPU server Odroid C2 = 0%). ' +
        'Anda dapat memutar sudut kamera (Orbit 360°), zoom in/out, dan mengontrol service app yang menjadi staf di kantor ini!'
      )
    ),
    canvasWrap
  );

  view.replaceChildren(...[topBar, cityCard].filter(Boolean));

  // Initialize Three.js Scene
  if (typeof THREE === 'undefined') {
    container3D.appendChild(h('p', { class: 'err', style: { padding: '20px' } }, 'Gagal memuat modul Three.js.'));
    return;
  }

  const width = container3D.clientWidth || 920;
  const height = 520;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a100c);
  scene.fog = new THREE.FogExp2(0x0a100c, 0.015);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 18, 26);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container3D.appendChild(renderer.domElement);
  threeRenderer = renderer;

  // OrbitControls
  let controls = null;
  if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05; // Prevent camera going below floor
    controls.minDistance = 8;
    controls.maxDistance = 45;
    controls.target.set(0, 0, 0);
  }

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xecfdf5, 0.9);
  dirLight.position.set(15, 25, 15);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 60;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  scene.add(dirLight);

  // Accent Colored Lights for Hermes3D Aesthetic
  const serverGlowLight = new THREE.PointLight(0x4299e1, 1.2, 16);
  serverGlowLight.position.set(7, 3, -6);
  scene.add(serverGlowLight);

  const huddleGlowLight = new THREE.PointLight(0x8ac275, 1.0, 16);
  huddleGlowLight.position.set(-6, 3, 5);
  scene.add(huddleGlowLight);

  // 1. Office Floor (4 Colored Zones)
  // Work Area: X: -12..0, Z: -12..0 (Green parquet)
  // Server Room: X: 0..12, Z: -12..0 (Tech Dark Metal)
  // Huddle Area: X: -12..0, Z: 0..12 (Warm Boardroom Wood)
  // Pantry & Lounge: X: 0..12, Z: 0..12 (Comfortable Carpet)

  function createZoneTile(x, z, w, d, color) {
    const geo = new THREE.BoxGeometry(w, 0.4, d);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, -0.2, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  createZoneTile(-6, -6, 12, 12, 0x16241c); // Zone 1: Workstations
  createZoneTile(6, -6, 12, 12, 0x18242a);  // Zone 2: Server Room
  createZoneTile(-6, 6, 12, 12, 0x242d26);  // Zone 3: Huddle Conference
  createZoneTile(6, 6, 12, 12, 0x2c2e2d);   // Zone 4: Pantry Lounge

  // Floor Grid lines
  const gridHelper = new THREE.GridHelper(24, 24, 0x273b30, 0x1e2c24);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Perimeter Low Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1f2b23, roughness: 0.8 });
  function addWall(x, z, w, d, h) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  addWall(0, -12.1, 24.2, 0.4, 1.8);
  addWall(-12.1, 0, 0.4, 24.2, 1.8);
  addWall(12.1, 0, 0.4, 24.2, 1.8);

  // Zone 3D Furniture Storage
  const interactiveObjects = [];

  // Workstations (3D Desks with Monitors)
  const deskLocations = [
    { x: -8, z: -8, name: 'Meja Mastermind HQ' },
    { x: -4, z: -8 },
    { x: -8, z: -4 },
    { x: -4, z: -4 },
    { x: -8, z: -1 },
    { x: -4, z: -1 }
  ];

  const deskMat = new THREE.MeshStandardMaterial({ color: 0x2d3e34, roughness: 0.6 });
  const pcMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.5 });
  const screenMatActive = new THREE.MeshBasicMaterial({ color: 0x8ac275 });
  const screenMatIdle = new THREE.MeshBasicMaterial({ color: 0x2d3748 });

  deskLocations.forEach(dl => {
    // Desk Top
    const dGeo = new THREE.BoxGeometry(2.4, 0.15, 1.4);
    const dMesh = new THREE.Mesh(dGeo, deskMat);
    dMesh.position.set(dl.x, 1.2, dl.z);
    dMesh.castShadow = true;
    dMesh.receiveShadow = true;
    scene.add(dMesh);

    // Legs
    [-1, 1].forEach(lx => {
      [-0.5, 0.5].forEach(lz => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2), pcMat);
        leg.position.set(dl.x + lx * 1.0, 0.6, dl.z + lz * 0.5);
        leg.castShadow = true;
        scene.add(leg);
      });
    });

    // Monitor
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.08), pcMat);
    mon.position.set(dl.x, 1.7, dl.z - 0.35);
    mon.castShadow = true;
    scene.add(mon);

    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), screenMatActive);
    scr.position.set(dl.x, 1.7, dl.z - 0.3);
    scene.add(scr);
  });

  // Server Room (Zone 2): 3D Server Racks
  const serverRackMeshes = [];
  [-3, 0, 3].forEach((offset, idx) => {
    const srvBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.2, 1.8), new THREE.MeshStandardMaterial({ color: 0x18201a, roughness: 0.4, metalness: 0.6 }));
    srvBox.position.set(4 + offset * 1.8, 2.1, -8);
    srvBox.castShadow = true;
    srvBox.receiveShadow = true;
    srvBox.userData = { type: 'server' };
    scene.add(srvBox);
    interactiveObjects.push(srvBox);
    serverRackMeshes.push(srvBox);

    // Server Tray Lines with blinking emissive LED lights
    for (let i = 0; i < 5; i++) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0x48bb78 }));
      led.position.set(4 + offset * 1.8 - 0.5 + i * 0.25, 0.8 + i * 0.7, -7.08);
      scene.add(led);
    }
  });

  // Huddle Conference Table (Zone 3)
  const huddleTable = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 0.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x3d5042, roughness: 0.6 })
  );
  huddleTable.position.set(-6, 1.2, 6);
  huddleTable.castShadow = true;
  huddleTable.receiveShadow = true;
  huddleTable.userData = { type: 'huddle' };
  scene.add(huddleTable);
  interactiveObjects.push(huddleTable);

  const huddleStand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.2, 16), pcMat);
  huddleStand.position.set(-6, 0.6, 6);
  scene.add(huddleStand);

  // Hologram center on Huddle Table
  const holoGeo = new THREE.OctahedronGeometry(0.4, 0);
  const holoMat = new THREE.MeshBasicMaterial({ color: 0x8ac275, wireframe: true });
  const hologram = new THREE.Mesh(holoGeo, holoMat);
  hologram.position.set(-6, 2.0, 6);
  scene.add(hologram);

  // Whiteboard
  const wb = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.1), new THREE.MeshStandardMaterial({ color: 0xf7fafc, roughness: 0.3 }));
  wb.position.set(-10, 2.2, 6);
  wb.rotation.y = Math.PI / 2;
  scene.add(wb);

  // Pantry & Lounge (Zone 4): Coffee Machine & Beds
  const coffeeCounter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.2), new THREE.MeshStandardMaterial({ color: 0x313d35 }));
  coffeeCounter.position.set(9, 0.65, 3);
  coffeeCounter.castShadow = true;
  coffeeCounter.userData = { type: 'coffee' };
  scene.add(coffeeCounter);
  interactiveObjects.push(coffeeCounter);

  const coffeeMachine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: 0xe53e3e, roughness: 0.3 }));
  coffeeMachine.position.set(9, 1.75, 3);
  coffeeMachine.castShadow = true;
  scene.add(coffeeMachine);

  // Lounge Beds
  const bedLocations = [
    { x: 5, z: 8 },
    { x: 8, z: 8 },
    { x: 5, z: 10.5 },
    { x: 8, z: 10.5 }
  ];

  bedLocations.forEach(bl => {
    const bFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 2.6), new THREE.MeshStandardMaterial({ color: 0x242e28 }));
    bFrame.position.set(bl.x, 0.2, bl.z);
    bFrame.castShadow = true;
    scene.add(bFrame);

    const bMat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.6), new THREE.MeshStandardMaterial({ color: 0x3182ce, roughness: 0.8 }));
    bMat.position.set(bl.x, 0.4, bl.z + 0.4);
    scene.add(bMat);

    const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    pillow.position.set(bl.x, 0.45, bl.z - 0.8);
    scene.add(pillow);
  });

  // 2. 3D Avatar Employees (Hermes3D Agent Workers)
  const employees = [];

  function createAgentAvatar(emp) {
    const group = new THREE.Group();

    // Body / Shirt
    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.0, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: emp.color, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf6ad55, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);

    // Hair
    const hairGeo = new THREE.SphereGeometry(0.34, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const hairMat = new THREE.MeshStandardMaterial({ color: emp.hairColor, roughness: 0.9 });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 1.8;
    group.add(hair);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a202c });
    [-0.18, 0.18].forEach(lx => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.35, 0);
      leg.castShadow = true;
      group.add(leg);
    });

    // Sims 1 Plumbob / Indicator above head
    const plumbobGeo = new THREE.OctahedronGeometry(0.24, 0);
    const plumbobMat = new THREE.MeshBasicMaterial({ color: emp.status === 'active' ? 0x48bb78 : 0xe53e3e });
    const plumbob = new THREE.Mesh(plumbobGeo, plumbobMat);
    plumbob.position.y = 2.45;
    group.add(plumbob);

    // Text Label Sprite
    const canvasText = document.createElement('canvas');
    canvasText.width = 256; canvasText.height = 64;
    const tCtx = canvasText.getContext('2d');
    tCtx.fillStyle = '#0e1511ee';
    tCtx.fillRect(10, 10, 236, 44);
    tCtx.strokeStyle = '#8ac275';
    tCtx.lineWidth = 3;
    tCtx.strokeRect(10, 10, 236, 44);
    tCtx.fillStyle = '#eaf3eb';
    tCtx.font = 'bold 24px monospace';
    tCtx.textAlign = 'center';
    tCtx.fillText(emp.name.slice(0, 14), 128, 41);

    const texture = new THREE.CanvasTexture(canvasText);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 2.95;
    sprite.scale.set(1.8, 0.45, 1);
    group.add(sprite);

    group.position.set(emp.curX, 0, emp.curZ);
    group.userData = { type: 'employee', emp };
    scene.add(group);

    emp.meshGroup = group;
    emp.plumbob = plumbob;
    interactiveObjects.push(body);
    body.userData = { type: 'employee', emp };
  }

  // Pegawai 0: Mastermind Chief
  employees.push({
    id: 'mastermind',
    name: 'Mastermind',
    status: 'active',
    deskX: deskLocations[0].x,
    deskZ: deskLocations[0].z + 0.8,
    bedX: bedLocations[0].x,
    bedZ: bedLocations[0].z,
    curX: deskLocations[0].x,
    curZ: deskLocations[0].z + 0.8,
    targetX: deskLocations[0].x,
    targetZ: deskLocations[0].z + 0.8,
    color: 0x8ac275,
    hairColor: 0x2d3748,
    isHQ: true,
    restarting: false,
    port: 8443
  });

  installedApps.forEach((app, idx) => {
    const dIdx = (idx + 1) % deskLocations.length;
    const bIdx = (idx + 1) % bedLocations.length;
    const isAct = app.status === 'active';
    const desk = deskLocations[dIdx];
    const bed = bedLocations[bIdx];

    const emp = {
      id: app.id,
      name: app.id,
      app,
      status: app.status,
      port: app.port || 0,
      deskX: desk.x,
      deskZ: desk.z + 0.8,
      bedX: bed.x,
      bedZ: bed.z,
      curX: isAct ? desk.x : bed.x,
      curZ: isAct ? (desk.z + 0.8) : bed.z,
      targetX: isAct ? desk.x : bed.x,
      targetZ: isAct ? (desk.z + 0.8) : bed.z,
      color: idx % 4 === 0 ? 0x4255ff : idx % 4 === 1 ? 0xd99166 : idx % 4 === 2 ? 0x63a863 : 0xe53e3e,
      hairColor: idx % 2 === 0 ? 0x1f2937 : 0x92400e,
      isHQ: false,
      restarting: false
    };
    employees.push(emp);
  });

  employees.forEach(createAgentAvatar);

  // Click & Raycasting Detection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onCanvasClick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const type = hit.userData.type;

      if (type === 'employee') {
        showEmpQuickMenu(hit.userData.emp);
      } else if (type === 'server') {
        showServerRoomModal();
      } else if (type === 'huddle') {
        showStandupModal();
      } else if (type === 'coffee') {
        playSfx('chime');
        toast('☕ Mesin Kopi Hermes3D: Secangkir kopi hangat disajikan untuk staf service!');
      }
    }
  }

  renderer.domElement.addEventListener('click', onCanvasClick);

  // Modals for Interactive Features
  function showStandupModal() {
    playSfx('beep');
    let modal = document.getElementById('standup-modal');
    if (modal) modal.remove();

    const rows = employees.map(e => h('tr', {},
      h('td', { style: 'font-weight: bold;' }, e.name),
      h('td', {}, h('span', { class: 'tag ' + (e.status === 'active' ? 'ok-badge' : 's-stopped') }, e.status.toUpperCase())),
      h('td', { style: 'font-family: monospace; color: var(--accent);' }, e.port ? `:${e.port}` : '-'),
      h('td', { class: 'dim', style: 'font-size: 11px;' }, e.status === 'active' ? 'Online di meja kerja' : 'Offline di kamar tidur')
    ));

    modal = h('div', { id: 'standup-modal', class: 'term-modal' },
      h('div', { class: 'term-window', style: 'max-width: 540px; padding: 18px;' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' },
          h('h3', { style: 'font-size: 14px; margin: 0;' }, '📋 LAPORAN RAPAT STANDUP HERMES3D'),
          h('button', { class: 'ghost', style: 'padding: 2px 8px;', onclick: () => modal.remove() }, '✕')
        ),
        h('p', { class: 'dim', style: 'font-size: 11px; margin-bottom: 10px;' }, 'Status operasional seluruh armada service app yang bertugas di Mastermind:'),
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
        h('p', { class: 'dim', style: 'font-size: 11px;' }, 'Mengelola isolasi cgroups slice & namespace kernel untuk service aplikasi.'),
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
          emp.plumbob.material.color.setHex(0xe53e3e);
          toast(`Menghentikan ${emp.name}... Pegawai berjalan ke kamar istirahat.`);
          await api(`apps/${emp.id}/stop`, 'POST').catch(e => toast(e.message));
          render();
        } }, '⏹ Hentikan (Tidur)'));
        acts.push(h('button', { class: 'good', onclick: async () => {
          modal.remove();
          emp.restarting = true;
          playSfx('chime');
          toast(`Me-restart ${emp.name}... Pegawai menuju ruang server.`);
          await api(`apps/${emp.id}/restart`, 'POST').catch(e => toast(e.message));
          setTimeout(() => { emp.restarting = false; render(); }, 1800);
        } }, '🔄 Restart (Pemeliharaan)'));
      } else {
        acts.push(h('button', { class: 'good', onclick: async () => {
          modal.remove();
          emp.status = 'active';
          emp.plumbob.material.color.setHex(0x48bb78);
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

  // 3D Animation Loop locked at fixed 24 FPS
  let tick = 0;
  const THREE_FPS = 24;
  const THREE_INTERVAL = 1000 / THREE_FPS;
  let last3DFrame = performance.now();

  function animate3D(now) {
    cityAnimId = requestAnimationFrame(animate3D);
    if (document.hidden) return;

    const delta = now - last3DFrame;
    if (delta < THREE_INTERVAL) return;
    last3DFrame = now - (delta % THREE_INTERVAL);
    tick++;

    if (controls) controls.update();

    // Rotate Hologram on Huddle Table
    hologram.rotation.y += 0.04;
    hologram.rotation.x = Math.sin(tick * 0.05) * 0.2;

    // Animate Employees position & plumbob rotation
    employees.forEach(emp => {
      if (emp.restarting) {
        emp.targetX = 4;
        emp.targetZ = -5.8;
      } else if (emp.status === 'active') {
        // Mostly at desk, periodically huddle
        if ((tick + emp.port) % 480 > 400) {
          emp.targetX = -6 + Math.cos(emp.port) * 2.5;
          emp.targetZ = 6 + Math.sin(emp.port) * 2.5;
        } else {
          emp.targetX = emp.deskX;
          emp.targetZ = emp.deskZ;
        }
      } else {
        emp.targetX = emp.bedX;
        emp.targetZ = emp.bedZ;
      }

      // Smooth step movement
      const dx = emp.targetX - emp.curX;
      const dz = emp.targetZ - emp.curZ;
      const dist = Math.hypot(dx, dz);
      const isWalking = dist > 0.08;

      if (isWalking) {
        emp.curX += (dx / dist) * 0.08;
        emp.curZ += (dz / dist) * 0.08;
        emp.meshGroup.rotation.y = Math.atan2(dx, dz);
        if (tick % 12 === 0) playSfx('step');
      } else if (emp.status === 'active' && !emp.restarting && Math.random() < 0.02) {
        playSfx('type');
      }

      emp.meshGroup.position.x = emp.curX;
      emp.meshGroup.position.z = emp.curZ;

      // Bobbing animation
      const bob = isWalking ? Math.sin(tick * 0.5) * 0.1 : (emp.status === 'active' ? Math.sin(tick * 0.15) * 0.03 : 0);
      emp.meshGroup.position.y = bob;

      // Spin plumbob
      if (emp.plumbob) emp.plumbob.rotation.y += 0.05;
    });

    renderer.render(scene, camera);
  }

  cityAnimId = requestAnimationFrame(animate3D);
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
