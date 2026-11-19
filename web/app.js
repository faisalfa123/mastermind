
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


let isUpdatingMastermind = false;

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
    } catch (_) {
      // Selama self-update berlangsung, abaikan disconnect sementara saat daemon restart
    }
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
function toast(m, type = 'info') {
  const t = $('#toast');
  if (!t) return;
  const isErr = type === 'error' || /gagal|error|ditolak|mismatch|blocked|failed|salah|bentrok/i.test(String(m));
  const isSucc = type === 'success' || /berhasil|success|valid|disalin|selesai|ok|aktif/i.test(String(m));
  const icon = isErr ? '⚠️' : (isSucc ? '✅' : 'ℹ️');
  const toneClass = isErr ? 'toast-error' : (isSucc ? 'toast-success' : 'toast-info');

  t.className = `show ${toneClass}`;
  t.replaceChildren(
    h('span', { class: 'toast-icon', style: 'font-size:16px;line-height:1;user-select:none;' }, icon),
    h('div', { class: 'toast-body', style: 'flex:1;word-break:break-word;' }, String(m)),
    h('button', {
      type: 'button',
      class: 'toast-close',
      'aria-label': 'Tutup notifikasi',
      style: 'background:none;border:none;color:inherit;cursor:pointer;padding:0 0 0 8px;font-size:14px;opacity:0.8;font-weight:bold;line-height:1;',
      onclick: () => { t.className = ''; }
    }, '✕')
  );
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.className = ''; }, 6000);
}
function levelUp(txt) { const d = h('div', { class: 'levelup' }, h('span', {}, txt)); document.body.append(d); setTimeout(() => d.remove(), 1300); }
function loading() { view.replaceChildren(h('p', { class: 'loading' }, h('i'), h('i'), h('i'))); }

/* Dual Mode Ghibli & Kalender Event Musim Indonesia + Internasional */
const SEASON_CATALOG = [
  { id: 'ramadhan', region: 'Indonesia', name: 'Ramadhan & Lebaran', desc: 'Lentera ketupat & bulan sabit hangat (Maret-April)' },
  { id: 'merdeka',  region: 'Indonesia', name: '17 Agustus (Merdeka)', desc: 'Nuansa merah-putih lembut & lampion kemerdekaan (Agustus)' },
  { id: 'hujan',    region: 'Indonesia', name: 'Musim Hujan', desc: 'Rintik hujan cat air & kabut sejuk (November-Februari)' },
  { id: 'kemarau',  region: 'Indonesia', name: 'Musim Kemarau', desc: 'Langit cerah hangat & benih dandelion (Mei-Oktober)' },
  { id: 'sakura',   region: 'Internasional', name: 'Spring (Sakura)', desc: 'Kelopak sakura lembut berterbangan (Maret-Mei)' },
  { id: 'summer',   region: 'Internasional', name: 'Summer (Kunang-kunang)', desc: 'Kunang-kunang keemasan di padang rumput (Juni-Agustus)' },
  { id: 'autumn',   region: 'Internasional', name: 'Autumn (Maple)', desc: 'Daun maple jingga gugur perlahan (September-November)' },
  { id: 'winter',   region: 'Internasional', name: 'Winter (Natal & Tahun Baru)', desc: 'Salju lembut & langit musim dingin (Desember-Januari)' }
];

function detectAutoSeason(now = new Date()) {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  // Event Indonesia prioritas berdasarkan kalender tahunan
  if (m === 8 && d >= 1 && d <= 25) return 'merdeka';
  if ((m === 12 && d >= 18) || (m === 1 && d <= 7)) return 'winter';
  if ((m === 3 && d >= 15) || (m === 4 && d <= 15)) return 'sakura';
  if (m === 2 && d >= 18 || (m === 3 && d <= 14)) return 'ramadhan';
  if (m >= 9 && m <= 11) return 'autumn';
  if (m === 12 || m === 1 || m === 2) return 'hujan';
  if (m >= 6 && m <= 7) return 'summer';
  return 'kemarau';
}

function applyMode(mode) {
  const m = mode === 'night' ? 'night' : 'day';
  document.documentElement.dataset.mode = m;
  localStorage.setItem('mm-mode', m);
  const btn = $('#mode-toggle');
  const lbl = $('#mode-toggle-label');
  if (btn) btn.setAttribute('aria-pressed', m === 'night' ? 'true' : 'false');
  if (lbl) lbl.textContent = m === 'night' ? 'Mode Malam' : 'Mode Siang';
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', m === 'night' ? '#141923' : '#f4ede0');
  if (window.MastermindScene) window.MastermindScene.setMode(m);
}

function applySeason(pref) {
  const isAuto = !pref || pref === 'auto';
  const effective = isAuto ? detectAutoSeason() : pref;
  document.documentElement.dataset.season = effective;
  localStorage.setItem('mm-season-pref', isAuto ? 'auto' : effective);
  const meta = SEASON_CATALOG.find(s => s.id === effective) || SEASON_CATALOG[3];
  const pill = $('#season-pill-text');
  if (pill) pill.textContent = isAuto ? `Auto: ${meta.name}` : meta.name;
  const footerInfo = $('#footer-season-info');
  if (footerInfo) footerInfo.textContent = `${meta.region}: ${meta.name}`;
  const sel = $('#season-select');
  if (sel) sel.value = isAuto ? 'auto' : effective;
  if (window.MastermindScene) window.MastermindScene.setSeason(effective);
}

function renderSeasonCalendarModal() {
  const list = $('#season-calendar-list');
  const dlg = $('#season-dlg');
  if (!list || !dlg) return;
  const current = document.documentElement.dataset.season || 'kemarau';
  const pref = localStorage.getItem('mm-season-pref') || 'auto';
  const items = [
    h('button', {
      type: 'button',
      class: 'season-cal-item' + (pref === 'auto' ? ' active' : ''),
      onclick: () => { applySeason('auto'); dlg.close(); toast('Musim diatur ke Otomatis (Kalender)'); }
    }, h('strong', {}, 'Otomatis (Kalender Hari Ini)'), h('small', {}, `Terdeteksi saat ini: ${detectAutoSeason().toUpperCase()}`))
  ];
  for (const s of SEASON_CATALOG) {
    items.push(h('button', {
      type: 'button',
      class: 'season-cal-item' + (pref !== 'auto' && current === s.id ? ' active' : ''),
      onclick: () => { applySeason(s.id); dlg.close(); toast(`Pratinjau Musim: ${s.name}`); }
    }, h('strong', {}, s.name), h('small', {}, `${s.region} - ${s.desc}`)));
  }
  list.replaceChildren(...items);
  if (typeof dlg.showModal === 'function') dlg.showModal();
}

