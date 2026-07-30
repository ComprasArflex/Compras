const BASE_CACHE_KEY = 'requisicaoBasesCacheV2';
const DRAFT_DB = 'requisicao-drafts';
const DRAFT_STORE = 'rascunhos';
const DRAFT_KEY_PREFIX = 'draft:';
const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024;

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

let cachedBases = readBasesCache();
let draftSaveTimer = null;
let restoringDraft = false;
let enhancementsStarted = false;

function readBasesCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BASE_CACHE_KEY) || '{}');
    return {
      obras: Array.isArray(parsed.obras) ? parsed.obras : [],
      materiais: Array.isArray(parsed.materiais) ? parsed.materiais : [],
      updatedAt: parsed.updatedAt || ''
    };
  } catch (_) {
    return { obras: [], materiais: [], updatedAt: '' };
  }
}

function writeBasesCache(bases) {
  const value = {
    obras: Array.isArray(bases?.obras) ? bases.obras : [],
    materiais: Array.isArray(bases?.materiais) ? bases.materiais : [],
    updatedAt: new Date().toISOString()
  };
  cachedBases = value;
  try {
    localStorage.setItem(BASE_CACHE_KEY, JSON.stringify(value));
  } catch (_) {}
}

window.addEventListener('message', (event) => {
  const response = event.data;
  if (response?.source !== 'requisicao-app' || !response?.ok || !response?.bases) return;
  writeBasesCache(response.bases);
});

function workMatchesQuery(work, query) {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  const searchable = normalizeText(`${work?.nome || ''} ${work?.palavrasChave || ''}`);
  return terms.every((term) => searchable.includes(term));
}

function renderWorkSuggestions(input, panel) {
  const matches = cachedBases.obras
    .filter((work) => workMatchesQuery(work, input.value))
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    .slice(0, 12);

  panel.innerHTML = '';

  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'suggestion-empty';
    empty.textContent = cachedBases.obras.length
      ? 'Nenhuma opção encontrada.'
      : 'Carregando opções...';
    panel.appendChild(empty);
  } else {
    matches.forEach((work) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'suggestion notranslate';
      button.innerHTML = '<span class="suggestion-title"></span><span class="suggestion-meta"></span>';
      button.querySelector('.suggestion-title').textContent = work.nome || '';
      button.querySelector('.suggestion-meta').textContent = work.empresa ? `Empresa: ${work.empresa}` : '';
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        input.value = work.nome || '';
        input.dataset.empresa = work.empresa || '';
        panel.classList.remove('visible');
        panel.innerHTML = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        scheduleDraftSave();
        input.focus();
      });
      panel.appendChild(button);
    });
  }

  panel.classList.add('visible');
}

function installWorkSearchOverride() {
  const input = document.getElementById('obra');
  const panel = document.getElementById('obraSuggestions');
  if (!input || !panel) return;

  input.oninput = () => {
    input.dataset.empresa = '';
    renderWorkSuggestions(input, panel);
    scheduleDraftSave();
  };
  input.onfocus = () => renderWorkSuggestions(input, panel);
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

async function putDraft(value) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFT_STORE, 'readwrite');
    transaction.objectStore(DRAFT_STORE).put(value);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getDraft(key) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DRAFT_STORE).objectStore(DRAFT_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteDraft(key) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFT_STORE, 'readwrite');
    transaction.objectStore(DRAFT_STORE).delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function currentDraftKey() {
  const email = document.getElementById('userEmail')?.textContent?.trim() || 'anonymous';
  const device = localStorage.getItem('requisicaoDeviceId') || 'device';
  return `${DRAFT_KEY_PREFIX}${email}:${device}`;
}

function dataUrlFromImage(image) {
  return {
    name: image.name || 'imagem.jpg',
    mime: image.mime || 'image/jpeg',
    base64: image.base64 || ''
  };
}

function collectDraft() {
  const rows = Array.from(document.querySelectorAll('#itemsBody .item-row'));
  const priorityText = document.getElementById('priorityResult')?.textContent || '';
  return {
    key: currentDraftKey(),
    updatedAt: new Date().toISOString(),
    obra: document.getElementById('obra')?.value || '',
    empresa: document.getElementById('obra')?.dataset?.empresa || '',
    prioridade: priorityText.replace(/^Classificação definida:\s*/i, '').trim(),
    observacoes: document.getElementById('observacoes')?.value || '',
    itens: rows.map((row) => ({
      quantidade: row.querySelector('.qty-input')?.value || '',
      unidade: row.querySelector('.unit-input')?.value || '',
      descricao: row.querySelector('.desc-input')?.value || '',
      images: Array.isArray(row._images) ? row._images.map(dataUrlFromImage) : []
    }))
  };
}

