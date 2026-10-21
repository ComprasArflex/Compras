const EMAIL_DESTINO = 'compras@arflex.com.br';
const API_VERSION = '2026.10.21-historico-retencao-v3';

// Deixe vazio para usar a planilha vinculada ao projeto.
const ID_PLANILHA = '';
const NOME_ABA = '';

const FIREBASE_WEB_API_KEY = 'AIzaSyDhCsyprLYGe7PrBre9PR7liJOJ6QFF7wk';
const FIREBASE_PROJECT_ID_PUBLICO = 'requisicao-de-compras';
const PAGINA_NOTIFICACOES = 'https://comprasarflex.github.io/Compras/requisicao-v2.html';

const NOME_ABA_BASE_OBRAS = 'BASE_OBRAS';
const NOME_ABA_BASE_MATERIAIS = 'BASE_MATERIAIS';
const NOME_ABA_USUARIOS = 'USUARIOS_AUTORIZADOS';
const NOME_ABA_SESSOES = 'USUARIOS_SESSOES';
const NOME_ABA_ARQUIVOS = 'ARQUIVOS_REQUISICOES';
const NOME_ABA_IMAGENS = 'IMAGENS';
const NOME_ABA_SOLICITACOES_OCULTAS = 'SOLICITACOES_OCULTAS';

const MAX_IMAGENS_POR_ITEM = 3;
const MAX_BYTES_IMAGEM = 750000;
const DIAS_ARQUIVAR = 90;
const DIAS_GRACA_EXCLUSAO = 30;
const HORAS_LIMPAR_PENDENTE = 24;
const DIAS_VISUALIZACAO_PRIORIDADE = { Emergencial: 5, Urgente: 6, 'Necessária': 10, Programada: 35 };

const CABECALHOS = [
  'ID da requisição', 'Data', 'Hora', 'Empresa', 'Obra', 'Usuário autenticado',
  'Quantidade', 'Unidade', 'Descrição', 'Observações', 'Prioridade',
  'E-mail do usuário', 'Nome do usuário', 'Imagens'
];

const CABECALHOS_USUARIOS = ['Ativo', 'E-mail', 'Nome', 'Perfil'];
const CABECALHOS_SESSOES = [
  'E-mail', 'UID Firebase', 'Nome', 'Dispositivo', 'Hash do dispositivo',
  'Hash da sessão', 'Criada em', 'Última atividade', 'Status', 'Último logout'
];
const CABECALHOS_ARQUIVOS = [
  'ID da requisição', 'Pasta ID', 'E-mail', 'Criada em', 'Última atividade',
  'Status', 'Arquivada em', 'Excluir após', 'Finalizada em'
];
const CABECALHOS_IMAGENS = [
  'ID da requisição', 'Item', 'Arquivo ID', 'Nome do arquivo', 'Link',
  'E-mail', 'Criada em', 'Tamanho', 'MIME'
];
const CABECALHOS_SOLICITACOES_OCULTAS = ['ID da requisição', 'E-mail', 'Ocultada em', 'Motivo'];

const PROPRIEDADES = {
  FIREBASE_PROJECT_ID: 'FIREBASE_PROJECT_ID',
  FIREBASE_CLIENT_EMAIL: 'FIREBASE_CLIENT_EMAIL',
  FIREBASE_PRIVATE_KEY: 'FIREBASE_PRIVATE_KEY',
  NOTIFICATION_ACTIVATION_KEY: 'NOTIFICATION_ACTIVATION_KEY',
  FCM_DEVICES: 'FCM_DEVICES_JSON',
  DRIVE_ROOT_FOLDER_ID: 'DRIVE_REQUISICOES_FOLDER_ID',
  DRIVE_ARCHIVE_FOLDER_ID: 'DRIVE_ARQUIVO_FOLDER_ID',
  ALLOW_LEGACY: 'PERMITIR_ENVIO_LEGADO'
};

function doPost(e) {
  try {
    const recebido = lerCorpoDaRequisicao_(e);
    const acao = texto_(recebido.acao);

    if (acao === 'iniciarSessao') return processarInicioSessao_(recebido);
    if (acao === 'validarSessao') return processarValidacaoSessao_(recebido);
    if (acao === 'encerrarSessao') return processarEncerramentoSessao_(recebido);
    if (acao === 'carregarBases') return processarCarregamentoBasesAutenticado_(recebido);
    if (acao === 'listarMinhasSolicitacoes') return processarListagemMinhasSolicitacoes_(recebido);
    if (acao === 'ocultarMinhaSolicitacao') return processarOcultacaoMinhaSolicitacao_(recebido);
    if (acao === 'reservarRequisicao') return processarReservaRequisicao_(recebido);
    if (acao === 'enviarImagem') return processarEnvioImagem_(recebido);
    if (acao === 'finalizarRequisicao') return processarFinalizacaoRequisicao_(recebido);

    if (['registrarDispositivo', 'removerDispositivo', 'testarNotificacao'].indexOf(acao) !== -1) {
      return processarAcaoNotificacao_(recebido);
    }

    // Compatibilidade temporária com a página antiga durante a implantação.
    if (!acao && permitirEnvioLegado_()) return processarEnvioLegado_(recebido);

    throw new Error('Ação não reconhecida ou autenticação obrigatória.');
  } catch (erro) {
    console.error('Erro geral: ' + erro.stack);
    return respostaIframe_({
      ok: false,
      token: obterTokenSeguro_(e),
      erro: erro.message
    });
  }
}

function doGet() {
  return respostaJson_({ ok: true, mensagem: 'Aplicativo de requisições ativo.', versao: API_VERSION });
}

function configurarEstruturaInicial() {
  const planilha = obterPlanilha_();
  garantirAbaComCabecalhos_(planilha, NOME_ABA_USUARIOS, CABECALHOS_USUARIOS);
  garantirAbaComCabecalhos_(planilha, NOME_ABA_SESSOES, CABECALHOS_SESSOES);
  garantirAbaComCabecalhos_(planilha, NOME_ABA_ARQUIVOS, CABECALHOS_ARQUIVOS);
  garantirAbaComCabecalhos_(planilha, NOME_ABA_IMAGENS, CABECALHOS_IMAGENS);
  garantirAbaComCabecalhos_(planilha, NOME_ABA_SOLICITACOES_OCULTAS, CABECALHOS_SOLICITACOES_OCULTAS);

  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty(PROPRIEDADES.DRIVE_ROOT_FOLDER_ID);
  let root;
  if (rootId) {
    root = DriveApp.getFolderById(rootId);
  } else {
    root = DriveApp.createFolder('REQUISICOES_DE_MATERIAIS');
    props.setProperty(PROPRIEDADES.DRIVE_ROOT_FOLDER_ID, root.getId());
  }

  let archiveId = props.getProperty(PROPRIEDADES.DRIVE_ARCHIVE_FOLDER_ID);
  if (!archiveId) {
    const archive = obterOuCriarSubpasta_(root, '_ARQUIVO');
    props.setProperty(PROPRIEDADES.DRIVE_ARCHIVE_FOLDER_ID, archive.getId());
  }

  instalarGatilhoManutencao();
  return 'Estrutura configurada. Pasta: ' + root.getUrl();
}

