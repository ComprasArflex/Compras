import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyNRYhvGD-SrkJ88d4WRS1pAEat5JPzafhP11SFCfMmGUOdmGARTn4rtRpEMhPjZx6t/exec';

let historyLoaded = false;
let historyLoading = false;
let pendingRequest = null;
let initialized = false;

function normalText(value) {
  return String(value || '').trim();
}

function esc(value) {
  return normalText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureStyle() {
  if (document.getElementById('requestWorkspaceStyle')) return;
  const style = document.createElement('style');
  style.id = 'requestWorkspaceStyle';
  style.textContent = `
    .request-tabs{display:flex;gap:8px;padding:12px 22px 0;background:#fff;border-bottom:1px solid var(--line)}
    .request-tab{padding:10px 16px;border:0;border-radius:12px 12px 0 0;background:#edf2ef;color:#34423a;font-weight:700;cursor:pointer}
    .request-tab.active{background:var(--accent);color:#fff}
    .draft-review{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:16px;background:#f8fbf9}
    .draft-review-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}
    .draft-review-title{margin:0;color:var(--accent);font-size:17px}
    .draft-save-state{font-size:12px;color:#166534;font-weight:700}
    .draft-context{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
    .draft-chip{padding:6px 9px;border-radius:999px;background:#e8f3ec;color:#28553d;font-size:12px;font-weight:700}
    .draft-empty{padding:14px;color:var(--muted);border:1px dashed var(--line);border-radius:12px;background:#fff}
    .draft-list{display:grid;gap:8px}
    .draft-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid #dfe8e2;border-radius:12px;background:#fff}
    .draft-item-main{min-width:0}
    .draft-item-desc{font-weight:700;overflow-wrap:anywhere}
    .draft-item-meta{margin-top:4px;color:var(--muted);font-size:12px}
    .draft-edit{padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--accent);font-weight:700;cursor:pointer}
    .history-pane{padding:20px 22px 22px;background:#fff}
    .history-header{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
    .history-header h2{margin:0;color:var(--accent);font-size:20px}
    .history-refresh{padding:9px 13px;border:1px solid var(--line);border-radius:10px;background:#f7faf8;color:#244b37;font-weight:700;cursor:pointer}
    .history-list{display:grid;gap:10px}
    .history-card{border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}
    .history-card summary{list-style:none;cursor:pointer;padding:14px 16px;background:#f7faf8}
    .history-card summary::-webkit-details-marker{display:none}
    .history-summary{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:12px;align-items:center}
    .history-date{font-weight:700;color:#34423a}
    .history-work{font-weight:700;overflow-wrap:anywhere}
    .history-priority{padding:5px 9px;border-radius:999px;background:#edf2ef;color:#34423a;font-size:12px;font-weight:700;white-space:nowrap}
    .history-body{padding:0 14px 14px;overflow-x:auto}
    .history-table{width:100%;min-width:620px;border-collapse:collapse;table-layout:auto}
    .history-table th,.history-table td{padding:10px;border-bottom:1px solid #e8eeea;text-align:left;vertical-align:top;background:#fff}
    .history-table th{font-size:12px;color:#355043;background:#f9fbfa}
    .history-table td{font-size:13px}
    .history-empty,.history-error,.history-loading{padding:18px;border:1px solid var(--line);border-radius:14px;background:#f8fbf9;color:var(--muted)}
    @media(max-width:768px){
      .request-tabs{padding:10px 16px 0;position:sticky;top:0;z-index:80}
      .request-tab{flex:1;padding:10px 8px}
      .history-pane{padding:16px}
      .history-summary{grid-template-columns:1fr auto;gap:6px 10px}
      .history-date{grid-column:1}
      .history-work{grid-column:1}
      .history-priority{grid-column:2;grid-row:1/3;align-self:center}
      .draft-item{grid-template-columns:1fr}
      .draft-edit{width:100%}
    }
  `;
  document.head.appendChild(style);
}

function createTransport() {
  if (document.getElementById('workspaceFrame')) return;
  const iframe = document.createElement('iframe');
  iframe.id = 'workspaceFrame';
  iframe.name = 'workspaceFrame';
  iframe.hidden = true;
  const form = document.createElement('form');
  form.id = 'workspaceForm';
  form.method = 'POST';
  form.target = 'workspaceFrame';
  form.hidden = true;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.id = 'workspacePayload';
  form.appendChild(input);
  document.body.append(iframe, form);

  window.addEventListener('message', (event) => {
    const response = event.data;
    if (!pendingRequest || !response || response.source !== 'requisicao-app') return;
    if (response.token !== pendingRequest.token) return;
    clearTimeout(pendingRequest.timer);
    const current = pendingRequest;
    pendingRequest = null;
    if (response.ok) current.resolve(response);
    else current.reject(new Error(response.erro || 'O servidor recusou a operação.'));
  });
}

function post(payload) {
  if (pendingRequest) return Promise.reject(new Error('Aguarde a operação atual terminar.'));
  createTransport();
  return new Promise((resolve, reject) => {
    const token = 'workspace-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    const form = document.getElementById('workspaceForm');
    const input = document.getElementById('workspacePayload');
    payload.tokenResposta = token;
    input.value = JSON.stringify(payload);
    form.action = SCRIPT_URL;
    pendingRequest = { token, resolve, reject, timer: null };
    pendingRequest.timer = setTimeout(() => {
      const current = pendingRequest;
      pendingRequest = null;
      current.reject(new Error('O servidor não confirmou a consulta.'));
    }, 45000);
    form.submit();
  });
}

async function authPayload(action, extra = {}) {
  if (!getApps().length) throw new Error('A autenticação ainda não foi inicializada.');
  const auth = getAuth(getApp());
  const user = auth.currentUser;
  const sessionToken = localStorage.getItem('requisicaoSessionToken') || '';
  const deviceId = localStorage.getItem('requisicaoDeviceId') || '';
  if (!user || !sessionToken || !deviceId) throw new Error('Faça login novamente.');
  return {
    acao: action,
    ...extra,
    firebaseIdToken: await user.getIdToken(),
    sessaoToken: sessionToken,
    deviceId
  };
}

function currentPriority() {
  const text = document.getElementById('priorityResult')?.textContent || '';
  return text.replace(/^Classificação definida:\s*/i, '').trim();
}

function renderDraftReview() {
  const container = document.getElementById('draftReview');
  if (!container) return;

  const rows = Array.from(document.querySelectorAll('#itemsBody .item-row'));
  const items = rows.map((row, index) => ({
    row,
    index,
    quantity: normalText(row.querySelector('.qty-input')?.value),
    unit: normalText(row.querySelector('.unit-input')?.value),
    description: normalText(row.querySelector('.desc-input')?.value),
    images: Array.isArray(row._images) ? row._images.length : 0
  })).filter(item => item.quantity || item.unit || item.description || item.images);

  const obra = normalText(document.getElementById('obra')?.value);
  const priority = currentPriority();
  const context = [];
  if (obra) context.push('<span class="draft-chip">Obra: ' + esc(obra) + '</span>');
  if (priority) context.push('<span class="draft-chip">Prioridade: ' + esc(priority) + '</span>');

  if (!items.length) {
    container.innerHTML = `
      <div class="draft-review-head">
        <h3 class="draft-review-title">Rascunho atual</h3>
        <span class="draft-save-state">Salvo automaticamente neste dispositivo</span>
      </div>
      ${context.length ? '<div class="draft-context">' + context.join('') + '</div>' : ''}
      <div class="draft-empty">Os materiais adicionados aparecerão aqui para revisão antes do envio.</div>
    `;
    return;
  }

  const list = items.map(item => {
    const meta = [
      item.quantity ? esc(item.quantity) : '',
      item.unit ? esc(item.unit) : '',
      item.images ? item.images + (item.images === 1 ? ' imagem' : ' imagens') : ''
    ].filter(Boolean).join(' · ');
    return `
      <div class="draft-item" data-row-index="${item.index}">
        <div class="draft-item-main">
          <div class="draft-item-desc">${esc(item.description || 'Descrição ainda não informada')}</div>
          <div class="draft-item-meta">${meta || 'Item em preenchimento'}</div>
        </div>
        <button type="button" class="draft-edit" data-edit-row="${item.index}">Editar</button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="draft-review-head">
      <h3 class="draft-review-title">Rascunho atual</h3>
      <span class="draft-save-state">Salvo automaticamente neste dispositivo</span>
    </div>
    ${context.length ? '<div class="draft-context">' + context.join('') + '</div>' : ''}
    <div class="draft-list">${list}</div>
  `;
}

function installDraftReview() {
  if (document.getElementById('draftReview')) return;
  const itemsSection = document.getElementById('itemsBody')?.closest('.section');
  if (!itemsSection) return;
  const review = document.createElement('div');
  review.id = 'draftReview';
  review.className = 'draft-review';
  itemsSection.appendChild(review);
  renderDraftReview();

  review.addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-row]');
    if (!button) return;
    const index = Number(button.dataset.editRow);
    const row = document.querySelectorAll('#itemsBody .item-row')[index];
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => row.querySelector('.desc-input')?.focus(), 350);
  });

  document.addEventListener('input', () => queueMicrotask(renderDraftReview), true);
  document.addEventListener('change', () => queueMicrotask(renderDraftReview), true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('.priority-option,.priority-reset,#addItem,.remove-btn,.image-remove,.image-button')) {
      setTimeout(renderDraftReview, 80);
    }
  }, true);
  const body = document.getElementById('itemsBody');
  if (body) new MutationObserver(() => setTimeout(renderDraftReview, 20)).observe(body, { childList: true, subtree: true });
}

