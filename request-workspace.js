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
    .history-controls{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 0 4px}
    .history-expiry{color:var(--muted);font-size:12px}
    .history-delete{padding:8px 12px;border:1px solid #f4c7c7;border-radius:9px;background:#fff5f5;color:#b91c1c;font-weight:700;cursor:pointer}
    .history-delete:disabled{opacity:.6;cursor:wait}
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


const DRAFT_DB = 'requisicao-drafts';
const DRAFT_STORE = 'rascunhos';
const SAVED_DRAFT_PREFIX = 'saved:';
let activeSavedDraftKey = '';

function currentPriority() {
  const text = document.getElementById('priorityResult')?.textContent || '';
  return text.replace(/^Classificação definida:\s*/i, '').trim();
}

function openDraftDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE)) {
        request.result.createObjectStore(DRAFT_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllDraftRecords() {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DRAFT_STORE).objectStore(DRAFT_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function getDraftRecord(key) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DRAFT_STORE).objectStore(DRAFT_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function putDraftRecord(record) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteDraftRecord(key) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function draftIdentity() {
  const email = normalText(document.getElementById('userEmail')?.textContent).toLowerCase() || 'anonymous';
  const device = localStorage.getItem('requisicaoDeviceId') || 'device';
  return { email, device };
}

function savedDraftPrefix() {
  const id = draftIdentity();
  return SAVED_DRAFT_PREFIX + id.email + ':' + id.device + ':';
}

function currentAutoDraftKey() {
  const id = draftIdentity();
  return 'draft:' + id.email + ':' + id.device;
}

function imagesForStorage(row) {
  return (Array.isArray(row._images) ? row._images : []).map((image) => ({
    name: image.name || 'imagem.jpg',
    mime: image.mime || 'image/jpeg',
    base64: image.base64 || ''
  }));
}

function collectFormSnapshot() {
  const obra = document.getElementById('obra');
  const rows = Array.from(document.querySelectorAll('#itemsBody .item-row'));
  return {
    obra: normalText(obra?.value),
    empresa: normalText(obra?.dataset?.empresa),
    prioridade: currentPriority(),
    observacoes: normalText(document.getElementById('observacoes')?.value),
    itens: rows.map((row) => ({
      quantidade: normalText(row.querySelector('.qty-input')?.value),
      unidade: normalText(row.querySelector('.unit-input')?.value),
      descricao: normalText(row.querySelector('.desc-input')?.value),
      images: imagesForStorage(row)
    }))
  };
}

function snapshotHasContent(snapshot) {
  return Boolean(
    snapshot.obra ||
    snapshot.prioridade ||
    snapshot.observacoes ||
    (snapshot.itens || []).some((item) => item.quantidade || item.unidade || item.descricao || (item.images || []).length)
  );
}

function ensureDraftStyle() {
  if (document.getElementById('savedDraftStyle')) return;
  const style = document.createElement('style');
  style.id = 'savedDraftStyle';
  style.textContent =
    '.draft-actions{display:flex;gap:8px;flex-wrap:wrap}' +
    '.draft-status{display:none;margin-bottom:12px;padding:10px 12px;border-radius:10px;background:#ecfdf3;color:#166534;font-size:12px;font-weight:700}' +
    '.draft-status.visible{display:block}' +
    '.draft-card-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:12px 0}' +
    '.draft-action{padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--accent);font-weight:700;cursor:pointer}' +
    '.draft-action.danger{color:#b91c1c;border-color:#f4c7c7}' +
    '.draft-note{color:var(--muted);font-size:12px;line-height:1.45}' +
    '@media(max-width:768px){.draft-actions{width:100%}.draft-actions .btn{flex:1}.draft-card-actions{justify-content:stretch}.draft-action{flex:1}}';
  document.head.appendChild(style);
}

function setDraftStatus(message) {
  const status = document.getElementById('draftStatus');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('visible', Boolean(message));
}

function updateDraftButtons() {
  const save = document.getElementById('saveDraftButton');
  if (save) save.textContent = activeSavedDraftKey ? 'Atualizar rascunho' : 'Salvar rascunho';
}

function formatDraftDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function createPreviewUrl(image) {
  try {
    const binary = atob(image.base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: image.mime || 'image/jpeg' }));
  } catch (_) {
    return '';
  }
}

function renderLoadedPreviews(row) {
  const box = row.querySelector('.image-previews');
  if (!box) return;
  box.innerHTML = '';
  (row._images || []).forEach((image, index) => {
    if (!image.previewUrl) image.previewUrl = createPreviewUrl(image);
    const wrapper = document.createElement('div');
    wrapper.className = 'image-preview';
    const img = document.createElement('img');
    img.alt = 'Prévia';
    img.src = image.previewUrl || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-remove';
    button.textContent = '×';
    button.addEventListener('click', () => {
      if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
      row._images.splice(index, 1);
      renderLoadedPreviews(row);
    });
    wrapper.append(img, button);
    box.appendChild(wrapper);
  });
}

function restorePriority(priority) {
  if (!priority) return;
  const sequence = {
    Emergencial: ['sim'],
    Urgente: ['nao', 'sim'],
    'Necessária': ['nao', 'nao', 'sim'],
    Programada: ['nao', 'nao', 'nao']
  }[priority];
  (sequence || []).forEach((answer) => {
    document.querySelector('.priority-option[data-answer="' + answer + '"]')?.click();
  });
}

async function storeCurrentAutosave(snapshot) {
  const identity = draftIdentity();
  await putDraftRecord({
    key: currentAutoDraftKey(),
    updatedAt: new Date().toISOString(),
    obra: snapshot.obra || '',
    empresa: snapshot.empresa || '',
    prioridade: snapshot.prioridade || '',
    observacoes: snapshot.observacoes || '',
    itens: snapshot.itens || [],
    email: identity.email,
    deviceId: identity.device
  });
}

async function applySavedDraft(record) {
  const clearButton = document.getElementById('clearBtn');
  clearButton?.click();

  const obra = document.getElementById('obra');
  const obs = document.getElementById('observacoes');
  if (obra) {
    obra.value = record.obra || '';
    obra.dataset.empresa = record.empresa || '';
  }
  if (obs) obs.value = record.observacoes || '';

  const body = document.getElementById('itemsBody');
  const add = document.getElementById('addItem');
  if (body && add) {
    body.innerHTML = '';
    const items = Array.isArray(record.itens) && record.itens.length ? record.itens : [{}];
    items.forEach(() => add.click());
    Array.from(body.querySelectorAll('.item-row')).forEach((row, index) => {
      const item = items[index] || {};
      const quantity = row.querySelector('.qty-input');
      const unit = row.querySelector('.unit-input');
      const description = row.querySelector('.desc-input');
      if (quantity) quantity.value = item.quantidade || '';
      if (unit) unit.value = item.unidade || '';
      if (description) description.value = item.descricao || '';
      row._images = (item.images || []).map((image) => ({
        name: image.name || 'imagem.jpg',
        mime: image.mime || 'image/jpeg',
        base64: image.base64 || '',
        previewUrl: createPreviewUrl(image)
      }));
      renderLoadedPreviews(row);
    });
  }

  restorePriority(record.prioridade || '');
  const snapshot = collectFormSnapshot();
  await storeCurrentAutosave(snapshot).catch(() => {});
  document.dispatchEvent(new Event('change', { bubbles: true }));
}

function makeDraftTable(record) {
  const wrapper = document.createElement('div');
  wrapper.className = 'history-body';

  const actions = document.createElement('div');
  actions.className = 'draft-card-actions';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'draft-action';
  edit.textContent = 'Editar';
  edit.dataset.draftEdit = record.key;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'draft-action danger';
  remove.textContent = 'Excluir';
  remove.dataset.draftDelete = record.key;

  actions.append(edit, remove);

  const table = document.createElement('table');
  table.className = 'history-table';
  table.innerHTML = '<thead><tr><th>Quantidade</th><th>Unidade</th><th>Descrição</th><th>Observação</th></tr></thead>';
  const tbody = document.createElement('tbody');
  (record.itens || []).forEach((item) => {
    const row = document.createElement('tr');
    [item.quantidade || '', item.unidade || '', item.descricao || '', record.observacoes || ''].forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  wrapper.append(actions, table);
  return wrapper;
}

async function renderSavedDrafts() {
  const list = document.getElementById('savedDraftsList');
  if (!list) return;
  const prefix = savedDraftPrefix();
  const records = (await getAllDraftRecords().catch(() => []))
    .filter((record) => String(record.key || '').startsWith(prefix))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  list.innerHTML = '';
  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhum rascunho salvo neste dispositivo.';
    list.appendChild(empty);
    return;
  }

  records.forEach((record) => {
    const details = document.createElement('details');
    details.className = 'history-card';

    const summary = document.createElement('summary');
    const row = document.createElement('div');
    row.className = 'history-summary';

    const date = document.createElement('div');
    date.className = 'history-date';
    date.textContent = formatDraftDate(record.updatedAt);

    const work = document.createElement('div');
    work.className = 'history-work';
    work.textContent = record.obra || 'Obra ainda não informada';

    const priority = document.createElement('div');
    priority.className = 'history-priority';
    priority.textContent = record.prioridade || 'Sem prioridade';

    row.append(date, work, priority);
    summary.appendChild(row);
    details.append(summary, makeDraftTable(record));
    list.appendChild(details);
  });
}

async function saveExplicitDraft() {
  const snapshot = collectFormSnapshot();
  if (!snapshotHasContent(snapshot)) {
    alert('Preencha ao menos uma informação antes de salvar o rascunho.');
    return;
  }

  const identity = draftIdentity();
  const now = new Date().toISOString();
  let existing = activeSavedDraftKey ? await getDraftRecord(activeSavedDraftKey).catch(() => null) : null;
  const key = activeSavedDraftKey || savedDraftPrefix() + crypto.randomUUID();

  await putDraftRecord({
    key,
    type: 'saved',
    email: identity.email,
    deviceId: identity.device,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...snapshot
  });

  activeSavedDraftKey = key;
  updateDraftButtons();
  setDraftStatus('Rascunho salvo neste dispositivo.');
  await renderSavedDrafts();
}

async function startNewDraft() {
  const current = collectFormSnapshot();
  if (snapshotHasContent(current)) {
    const proceed = confirm('O preenchimento atual será limpo. Os rascunhos já salvos não serão alterados. Deseja continuar?');
    if (!proceed) return;
  }
  document.getElementById('clearBtn')?.click();
  activeSavedDraftKey = '';
  updateDraftButtons();
  await deleteDraftRecord(currentAutoDraftKey()).catch(() => {});
  setDraftStatus('Novo rascunho iniciado.');
  document.getElementById('obra')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function editExplicitDraft(key) {
  const record = await getDraftRecord(key).catch(() => null);
  if (!record) {
    setDraftStatus('O rascunho não foi encontrado neste dispositivo.');
    await renderSavedDrafts();
    return;
  }

  const current = collectFormSnapshot();
  if (snapshotHasContent(current) && activeSavedDraftKey !== key) {
    const proceed = confirm('O preenchimento atual será substituído pelo rascunho selecionado. Rascunhos já salvos continuarão preservados. Deseja continuar?');
    if (!proceed) return;
  }

  await applySavedDraft(record);
  activeSavedDraftKey = key;
  updateDraftButtons();
  setDraftStatus('Rascunho carregado para edição.');

  document.querySelector('.request-tab[data-tab="new"]')?.click();
  document.getElementById('obra')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function removeExplicitDraft(key) {
  const proceed = confirm('Excluir este rascunho deste dispositivo?');
  if (!proceed) return;
  await deleteDraftRecord(key);
  if (activeSavedDraftKey === key) {
    activeSavedDraftKey = '';
    updateDraftButtons();
  }
  setDraftStatus('Rascunho excluído.');
  await renderSavedDrafts();
}

function installSavedDrafts() {
  if (document.getElementById('savedDraftsSection')) return;
  ensureDraftStyle();

  const observations = document.getElementById('observacoes')?.closest('.section');
  if (!observations) return;

  const section = document.createElement('section');
  section.id = 'savedDraftsSection';
  section.className = 'section';
  section.innerHTML =
    '<div class="section-header">' +
      '<div><h2>Rascunhos</h2><div class="hint">Salve uma solicitação em preparação para continuar ou revisar depois. Os rascunhos ficam neste dispositivo e só são enviados quando você clicar em Salvar solicitação.</div></div>' +
      '<div class="draft-actions">' +
        '<button id="saveDraftButton" class="btn btn-primary" type="button">Salvar rascunho</button>' +
        '<button id="newDraftButton" class="btn btn-secondary" type="button">Novo rascunho</button>' +
      '</div>' +
    '</div>' +
    '<div id="draftStatus" class="draft-status"></div>' +
    '<div id="savedDraftsList" class="history-list"></div>';

  observations.insertAdjacentElement('afterend', section);
  document.getElementById('saveDraftButton')?.addEventListener('click', saveExplicitDraft);
  document.getElementById('newDraftButton')?.addEventListener('click', startNewDraft);

  section.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-draft-edit]');
    if (edit) {
      editExplicitDraft(edit.dataset.draftEdit);
      return;
    }
    const remove = event.target.closest('[data-draft-delete]');
    if (remove) removeExplicitDraft(remove.dataset.draftDelete);
  });

  updateDraftButtons();
  renderSavedDrafts();
}


function priorityClass(priority) {
  return 'history-priority';
}

function renderHistory(records) {
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = '';
  if (!Array.isArray(records) || !records.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhuma solicitação disponível para visualização.';
    list.appendChild(empty);
    return;
  }
  records.forEach((record) => {
    const details = document.createElement('details');
    details.className = 'history-card';
    details.dataset.requestId = record.idRequisicao || '';
    const summary = document.createElement('summary');
    const summaryRow = document.createElement('div');
    summaryRow.className = 'history-summary';
    const date = document.createElement('div');
    date.className = 'history-date';
    date.textContent = record.data || '';
    const work = document.createElement('div');
    work.className = 'history-work';
    work.textContent = record.obra || '';
    const priority = document.createElement('div');
    priority.className = priorityClass(record.prioridade);
    priority.textContent = record.prioridade || '';
    summaryRow.append(date, work, priority);
    summary.appendChild(summaryRow);
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'history-body';
    const controls = document.createElement('div');
    controls.className = 'history-controls';
    const expiry = document.createElement('span');
    expiry.className = 'history-expiry';
    expiry.textContent = record.expiraEm ? 'Disponível até ' + record.expiraEm : '';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-delete';
    remove.dataset.hideRequest = record.idRequisicao || '';
    remove.textContent = 'Excluir';
    controls.append(expiry, remove);
    body.appendChild(controls);
    const table = document.createElement('table');
    table.className = 'history-table';
    table.innerHTML = '<thead><tr><th>Quantidade</th><th>Unidade</th><th>Descrição</th><th>Observação</th></tr></thead>';
    const tbody = document.createElement('tbody');
    (Array.isArray(record.itens) ? record.itens : []).forEach((item) => {
      const row = document.createElement('tr');
      [item.quantidade || '', item.unidade || '', item.descricao || '', item.observacao || ''].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    body.appendChild(table);
    details.appendChild(body);
    list.appendChild(details);
  });
}

async function hideHistoryRequest(requestId, button) {
  const id = normalText(requestId);
  if (!id) return;
  const confirmed = confirm(
    'Excluir esta solicitação de "Minhas solicitações"?\n\n' +
    'Ela deixará de aparecer para você, mas o registro continuará preservado na planilha.'
  );
  if (!confirmed) return;
  const original = button?.textContent || 'Excluir';
  if (button) { button.disabled = true; button.textContent = 'Excluindo...'; }
  try {
    await post(await authPayload('ocultarMinhaSolicitacao', { idRequisicao: id }));
    historyLoaded = false;
    await loadHistory(true);
  } catch (error) {
    alert(error.message || 'Não foi possível excluir a solicitação da visualização.');
    if (button) { button.disabled = false; button.textContent = original; }
  }
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
    let message = error.message || 'Não foi possível carregar suas solicitações.';
    if (/Ação não reconhecida|autenticação obrigatória/i.test(message)) {
      message = 'A implantação do Apps Script ainda está na versão anterior. Atualize o Código.gs e crie uma nova versão da implantação para habilitar Minhas solicitações.';
    }
    if (list) list.innerHTML = '<div class="history-error">' + esc(message) + '</div>';
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
  history.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hide-request]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    hideHistoryRequest(button.dataset.hideRequest, button);
  });
}

function watchSuccessfulSubmission() {
  const box = document.getElementById('progressBox');
  if (!box) return;
  new MutationObserver(async () => {
    if (/enviada com sucesso/i.test(box.textContent || '')) {
      historyLoaded = false;
      if (activeSavedDraftKey) {
        await deleteDraftRecord(activeSavedDraftKey).catch(() => {});
        activeSavedDraftKey = '';
        updateDraftButtons();
        await renderSavedDrafts();
      }
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
  installSavedDrafts();
  watchSuccessfulSubmission();

  new MutationObserver(() => {
    if (!appView.hidden) {
      createTabs();
      installSavedDrafts();
      renderSavedDrafts();
    }
  }).observe(appView, { attributes: true, attributeFilter: ['hidden'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