function instalarGatilhoManutencao() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'manutencaoDiaria') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('manutencaoDiaria').timeBased().everyDays(1).atHour(3).create();
}

function autorizarServicos() {
  obterPlanilha_().getId();
  DriveApp.getRootFolder().getId();
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis', { muteHttpExceptions: true });
  MailApp.getRemainingDailyQuota();
}

function processarInicioSessao_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    const identidade = verificarIdentidadeFirebase_(data.firebaseIdToken);
    const autorizado = obterUsuarioAutorizado_(identidade.email);
    const sessao = criarSessao_(identidade, autorizado, data.deviceId, data.deviceName);
    return respostaIframe_({
      ok: true,
      token: tokenResposta,
      acao: 'iniciarSessao',
      sessaoToken: sessao.token,
      usuario: {
        uid: identidade.uid,
        email: identidade.email,
        nome: autorizado.nome || identidade.nome || identidade.email,
        perfil: autorizado.perfil || 'Usuário'
      }
    });
  } catch (erro) {
    return respostaIframe_({ ok: false, token: tokenResposta, acao: 'iniciarSessao', erro: erro.message });
  }
}

function processarValidacaoSessao_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    const contexto = validarContextoAutenticado_(data);
    return respostaIframe_({
      ok: true,
      token: tokenResposta,
      acao: 'validarSessao',
      usuario: contexto.usuario
    });
  } catch (erro) {
    return respostaIframe_({ ok: false, token: tokenResposta, acao: 'validarSessao', erro: erro.message, sessaoInvalida: true });
  }
}

function processarEncerramentoSessao_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    encerrarSessao_(data);
    return respostaIframe_({ ok: true, token: tokenResposta, acao: 'encerrarSessao' });
  } catch (erro) {
    return respostaIframe_({ ok: false, token: tokenResposta, acao: 'encerrarSessao', erro: erro.message });
  }
}

function processarCarregamentoBasesAutenticado_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    validarContextoAutenticado_(data);
    return respostaIframe_({
      ok: true,
      token: tokenResposta,
      acao: 'carregarBases',
      bases: { obras: carregarBaseObras_(), materiais: carregarBaseMateriais_() }
    });
  } catch (erro) {
    return respostaIframe_({ ok: false, token: tokenResposta, acao: 'carregarBases', erro: erro.message });
  }
}


function processarListagemMinhasSolicitacoes_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    const contexto = validarContextoAutenticado_(data);
    const limiteRecebido = Number(data.limite);
    const limite = Math.min(Math.max(isFinite(limiteRecebido) && limiteRecebido > 0 ? Math.floor(limiteRecebido) : 100, 1), 200);
    const solicitacoes = listarSolicitacoesDoUsuario_(contexto.usuario.email, limite);
    return respostaIframe_({
      ok: true,
      token: tokenResposta,
      acao: 'listarMinhasSolicitacoes',
      solicitacoes: solicitacoes,
      versao: API_VERSION
    });
  } catch (erro) {
    return respostaIframe_({
      ok: false,
      token: tokenResposta,
      acao: 'listarMinhasSolicitacoes',
      erro: erro.message
    });
  }
}

function processarOcultacaoMinhaSolicitacao_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    const contexto = validarContextoAutenticado_(data);
    const idRequisicao = texto_(data.idRequisicao);
    if (!idRequisicao) throw new Error('Solicitação não informada.');

    if (!solicitacaoPertenceAoUsuario_(idRequisicao, contexto.usuario.email)) {
      throw new Error('Esta solicitação não pertence ao usuário autenticado.');
    }

    registrarSolicitacaoOculta_(idRequisicao, contexto.usuario.email, 'MANUAL');
    return respostaIframe_({
      ok: true,
      token: tokenResposta,
      acao: 'ocultarMinhaSolicitacao',
      idRequisicao: idRequisicao
    });
  } catch (erro) {
    return respostaIframe_({
      ok: false,
      token: tokenResposta,
      acao: 'ocultarMinhaSolicitacao',
      erro: erro.message
    });
  }
}

function listarSolicitacoesDoUsuario_(email, limite) {
  const sheet = obterAbaDestino_();
  if (!sheet || sheet.getLastRow() < 2) return [];

  const colunas = CABECALHOS.length;
  const linhas = sheet.getRange(2, 1, sheet.getLastRow() - 1, colunas).getDisplayValues();
  const emailAlvo = texto_(email).toLowerCase();
  const ocultas = obterSolicitacoesOcultasDoUsuario_(emailAlvo);
  const grupos = {};

  const idx = {
    id: CABECALHOS.indexOf('ID da requisição'),
    data: CABECALHOS.indexOf('Data'),
    hora: CABECALHOS.indexOf('Hora'),
    empresa: CABECALHOS.indexOf('Empresa'),
    obra: CABECALHOS.indexOf('Obra'),
    quantidade: CABECALHOS.indexOf('Quantidade'),
    unidade: CABECALHOS.indexOf('Unidade'),
    descricao: CABECALHOS.indexOf('Descrição'),
    observacoes: CABECALHOS.indexOf('Observações'),
    prioridade: CABECALHOS.indexOf('Prioridade'),
    email: CABECALHOS.indexOf('E-mail do usuário')
  };

  linhas.forEach(function(linha, index) {
    if (texto_(linha[idx.email]).toLowerCase() !== emailAlvo) return;

    const id = texto_(linha[idx.id]);
    if (!id || ocultas[id]) return;

    if (!grupos[id]) {
      grupos[id] = {
        idRequisicao: id,
        data: texto_(linha[idx.data]),
        hora: texto_(linha[idx.hora]),
        empresa: texto_(linha[idx.empresa]),
        obra: texto_(linha[idx.obra]),
        prioridade: normalizarPrioridade_(linha[idx.prioridade]),
        itens: [],
        _ordem: index
      };
    }

    grupos[id]._ordem = Math.max(grupos[id]._ordem, index);
    grupos[id].itens.push({
      quantidade: texto_(linha[idx.quantidade]),
      unidade: texto_(linha[idx.unidade]),
      descricao: texto_(linha[idx.descricao]),
      observacao: texto_(linha[idx.observacoes])
    });
  });

  const hoje = inicioDoDia_(new Date());
  return Object.keys(grupos)
    .map(function(id) {
      const item = grupos[id];
      const limite = calcularDataLimiteVisualizacao_(item.data, item.prioridade);
      item.expiraEm = limite ? Utilities.formatDate(limite, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'dd/MM/yyyy') : '';
      item.expiraEmData = limite;
      return item;
    })
    .filter(function(item) {
      return !item.expiraEmData || hoje <= item.expiraEmData;
    })
    .sort(function(a, b) { return b._ordem - a._ordem; })
    .slice(0, limite)
    .map(function(item) {
      delete item._ordem;
      delete item.expiraEmData;
      return item;
    });
}