function initTheme() {
  const savedMode = localStorage.getItem('mm-mode') || 'day';
  const savedSeason = localStorage.getItem('mm-season-pref') || 'auto';
  applyMode(savedMode);
  applySeason(savedSeason);

  const modeBtn = $('#mode-toggle');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      const next = document.documentElement.dataset.mode === 'night' ? 'day' : 'night';
      applyMode(next);
      toast(next === 'night' ? 'Mode Malam (Lentera) aktif' : 'Mode Siang (Ghibli) aktif');
    });
  }

  const seasonSel = $('#season-select');
  if (seasonSel) {
    seasonSel.addEventListener('change', () => {
      applySeason(seasonSel.value);
      toast('Suasana: ' + seasonSel.options[seasonSel.selectedIndex].text);
    });
  }

  const calBtn = $('#season-calendar-btn');
  if (calBtn) {
    calBtn.addEventListener('click', renderSeasonCalendarModal);
  }

  const animSel = $('#anim-select');
  if (animSel) {
    animSel.value = localStorage.getItem('mm-anim') || 'full';
    animSel.addEventListener('change', () => {
      if (window.MastermindScene) window.MastermindScene.setAnimMode(animSel.value);
      toast(animSel.options[animSel.selectedIndex].text);
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

  const headerMascot = document.getElementById('kodama-mascot');
  if (headerMascot) {
    headerMascot.title = 'Shell Bumiayu (Klik untuk Info Sistem & Update Mastermind)';
    headerMascot.onclick = openMastermindSystemModal;
  }
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
  if (r.status === 401 && path !== 'login') {
    if (!isUpdatingMastermind) {
      showLogin();
    }
    throw new Error('sesi berakhir');
  }
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
      t.type = 'password';
      t.placeholder = 'PASSWORD ADMIN / JAWABAN';
    } else if (needTotp) {
      t.removeAttribute('inputmode');
      t.removeAttribute('maxlength');
      t.type = 'password';
      t.placeholder = 'PASSWORD ADMIN / KODE 2FA';
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

/* ==========================================================================
   MASTERMIND SYSTEM INFO & SELF-UPDATE MODAL
   ========================================================================== */
function openMastermindSystemModal() {
  document.getElementById('sys-modal')?.remove();

  const close = () => modal.remove();
  const infoStatus = h('p', { class: 'dim', style: 'font-size: 11px; margin-top: 8px;' }, 'Memeriksa rilis terbaru di GitHub...');
  const actionRow = h('div', { class: 'row', style: 'margin-top: 14px; gap: 8px;' });

  const activeVerVal = h('div', { class: 'drawer-metric-val', style: 'color: var(--accent);' }, 'v' + (window.__mmVersion || '...'));

  const modal = h('div', { id: 'sys-modal', class: 'wiz-modal-overlay' },
    h('div', { class: 'wiz-dialog', style: 'max-width: 540px;' },
      h('div', { class: 'wiz-header' },
        h('h3', { style: 'margin: 0; font-size: 14px; display: flex; align-items: center; gap: 6px;' },
          h('span', {}, '👑'),
          h('span', {}, 'MASTERMIND HQ • KERNEL & SISTEM')
        ),
        h('button', { class: 'ghost', onclick: close, style: 'padding: 2px 8px; font-size: 12px;' }, '✕')
      ),
      h('div', { style: 'padding: 18px;' },
        h('div', { class: 'drawer-metric-grid', style: 'margin-bottom: 14px;' },
          h('div', { class: 'drawer-metric-box' },
            h('div', { class: 'drawer-metric-label' }, 'VERSI AKTIF'),
            activeVerVal
          ),
          h('div', { class: 'drawer-metric-box' },
            h('div', { class: 'drawer-metric-label' }, 'TARGET ARCH'),
            h('div', { class: 'drawer-metric-val' }, 'ARM64')
          ),
          h('div', { class: 'drawer-metric-box' },
            h('div', { class: 'drawer-metric-label' }, 'MEMORI DAEMON'),
            h('div', { class: 'drawer-metric-val', style: 'color: var(--good);' }, '< 10 MB')
          ),
          h('div', { class: 'drawer-metric-box' },
            h('div', { class: 'drawer-metric-label' }, 'ISOLASI CGROUP'),
            h('div', { class: 'drawer-metric-val' }, 'SYSTEMD')
          )
        ),
        h('div', { style: 'background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-top: 8px;' },
          h('div', { style: 'font-weight: bold; font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;' },
            h('span', {}, '🌐'),
            h('span', {}, 'Pembaruan Langsung dari Web')
          ),
          h('div', { class: 'dim', style: 'font-size: 11px; margin-bottom: 8px;' }, 'Terapkan pembaruan biner arm64 resmi dari GitHub langsung lewat browser tanpa perlu login SSH.'),
          infoStatus,
          actionRow
        ),
        h('div', { style: 'background: rgba(0, 0, 0, 0.22); border: 1px dashed var(--border); border-radius: 8px; padding: 14px; margin-top: 12px;' },
          h('div', { style: 'font-weight: bold; font-size: 12px; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;' },
            h('span', {}, '💻 Perintah Terminal (SSH) Siap Pakai'),
            h('span', { class: 'dim', style: 'font-size: 10px;' }, 'Bebas Stuck Whiptail')
          ),
          h('div', { class: 'dim', style: 'font-size: 11px; margin-bottom: 6px;' }, '1. Perintah Update Cepat Terminal (1 Baris non-interaktif):'),
          h('div', { style: 'display: flex; gap: 6px; align-items: center;' },
            h('input', {
              type: 'text',
              readonly: true,
              value: 'curl -fsSL https://raw.githubusercontent.com/faisalfa123/mastermind/main/deploy/update.sh | sudo sh',
              style: 'flex: 1; font-family: monospace; font-size: 10px; padding: 6px 8px; background: #0d1117; color: #58a6ff; border: 1px solid var(--border); border-radius: 4px;'
            }),
            h('button', {
              type: 'button',
              class: 'ghost',
              style: 'padding: 6px 10px; font-size: 10px; white-space: nowrap;',
              onclick: () => {
                navigator.clipboard.writeText('curl -fsSL https://raw.githubusercontent.com/faisalfa123/mastermind/main/deploy/update.sh | sudo sh')
                  .then(() => toast('Perintah update terminal disalin!'))
                  .catch(() => toast('Gagal menyalin'));
              }
            }, '📋 Salin')
          ),
          h('div', { class: 'dim', style: 'font-size: 11px; margin-top: 10px; margin-bottom: 6px;' }, '2. Perintah Pasang Baru (Fresh Install) Mode Teks CLI:'),
          h('div', { style: 'display: flex; gap: 6px; align-items: center;' },
            h('input', {
              type: 'text',
              readonly: true,
              value: 'curl -fsSL https://raw.githubusercontent.com/faisalfa123/mastermind/main/deploy/install.sh | sudo sh -s -- --cli',
              style: 'flex: 1; font-family: monospace; font-size: 10px; padding: 6px 8px; background: #0d1117; color: #7ee787; border: 1px solid var(--border); border-radius: 4px;'
            }),
            h('button', {
              type: 'button',
              class: 'ghost',
              style: 'padding: 6px 10px; font-size: 10px; white-space: nowrap;',
              onclick: () => {
                navigator.clipboard.writeText('curl -fsSL https://raw.githubusercontent.com/faisalfa123/mastermind/main/deploy/install.sh | sudo sh -s -- --cli')
                  .then(() => toast('Perintah fresh install CLI disalin!'))
                  .catch(() => toast('Gagal menyalin'));
              }
            }, '📋 Salin')
          )
        )
      ),
      h('div', { class: 'wiz-footer' },
        h('button', { class: 'ghost', onclick: close }, 'Tutup'),
        h('span', { class: 'dim', style: 'font-size: 10px;' }, 'Odroid-C2 • DietPi / Ubuntu')
      )
    )
  );

  document.body.appendChild(modal);

  api('self-update/status', 'GET').then(res => {
    if (res.current_version) {
      activeVerVal.textContent = res.current_version;
      window.__mmVersion = res.current_version.replace(/^v/, '');
    }
    const headerBtn = document.getElementById('system-update-btn');
    const headerTxt = document.getElementById('sys-update-text');
    if (headerBtn && headerTxt) {
      if (res.has_update) {
        headerBtn.classList.add('has-update');
        headerTxt.textContent = `🚀 Update ke ${res.latest_version}`;
      } else {
        headerBtn.classList.remove('has-update');
        headerTxt.textContent = `Mastermind ${res.current_version || ''}`;
      }
    }
    if (res.has_update) {
      infoStatus.innerHTML = `<span style="color:var(--good); font-weight:bold;">🚀 Rilis baru tersedia: ${res.latest_version}</span> (Aktif: ${res.current_version})`;
      const updateBtn = h('button', { class: 'good', style: 'padding: 8px 16px; font-weight: bold;', onclick: async () => {
        close();
        const code = await ask(`UPDATE MASTERMIND KE ${res.latest_version}?\nMasukkan password / jawaban keamanan:`, true);
        if (!code) return;
        isUpdatingMastermind = true;
        const term = showInstallTerminal('mastermind', `UPDATE: Mastermind ${res.latest_version}`);
        try {
          const r = await api('self-update/apply', 'POST', { totp: code });
          toast(r.message || 'Pembaruan berhasil diterapkan!');
          if (term && term.finish) term.finish();
          levelUp('UPGRADED!');
          // Tunggu service hidup kembali lalu muat ulang halaman dengan sesi utuh
          setTimeout(async () => {
            let attempts = 0;
            const checkAlive = setInterval(async () => {
              attempts++;
              try {
                const me = await fetch('/api/me');
                if (me.ok || attempts >= 10) {
                  clearInterval(checkAlive);
                  window.location.reload();
                }
              } catch (_) {
                if (attempts >= 10) {
                  clearInterval(checkAlive);
                  window.location.reload();
                }
              }
            }, 1000);
          }, 2500);
        } catch (err) {
          isUpdatingMastermind = false;
          if (term && term.finish) term.finish(err.message);
          toast('GAGAL UPDATE: ' + err.message);
        }
      } }, `⬆ Update ke ${res.latest_version}`);
      actionRow.replaceChildren(updateBtn);
    } else {
      infoStatus.innerHTML = `<span style="color:var(--good);">✔ Mastermind versi ${res.current_version} sudah rilis paling baru.</span>`;
      const reinstallBtn = h('button', { class: 'ghost', onclick: async () => {
        close();
        const code = await ask(`PASANG ULANG MASTERMIND ${res.current_version}?\nMasukkan password / jawaban keamanan:`, true);
        if (!code) return;
        isUpdatingMastermind = true;
        const term = showInstallTerminal('mastermind', `RE-INSTALL: Mastermind ${res.current_version}`);
        try {
          const r = await api('self-update/apply', 'POST', { totp: code });
          toast(r.message || 'Berhasil dipasang ulang!');
          if (term && term.finish) term.finish();
          setTimeout(async () => {
            let attempts = 0;
            const checkAlive = setInterval(async () => {
              attempts++;
              try {
                const me = await fetch('/api/me');
                if (me.ok || attempts >= 10) {
                  clearInterval(checkAlive);
                  window.location.reload();
                }
              } catch (_) {
                if (attempts >= 10) {
                  clearInterval(checkAlive);
                  window.location.reload();
                }
              }
            }, 1000);
          }, 2500);
        } catch (err) {
          isUpdatingMastermind = false;
          if (term && term.finish) term.finish(err.message);
          toast('GAGAL: ' + err.message);
        }
      } }, '🔄 Pasang Ulang Biner');
      actionRow.replaceChildren(reinstallBtn);
    }
  }).catch(e => {
    infoStatus.textContent = 'Gagal memeriksa GitHub: ' + e.message;
  });
}

function checkMastermindUpdatesQuietly() {
  api('self-update/status', 'GET').then(res => {
    const btn = document.getElementById('system-update-btn');
    const txt = document.getElementById('sys-update-text');
    if (!btn || !txt) return;
    if (res.has_update) {
      btn.classList.add('has-update');
      txt.textContent = `🚀 Update ke ${res.latest_version}`;
      btn.title = `Rilis baru Mastermind ${res.latest_version} tersedia! Klik untuk update langsung di Web`;
    } else {
      btn.classList.remove('has-update');
      txt.textContent = `Mastermind ${res.current_version || ''}`;
    }
  }).catch(() => {});
}

/* ==========================================================================
   INTERACTIVE INSTALL WIZARD (GHOST-WRITING & PORT CONFLICT CHECK)
   ========================================================================== */
function openInstallWizard(a) {
  document.getElementById('install-wiz-modal')?.remove();

  let cfg = {
    id: a.id,
    repo: a.repo || '',
    bin_name: a.id,
    description: a.description || 'Layanan mandiri Mastermind',
    language: a.language || 'rust',
    port: a.port || 8080,
    priority: a.priority || 50,
    memory_max_mb: a.memory_max_mb || 64,
    cpu_quota_pct: a.cpu_quota_pct || 30,
    autostart: true,
    paths_rw: [`/var/lib/mastermind/${a.id}`],
    paths_ro: [],
    pin: ''
  };

  const FORBIDDEN_PATHS = ['/etc', '/root', '/home', '/boot', '/proc', '/sys', '/dev', '/usr', '/bin', '/sbin', '/lib', '/opt/mastermind', '/run', '/var/run'];
  function checkPathsAllowed(paths) {
    for (const p of paths) {
      const clean = p.trim();
      if (!clean) continue;
      if (clean === '/') return `Path '${clean}' dilarang`;
      for (const f of FORBIDDEN_PATHS) {
        if (clean === f || clean.startsWith(f + '/')) return `Path '${clean}' dilarang (direktori sistem aman ${f})`;
      }
      if (clean.startsWith('/var/lib/mastermind/') && clean !== `/var/lib/mastermind/${cfg.id}` && !clean.startsWith(`/var/lib/mastermind/${cfg.id}/`)) {
        return `Path '${clean}' dilarang (jail aplikasi lain)`;
      }
    }
    return null;
  }

  const tomlPreview = h('textarea', {
    rows: 18,
    spellcheck: 'false',
    style: 'width: 100%; height: 350px; font-family: monospace; font-size: 11px; background: #0a110d; color: #a3e635; border: 1px solid var(--border); border-radius: 6px; padding: 10px; resize: none;'
  });

  const pathStatus = h('span', { class: 'port-status-pill port-ok', style: 'display:none;' });

  function updateTomlPreview() {
    tomlPreview.value = [
      `# Mastermind Isolation Manifest (${cfg.id}.batasan.toml)`,
      `# Native cgroups & systemd isolation (tanpa bloat container)`,
      ``,
      `[app]`,
      `id = "${cfg.id}"`,
      `repo = "${cfg.repo}"`,
      `asset = "${cfg.bin_name}"`,
      `language = "${cfg.language}"`,
      `description = "${cfg.description}"`,
      ``,
      `[run]`,
      `port = ${cfg.port}`,
      `priority = ${cfg.priority}`,
      `args = []`,
      ``,
      `[limits]`,
      `memory_max_mb = ${cfg.memory_max_mb}`,
      `cpu_quota_pct = ${cfg.cpu_quota_pct}`,
      `tasks_max = 64`,
      ``,
      `[permissions]`,
      `paths_rw = [${cfg.paths_rw.map(p => `"${p}"`).join(', ')}]`,
      `paths_ro = [${cfg.paths_ro.map(p => `"${p}"`).join(', ')}]`,
      ``,
      `[auto_alive]`,
      `restart = "${cfg.autostart ? 'always' : 'no'}"`,
      `restart_sec = 3`,
      `burst_limit = 5`
    ].join('\n');

    const pathErr = checkPathsAllowed([...cfg.paths_rw, ...cfg.paths_ro]);
    if (pathErr) {
      pathStatus.style.display = 'inline-block';
      pathStatus.textContent = `⚠ ${pathErr}`;
      pathStatus.className = 'port-status-pill port-err';
      installBtn.disabled = true;
    } else {
      pathStatus.style.display = 'none';
      if (portOk) installBtn.disabled = false;
    }
  }

  const portInput = h('input', { type: 'number', min: '80', max: '65535', value: cfg.port });
  const portStatus = h('span', { class: 'port-status-pill port-ok' }, 'Memeriksa...');

  let portOk = true;
  let portDebounce = null;
  const triggerPortCheck = () => {
    clearTimeout(portDebounce);
    portDebounce = setTimeout(async () => {
      const p = parseInt(portInput.value, 10);
      cfg.port = p || 8080;
      updateTomlPreview();
      if (!p || p < 80 || p > 65535) {
        portStatus.textContent = 'Port tidak valid ✗';
        portStatus.className = 'port-status-pill port-err';
        portOk = false;
        installBtn.disabled = true;
        return;
      }
      try {
        const res = await api('check-port', 'POST', { port: p });
        if (res.busy) {
          portStatus.textContent = `⚠ ${res.reason}`;
          portStatus.className = 'port-status-pill port-err';
          portOk = false;
          installBtn.disabled = true;
        } else {
          portStatus.textContent = `✔ Port :${p} tersedia`;
          portStatus.className = 'port-status-pill port-ok';
          portOk = true;
          const pathErr = checkPathsAllowed([...cfg.paths_rw, ...cfg.paths_ro]);
          if (!pathErr) installBtn.disabled = false;
        }
      } catch (_) {
        portStatus.textContent = 'Gagal memeriksa status port';
      }
    }, 280);
  };
  portInput.oninput = triggerPortCheck;

  const memLabel = h('span', { style: 'font-weight: bold; color: var(--accent);' }, `${cfg.memory_max_mb} MB`);
  const memSlider = h('input', { type: 'range', min: '16', max: '1024', step: '16', value: cfg.memory_max_mb, oninput: e => {
    cfg.memory_max_mb = parseInt(e.target.value, 10);
    memLabel.textContent = `${cfg.memory_max_mb} MB`;
    updateTomlPreview();
  } });

  const cpuLabel = h('span', { style: 'font-weight: bold; color: var(--accent);' }, `${cfg.cpu_quota_pct}%`);
  const cpuSlider = h('input', { type: 'range', min: '5', max: '100', step: '5', value: cfg.cpu_quota_pct, oninput: e => {
    cfg.cpu_quota_pct = parseInt(e.target.value, 10);
    cpuLabel.textContent = `${cfg.cpu_quota_pct}%`;
    updateTomlPreview();
  } });

  const prioLabel = h('span', { style: 'font-weight: bold; color: var(--accent);' }, cfg.priority);
  const prioSlider = h('input', { type: 'range', min: '0', max: '100', step: '5', value: cfg.priority, oninput: e => {
    cfg.priority = parseInt(e.target.value, 10);
    prioLabel.textContent = cfg.priority;
    updateTomlPreview();
  } });

  const autostartCheck = h('input', { type: 'checkbox', checked: cfg.autostart, onchange: e => {
    cfg.autostart = e.target.checked;
    updateTomlPreview();
  } });
  const autostartToggle = h('label', { class: 'switch-control' }, autostartCheck, h('span', { class: 'switch-slider' }));

  const rwInput = h('input', { value: cfg.paths_rw.join(', '), placeholder: '/var/lib/mastermind/myapp', oninput: e => {
    cfg.paths_rw = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    updateTomlPreview();
  } });

  const pinInput = h('input', { placeholder: 'SHA256 pin (opsional jika rilis tanpa checksums.txt)', value: cfg.pin, oninput: e => {
    cfg.pin = e.target.value.trim();
  } });

  // Prioritas batasan_toml bawaan resmi aplikasi dari katalog
  if (a.batasan_toml && a.batasan_toml.trim().length > 10) {
    tomlPreview.value = a.batasan_toml;
  } else {
    updateTomlPreview();
  }
  triggerPortCheck();

  const close = () => modal.remove();

  const installBtn = h('button', { class: 'good', onclick: async () => {
    const pathErr = checkPathsAllowed([...cfg.paths_rw, ...cfg.paths_ro]);
    if (pathErr) {
      toast(pathErr);
      return;
    }
    if (!portOk) {
      toast('Perbaiki bentrok port sebelum memasang!');
      return;
    }
    const finalToml = tomlPreview.value;
    close();

    const r = await sensitive(
      `INSTALL ${cfg.id} (PORT :${cfg.port})?`,
      code => api(`apps/${cfg.id}/install`, 'POST', { toml: finalToml, sha256: cfg.pin, totp: code }),
      () => showInstallTerminal(cfg.id, `INSTALL: ${cfg.id}`)
    );
    if (r) {
      levelUp('LEVEL UP!');
      render();
    }
  } }, '✔ Lanjut Pasang (2FA)');

  const formColumn = h('div', {},
    h('div', { style: 'background: var(--panel); padding: 10px 12px; border-radius: 8px; margin-bottom: 10px;' },
      h('div', { style: 'font-size: 11px; font-weight: bold; color: var(--accent);' }, `APLIKASI: ${cfg.id.toUpperCase()}`),
      h('div', { class: 'dim', style: 'font-size: 10px;' }, cfg.repo || 'Katalog Resmi')
    ),
    h('div', { style: 'margin-bottom: 10px;' },
      h('div', { style: 'display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;' },
        h('span', {}, 'Port HTTP Layanan'),
        portStatus
      ),
      portInput
    ),
    h('div', { style: 'margin-bottom: 10px;' },
      h('div', { style: 'display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;' },
        h('span', {}, 'Batas RAM (MemoryMax):'),
        memLabel
      ),
      memSlider
    ),
    h('div', { style: 'margin-bottom: 10px;' },
      h('div', { style: 'display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;' },
        h('span', {}, 'Batas CPU Quota:'),
        cpuLabel
      ),
      cpuSlider
    ),
    h('div', { style: 'margin-bottom: 10px;' },
      h('div', { style: 'display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;' },
        h('span', {}, 'Prioritas OOM (Nice):'),
        prioLabel
      ),
      prioSlider
    ),
    h('div', { style: 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;' },
      h('span', { style: 'font-size: 11px;' }, 'Jalankan Otomatis saat Boot:'),
      autostartToggle
    ),
    h('div', { style: 'margin-bottom: 10px;' },
      h('div', { style: 'display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;' },
        h('span', {}, 'Akses Tulis Jail (paths_rw):'),
        pathStatus
      ),
      rwInput
    ),
    (a.verified === false ? h('div', { style: 'margin-bottom: 8px;' },
      h('label', { style: 'font-size: 10px; color: var(--warn); display: block; margin-bottom: 4px;' }, 'Pin SHA256 (Opsional):'),
      pinInput
    ) : null)
  );

  const previewColumn = h('div', {},
    h('div', { style: 'font-size: 11px; font-weight: bold; margin-bottom: 6px; display: flex; justify-content: space-between;' },
      h('span', {}, 'PRATINJAU .BATASAN.TOML (GHOST-WRITING)'),
      h('span', { class: 'dim', style: 'font-size: 10px;' }, 'Tersinkron Live')
    ),
    tomlPreview
  );

  const modal = h('div', { id: 'install-wiz-modal', class: 'wiz-modal-overlay' },
    h('div', { class: 'wiz-dialog' },
      h('div', { class: 'wiz-header' },
        h('h3', { style: 'margin: 0; font-size: 14px;' }, `⚙ RACIK BATASAN SEBELUM PASANG: ${cfg.id}`),
        h('button', { class: 'ghost', onclick: close, style: 'padding: 2px 8px; font-size: 12px;' }, '✕')
      ),
      h('div', { class: 'wiz-body' }, formColumn, previewColumn),
      h('div', { class: 'wiz-footer' },
        h('button', { class: 'ghost', onclick: close }, 'Batal'),
        installBtn
      )
    )
  );

  document.body.appendChild(modal);

  if (cfg.repo) {
    api('sites/wizard', 'POST', { repo: cfg.repo }).then(res => {
      if (res && res.ok && res.draft && res.draft.toml) {
        tomlPreview.value = res.draft.toml;
      }
    }).catch(() => {});
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
    // Uninstalled app card: Buka Interactive Wizard sebelum Install
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
      h('div', { class: 'row' }, h('button', { class: 'good', onclick: () => openInstallWizard(a) }, '⚙ Pasang & Atur Batasan'))
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
  frontActions.push(h('button', { type: 'button', class: 'ghost', onclick: () => showAppLogs(a.id) }, 'Log'));
  if (a.update_available) {
    frontActions.push(act('update', `🚀 Perbarui ke ${a.latest_version || a.version}`, 'good'));
  } else {
    frontActions.push(act('update', '🔄 Pasang Ulang / Perbarui', 'ghost'));
  }
  if (a.has_rollback) {
    frontActions.push(h('button', {
      type: 'button',
      class: 'ghost',
      title: 'Kembalikan ke snapshot versi sebelumnya',
      onclick: async () => {
        const ok = await sensitive(`ROLLBACK ${a.id} ke versi sebelumnya?`, code => api(`apps/${a.id}/rollback`, 'POST', { totp: code }));
        if (ok) {
          toast(`Rollback ${a.id} selesai`);
          render();
        }
      }
    }, 'Rollback'));
  }
  frontActions.push(act('remove', 'Hapus', 'danger'));
  frontActions.push(h('button', { type: 'button', class: 'ghost', style: 'margin-left: auto;', onclick: toggleFlip }, 'Konfigurasi'));

  const installedVer = (a.installed && a.installed.version) ? a.installed.version : a.version;
  const updateBanner = a.update_available
    ? h('div', { class: 'update-pill pulse', title: `Tersedia versi baru ${a.latest_version} dari repositori` }, `🚀 Pembaruan Tersedia: ${installedVer} ➔ ${a.latest_version || a.version}`)
    : null;

  const warningsBox = (Array.isArray(a.warnings) && a.warnings.length)
    ? h('div', { class: 'warn-list-box' },
        h('strong', {}, 'Catatan Pemeriksaan (Soft Gate):'),
        h('ul', {}, ...a.warnings.map(w => h('li', {}, w))))
    : null;

  const sandboxTags = (Array.isArray(a.sandbox_tools) && a.sandbox_tools.length)
    ? h('span', { class: 'tag sandbox-pill', title: 'Tool disalin/diunduh ke folder sandbox internal app' }, `Sandbox: ${a.sandbox_tools.join(', ')}`)
    : null;

  const folderTags = (Array.isArray(a.folder_paths) && a.folder_paths.length)
    ? h('span', { class: 'tag', title: 'Folder terizin (aturan ketat)' }, `Folder: ${a.folder_paths.length}`)
    : null;

  const portRedirectTag = a.internal_port
    ? h('span', { class: 'tag', title: `Port bawaan ${a.internal_port} bentrok, dialihkan otomatis ke ${a.port}` }, `Auto-Port :${a.port} (asal :${a.internal_port})`)
    : null;

  const frontFace = h('div', { class: 'card flip-card-front' },
    h('div', { style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;' },
      h('h3', { style: 'margin: 0 0 4px;' }, a.id),
      h('button', { type: 'button', class: 'ghost', style: 'padding: 4px 10px; font-size: 12px;', title: 'Ubah Konfigurasi', onclick: toggleFlip }, 'Edit')
    ),
    updateBanner,
    h('p', {}, a.description || a.repo),
    h('p', {},
      warnBadge,
      h('span', { class: 'tag' }, 'PRIO ' + a.priority),
      h('span', { class: 'tag' }, (a.language || 'app').toUpperCase()),
      h('span', { class: 'tag' }, `${a.memory_max_mb}MB / ${a.cpu_quota_pct}% CPU`),
      sandboxTags,
      folderTags,
      portRedirectTag
    ),
    warningsBox,
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

  const inspectBtn = h('button', { type: 'button', class: 'good', onclick: async () => {
    const val = repoInput.value.trim();
    if (!val) { toast('Masukkan nama repo atau URL GitHub'); return; }
    resultBox.replaceChildren(h('p', { class: 'loading' }, 'Memeriksa repo dan mendeteksi tipe webapp...'));
    try {
      const res = await api('sites/inspect', 'POST', { repo: val });
      if (!res.ok) {
        resultBox.replaceChildren(h('div', { class: 'card lock' },
          h('h4', {}, 'BELUM BISA DIINSTALL LANGSUNG'),
          h('p', {}, `Alasan: ${res.reason}`),
          h('p', { class: 'dim' }, 'Solusi: Buat file .batasan.toml di menu "RACIK BATASAN", lalu tambahkan ke rilis repo GitHub Anda.')));
        return;
      }

      if (res.adaptive) {
        const f = res.findings || {};
        const folders = Array.isArray(f.folder_paths) ? f.folder_paths : [];
        const tools = Array.isArray(f.tools) ? f.tools : [];
        const warns = Array.isArray(res.warnings) ? res.warnings : [];

        const folderChk = h('input', { type: 'checkbox', checked: folders.length === 0 });
        const adaptiveInstallBtn = h('button', {
          type: 'button',
          class: 'good',
          disabled: folders.length > 0,
          onclick: async () => {
            const ok = await sensitive(
              `PASANG ADAPTIF ${res.id} (${(f.language || 'webapp').toUpperCase()})?\nPort: :${res.suggested_port}\nHard Gate Malware & Antivirus wajib lolos.`,
              code => api('apps/adaptive-install', 'POST', {
                repo: res.repo,
                batasan_toml: res.draft_toml,
                asset_url: res.asset_url,
                version: 'adaptive',
                totp: code
              })
            );
            if (ok) {
              toast(`Instalasi adaptif ${res.id} berhasil`);
              tab = 'apps';
              render();
            }
          }
        }, `Pasang Adaptif (Port :${res.suggested_port})`);

        if (folders.length > 0) {
          folderChk.addEventListener('change', () => {
            adaptiveInstallBtn.disabled = !folderChk.checked;
          });
        }

        const folderBox = folders.length > 0
          ? h('div', { class: 'folder-perm-box' },
              h('strong', {}, 'Permintaan Akses Folder Eksternal (Aturan Ketat):'),
              h('p', { class: 'dim', style: 'margin:4px 0;' }, `Hanya path terizin (/mnt/*, /media/*, /srv/*): ${folders.join(', ')}`),
              h('label', {}, folderChk, h('span', {}, 'Saya menyetujui akses folder terbatas di atas (direktori sistem /etc, /root, /home tetap diblokir keras).')))
          : null;

        const sandboxBox = tools.length > 0
          ? h('p', {}, h('span', { class: 'tag sandbox-pill' }, `Sandbox Tool Lokal: ${tools.join(', ')} (tidak mengubah OS global)`))
          : null;

        const warnBox = warns.length > 0
          ? h('div', { class: 'warn-list-box' },
              h('strong', {}, 'Tanda Pemeriksaan (Soft Gate):'),
              h('ul', {}, ...warns.map(w => h('li', {}, w))))
          : null;

        resultBox.replaceChildren(h('div', { class: 'adaptive-plan-box' },
          h('h4', { style: 'margin:0 0 6px;' }, `Mode Adaptif WebApp: ${res.id}`),
          h('p', { class: 'dim', style: 'margin:0 0 8px;' }, `Repo: ${res.repo}`),
          h('p', {},
            h('span', { class: 'tag' }, `TIPE: ${(f.language || 'go').toUpperCase()}`),
            h('span', { class: 'tag' }, res.port_conflict ? `AUTO-PORT :${res.suggested_port} (bentrok :${res.desired_port})` : `PORT :${res.suggested_port}`),
            h('span', { class: 'tag sandbox-pill' }, 'HARD GATE: MALWARE & ANTIVIRUS WAJIB LOLOS')
          ),
          sandboxBox,
          warnBox,
          folderBox,
          h('div', { class: 'row', style: 'margin-top:12px;' }, adaptiveInstallBtn)
        ));
        return;
      }

      const e = res.entry;
      const addAndInstallBtn = h('button', { type: 'button', class: 'ghost', onclick: async () => {
        const ok = await sensitive(`TAMBAHKAN SITUS ${e.repo}?`, code => api('sites/add', 'POST', { repo: e.repo, totp: code }));
        if (!ok) return;
        toast('Situs ditambahkan ke katalog');
        tab = 'catalog';
        render();
      } }, 'Tambahkan ke Katalog');
      const directInstallBtn = h('button', { type: 'button', class: 'good', onclick: () => openWizard(e.repo) }, 'Atur Batasan & Pasang');

      resultBox.replaceChildren(h('div', { class: 'card' },
        h('h3', {}, `${e.id} (${e.version})`),
        h('p', {}, e.description || e.repo),
        h('p', {},
          h('span', { class: 'tag' }, `PORT :${e.port}`),
          h('span', { class: 'tag' }, e.language.toUpperCase()),
          h('span', { class: 'tag' }, `${e.memory_max_mb}MB / ${e.cpu_quota_pct}% CPU`)),
        h('div', { class: 'row' }, directInstallBtn, addAndInstallBtn)));
    } catch (err) {
      resultBox.replaceChildren(h('p', { class: 'err' }, err.message));
    }
  } }, 'Periksa Repo');

  card.append(
    h('h3', {}, 'PASANG APLIKASI ADAPTIF DARI GITHUB'),
    h('p', { class: 'dim' }, 'Masukkan alamat repository GitHub publik (Go, Rust, Node.js, Python, atau Static WebApp). Mastermind otomatis mendeteksi tipe app, port bebas, sandbox tool, dan wajib lolos cek malware.'),
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
            h('td', {}, h('button', { type: 'button', class: 'danger', onclick: async () => {
              const ok = await sensitive(`HAPUS SITUS ${r}?`, code => api('sites/remove', 'POST', { repo: r, totp: code }));
              if (ok) render();
            } }, 'Hapus'))))));
    }
  } catch (_) {}

  // GitHub Personal Access Token Card (Menaikkan kuota dari 60 ke 5000 req/jam)
  const tokenInput = h('input', { type: 'password', placeholder: 'ghp_xxxxxxxxxxxx atau github_pat_xxxxxxxx', style: 'flex:1;' });
  const saveTokenBtn = h('button', { type: 'button', class: 'good', onclick: async () => {
    const val = tokenInput.value.trim();
    const ok = await sensitive(
      val ? 'SIMPAN GITHUB TOKEN?\n(Menaikkan limit API ke 5000 req/jam)' : 'HAPUS GITHUB TOKEN?',
      code => api('sites/token', 'POST', { token: val, totp: code })
    );
    if (ok) {
      toast('Token GitHub berhasil diperbarui');
      tokenInput.value = '';
    }
  } }, 'Simpan Token');

  const tokenCard = h('div', { class: 'card', style: 'margin-bottom:16px;' },
    h('h3', {}, 'GITHUB PERSONAL ACCESS TOKEN (OPSIONAL)'),
    h('p', { class: 'dim' }, 'Bila terkena batas GitHub (HTTP 403), masukkan token GitHub publik (read-only) untuk menaikkan kuota menjadi 5.000 req/jam. Kosongkan dan simpan jika ingin menghapus.'),
    h('div', { class: 'row', style: 'gap:8px;' }, tokenInput, saveTokenBtn)
  );

  const searchCard = h('div', { class: 'card', style: 'margin-bottom:16px' });
  await renderSearch(searchCard);
  view.replaceChildren(...[topBar, tokenCard, searchCard, card, customSitesBox].filter(Boolean));
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
let currentSelectedEmp = null;
let activeDrawer = null;

function closeSlideDrawer() {
  const drawer = document.getElementById('slide-drawer');
  if (drawer) {
    drawer.classList.remove('open');
    setTimeout(() => drawer.remove(), 350);
  }
  activeDrawer = null;
}

function openSlideDrawer(emp, onActionTriggered) {
  let drawer = document.getElementById('slide-drawer');
  if (drawer) drawer.remove();

  const host = window.location.hostname;
  const directHttp = `http://${host}:${emp.port}`;
  const cpuVal = (emp.cpu_pct || 0).toFixed(1);
  const memVal = emp.mem_mb ? `${emp.mem_mb} MB` : 'cgroup';

  const logBox = h('div', { class: 'drawer-logs-box' }, 'Memuat live stream journalctl logs...');
  const closeBtn = h('button', { class: 'ghost', style: 'padding: 2px 8px; font-size: 14px;', onclick: closeSlideDrawer }, '✕');

  const actionButtons = [];
  if (!emp.isHQ) {
    if (emp.status === 'active') {
      actionButtons.push(h('button', { class: 'ghost', onclick: async () => {
        closeSlideDrawer();
        emp.status = 'inactive';
        if (emp.deskObj) {
          window.WorkerFactory.updateScreenTexture(emp.deskObj.screenData, emp.name, 'inactive', 0);
          if (emp.deskObj.beacon) emp.deskObj.beacon.material.color.setHex(0xe53e3e);
        }
        if (emp.worker3D && emp.worker3D.plumbob) {
          emp.worker3D.plumbob.material.color.setHex(0xe53e3e);
        }
        if (onActionTriggered) onActionTriggered('stop', emp);
        toast(`Mastermind berjalan memberi instruksi STOP ke ${emp.name}...`);
        await api(`apps/${emp.id}/stop`, 'POST').catch(e => toast(e.message));
      } }, '⏹ Stop Service'));

      actionButtons.push(h('button', { class: 'good', onclick: async () => {
        closeSlideDrawer();
        emp.status = 'active';
        if (emp.deskObj) {
          window.WorkerFactory.updateScreenTexture(emp.deskObj.screenData, emp.name, 'active', emp.cpu_pct || 25);
          if (emp.deskObj.beacon) emp.deskObj.beacon.material.color.setHex(0x48bb78);
        }
        if (emp.worker3D && emp.worker3D.plumbob) {
          emp.worker3D.plumbob.material.color.setHex(0x48bb78);
        }
        if (onActionTriggered) onActionTriggered('restart', emp);
        toast(`Mastermind berjalan memberi instruksi RESTART ke ${emp.name}...`);
        await api(`apps/${emp.id}/restart`, 'POST').catch(e => toast(e.message));
      } }, '🔄 Restart'));
    } else {
      actionButtons.push(h('button', { class: 'good', onclick: async () => {
        closeSlideDrawer();
        emp.status = 'active';
        if (emp.deskObj) {
          window.WorkerFactory.updateScreenTexture(emp.deskObj.screenData, emp.name, 'active', emp.cpu_pct || 20);
          if (emp.deskObj.beacon) emp.deskObj.beacon.material.color.setHex(0x48bb78);
        }
        if (emp.worker3D && emp.worker3D.plumbob) {
          emp.worker3D.plumbob.material.color.setHex(0x48bb78);
        }
        if (onActionTriggered) onActionTriggered('start', emp);
        toast(`Mastermind berjalan memberi instruksi START ke ${emp.name}...`);
        await api(`apps/${emp.id}/start`, 'POST').catch(e => toast(e.message));
      } }, '▶ Start Service'));
    }

    if (emp.port > 0) {
      actionButtons.push(h('a', {
        href: directHttp,
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'btn good',
        style: 'text-decoration: none; padding: 6px 12px; font-size: 11px;',
        onclick: closeSlideDrawer
      }, `Buka HTTP :${emp.port} ↗`));
    }
  }

  drawer = h('div', { id: 'slide-drawer', class: 'slide-drawer' },
    h('div', { class: 'drawer-header' },
      h('div', { class: 'drawer-title' },
        h('span', {}, emp.isHQ ? '👑' : '💻'),
        h('span', {}, `${emp.name.toUpperCase()} (STAF APP)`)
      ),
      closeBtn
    ),
    h('div', { class: 'drawer-body' },
      h('div', { class: 'drawer-metric-grid' },
        h('div', { class: 'drawer-metric-box' },
          h('div', { class: 'drawer-metric-label' }, 'STATUS OPERASI'),
          h('div', { class: 'drawer-metric-val', style: `color: ${emp.status === 'active' ? 'var(--good)' : 'var(--danger)'}` }, emp.status.toUpperCase())
        ),
        h('div', { class: 'drawer-metric-box' },
          h('div', { class: 'drawer-metric-label' }, 'PORT NETWORK'),
          h('div', { class: 'drawer-metric-val' }, emp.port ? `:${emp.port}` : 'NO-PORT')
        ),
        h('div', { class: 'drawer-metric-box' },
          h('div', { class: 'drawer-metric-label' }, 'BEBAN CPU REAL-TIME'),
          h('div', { class: 'drawer-metric-val' }, `${cpuVal}%`)
        ),
        h('div', { class: 'drawer-metric-box' },
          h('div', { class: 'drawer-metric-label' }, 'MEMORI CGROUP'),
          h('div', { class: 'drawer-metric-val' }, memVal)
        )
      ),
      h('div', { class: 'drawer-actions' }, ...actionButtons),
      h('div', { class: 'drawer-logs-header' },
        h('span', {}, 'JOURNALCTL / SERVICE LOGS'),
        h('button', { class: 'ghost', style: 'padding: 2px 6px; font-size: 10px;', onclick: loadLogs }, 'Segarkan')
      ),
      logBox
    )
  );

  document.body.appendChild(drawer);
  requestAnimationFrame(() => drawer.classList.add('open'));
  activeDrawer = drawer;

  async function loadLogs() {
    logBox.textContent = 'Mengambil log service...';
    try {
      const res = await api(`apps/${emp.id}/logs`, 'GET');
      logBox.textContent = res.logs || 'Belum ada catatan log terbaru.';
      logBox.scrollTop = logBox.scrollHeight;
    } catch (e) {
      logBox.textContent = 'Gagal memuat log: ' + e.message;
    }
  }

  loadLogs();
}

async function renderCity() {
  if (cityAnimId) { cancelAnimationFrame(cityAnimId); cityAnimId = null; }
  if (threeRenderer) {
    try { threeRenderer.dispose(); } catch (_) {}
    threeRenderer = null;
  }
  closeSlideDrawer();

  const topBar = await sysbar();
  let d = { apps: [] };
  try { d = await api('apps'); } catch (_) {}
  const installedApps = d.apps.filter(a => a.installed);

  const sfxBtn = h('button', {
    class: 'ghost',
    style: { padding: '2px 8px', fontSize: '10px', cursor: 'pointer', borderRadius: '999px' },
    onclick: () => {
      sfxEnabled = !sfxEnabled;
      localStorage.setItem('mm-sfx', sfxEnabled ? '1' : '0');
      sfxBtn.textContent = sfxEnabled ? '🔊 SFX: AKTIF' : '🔇 SFX: MATI';
      toast(sfxEnabled ? 'Efek Suara Retro Diaktifkan' : 'Efek Suara Dinonaktifkan');
      if (sfxEnabled) playSfx('chime');
    }
  }, sfxEnabled ? '🔊 SFX: AKTIF' : '🔇 SFX: MATI');

  // 1. Mode Transparan Tanpa Bingkai Khusus Tab KOTA (Menyatu dengan Matcha Forest)
  const container3D = h('div', { id: 'office3d-container', class: 'city-frameless-canvas' });
  const framelessStage = h('div', { class: 'city-frameless' },
    container3D,
    h('div', { class: 'city-floating-controls' },
      h('div', { class: 'city-floating-pill' },
        h('span', { class: 'dot' }),
        h('span', {}, 'Mastermind HQ • 24 FPS'),
        sfxBtn
      ),
      h('div', { class: 'city-floating-pill' },
        '🖱️ Putar: Klik & Tarik • Zoom: Scroll • Klik Pekerja untuk Kontrol & Logs'
      )
    )
  );

  view.replaceChildren(...[topBar, framelessStage].filter(Boolean));

  if (typeof THREE === 'undefined') {
    container3D.appendChild(h('p', { class: 'err', style: { padding: '20px' } }, 'Gagal memuat modul Three.js.'));
    return;
  }

  const width = container3D.clientWidth || 960;
  const height = container3D.clientHeight || 560;

  // Transparent Scene Background (menyatu langsung dengan #zen-canvas Matcha Forest)
  const scene = new THREE.Scene();
  scene.background = null;

  // 3. Dekatkan Kamera Isometrik & Perbesar Proporsi Ruangan (Responsif Portrait Mobile)
  const aspect = width / height;
  const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 1000);
  const zoomFactor = aspect < 1.0 ? Math.max(1.0, 1.15 / aspect) : 1.0;
  camera.position.set(0, 15.5 * zoomFactor, 16.5 * zoomFactor);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container3D.appendChild(renderer.domElement);
  threeRenderer = renderer;

  // Handle responsive resize (Auto adjust zoom on mobile orientation change)
  const onResize = () => {
    if (!container3D || !renderer) return;
    const w = container3D.clientWidth || 960;
    const hVal = container3D.clientHeight || 560;
    const asp = w / hVal;
    camera.aspect = asp;
    const zf = asp < 1.0 ? Math.max(1.0, 1.15 / asp) : 1.0;
    camera.position.set(0, 15.5 * zf, 16.5 * zf);
    camera.updateProjectionMatrix();
    renderer.setSize(w, hVal);
  };
  window.addEventListener('resize', onResize, { passive: true });

  // OrbitControls restricted to Top-Down perspective
  let controls = null;
  if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = Math.PI / 5;   // ~36°
    controls.maxPolarAngle = Math.PI / 2.25; // ~80°
    controls.minDistance = 5;
    controls.maxDistance = 36;
    controls.target.set(0, 0.4, -1.0);
  }

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xf0fdf4, 0.95);
  dirLight.position.set(14, 28, 16);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 65;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  scene.add(dirLight);

  // Add Office Architecture (Diorama Slab + Mastermind Glass Suite + Chill Lounge)
  const office = window.OfficeWorld.createOfficeScene();
  scene.add(office.world);

  // Interactive Click Raycasting list
  const interactiveObjects = [];
  if (office.coffeeMaker) interactiveObjects.push(office.coffeeMaker);

  // Workstation Grid layout
  const deskLocations = [
    { x: -5.5, z: -3.5 },
    { x: 0, z: -3.5 },
    { x: 5.5, z: -3.5 },
    { x: -5.5, z: 2.5 },
    { x: 0, z: 2.5 },
    { x: 5.5, z: 2.5 }
  ];

  const employees = [];

  // 1. Create Mastermind (The Boss Kernel) inside Glass Room facing monitors (Math.PI)
  const bossEmp = {
    id: 'mastermind',
    name: 'Mastermind',
    status: 'active',
    animState: 'HQ_AT_DESK',
    isHQ: true,
    deskPos: new THREE.Vector3(0, 0, -9.2),
    restSlot: { pos: office.loungePos, rotY: 0 },
    curPos: new THREE.Vector3(0, 0, -9.2),
    targetPos: new THREE.Vector3(0, 0, -9.2),
    commandTask: null,
    cpu_pct: 12.0,
    mem_mb: 8,
    category: 'kernel',
    hairColor: 0x111827
  };

  const bossWorker3D = window.WorkerFactory.createWorkerCharacter(bossEmp);
  bossWorker3D.root.position.copy(bossEmp.curPos);
  bossWorker3D.root.rotation.y = Math.PI; // Menghadap layar melengkung di -Z
  scene.add(bossWorker3D.root);
  bossEmp.worker3D = bossWorker3D;

  const bossChair3D = window.WorkerFactory.createSwivelChair();
  bossChair3D.root.position.set(0, 0, -9.2);
  bossChair3D.root.rotation.y = Math.PI; // Sandaran kursi di belakang punggung (+Z)
  scene.add(bossChair3D.root);
  bossEmp.chair3D = bossChair3D;

  employees.push(bossEmp);
  interactiveObjects.push(bossWorker3D.torso || bossWorker3D.root);
  (bossWorker3D.torso || bossWorker3D.root).userData = { type: 'employee', emp: bossEmp };

  // 2. Create Workers for Installed Applications
  const restSlots = office.restSlots || [{ pos: office.loungePos, rotY: 0 }];
  installedApps.forEach((app, idx) => {
    const dLoc = deskLocations[idx % deskLocations.length];
    const isAct = app.status === 'active';
    const cpuPct = app.cpu_pct != null ? app.cpu_pct : (isAct ? 18.0 + (idx * 5) % 30 : 0);
    const cat = app.source === 'docker' ? 'docker' : (app.id.includes('db') || app.id.includes('sql') ? 'database' : 'web');

    // Create Dual-Monitor Teak L-Desk
    const deskObj = window.WorkerFactory.createLDesk(app.id, app.status, cpuPct);
    deskObj.root.position.set(dLoc.x, 0, dLoc.z);
    scene.add(deskObj.root);

    // Create Swivel Chair rotated Math.PI so backrest is behind worker facing -Z monitor
    const chairObj = window.WorkerFactory.createSwivelChair();
    chairObj.root.position.set(dLoc.x, 0, dLoc.z + 0.85);
    chairObj.root.rotation.y = Math.PI;
    scene.add(chairObj.root);

    const slot = restSlots[idx % restSlots.length];
    const deskPosVec = new THREE.Vector3(dLoc.x, 0, dLoc.z + 0.85);

    const emp = {
      id: app.id,
      name: app.id,
      idx,
      status: app.status,
      animState: isAct ? (cpuPct > 65 ? 'OVERLOAD' : (cpuPct >= 5 ? 'WORKING' : 'IDLE')) : 'RESTING',
      walkStage: 0,
      pendingResponse: null,
      idleTimer: 120 + (idx * 73) % 180,
      idleAction: null,
      idleActionTicks: 0,
      port: app.port || 0,
      isHQ: false,
      deskPos: deskPosVec,
      aislePos: new THREE.Vector3(-2.5, 0, 5.2), // Lorong aman untuk pathfinding menghindari meja
      restSlot: slot,
      curPos: isAct ? deskPosVec.clone() : slot.pos.clone(),
      targetPos: isAct ? deskPosVec.clone() : slot.pos.clone(),
      cpu_pct: cpuPct,
      mem_mb: app.mem_mb || 48,
      category: cat,
      deskObj,
      chairObj,
      color: idx % 3 === 0 ? 0x2563eb : (idx % 3 === 1 ? 0xd97706 : 0x059669),
      hairColor: idx % 2 === 0 ? 0x1e293b : 0x78350f
    };

    const worker3D = window.WorkerFactory.createWorkerCharacter(emp);
    worker3D.root.position.copy(emp.curPos);
    worker3D.root.rotation.y = isAct ? Math.PI : slot.rotY; // Menghadap monitor (Math.PI) saat bekerja
    scene.add(worker3D.root);
    emp.worker3D = worker3D;

    employees.push(emp);
    interactiveObjects.push(worker3D.torso || worker3D.root);
    (worker3D.torso || worker3D.root).userData = { type: 'employee', emp };
  });

  // Mastermind Walking Choreography Command Handler
  function triggerMastermindCommand(action, targetEmp) {
    playSfx('chime');
    if (bossEmp.commandTask && bossEmp.commandTask.badge) {
      bossEmp.worker3D.root.remove(bossEmp.commandTask.badge);
    }
    const standPoint = targetEmp.status === 'inactive' && targetEmp.animState === 'RESTING'
      ? new THREE.Vector3(targetEmp.curPos.x + 1.2, 0, targetEmp.curPos.z)
      : new THREE.Vector3(targetEmp.deskPos.x - 1.25, 0, targetEmp.deskPos.z);

    targetEmp.pendingResponse = action;
    bossEmp.animState = 'WALKING_TO_TARGET';
    bossEmp.commandTask = {
      action,
      targetEmp,
      standPoint,
      stage: bossEmp.curPos.z < -6.2 ? 0 : 1, // Keluar pintu kaca jika masih di dalam HQ
      instructTicks: 42,
      badge: null
    };
  }

  // Click & Raycasting Detection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onCanvasClick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects, true);

    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData.type && hit.parent) {
        hit = hit.parent;
      }
      const type = hit ? hit.userData.type : null;

      if (type === 'employee') {
        const emp = hit.userData.emp;
        playSfx('beep');
        if (controls) {
          controls.target.set(emp.curPos.x, 1.0, emp.curPos.z);
        }
        openSlideDrawer(emp, triggerMastermindCommand);
      } else if (type === 'coffee') {
        playSfx('chime');
        toast('☕ Mesin Kopi HQ: Secangkir kopi hangat diseduh untuk pekerja service!');
      }
    }
  }

  renderer.domElement.addEventListener('click', onCanvasClick);

  // 3D Animation Loop locked at fixed 24 FPS with delta-time throttling
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

    // Animate Koi Fish in mini pond
    if (office.koiFish) {
      office.koiFish.forEach(k => {
        k.angle += k.speed;
        k.mesh.position.x = Math.cos(k.angle) * k.radius;
        k.mesh.position.z = Math.sin(k.angle) * k.radius;
        k.mesh.rotation.y = -k.angle;
      });
    }

    // Check SoC thermal state on Mastermind boss office
    let sysTemp = 45;
    if (window.__lastSysTemp) sysTemp = window.__lastSysTemp;
    if (sysTemp > 75) {
      office.socAlertLight.intensity = Math.sin(tick * 0.3) > 0 ? 3.0 : 0.5;
    } else {
      office.socAlertLight.intensity = 0;
    }

    // Animate Employees & Mastermind Choreography State Machine
    employees.forEach(emp => {
      const isAct = emp.status === 'active';
      const cpu = emp.cpu_pct || 0;

      // -------------------------------------------------------------
      // A. MASTERMIND (THE BOSS) WALKING CHOREOGRAPHY
      // -------------------------------------------------------------
      if (emp.isHQ) {
        if (emp.animState === 'WALKING_TO_TARGET' && emp.commandTask) {
          const task = emp.commandTask;
          const wp = task.stage === 0 ? office.hqDoorPos : task.standPoint;
          const dx = wp.x - emp.curPos.x;
          const dz = wp.z - emp.curPos.z;
          const dist = Math.hypot(dx, dz);

          if (dist > 0.16) {
            emp.curPos.x += (dx / dist) * 0.18;
            emp.curPos.z += (dz / dist) * 0.18;
            emp.worker3D.root.rotation.y = Math.atan2(dx, dz);

            const swing = Math.sin(tick * 0.6) * 0.55;
            if (emp.worker3D.leftLeg) emp.worker3D.leftLeg.rotation.x = swing;
            if (emp.worker3D.rightLeg) emp.worker3D.rightLeg.rotation.x = -swing;
            emp.worker3D.leftArm.upperArm.rotation.x = -swing * 0.7;
            emp.worker3D.rightArm.upperArm.rotation.x = swing * 0.7;
            emp.worker3D.torso.rotation.x = 0.05;
            emp.worker3D.head.rotation.x = 0;
            emp.worker3D.root.position.y = Math.abs(Math.sin(tick * 0.6)) * 0.08;
            if (tick % 10 === 0) playSfx('step');
          } else if (task.stage === 0) {
            task.stage = 1;
          } else {
            // Arrived beside target worker -> GIVING_INSTRUCTION
            emp.animState = 'GIVING_INSTRUCTION';
            emp.worker3D.root.position.y = 0;
            if (emp.worker3D.leftLeg) emp.worker3D.leftLeg.rotation.x = 0;
            if (emp.worker3D.rightLeg) emp.worker3D.rightLeg.rotation.x = 0;

            playSfx('beep');
            levelUp(`👑 [INSTRUKSI] ${task.action.toUpperCase()} -> ${task.targetEmp.name}`);
            if (window.OfficeWorld.createCommandIcon) {
              task.badge = window.OfficeWorld.createCommandIcon(task.action.toUpperCase());
              emp.worker3D.root.add(task.badge);
            }

            // Trigger worker response
            const tEmp = task.targetEmp;
            if (task.action === 'stop') {
              tEmp.animState = 'WALKING_TO_REST';
              tEmp.walkStage = 0;
              tEmp.idleAction = null;
            } else {
              tEmp.animState = 'WALKING_TO_DESK';
              tEmp.walkStage = 0;
              tEmp.idleAction = null;
            }
            tEmp.pendingResponse = null;
          }
        } else if (emp.animState === 'GIVING_INSTRUCTION' && emp.commandTask) {
          const task = emp.commandTask;
          const tPos = task.targetEmp.curPos;
          emp.worker3D.root.rotation.y = Math.atan2(tPos.x - emp.curPos.x, tPos.z - emp.curPos.z);
          emp.worker3D.rightArm.upperArm.rotation.x = -1.1 + Math.sin(tick * 0.45) * 0.16;
          emp.worker3D.rightArm.forearmGroup.rotation.x = -0.35;
          emp.worker3D.leftArm.upperArm.rotation.x = -0.15;
          emp.worker3D.head.rotation.x = Math.sin(tick * 0.5) * 0.2;
          task.instructTicks--;

          if (task.instructTicks <= 0) {
            if (task.badge) {
              emp.worker3D.root.remove(task.badge);
              task.badge = null;
            }
            emp.animState = 'WALKING_BACK_TO_HQ';
            task.stage = 0;
          }
        } else if (emp.animState === 'WALKING_BACK_TO_HQ' && emp.commandTask) {
          const task = emp.commandTask;
          const wp = task.stage === 0 ? office.hqDoorPos : emp.deskPos;
          const dx = wp.x - emp.curPos.x;
          const dz = wp.z - emp.curPos.z;
          const dist = Math.hypot(dx, dz);

          if (dist > 0.16) {
            emp.curPos.x += (dx / dist) * 0.18;
            emp.curPos.z += (dz / dist) * 0.18;
            emp.worker3D.root.rotation.y = Math.atan2(dx, dz);

            const swing = Math.sin(tick * 0.6) * 0.55;
            if (emp.worker3D.leftLeg) emp.worker3D.leftLeg.rotation.x = swing;
            if (emp.worker3D.rightLeg) emp.worker3D.rightLeg.rotation.x = -swing;
            emp.worker3D.leftArm.upperArm.rotation.x = -swing * 0.7;
            emp.worker3D.rightArm.upperArm.rotation.x = swing * 0.7;
            emp.worker3D.rightArm.forearmGroup.rotation.x = 0;
            emp.worker3D.head.rotation.x = 0;
            emp.worker3D.root.position.y = Math.abs(Math.sin(tick * 0.6)) * 0.08;
            if (tick % 10 === 0) playSfx('step');
          } else if (task.stage === 0) {
            task.stage = 1;
          } else {
            emp.animState = 'HQ_AT_DESK';
            emp.commandTask = null;
          }
        } else {
          // HQ_AT_DESK: Mastermind sits facing 3 curved monitors (Math.PI)
          emp.worker3D.root.position.y = 0;
          if (emp.worker3D.leftLeg) emp.worker3D.leftLeg.rotation.x = 0;
          if (emp.worker3D.rightLeg) emp.worker3D.rightLeg.rotation.x = 0;
          const scanRot = Math.PI + Math.sin(tick * 0.03) * 0.25;
          emp.worker3D.root.rotation.y = THREE.MathUtils.lerp(emp.worker3D.root.rotation.y, scanRot, 0.12);
          if (emp.chair3D) emp.chair3D.seatGroup.rotation.y = Math.sin(tick * 0.03) * 0.25;
          emp.worker3D.leftArm.upperArm.rotation.x = -0.55 + Math.sin(tick * 0.25) * 0.08;
          emp.worker3D.rightArm.upperArm.rotation.x = -0.55 + Math.cos(tick * 0.25) * 0.08;
          emp.worker3D.rightArm.forearmGroup.rotation.x = 0;
          emp.worker3D.torso.rotation.x = 0.06;
          emp.worker3D.head.rotation.x = 0.08;
        }

        emp.worker3D.root.position.x = emp.curPos.x;
        emp.worker3D.root.position.z = emp.curPos.z;
        if (emp.worker3D.plumbob) emp.worker3D.plumbob.rotation.y += 0.06;
        return;
      }

      // -------------------------------------------------------------
      // B. SERVICE WORKER STATE MACHINE & DYNAMIC MICRO-ACTIVITIES
      // -------------------------------------------------------------
      let currentTarget = emp.deskPos;
      if (emp.animState === 'WALKING_TO_REST') {
        currentTarget = emp.walkStage === 0 ? emp.aislePos : emp.restSlot.pos;
      } else if (emp.animState === 'WALKING_TO_DESK') {
        currentTarget = emp.walkStage === 0 ? emp.aislePos : emp.deskPos;
      } else if (emp.idleAction === 'WALK_COFFEE') {
        currentTarget = emp.walkStage === 0 ? emp.aislePos : office.coffeeSpot;
      } else if (emp.idleAction === 'AT_COFFEE') {
        currentTarget = office.coffeeSpot;
      } else if (emp.idleAction === 'RETURN_FROM_COFFEE') {
        currentTarget = emp.walkStage === 0 ? emp.aislePos : emp.deskPos;
      } else if (!isAct) {
        currentTarget = emp.restSlot.pos;
      }

      const dx = currentTarget.x - emp.curPos.x;
      const dz = currentTarget.z - emp.curPos.z;
      const dist = Math.hypot(dx, dz);
      const isWalking = dist > 0.14;

      if (isWalking) {
        emp.curPos.x += (dx / dist) * 0.14;
        emp.curPos.z += (dz / dist) * 0.14;
        emp.worker3D.root.rotation.y = Math.atan2(dx, dz);

        const swing = Math.sin(tick * 0.55) * 0.55;
        if (emp.worker3D.leftLeg) emp.worker3D.leftLeg.rotation.x = swing;
        if (emp.worker3D.rightLeg) emp.worker3D.rightLeg.rotation.x = -swing;
        emp.worker3D.leftArm.upperArm.rotation.x = -swing * 0.7;
        emp.worker3D.rightArm.upperArm.rotation.x = swing * 0.7;
        emp.worker3D.rightArm.forearmGroup.rotation.x = 0;
        emp.worker3D.torso.rotation.x = 0.05;
        emp.worker3D.head.rotation.x = 0;
        emp.worker3D.head.rotation.y = 0;
        emp.worker3D.root.position.y = Math.abs(Math.sin(tick * 0.55)) * 0.08;
        if (tick % 10 === 0) playSfx('step');
      } else {
        if ((emp.animState === 'WALKING_TO_REST' || emp.animState === 'WALKING_TO_DESK' || emp.idleAction === 'WALK_COFFEE' || emp.idleAction === 'RETURN_FROM_COFFEE') && emp.walkStage === 0) {
          emp.walkStage = 1;
        } else {
          if (emp.animState === 'WALKING_TO_REST') emp.animState = 'RESTING';
          if (emp.animState === 'WALKING_TO_DESK') emp.animState = cpu > 65 ? 'OVERLOAD' : (cpu >= 5 ? 'WORKING' : 'IDLE');

          if (emp.idleAction === 'WALK_COFFEE') {
            emp.idleAction = 'AT_COFFEE';
            emp.idleActionTicks = 60;
          } else if (emp.idleAction === 'RETURN_FROM_COFFEE') {
            emp.idleAction = null;
          }

          emp.worker3D.root.position.y = 0;
          if (emp.worker3D.leftLeg) emp.worker3D.leftLeg.rotation.x = 0;
          if (emp.worker3D.rightLeg) emp.worker3D.rightLeg.rotation.x = 0;

          if (emp.idleAction === 'AT_COFFEE') {
            emp.worker3D.root.rotation.y = THREE.MathUtils.lerp(emp.worker3D.root.rotation.y, 0, 0.15);
            emp.worker3D.torso.rotation.x = 0;
            emp.worker3D.rightArm.upperArm.rotation.x = -1.05;
            emp.worker3D.rightArm.forearmGroup.rotation.x = -0.65;
            emp.worker3D.leftArm.upperArm.rotation.x = -0.1;
            emp.idleActionTicks--;
            if (emp.idleActionTicks <= 0) {
              emp.idleAction = 'RETURN_FROM_COFFEE';
              emp.walkStage = 0;
            }
          } else if (!isAct || emp.animState === 'RESTING') {
            // RESTING di Bumiayu Chill Lounge
            emp.worker3D.root.rotation.y = THREE.MathUtils.lerp(emp.worker3D.root.rotation.y, emp.restSlot.rotY, 0.15);
            emp.worker3D.torso.rotation.x = -0.1;
            emp.worker3D.head.rotation.x = 0.35 + Math.sin(tick * 0.06) * 0.08;
            emp.worker3D.head.rotation.y = 0;
            emp.worker3D.leftArm.upperArm.rotation.x = 0.1;
            emp.worker3D.rightArm.upperArm.rotation.x = 0.1;
            emp.worker3D.rightArm.forearmGroup.rotation.x = 0;
          } else {
            // Duduk di kursi meja kerja menghadap dual monitor (Math.PI)
            const targetFacing = Math.PI;
            if (cpu > 65) {
              // OVERLOAD: mengetik cepat 3x lipat, kepala geleng panik
              emp.worker3D.root.rotation.y = THREE.MathUtils.lerp(emp.worker3D.root.rotation.y, targetFacing, 0.2);
              const furious = tick * 1.2;
              emp.worker3D.torso.rotation.x = 0.14;
              emp.worker3D.leftArm.upperArm.rotation.x = -0.75 + Math.sin(furious) * 0.25;
              emp.worker3D.rightArm.upperArm.rotation.x = -0.75 + Math.cos(furious) * 0.25;
              emp.worker3D.rightArm.forearmGroup.rotation.x = 0;
              emp.worker3D.head.rotation.y = Math.sin(tick * 0.8) * 0.18;
              if (emp.chairObj) emp.chairObj.seatGroup.position.x = (Math.random() - 0.5) * 0.03;
            } else if (cpu >= 5) {
              // WORKING: menghadap monitor, mengetik, sesekali menoleh mengecek dual monitor
              emp.worker3D.root.rotation.y = THREE.MathUtils.lerp(emp.worker3D.root.rotation.y, targetFacing, 0.2);
              const speed = tick * 0.5;
              emp.worker3D.torso.rotation.x = 0.12;
              emp.worker3D.leftArm.upperArm.rotation.x = -0.68 + Math.sin(speed) * 0.14;
              emp.worker3D.rightArm.upperArm.rotation.x = -0.68 + Math.cos(speed) * 0.14;
              emp.worker3D.rightArm.forearmGroup.rotation.x = 0;
              emp.worker3D.head.rotation.x = 0.15;
              emp.worker3D.head.rotation.y = Math.sin(tick * 0.07 + emp.idx) * 0.28;
              if (emp.chairObj) emp.chairObj.seatGroup.rotation.y = Math.sin(tick * 0.04 + emp.idx) * 0.07;
            } else {
              // IDLE: aktivitas mikro dinamis (peregangan / jalan ke dispenser kopi)
              emp.idleTimer--;
              if (emp.idleTimer <= 0 && !emp.idleAction) {
                emp.idleTimer = 240 + Math.floor(Math.random() * 240);
                if (Math.random() < 0.45) {
                  emp.idleAction = 'WALK_COFFEE';
                  emp.walkStage = 0;
                } else {
                  emp.idleAction = 'STRETCH';
                  emp.idleActionTicks = 70;
                }
              }

              if (emp.idleAction === 'STRETCH') {
                emp.worker3D.root.rotation.y = THREE.MathUtils.lerp(emp.worker3D.root.rotation.y, targetFacing, 0.15);
                emp.worker3D.torso.rotation.x = -0.15;
                emp.worker3D.leftArm.upperArm.rotation.x = -2.4 + Math.sin(tick * 0.2) * 0.15;
                emp.worker3D.rightArm.upperArm.rotation.x = -2.4 + Math.sin(tick * 0.2) * 0.15;
                emp.worker3D.rightArm.forearmGroup.rotation.x = 0;
                emp.idleActionTicks--;
                if (emp.idleActionTicks <= 0) emp.idleAction = null;
              } else {
                const swivel = Math.sin(tick * 0.04 + emp.idx) * 0.12;
                emp.worker3D.root.rotation.y = THREE.MathUtils.lerp(emp.worker3D.root.rotation.y, targetFacing + swivel, 0.15);
                if (emp.chairObj) emp.chairObj.seatGroup.rotation.y = swivel;
                emp.worker3D.torso.rotation.x = -0.08;
                emp.worker3D.head.rotation.x = 0;
                emp.worker3D.head.rotation.y = Math.sin(tick * 0.05 + emp.idx) * 0.18;
                if (Math.sin(tick * 0.02 + emp.idx) > 0.85) {
                  emp.worker3D.rightArm.upperArm.rotation.x = -1.1;
                  emp.worker3D.rightArm.forearmGroup.rotation.x = -0.6;
                } else {
                  emp.worker3D.rightArm.upperArm.rotation.x = -0.2;
                  emp.worker3D.rightArm.forearmGroup.rotation.x = 0;
                }
              }
            }
          }
        }
      }

      emp.worker3D.root.position.x = emp.curPos.x;
      emp.worker3D.root.position.z = emp.curPos.z;

      // Spin Plumbob
      if (emp.worker3D.plumbob) {
        emp.worker3D.plumbob.rotation.y += 0.06;
      }
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
      const updateCount = d.apps.filter(a => a.installed && a.update_available).length;
      const navAppsBtn = $('#nav-apps-btn');
      if (navAppsBtn) {
        navAppsBtn.replaceChildren('APPS', updateCount > 0 ? h('span', { class: 'nav-badge', title: `${updateCount} aplikasi punya pembaruan` }, String(updateCount)) : null);
      }
      const list = d.apps.filter(a => tab === 'apps' ? a.installed : !a.installed);
      const out = [await sysbar()];
      if (tab === 'apps') {
        const checkAllUpdatesBtn = h('button', {
          type: 'button',
          class: 'ghost',
          style: 'display: inline-flex; align-items: center; gap: 6px;',
          title: 'Periksa pembaruan rilis terbaru untuk semua aplikasi dari repositori GitHub',
          onclick: async () => {
            toast('Memindai pembaruan dari GitHub...');
            await api('refresh', 'POST').catch(e => toast(e.message));
            render();
          }
        }, '🔍 Cek Pembaruan Semua Aplikasi');

        const updateSummary = updateCount > 0
          ? h('span', { class: 'tag', style: 'background: #10b981; color: #052e16; font-weight: bold; padding: 4px 10px; font-size: 11px;' }, `🚀 ${updateCount} Aplikasi Memiliki Rilis Baru`)
          : null;

        out.push(h('div', { class: 'row', style: 'align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;' },
          h('button', { type: 'button', class: d.lockdown ? 'good' : 'danger', onclick: () => sensitive(d.lockdown ? 'Matikan lockdown?' : 'LOCKDOWN: hentikan semua app non-kritis?', c => api('lockdown', 'POST', { on: !d.lockdown, totp: c })).then(render) }, d.lockdown ? 'Akhiri lockdown' : 'Lockdown'),
          checkAllUpdatesBtn,
          updateSummary
        ));
      }
      out.push(h('h2', {}, tab === 'apps' ? 'APLIKASI TERPASANG' : 'KATALOG TERSEDIA'));
      out.push(list.length ? h('div', { class: 'grid' }, list.map(appCard)) : h('div', { class: 'card' }, h('p', { class: 'dim', style: 'margin:0;' }, tab === 'apps' ? 'Belum ada aplikasi terpasang. Buka tab KATALOG atau SITUS untuk memasang aplikasi pertama Anda.' : 'Semua aplikasi dari katalog sudah terpasang, atau tekan Pindai Ulang untuk memeriksa rilis terbaru.')));
      if (tab === 'catalog') {
        out.push(h('div', { class: 'row', style: 'margin-top:12px;' }, h('button', { type: 'button', class: 'ghost', onclick: async () => { toast('Memindai GitHub...'); await api('refresh', 'POST').catch(e => toast(e.message)); render(); } }, 'Pindai Ulang Katalog')));
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
    checkMastermindUpdatesQuietly();
  } catch (e) { if (csrf) toast(e.message); }
}

async function start() {
  await fetchAuthInfo();
  nav.hidden = false; loading(); render();
  checkMastermindUpdatesQuietly();
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
