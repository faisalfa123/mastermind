
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