function solicitacaoPertenceAoUsuario_(idRequisicao, email) {
  const sheet = obterAbaDestino_();
  if (!sheet || sheet.getLastRow() < 2) return false;
  const idIndex = CABECALHOS.indexOf('ID da requisição') + 1;
  const emailIndex = CABECALHOS.indexOf('E-mail do usuário') + 1;
  const linhas = sheet.getRange(2, 1, sheet.getLastRow() - 1, CABECALHOS.length).getDisplayValues();
  const alvoId = texto_(idRequisicao);
  const alvoEmail = texto_(email).toLowerCase();
  return linhas.some(function(linha) {
    return texto_(linha[idIndex - 1]) === alvoId && texto_(linha[emailIndex - 1]).toLowerCase() === alvoEmail;
  });
}

function registrarSolicitacaoOculta_(idRequisicao, email, motivo) {
  const aba = garantirAbaComCabecalhos_(obterPlanilha_(), NOME_ABA_SOLICITACOES_OCULTAS, CABECALHOS_SOLICITACOES_OCULTAS);
  const alvoId = texto_(idRequisicao);
  const alvoEmail = texto_(email).toLowerCase();

  if (aba.getLastRow() >= 2) {
    const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHOS_SOLICITACOES_OCULTAS.length).getDisplayValues();
    const existente = linhas.some(function(linha) {
      return texto_(linha[0]) === alvoId && texto_(linha[1]).toLowerCase() === alvoEmail;
    });
    if (existente) return;
  }

  aba.appendRow([alvoId, alvoEmail, new Date(), texto_(motivo) || 'MANUAL']);
}

function obterSolicitacoesOcultasDoUsuario_(email) {
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_SOLICITACOES_OCULTAS);
  const mapa = {};
  if (!aba || aba.getLastRow() < 2) return mapa;

  const alvoEmail = texto_(email).toLowerCase();
  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHOS_SOLICITACOES_OCULTAS.length).getDisplayValues();
  linhas.forEach(function(linha) {
    if (texto_(linha[1]).toLowerCase() !== alvoEmail) return;
    const id = texto_(linha[0]);
    if (id) mapa[id] = true;
  });
  return mapa;
}

function calcularDataLimiteVisualizacao_(dataTexto, prioridade) {
  const base = parseDataSolicitacao_(dataTexto);
  if (!base) return null;
  const prioridadeNormalizada = normalizarPrioridade_(prioridade);
  const dias = DIAS_VISUALIZACAO_PRIORIDADE[prioridadeNormalizada];
  if (!dias) return null;
  return adicionarDiasUteis_(base, dias);
}

function parseDataSolicitacao_(valor) {
  const texto = texto_(valor);
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return inicioDoDia_(new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  const iso = new Date(texto);
  return isNaN(iso.getTime()) ? null : inicioDoDia_(iso);
}

function inicioDoDia_(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function adicionarDiasUteis_(dataInicial, dias) {
  const data = inicioDoDia_(dataInicial);
  let restantes = Number(dias) || 0;
  while (restantes > 0) {
    data.setDate(data.getDate() + 1);
    const dia = data.getDay();
    if (dia !== 0 && dia !== 6) restantes -= 1;
  }
  return data;
}


function processarReservaRequisicao_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    const contexto = validarContextoAutenticado_(data);
    const idRequisicao = gerarIdRequisicao_();
    const pasta = criarPastaRequisicao_(idRequisicao);
    registrarReserva_(idRequisicao, pasta.getId(), contexto.usuario.email);
    return respostaIframe_({
      ok: true,
      token: tokenResposta,
      acao: 'reservarRequisicao',
      idRequisicao: idRequisicao
    });
  } catch (erro) {
    return respostaIframe_({ ok: false, token: tokenResposta, acao: 'reservarRequisicao', erro: erro.message });
  }
}

function processarEnvioImagem_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    const contexto = validarContextoAutenticado_(data);
    const idRequisicao = texto_(data.idRequisicao);
    const item = Number(data.item);
    if (!idRequisicao || !Number.isInteger(item) || item < 1) throw new Error('Identificação da imagem inválida.');

    const reserva = obterReserva_(idRequisicao);
    validarReservaDoUsuario_(reserva, contexto.usuario.email);

    const imagem = salvarImagem_(reserva, item, data.imagem, contexto.usuario.email);
    atualizarAtividadeReserva_(idRequisicao);

    return respostaIframe_({
      ok: true,
      token: tokenResposta,
      acao: 'enviarImagem',
      imagem: imagem
    });
  } catch (erro) {
    return respostaIframe_({ ok: false, token: tokenResposta, acao: 'enviarImagem', erro: erro.message });
  }
}