function priorityClass(priority) {
  return 'history-priority';
}

function renderHistory(records) {
  const list = document.getElementById('historyList');
  if (!list) return;
  if (!Array.isArray(records) || !records.length) {
    list.innerHTML = '<div class="history-empty">Nenhuma solicitação enviada por esta conta foi encontrada.</div>';
    return;
  }

  list.innerHTML = records.map(record => {
    const items = Array.isArray(record.itens) ? record.itens : [];
    const rows = items.map(item => `
      <tr>
        <td>${esc(item.quantidade)}</td>
        <td>${esc(item.unidade)}</td>
        <td>${esc(item.descricao)}</td>
        <td>${esc(item.observacao || '')}</td>
      </tr>
    `).join('');
    return `
      <details class="history-card">
        <summary>
          <div class="history-summary">
            <div class="history-date">${esc(record.data || '')}</div>
            <div class="history-work">${esc(record.obra || '')}</div>
            <div class="${priorityClass(record.prioridade)}">${esc(record.prioridade || '')}</div>
          </div>
        </summary>
        <div class="history-body">
          <table class="history-table">
            <thead><tr><th>Quantidade</th><th>Unidade</th><th>Descrição</th><th>Observação</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>
    `;
  }).join('');
}

async function loadHistory(force = false) {
  if (historyLoading || (historyLoaded && !force)) return;
  const list = document.getElementById('historyList');
  const refresh = document.getElementById('historyRefresh');
  historyLoading = true;
  if (refresh) refresh.disabled = true;
  if (list) list.innerHTML = '<div class="history-loading">Carregando suas solicitações...</div>';
  try {
    const response = await post(await authPayload('listarMinhasSolicitacoes', { limite: 100 }));
    renderHistory(response.solicitacoes || []);
    historyLoaded = true;
  } catch (error) {
    if (list) list.innerHTML = '<div class="history-error">' + esc(error.message) + '</div>';
  } finally {
    historyLoading = false;
    if (refresh) refresh.disabled = false;
  }
}