async function saveDraftNow() {
  if (restoringDraft) return;
  const appView = document.getElementById('appView');
  if (!appView || appView.hidden) return;
  const draft = collectDraft();
  const hasContent = draft.obra
    || draft.prioridade
    || draft.observacoes
    || draft.itens.some((item) => item.quantidade || item.unidade || item.descricao || item.images.length);
  if (!hasContent) return;
  try {
    await putDraft(draft);
  } catch (error) {
    console.warn('Não foi possível salvar o rascunho local.', error);
  }
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(saveDraftNow, 350);
}

function createPreviewUrl(image) {
  try {
    const binary = atob(image.base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: image.mime || 'image/jpeg' }));
  } catch (_) {
    return '';
  }
}

function renderRestoredPreviews(row) {
  const box = row.querySelector('.image-previews');
  if (!box) return;
  box.innerHTML = '';
  (row._images || []).forEach((image, index) => {
    if (!image.previewUrl) image.previewUrl = createPreviewUrl(image);
    const wrapper = document.createElement('div');
    wrapper.className = 'image-preview';
    wrapper.innerHTML = '<img alt="Prévia"><button type="button" class="image-remove">×</button>';
    wrapper.querySelector('img').src = image.previewUrl;
    wrapper.querySelector('button').addEventListener('click', () => {
      if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
      row._images.splice(index, 1);
      renderRestoredPreviews(row);
      scheduleDraftSave();
    });
    box.appendChild(wrapper);
  });
}

function restorePriority(priority) {
  if (!priority) return;
  const buttons = () => Array.from(document.querySelectorAll('.priority-option'));
  const clickAnswer = (answer) => buttons().find((button) => button.dataset.answer === answer)?.click();
  const sequence = {
    Emergencial: ['sim'],
    Urgente: ['nao', 'sim'],
    Necessária: ['nao', 'nao', 'sim'],
    Programada: ['nao', 'nao', 'nao']
  }[priority];
  (sequence || []).forEach(clickAnswer);
}

async function restoreDraftIfAvailable() {
  const appView = document.getElementById('appView');
  if (!appView || appView.hidden) return;
  const key = currentDraftKey();
  const draft = await getDraft(key).catch(() => null);
  if (!draft) return;

  restoringDraft = true;
  try {
    const obra = document.getElementById('obra');
    const observations = document.getElementById('observacoes');
    if (obra) {
      obra.value = draft.obra || '';
      obra.dataset.empresa = draft.empresa || '';
    }
    if (observations) observations.value = draft.observacoes || '';

    const body = document.getElementById('itemsBody');
    const addButton = document.getElementById('addItem');
    if (body && addButton && Array.isArray(draft.itens)) {
      body.innerHTML = '';
      const items = draft.itens.length ? draft.itens : [{}];
      items.forEach(() => addButton.click());
      Array.from(body.querySelectorAll('.item-row')).forEach((row, index) => {
        const item = items[index] || {};
        const quantity = row.querySelector('.qty-input');
        const unit = row.querySelector('.unit-input');
        const description = row.querySelector('.desc-input');
        if (quantity) quantity.value = item.quantidade || '';
        if (unit) unit.value = item.unidade || '';
        if (description) description.value = item.descricao || '';
        row._images = (item.images || []).map((image) => ({ ...image, previewUrl: createPreviewUrl(image) }));
        renderRestoredPreviews(row);
      });
    }

    restorePriority(draft.prioridade);
  } finally {
    restoringDraft = false;
  }
}

function installDraftAutosave() {
  document.addEventListener('input', scheduleDraftSave, true);
  document.addEventListener('change', scheduleDraftSave, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('.priority-option, .priority-reset, #addItem, .remove-btn, .image-remove')) {
      scheduleDraftSave();
    }
  }, true);
  window.addEventListener('pagehide', saveDraftNow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveDraftNow();
  });

  const progressBox = document.getElementById('progressBox');
  if (progressBox) {
    new MutationObserver(async () => {
      const text = progressBox.textContent || '';
      if (/salva neste dispositivo|enviada com sucesso/i.test(text)) {
        await deleteDraft(currentDraftKey()).catch(() => {});
      }
    }).observe(progressBox, { childList: true, characterData: true, subtree: true });
  }
}