function processarFinalizacaoRequisicao_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    const contexto = validarContextoAutenticado_(data);
    const idRequisicao = texto_(data.idRequisicao);
    const reserva = obterReserva_(idRequisicao);
    validarReservaDoUsuario_(reserva, contexto.usuario.email);

    const normalizado = normalizarDados_(data);
    normalizado.usuarioEmail = contexto.usuario.email;
    normalizado.usuarioNome = contexto.usuario.nome;
    normalizado.solicitante = contexto.usuario.nome || contexto.usuario.email;
    normalizado.empresa = resolverEmpresaPorObra_(normalizado.obra);
    validarDados_(normalizado);

    const imagensPorItem = obterImagensPorItem_(idRequisicao);
    const sheet = obterAbaDestino_();
    gravarRequisicao_(sheet, idRequisicao, normalizado, imagensPorItem);
    marcarReservaFinalizada_(idRequisicao);

    let notificacoesEnviadas = 0;
    let avisoNotificacao = '';
    try {
      notificacoesEnviadas = enviarNotificacoesDaRequisicao_(idRequisicao, normalizado, imagensPorItem);
    } catch (erroNotificacao) {
      avisoNotificacao = erroNotificacao.message;
      console.error(erroNotificacao.stack);
    }

    let emailEnviado = true;
    let avisoEmail = '';
    try {
      enviarEmail_(idRequisicao, normalizado, imagensPorItem);
    } catch (erroEmail) {
      emailEnviado = false;
      avisoEmail = erroEmail.message;
      console.error(erroEmail.stack);
    }

    return respostaIframe_({
      ok: true,
      token: tokenResposta,
      acao: 'finalizarRequisicao',
      idRequisicao: idRequisicao,
      prioridade: normalizado.prioridade,
      notificacoesEnviadas: notificacoesEnviadas,
      avisoNotificacao: avisoNotificacao,
      emailEnviado: emailEnviado,
      avisoEmail: avisoEmail
    });
  } catch (erro) {
    return respostaIframe_({ ok: false, token: tokenResposta, acao: 'finalizarRequisicao', erro: erro.message });
  }
}

function verificarIdentidadeFirebase_(idToken) {
  const token = texto_(idToken);
  if (!token) throw new Error('Faça login com sua conta Google.');

  const endpoint = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FIREBASE_WEB_API_KEY);
  const resposta = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: token }),
    muteHttpExceptions: true
  });

  if (resposta.getResponseCode() < 200 || resposta.getResponseCode() >= 300) {
    throw new Error('A autenticação expirou. Entre novamente.');
  }

  const json = JSON.parse(resposta.getContentText());
  const user = json.users && json.users[0];
  if (!user || user.disabled) throw new Error('Conta Google inválida ou desativada.');
  if (!user.email || !user.emailVerified) throw new Error('Use uma conta Google com e-mail verificado.');

  const providers = Array.isArray(user.providerUserInfo) ? user.providerUserInfo : [];
  if (!providers.some(function(provider) { return provider.providerId === 'google.com'; })) {
    throw new Error('O acesso deve ser feito com uma conta Google.');
  }

  return {
    uid: texto_(user.localId),
    email: texto_(user.email).toLowerCase(),
    nome: texto_(user.displayName),
    foto: texto_(user.photoUrl)
  };
}

function obterUsuarioAutorizado_(email) {
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_USUARIOS);
  if (!aba || aba.getLastRow() < 2) throw new Error('A lista de usuários autorizados ainda não foi configurada.');

  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, 4).getDisplayValues();
  const procurado = texto_(email).toLowerCase();
  for (let i = 0; i < linhas.length; i += 1) {
    if (!registroAtivo_(linhas[i][0])) continue;
    if (texto_(linhas[i][1]).toLowerCase() !== procurado) continue;
    return { email: procurado, nome: texto_(linhas[i][2]), perfil: texto_(linhas[i][3]) };
  }
  throw new Error('Este e-mail não está autorizado a usar o sistema.');
}

function criarSessao_(identidade, autorizado, deviceId, deviceName) {
  const dispositivo = texto_(deviceId);
  if (!dispositivo) throw new Error('O navegador não forneceu a identificação do dispositivo.');

  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  const aba = garantirAbaComCabecalhos_(obterPlanilha_(), NOME_ABA_SESSOES, CABECALHOS_SESSOES);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const row = localizarLinhaPorValor_(aba, 1, identidade.email);
    const agora = new Date();
    const valores = [[
      identidade.email,
      identidade.uid,
      autorizado.nome || identidade.nome || identidade.email,
      texto_(deviceName) || 'Dispositivo sem nome',
      hash_(dispositivo),
      hash_(token),
      agora,
      agora,
      'ATIVA',
      ''
    ]];
    if (row) aba.getRange(row, 1, 1, CABECALHOS_SESSOES.length).setValues(valores);
    else aba.getRange(aba.getLastRow() + 1, 1, 1, CABECALHOS_SESSOES.length).setValues(valores);
  } finally {
    lock.releaseLock();
  }
  return { token: token };
}

function validarContextoAutenticado_(data) {
  const identidade = verificarIdentidadeFirebase_(data.firebaseIdToken);
  const autorizado = obterUsuarioAutorizado_(identidade.email);
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_SESSOES);
  if (!aba) throw new Error('Sessão não encontrada. Entre novamente.');

  const row = localizarLinhaPorValor_(aba, 1, identidade.email);
  if (!row) throw new Error('Sessão não encontrada. Entre novamente.');
  const linha = aba.getRange(row, 1, 1, CABECALHOS_SESSOES.length).getValues()[0];
  const deviceHash = hash_(texto_(data.deviceId));
  const sessionHash = hash_(texto_(data.sessaoToken));

  if (texto_(linha[8]) !== 'ATIVA' || texto_(linha[3]) === '') throw new Error('A sessão foi encerrada.');
  if (texto_(linha[4]) !== deviceHash || texto_(linha[5]) !== sessionHash) {
    throw new Error('Esta conta foi conectada em outro dispositivo. Entre novamente.');
  }

  const ultimaAtividade = linha[7] instanceof Date ? linha[7] : new Date(linha[7]);
  if (!ultimaAtividade || isNaN(ultimaAtividade.getTime()) || (Date.now() - ultimaAtividade.getTime()) > 5 * 60 * 1000) {
    aba.getRange(row, 8).setValue(new Date());
  }

  return {
    usuario: {
      uid: identidade.uid,
      email: identidade.email,
      nome: autorizado.nome || identidade.nome || identidade.email,
      perfil: autorizado.perfil || 'Usuário'
    }
  };
}

function encerrarSessao_(data) {
  const identidade = verificarIdentidadeFirebase_(data.firebaseIdToken);
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_SESSOES);
  if (!aba) return;
  const row = localizarLinhaPorValor_(aba, 1, identidade.email);
  if (!row) return;
  const linha = aba.getRange(row, 1, 1, CABECALHOS_SESSOES.length).getValues()[0];
  if (texto_(linha[4]) === hash_(texto_(data.deviceId)) && texto_(linha[5]) === hash_(texto_(data.sessaoToken))) {
    aba.getRange(row, 9).setValue('ENCERRADA');
    aba.getRange(row, 10).setValue(new Date());
  }
}