function createTabs() {
  if (document.getElementById('requestTabs')) return;
  const appView = document.getElementById('appView');
  const userBar = appView?.querySelector('.user-bar');
  const content = appView?.querySelector('.content');
  if (!appView || !userBar || !content) return;

  content.id = 'newRequestPane';

  const tabs = document.createElement('div');
  tabs.id = 'requestTabs';
  tabs.className = 'request-tabs';
  tabs.innerHTML = `
    <button type="button" class="request-tab active" data-tab="new">Nova solicitação</button>
    <button type="button" class="request-tab" data-tab="history">Minhas solicitações</button>
  `;
  userBar.insertAdjacentElement('afterend', tabs);

  const history = document.createElement('section');
  history.id = 'historyPane';
  history.className = 'history-pane';
  history.hidden = true;
  history.innerHTML = `
    <div class="history-header">
      <h2>Minhas solicitações</h2>
      <button id="historyRefresh" class="history-refresh" type="button">Atualizar</button>
    </div>
    <div id="historyList" class="history-list">
      <div class="history-loading">Abra esta aba para carregar suas solicitações.</div>
    </div>
  `;
  content.insertAdjacentElement('afterend', history);

  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    const tab = button.dataset.tab;
    tabs.querySelectorAll('.request-tab').forEach(item => item.classList.toggle('active', item === button));
    content.hidden = tab !== 'new';
    history.hidden = tab !== 'history';
    if (tab === 'history') loadHistory(false);
  });

  history.querySelector('#historyRefresh')?.addEventListener('click', () => loadHistory(true));
}

function watchSuccessfulSubmission() {
  const box = document.getElementById('progressBox');
  if (!box) return;
  new MutationObserver(() => {
    if (/enviada com sucesso/i.test(box.textContent || '')) {
      historyLoaded = false;
      setTimeout(renderDraftReview, 100);
    }
  }).observe(box, { childList: true, subtree: true, characterData: true });
}

function start() {
  if (initialized) return;
  const appView = document.getElementById('appView');
  if (!appView) return;
  initialized = true;
  ensureStyle();
  createTransport();
  createTabs();
  installDraftReview();
  watchSuccessfulSubmission();

  new MutationObserver(() => {
    if (!appView.hidden) {
      createTabs();
      installDraftReview();
      renderDraftReview();
    }
  }).observe(appView, { attributes: true, attributeFilter: ['hidden'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