function installSessionRestoringMask() {
  if (!localStorage.getItem('requisicaoSessionToken')) return;
  const loginView = document.getElementById('loginView');
  const appView = document.getElementById('appView');
  if (!loginView || !appView) return;

  const mask = document.createElement('div');
  mask.id = 'sessionRestoringMask';
  mask.textContent = 'Restaurando sua sessão...';
  mask.style.cssText = 'padding:32px;text-align:center;color:#236b49;font-weight:700';
  loginView.parentNode.insertBefore(mask, loginView);
  loginView.hidden = true;

  const observer = new MutationObserver(() => {
    if (!appView.hidden || !loginView.hidden) {
      mask.remove();
      observer.disconnect();
    }
  });
  observer.observe(appView, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(loginView, { attributes: true, attributeFilter: ['hidden'] });
  setTimeout(() => mask.remove(), 15000);
}

function validateImageSize(files) {
  const oversized = Array.from(files || []).find((file) => file.size > MAX_ORIGINAL_IMAGE_BYTES);
  if (!oversized) return true;
  alert(`A imagem ${oversized.name} excede o limite de 10 MB.`);
  return false;
}

function transferFilesToInput(files, input) {
  const dataTransfer = new DataTransfer();
  Array.from(files || []).forEach((file) => dataTransfer.items.add(file));
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function enhanceImagePicker(row) {
  if (row.dataset.imagePickerEnhanced === 'true') return;
  const tools = row.querySelector('.image-tools');
  const galleryInput = row.querySelector('.image-input');
  const originalLabel = galleryInput?.closest('label');
  const caption = row.querySelector('.image-caption');
  if (!tools || !galleryInput || !originalLabel) return;

  row.dataset.imagePickerEnhanced = 'true';
  galleryInput.removeAttribute('capture');
  originalLabel.childNodes[0].textContent = 'Escolher da galeria';
  originalLabel.addEventListener('click', saveDraftNow, true);

  galleryInput.addEventListener('change', (event) => {
    if (!validateImageSize(event.target.files)) {
      event.stopImmediatePropagation();
      event.target.value = '';
    }
  }, true);

  const cameraLabel = document.createElement('label');
  cameraLabel.className = 'image-button';
  cameraLabel.style.marginLeft = '8px';
  cameraLabel.textContent = 'Tirar foto';
  const cameraInput = document.createElement('input');
  cameraInput.type = 'file';
  cameraInput.accept = 'image/*';
  cameraInput.capture = 'environment';
  cameraInput.className = 'image-input camera-input';
  cameraLabel.appendChild(cameraInput);
  originalLabel.insertAdjacentElement('afterend', cameraLabel);

  cameraLabel.addEventListener('click', saveDraftNow, true);
  cameraInput.addEventListener('change', () => {
    if (!validateImageSize(cameraInput.files)) {
      cameraInput.value = '';
      return;
    }
    if (cameraInput.files?.length) transferFilesToInput(cameraInput.files, galleryInput);
    cameraInput.value = '';
  });

  if (caption) caption.textContent = 'Máximo de 10 MB por imagem.';
}

function enhanceAllImagePickers() {
  document.querySelectorAll('#itemsBody .item-row').forEach(enhanceImagePicker);
}

function startEnhancements() {
  if (enhancementsStarted) return;
  enhancementsStarted = true;
  installSessionRestoringMask();
  installWorkSearchOverride();
  installDraftAutosave();
  enhanceAllImagePickers();

  const itemsBody = document.getElementById('itemsBody');
  if (itemsBody) {
    new MutationObserver(() => enhanceAllImagePickers()).observe(itemsBody, { childList: true });
  }

  const appView = document.getElementById('appView');
  if (appView) {
    const restoreWhenVisible = async () => {
      if (!appView.hidden) {
        installWorkSearchOverride();
        enhanceAllImagePickers();
        await restoreDraftIfAvailable();
      }
    };
    new MutationObserver(restoreWhenVisible).observe(appView, { attributes: true, attributeFilter: ['hidden'] });
    restoreWhenVisible();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startEnhancements, { once: true });
} else {
  startEnhancements();
}