function carregarBaseObras_() {
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_BASE_OBRAS);
  if (!aba || aba.getLastRow() < 2) return [];
  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, 4).getDisplayValues();
  const vistos = {};
  return linhas.reduce(function(lista, linha) {
    const empresa = texto_(linha[1]);
    const nome = texto_(linha[2]);
    if (!registroAtivo_(linha[0]) || !nome) return lista;
    const chave = removerAcentos_(empresa + '|' + nome).toLowerCase();
    if (vistos[chave]) return lista;
    vistos[chave] = true;
    lista.push({ empresa: empresa, nome: nome, palavrasChave: texto_(linha[3]) });
    return lista;
  }, []);
}

function carregarBaseMateriais_() {
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_BASE_MATERIAIS);
  if (!aba || aba.getLastRow() < 2) return [];
  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, 4).getDisplayValues();
  const vistos = {};
  return linhas.reduce(function(lista, linha) {
    const descricao = texto_(linha[1]);
    if (!registroAtivo_(linha[0]) || !descricao) return lista;
    const chave = removerAcentos_(descricao).toLowerCase();
    if (vistos[chave]) return lista;
    vistos[chave] = true;
    lista.push({ descricao: descricao, unidade: texto_(linha[2]), palavrasChave: texto_(linha[3]) });
    return lista;
  }, []);
}

function criarPastaRequisicao_(idRequisicao) {
  const root = obterPastaRaiz_();
  const agora = new Date();
  const ano = String(agora.getFullYear());
  const mes = ('0' + (agora.getMonth() + 1)).slice(-2) + ' - ' + nomesMeses_()[agora.getMonth()];
  return obterOuCriarSubpasta_(obterOuCriarSubpasta_(root, ano), mes).createFolder(idRequisicao);
}

function registrarReserva_(idRequisicao, pastaId, email) {
  const aba = garantirAbaComCabecalhos_(obterPlanilha_(), NOME_ABA_ARQUIVOS, CABECALHOS_ARQUIVOS);
  const agora = new Date();
  aba.appendRow([idRequisicao, pastaId, email, agora, agora, 'PENDENTE', '', '', '']);
}

function obterReserva_(idRequisicao) {
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_ARQUIVOS);
  if (!aba) throw new Error('Controle de arquivos não configurado.');
  const row = localizarLinhaPorValor_(aba, 1, idRequisicao);
  if (!row) throw new Error('Reserva da requisição não encontrada.');
  const valores = aba.getRange(row, 1, 1, CABECALHOS_ARQUIVOS.length).getValues()[0];
  return { aba: aba, row: row, id: texto_(valores[0]), pastaId: texto_(valores[1]), email: texto_(valores[2]).toLowerCase(), criadaEm: valores[3], ultimaAtividade: valores[4], status: texto_(valores[5]) };
}

function validarReservaDoUsuario_(reserva, email) {
  if (reserva.email !== texto_(email).toLowerCase()) throw new Error('Esta requisição pertence a outro usuário.');
  if (reserva.status !== 'PENDENTE') throw new Error('Esta requisição não aceita novos arquivos.');
}

function salvarImagem_(reserva, item, imagemRecebida, email) {
  const imagem = imagemRecebida || {};
  const mime = texto_(imagem.mime).toLowerCase();
  const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
  if (permitidos.indexOf(mime) === -1) throw new Error('Formato de imagem não permitido. Use JPG, PNG ou WebP.');

  const dadosBase64 = texto_(imagem.base64).replace(/^data:[^;]+;base64,/, '');
  if (!dadosBase64) throw new Error('A imagem não possui conteúdo.');
  const bytes = Utilities.base64Decode(dadosBase64);
  if (bytes.length > MAX_BYTES_IMAGEM) throw new Error('A imagem excede o limite após a compactação.');

  const imagensExistentes = contarImagensDoItem_(reserva.id, item);
  if (imagensExistentes >= MAX_IMAGENS_POR_ITEM) throw new Error('O item já possui o limite de imagens.');

  const extensao = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const sequencia = imagensExistentes + 1;
  const nome = reserva.id + '_ITEM-' + ('0' + item).slice(-2) + '_' + ('0' + sequencia).slice(-2) + '.' + extensao;
  const blob = Utilities.newBlob(bytes, mime, nome);
  const arquivo = DriveApp.getFolderById(reserva.pastaId).createFile(blob);
  const link = arquivo.getUrl();

  const aba = garantirAbaComCabecalhos_(obterPlanilha_(), NOME_ABA_IMAGENS, CABECALHOS_IMAGENS);
  aba.appendRow([reserva.id, item, arquivo.getId(), nome, link, email, new Date(), bytes.length, mime]);
  return { nome: nome, link: link, arquivoId: arquivo.getId(), item: item };
}

function contarImagensDoItem_(idRequisicao, item) {
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_IMAGENS);
  if (!aba || aba.getLastRow() < 2) return 0;
  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues();
  return linhas.filter(function(linha) { return texto_(linha[0]) === idRequisicao && Number(linha[1]) === Number(item); }).length;
}

function obterImagensPorItem_(idRequisicao) {
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_IMAGENS);
  const mapa = {};
  if (!aba || aba.getLastRow() < 2) return mapa;
  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHOS_IMAGENS.length).getValues();
  linhas.forEach(function(linha) {
    if (texto_(linha[0]) !== idRequisicao) return;
    const item = Number(linha[1]);
    if (!mapa[item]) mapa[item] = [];
    mapa[item].push({ nome: texto_(linha[3]), link: texto_(linha[4]), arquivoId: texto_(linha[2]) });
  });
  return mapa;
}

function atualizarAtividadeReserva_(idRequisicao) {
  const reserva = obterReserva_(idRequisicao);
  reserva.aba.getRange(reserva.row, 5).setValue(new Date());
}

function marcarReservaFinalizada_(idRequisicao) {
  const reserva = obterReserva_(idRequisicao);
  reserva.aba.getRange(reserva.row, 5).setValue(new Date());
  reserva.aba.getRange(reserva.row, 6).setValue('ATIVA');
  reserva.aba.getRange(reserva.row, 9).setValue(new Date());
}


function resolverEmpresaPorObra_(obraInformada) {
  const alvo = removerAcentos_(texto_(obraInformada)).toLowerCase();
  if (!alvo) throw new Error('Obra ou destino não informado.');
  const obra = carregarBaseObras_().find(function(item) {
    return removerAcentos_(texto_(item.nome)).toLowerCase() === alvo;
  });
  if (!obra || !texto_(obra.empresa)) throw new Error('Selecione uma obra cadastrada para identificar a empresa responsável.');
  return texto_(obra.empresa);
}

function normalizarDados_(data) {
  const itens = Array.isArray(data.itens) ? data.itens : [];
  return {
    token: texto_(data.token || data.tokenResposta),
    empresa: texto_(data.empresa),
    solicitante: texto_(data.solicitante || data.usuarioNome),
    obra: texto_(data.obra),
    data: texto_(data.data),
    hora: texto_(data.hora),
    prioridade: normalizarPrioridade_(data.prioridade),
    observacoes: texto_(data.observacoes),
    itens: itens.map(function(item) { return { quantidade: texto_(item.quantidade), unidade: texto_(item.unidade), descricao: texto_(item.descricao) }; })
  };
}

function validarDados_(data) {
  if (!data.empresa) throw new Error('Empresa não identificada pela obra selecionada.');
  if (!data.obra) throw new Error('Obra ou destino não informado.');
  if (!data.data || !data.hora) throw new Error('Data ou hora não informada.');
  if (['Emergencial', 'Urgente', 'Necessária', 'Programada'].indexOf(data.prioridade) === -1) throw new Error('Prioridade inválida.');
  if (!data.itens.length) throw new Error('Nenhum item informado.');
  data.itens.forEach(function(item, index) {
    const n = index + 1;
    const qtd = Number(item.quantidade.replace(',', '.'));
    if (!isFinite(qtd) || qtd <= 0) throw new Error('Quantidade inválida no item ' + n + '.');
    if (!item.unidade) throw new Error('Unidade não informada no item ' + n + '.');
    if (!item.descricao) throw new Error('Descrição não informada no item ' + n + '.');
  });
}

function gravarRequisicao_(sheet, idRequisicao, data, imagensPorItem) {
  garantirCabecalhos_(sheet);
  const linhas = data.itens.map(function(item, index) {
    const links = (imagensPorItem[index + 1] || []).map(function(img) { return img.link; }).join('\n');
    return [
      idRequisicao, data.data, data.hora, data.empresa, data.obra, data.solicitante,
      item.quantidade, item.unidade, item.descricao, data.observacoes, data.prioridade,
      data.usuarioEmail || '', data.usuarioNome || '', links
    ];
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, CABECALHOS.length).setValues(linhas);
  } finally {
    lock.releaseLock();
  }
}

function enviarEmail_(idRequisicao, data, imagensPorItem) {
  const linhas = [
    'Nova requisição recebida:', '',
    'ID: ' + idRequisicao,
    'Empresa: ' + data.empresa,
    'Usuário autenticado: ' + (data.usuarioNome || '') + ' <' + (data.usuarioEmail || '') + '>',
    'Obra: ' + data.obra,
    'Prioridade: ' + data.prioridade, '', 'Itens:'
  ];
  data.itens.forEach(function(item, index) {
    linhas.push((index + 1) + ') ' + item.quantidade + ' ' + item.unidade + ' - ' + item.descricao);
    (imagensPorItem[index + 1] || []).forEach(function(img, i) { linhas.push('   Imagem ' + (i + 1) + ': ' + img.link); });
  });
  if (data.observacoes) linhas.push('', 'Observações:', data.observacoes);
  MailApp.sendEmail({ to: EMAIL_DESTINO, subject: '[' + data.prioridade.toUpperCase() + '] Nova Requisição de Materiais', body: linhas.join('\n') });
}

function enviarNotificacoesDaRequisicao_(idRequisicao, data, imagensPorItem) {
  const dispositivos = obterDispositivos_();
  const tokens = Object.keys(dispositivos);
  if (!tokens.length) return 0;
  const qtdItens = data.itens.length;
  const qtdImagens = Object.keys(imagensPorItem).reduce(function(total, key) { return total + imagensPorItem[key].length; }, 0);
  const corpo = data.empresa + ' — ' + data.obra + '\nPrioridade: ' + data.prioridade + ' | ' + qtdItens + (qtdItens === 1 ? ' item' : ' itens') + (qtdImagens ? ' | ' + qtdImagens + (qtdImagens === 1 ? ' imagem' : ' imagens') : '');
  let enviados = 0;
  const invalidos = [];
  tokens.forEach(function(token) {
    try {
      enviarMensagemFcm_(token, { title: 'Nova solicitação de compra', body: corpo, requestId: idRequisicao, priority: data.prioridade, url: PAGINA_NOTIFICACOES });
      enviados += 1;
    } catch (erro) {
      if (erro.tokenInvalido) invalidos.push(token);
    }
  });
  invalidos.forEach(function(token) { delete dispositivos[token]; });
  if (invalidos.length) salvarDispositivos_(dispositivos);
  return enviados;
}

function manutencaoDiaria() {
  const aba = obterPlanilha_().getSheetByName(NOME_ABA_ARQUIVOS);
  if (!aba || aba.getLastRow() < 2) return;
  const valores = aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHOS_ARQUIVOS.length).getValues();
  const agora = new Date();
  const archiveRoot = obterPastaArquivo_();

  valores.forEach(function(linha, index) {
    const row = index + 2;
    const id = texto_(linha[0]);
    const pastaId = texto_(linha[1]);
    const criada = dataValida_(linha[3]);
    const ultima = dataValida_(linha[4]) || criada;
    let status = texto_(linha[5]).toUpperCase();
    const excluirApos = dataValida_(linha[7]);
    if (!id || !pastaId) return;

    try {
      const pasta = DriveApp.getFolderById(pastaId);
      if (status === 'PENDENTE' && horasEntre_(criada, agora) >= HORAS_LIMPAR_PENDENTE) {
        pasta.setTrashed(true);
        aba.getRange(row, 6).setValue('CANCELADA');
        return;
      }
      if (status === 'ATIVA' && diasEntre_(ultima, agora) >= DIAS_ARQUIVAR) {
        const ano = String((criada || agora).getFullYear());
        pasta.moveTo(obterOuCriarSubpasta_(archiveRoot, ano));
        aba.getRange(row, 6).setValue('ARQUIVADA');
        aba.getRange(row, 7).setValue(agora);
        return;
      }
      if (status === 'IRRELEVANTE') {
        if (!excluirApos) {
          const dataExclusao = new Date(agora.getTime() + DIAS_GRACA_EXCLUSAO * 86400000);
          aba.getRange(row, 8).setValue(dataExclusao);
        } else if (agora >= excluirApos) {
          pasta.setTrashed(true);
          aba.getRange(row, 6).setValue('EXCLUIDA');
        }
      }
    } catch (erro) {
      console.error('Manutenção ' + id + ': ' + erro.message);
    }
  });
}

function marcarRequisicaoComoIrrelevante(idRequisicao) {
  const reserva = obterReserva_(idRequisicao);
  reserva.aba.getRange(reserva.row, 6).setValue('IRRELEVANTE');
  reserva.aba.getRange(reserva.row, 8).setValue(new Date(Date.now() + DIAS_GRACA_EXCLUSAO * 86400000));
}

function processarEnvioLegado_(recebido) {
  const data = normalizarDados_(recebido);
  validarDados_(data);
  const id = gerarIdRequisicao_();
  gravarRequisicao_(obterAbaDestino_(), id, data, {});
  let emailEnviado = true;
  try { enviarEmail_(id, data, {}); } catch (erro) { emailEnviado = false; }
  try { enviarNotificacoesDaRequisicao_(id, data, {}); } catch (erro) {}
  return respostaIframe_({ ok: true, token: data.token, idRequisicao: id, prioridade: data.prioridade, emailEnviado: emailEnviado });
}

function permitirEnvioLegado_() {
  const valor = PropertiesService.getScriptProperties().getProperty(PROPRIEDADES.ALLOW_LEGACY);
  return valor === null || texto_(valor).toLowerCase() !== 'false';
}

function processarAcaoNotificacao_(data) {
  const tokenResposta = texto_(data.tokenResposta);
  try {
    validarChaveAtivacao_(data.chave);
    const acao = texto_(data.acao);
    const fcmToken = texto_(data.fcmToken);
    if (!fcmToken) throw new Error('Token do dispositivo não informado.');
    if (acao === 'registrarDispositivo') {
      registrarDispositivo_(fcmToken, texto_(data.nomeDispositivo) || 'Dispositivo sem nome', texto_(data.userAgent));
      return respostaIframe_({ ok: true, token: tokenResposta, acao: acao });
    }
    if (acao === 'removerDispositivo') {
      removerDispositivo_(fcmToken);
      return respostaIframe_({ ok: true, token: tokenResposta, acao: acao });
    }
    if (acao === 'testarNotificacao') {
      const messageId = enviarMensagemFcm_(fcmToken, { title: 'Teste de notificações de Compras', body: 'Este dispositivo está configurado para receber novas solicitações.', requestId: 'teste-' + Date.now(), priority: 'Teste', url: PAGINA_NOTIFICACOES });
      return respostaIframe_({ ok: true, token: tokenResposta, acao: acao, messageId: messageId });
    }
    throw new Error('Ação de notificação não reconhecida.');
  } catch (erro) {
    return respostaIframe_({ ok: false, token: tokenResposta, acao: texto_(data.acao), erro: erro.message });
  }
}

function validarChaveAtivacao_(informada) {
  const esperada = texto_(PropertiesService.getScriptProperties().getProperty(PROPRIEDADES.NOTIFICATION_ACTIVATION_KEY));
  if (!esperada) throw new Error('A chave de ativação não foi configurada.');
  if (texto_(informada) !== esperada) throw new Error('Chave de ativação inválida.');
}

function registrarDispositivo_(token, nome, userAgent) {
  const dispositivos = obterDispositivos_();
  const agora = new Date().toISOString();
  const anterior = dispositivos[token] || {};
  dispositivos[token] = { nome: nome, userAgent: userAgent, criadoEm: anterior.criadoEm || agora, atualizadoEm: agora };
  salvarDispositivos_(dispositivos);
}
function removerDispositivo_(token) { const d = obterDispositivos_(); delete d[token]; salvarDispositivos_(d); }
function obterDispositivos_() {
  const valor = PropertiesService.getScriptProperties().getProperty(PROPRIEDADES.FCM_DEVICES);
  try { return valor ? JSON.parse(valor) : {}; } catch (erro) { return {}; }
}
function salvarDispositivos_(d) { PropertiesService.getScriptProperties().setProperty(PROPRIEDADES.FCM_DEVICES, JSON.stringify(d)); }

function enviarMensagemFcm_(fcmToken, dados) {
  const config = obterConfiguracaoFirebase_();
  const accessToken = obterAccessTokenFirebase_(config);
  const endpoint = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(config.projectId) + '/messages:send';
  const resposta = UrlFetchApp.fetch(endpoint, {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify({ message: {
      token: fcmToken,
      notification: { title: texto_(dados.title), body: texto_(dados.body) },
      data: { title: texto_(dados.title), body: texto_(dados.body), requestId: texto_(dados.requestId), priority: texto_(dados.priority), url: texto_(dados.url) },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
        notification: {
          icon: 'https://comprasarflex.github.io/Compras/135927287_448584936583178_5622652680214904709_n.jpg',
          badge: 'https://comprasarflex.github.io/Compras/135927287_448584936583178_5622652680214904709_n.jpg',
          tag: 'requisicao-' + texto_(dados.requestId), renotify: true
        },
        fcm_options: { link: texto_(dados.url) || PAGINA_NOTIFICACOES }
      }
    }}),
    muteHttpExceptions: true
  });
  const status = resposta.getResponseCode();
  const corpo = resposta.getContentText();
  if (status >= 200 && status < 300) {
    try { return texto_(JSON.parse(corpo).name); } catch (erro) { return ''; }
  }
  const erro = new Error('O Firebase recusou a notificação. HTTP ' + status + ': ' + corpo);
  erro.tokenInvalido = status === 404 || corpo.indexOf('UNREGISTERED') !== -1;
  throw erro;
}

function obterConfiguracaoFirebase_() {
  const p = PropertiesService.getScriptProperties();
  const projectId = texto_(p.getProperty(PROPRIEDADES.FIREBASE_PROJECT_ID)) || FIREBASE_PROJECT_ID_PUBLICO;
  const clientEmail = texto_(p.getProperty(PROPRIEDADES.FIREBASE_CLIENT_EMAIL));
  const privateKey = p.getProperty(PROPRIEDADES.FIREBASE_PRIVATE_KEY) || '';
  if (!projectId || !clientEmail || !privateKey) throw new Error('Credenciais privadas do Firebase não configuradas.');
  return { projectId: projectId, clientEmail: clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') };
}

function obterAccessTokenFirebase_(config) {
  const cache = CacheService.getScriptCache();
  const existente = cache.get('firebase_access_token');
  if (existente) return existente;
  const agora = Math.floor(Date.now() / 1000);
  const header = base64Url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url_(JSON.stringify({ iss: config.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }));
  const unsigned = header + '.' + claims;
  const assinatura = Utilities.computeRsaSha256Signature(unsigned, config.privateKey);
  const jwt = unsigned + '.' + Utilities.base64EncodeWebSafe(assinatura).replace(/=+$/, '');
  const resposta = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }, muteHttpExceptions: true });
  if (resposta.getResponseCode() < 200 || resposta.getResponseCode() >= 300) throw new Error('Falha ao autenticar no Firebase: ' + resposta.getContentText());
  const token = JSON.parse(resposta.getContentText()).access_token;
  cache.put('firebase_access_token', token, 3300);
  return token;
}

function obterPastaRaiz_() {
  const id = texto_(PropertiesService.getScriptProperties().getProperty(PROPRIEDADES.DRIVE_ROOT_FOLDER_ID));
  if (!id) throw new Error('Execute configurarEstruturaInicial antes de enviar imagens.');
  return DriveApp.getFolderById(id);
}
function obterPastaArquivo_() {
  const id = texto_(PropertiesService.getScriptProperties().getProperty(PROPRIEDADES.DRIVE_ARCHIVE_FOLDER_ID));
  if (!id) throw new Error('Pasta de arquivo não configurada.');
  return DriveApp.getFolderById(id);
}
function obterOuCriarSubpasta_(parent, nome) { const it = parent.getFoldersByName(nome); return it.hasNext() ? it.next() : parent.createFolder(nome); }
function nomesMeses_() { return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; }

function obterPlanilha_() { return ID_PLANILHA ? SpreadsheetApp.openById(ID_PLANILHA) : SpreadsheetApp.getActiveSpreadsheet(); }
function obterAbaDestino_() {
  const planilha = obterPlanilha_();
  if (NOME_ABA) {
    const aba = planilha.getSheetByName(NOME_ABA);
    if (!aba) throw new Error('A aba de destino não foi encontrada.');
    return aba;
  }
  const ignorar = [NOME_ABA_BASE_OBRAS, NOME_ABA_BASE_MATERIAIS, NOME_ABA_USUARIOS, NOME_ABA_SESSOES, NOME_ABA_ARQUIVOS, NOME_ABA_IMAGENS, NOME_ABA_SOLICITACOES_OCULTAS];
  const porCabecalho = planilha.getSheets().find(function(sheet) {
    if (ignorar.indexOf(sheet.getName()) !== -1 || sheet.getLastColumn() < 3) return false;
    const h = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), CABECALHOS.length)).getDisplayValues()[0].map(texto_);
    return removerAcentos_(h[0]).toLowerCase().indexOf('requisicao') !== -1 && removerAcentos_(h[1]).toLowerCase() === 'data';
  });
  return porCabecalho || planilha.getActiveSheet();
}
function garantirCabecalhos_(sheet) {
  if (sheet.getMaxColumns() < CABECALHOS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), CABECALHOS.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, CABECALHOS.length).setValues([CABECALHOS]);
  sheet.setFrozenRows(1);
}
function garantirAbaComCabecalhos_(planilha, nome, cabecalhos) {
  let aba = planilha.getSheetByName(nome);
  if (!aba) aba = planilha.insertSheet(nome);
  if (aba.getMaxColumns() < cabecalhos.length) aba.insertColumnsAfter(aba.getMaxColumns(), cabecalhos.length - aba.getMaxColumns());
  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  aba.setFrozenRows(1);
  return aba;
}
function localizarLinhaPorValor_(aba, coluna, valor) {
  if (aba.getLastRow() < 2) return 0;
  const dados = aba.getRange(2, coluna, aba.getLastRow() - 1, 1).getDisplayValues();
  const alvo = texto_(valor).toLowerCase();
  for (let i = 0; i < dados.length; i += 1) if (texto_(dados[i][0]).toLowerCase() === alvo) return i + 2;
  return 0;
}

function lerCorpoDaRequisicao_(e) {
  if (!e) throw new Error('A requisição não possui dados.');
  const conteudo = e.parameter && e.parameter.payload ? e.parameter.payload : e.postData && e.postData.contents ? e.postData.contents : '';
  if (!conteudo) throw new Error('A requisição não possui dados.');
  try { return JSON.parse(conteudo); } catch (erro) { throw new Error('O conteúdo recebido não é um JSON válido.'); }
}
function obterTokenSeguro_(e) { try { const d = lerCorpoDaRequisicao_(e); return texto_(d.token || d.tokenResposta); } catch (erro) { return ''; } }
function respostaIframe_(objeto) {
  const mensagem = Object.assign({ source: 'requisicao-app' }, objeto);
  const json = JSON.stringify(mensagem).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><head><meta charset="UTF-8"></head><body><script>(function(){var m=' + json + ';try{window.parent.postMessage(m,"*")}catch(e){}try{window.top.postMessage(m,"*")}catch(e){}})();<\/script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function respostaJson_(objeto) { return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON); }
function texto_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function removerAcentos_(v) { return texto_(v).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function registroAtivo_(v) { return ['sim','s','ativo','1','true','verdadeiro','x'].indexOf(removerAcentos_(v).toLowerCase()) !== -1; }
function normalizarPrioridade_(v) { const n = removerAcentos_(v).toLowerCase(); return n === 'emergencial' ? 'Emergencial' : n === 'urgente' ? 'Urgente' : n === 'necessaria' ? 'Necessária' : n === 'programada' ? 'Programada' : texto_(v); }
function gerarIdRequisicao_() { const agora = new Date(); return Utilities.formatDate(agora, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase(); }
function hash_(texto) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto_(texto), Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
function base64Url_(texto) { return Utilities.base64EncodeWebSafe(texto).replace(/=+$/, ''); }
function dataValida_(v) { const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d; }
function diasEntre_(a, b) { return a ? Math.floor((b.getTime() - a.getTime()) / 86400000) : 0; }
function horasEntre_(a, b) { return a ? (b.getTime() - a.getTime()) / 3600000 : 0; }