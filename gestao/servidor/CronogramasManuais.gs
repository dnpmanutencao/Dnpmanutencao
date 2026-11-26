// =====================================================================================
// CRONOGRAMA MANUAL
// Cronograma livre, sem ligação com o orçamento: as etapas são digitadas à mão, cada uma
// com programação (início/fim previstos) e execução (início/fim reais e % concluído).
// Pode pertencer a uma obra (ProjetoID) ou ser avulso (só título e cliente opcional).
// Abas: CronogramasManuais e CronogramaManualEtapas (criadas sozinhas no primeiro uso).
// Datas gravadas como texto "yyyy-MM-dd" para não sofrer com fuso horário.
// =====================================================================================

var CM_ABA_ = 'CronogramasManuais';
var CM_ABA_ETAPAS_ = 'CronogramaManualEtapas';
var CM_CAB_ = ['ID', 'ProjetoID', 'ClienteID', 'Titulo', 'Descricao', 'Status', 'CriadoPor', 'CriadoEm', 'AtualizadoEm'];
var CM_CAB_ETAPAS_ = ['ID', 'CronogramaID', 'Ordem', 'Nome', 'Responsavel', 'InicioPrevisto', 'FimPrevisto', 'InicioReal', 'FimReal', 'Percentual', 'Observacao', 'AtualizadoEm'];

function cmAba_(nome, cab, colunasTexto) {
  var pl = obterPlanilha_();
  var aba = pl.getSheetByName(nome);
  if (!aba) {
    aba = pl.insertSheet(nome);
    aba.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    aba.setFrozenRows(1);
    (colunasTexto || []).forEach(function (c) { aba.getRange(1, c, aba.getMaxRows(), 1).setNumberFormat('@'); });
  }
  return aba;
}
function cmAbaCrono_() { return cmAba_(CM_ABA_, CM_CAB_, []); }
function cmAbaEtapas_() { return cmAba_(CM_ABA_ETAPAS_, CM_CAB_ETAPAS_, [6, 7, 8, 9]); }
function cmDados_(nome) { (nome === CM_ABA_ ? cmAbaCrono_ : cmAbaEtapas_)(); return obterDadosAba_(nome); }

// aceita "yyyy-MM-dd", "dd/MM/yyyy" ou Date; devolve "yyyy-MM-dd" ou ''
function cmData_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v).trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
function cmDia_(iso) { return iso ? Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000) : null; }
function cmHoje_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function cmAgora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'); }
function cmPct_(v) { var n = Number(String(v === undefined ? '' : v).replace(',', '.')); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }

function cmLinhaEtapa_(r) {
  return {
    id: String(r[0]), cronogramaId: String(r[1]), ordem: Number(r[2]) || 0, nome: String(r[3] || ''), responsavel: String(r[4] || ''),
    inicioPrevisto: cmData_(r[5]), fimPrevisto: cmData_(r[6]), inicioReal: cmData_(r[7]), fimReal: cmData_(r[8]),
    percentual: cmPct_(r[9]), observacao: String(r[10] || '')
  };
}

// situação, atraso e % que deveria estar feito hoje (linear entre início e fim previstos)
function cmAnalisarEtapa_(e, hoje) {
  var h = cmDia_(hoje), ip = cmDia_(e.inicioPrevisto), fp = cmDia_(e.fimPrevisto), ir = cmDia_(e.inicioReal), fr = cmDia_(e.fimReal);
  var concluida = e.percentual >= 100 || !!e.fimReal;
  if (concluida && e.percentual < 100) e.percentual = 100;
  e.duracaoPrevista = (ip !== null && fp !== null) ? Math.max(1, fp - ip + 1) : 0;
  e.duracaoReal = ir !== null ? Math.max(1, (fr !== null ? fr : h) - ir + 1) : 0;
  var prev = 0;
  if (ip !== null && fp !== null) prev = h < ip ? 0 : h >= fp ? 100 : ((h - ip + 1) / (fp - ip + 1)) * 100;
  e.percentualPrevistoHoje = Math.round(prev * 10) / 10;
  e.desvioFimDias = (fp !== null && fr !== null) ? fr - fp : (fp !== null && !concluida && h > fp ? h - fp : 0);
  e.desvioInicioDias = (ip !== null && ir !== null) ? ir - ip : (ip !== null && ir === null && h > ip ? h - ip : 0);
  if (concluida) e.situacao = (fp !== null && fr !== null && fr > fp) ? 'Concluída com atraso' : 'Concluída';
  else if (fp !== null && h > fp) e.situacao = 'Atrasada';
  else if (ir !== null || e.percentual > 0) e.situacao = (e.percentual + 0.5 < prev) ? 'Em andamento (atrás do previsto)' : 'Em andamento';
  else if (ip !== null && h > ip) e.situacao = 'Início atrasado';
  else e.situacao = 'Não iniciada';
  return e;
}

function cmResumo_(c, etapas, hoje) {
  var pesoTot = 0, real = 0, prev = 0, datas = [];
  etapas.forEach(function (e) {
    var p = e.duracaoPrevista || 1; pesoTot += p; real += p * e.percentual; prev += p * e.percentualPrevistoHoje;
    [e.inicioPrevisto, e.fimPrevisto, e.inicioReal, e.fimReal].forEach(function (d) { if (d) datas.push(d); });
  });
  datas.sort();
  c.qtdEtapas = etapas.length;
  c.percentualReal = pesoTot ? Math.round(real / pesoTot * 10) / 10 : 0;
  c.percentualPrevisto = pesoTot ? Math.round(prev / pesoTot * 10) / 10 : 0;
  c.inicio = datas[0] || ''; c.fim = datas[datas.length - 1] || '';
  c.atrasadas = etapas.filter(function (e) { return /Atrasada|atrasado|atrás/.test(e.situacao); }).length;
  c.concluidas = etapas.filter(function (e) { return /^Concluída/.test(e.situacao); }).length;
  c.hoje = hoje;
  return c;
}

function cmMapaProjetos_() {
  var m = {}, d = obterDadosAba_(CONFIG.ABAS.PROJETOS);
  for (var i = 1; i < d.length; i++) m[String(d[i][0])] = { titulo: String(d[i][3] || ''), clienteId: String(d[i][2] || '') };
  return m;
}

function cmMontar_(r, mapaProj, mapaCli) {
  var p = r[1] ? mapaProj[String(r[1])] : null;
  var cli = String(r[2] || (p ? p.clienteId : '') || '');
  return {
    id: String(r[0]), projetoId: String(r[1] || ''), projetoTitulo: p ? p.titulo : '', clienteId: cli,
    nomeCliente: cli ? (mapaCli[cli] || '') : '', titulo: String(r[3] || ''), descricao: String(r[4] || ''),
    status: String(r[5] || 'Ativo'), avulso: !r[1]
  };
}

function listarCronogramasManuais(token, filtro) {
  exigirPermissao_(token, 'projetos', 'ver');
  filtro = filtro || {};
  var d = cmDados_(CM_ABA_), de = cmDados_(CM_ABA_ETAPAS_), hoje = cmHoje_();
  var mapaProj = cmMapaProjetos_(), mapaCli = obterMapaNomesClientes_(), porCrono = {};
  for (var j = 1; j < de.length; j++) { var k = String(de[j][1]); (porCrono[k] = porCrono[k] || []).push(cmAnalisarEtapa_(cmLinhaEtapa_(de[j]), hoje)); }
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!d[i][0]) continue;
    if (filtro.projetoId && String(d[i][1]) !== String(filtro.projetoId)) continue;
    var c = cmMontar_(d[i], mapaProj, mapaCli);
    if (filtro.status && c.status !== filtro.status) continue;
    out.push(cmResumo_(c, porCrono[c.id] || [], hoje));
  }
  return out.reverse();
}

function obterCronogramaManual(token, cronogramaId) {
  exigirPermissao_(token, 'projetos', 'ver');
  var d = cmDados_(CM_ABA_), de = cmDados_(CM_ABA_ETAPAS_), hoje = cmHoje_(), c = null;
  for (var i = 1; i < d.length; i++) if (String(d[i][0]) === String(cronogramaId)) { c = cmMontar_(d[i], cmMapaProjetos_(), obterMapaNomesClientes_()); break; }
  if (!c) throw new Error('Cronograma não encontrado.');
  var etapas = [];
  for (var j = 1; j < de.length; j++) if (String(de[j][1]) === c.id) etapas.push(cmAnalisarEtapa_(cmLinhaEtapa_(de[j]), hoje));
  etapas.sort(function (a, b) { return a.ordem - b.ordem; });
  etapas.forEach(function (e, n) { e.numero = n + 1; });
  c.etapas = etapas;
  return cmResumo_(c, etapas, hoje);
}

// cria (sem dados.id) ou edita um cronograma. dados: { id, projetoId, clienteId, titulo, descricao, status }
function salvarCronogramaManual(token, dados) {
  var u = exigirPermissao_(token, 'projetos', 'editar');
  dados = dados || {};
  var titulo = String(dados.titulo || '').trim();
  var projetoId = String(dados.projetoId || '').trim();
  if (!titulo && projetoId) { var p = cmMapaProjetos_()[projetoId]; titulo = p ? 'Cronograma - ' + p.titulo : ''; }
  if (!titulo) throw new Error('Informe o título do cronograma.');
  var aba = cmAbaCrono_(), d = cmDados_(CM_ABA_), agora = cmAgora_();
  var status = ['Ativo', 'Concluído', 'Arquivado'].indexOf(dados.status) >= 0 ? dados.status : 'Ativo';
  if (dados.id) {
    for (var i = 1; i < d.length; i++) if (String(d[i][0]) === String(dados.id)) {
      aba.getRange(i + 1, 2, 1, 5).setValues([[projetoId, String(dados.clienteId || ''), titulo, String(dados.descricao || ''), status]]);
      aba.getRange(i + 1, 9).setValue(agora);
      invalidarCacheAba_(CM_ABA_);
      registrarLog_(u.id, u.email, 'EDITAR_CRONOGRAMA_MANUAL', titulo);
      return { sucesso: true, id: String(dados.id) };
    }
    throw new Error('Cronograma não encontrado.');
  }
  var id = Utilities.getUuid();
  aba.appendRow([id, projetoId, String(dados.clienteId || ''), titulo, String(dados.descricao || ''), status, u.id, agora, agora]);
  invalidarCacheAba_(CM_ABA_);
  registrarLog_(u.id, u.email, 'CRIAR_CRONOGRAMA_MANUAL', titulo);
  return { sucesso: true, id: id };
}

function excluirCronogramaManual(token, cronogramaId) {
  var u = exigirPermissao_(token, 'projetos', 'editar');
  var aba = cmAbaCrono_(), d = cmDados_(CM_ABA_), abaE = cmAbaEtapas_(), de = cmDados_(CM_ABA_ETAPAS_), achou = false;
  for (var j = de.length - 1; j >= 1; j--) if (String(de[j][1]) === String(cronogramaId)) abaE.deleteRow(j + 1);
  for (var i = d.length - 1; i >= 1; i--) if (String(d[i][0]) === String(cronogramaId)) { aba.deleteRow(i + 1); achou = true; }
  invalidarCacheAba_(CM_ABA_); invalidarCacheAba_(CM_ABA_ETAPAS_);
  if (!achou) throw new Error('Cronograma não encontrado.');
  registrarLog_(u.id, u.email, 'EXCLUIR_CRONOGRAMA_MANUAL', cronogramaId);
  return { sucesso: true };
}

// cria (sem dados.id) ou edita uma etapa.
// dados: { id, nome, responsavel, inicioPrevisto, fimPrevisto, inicioReal, fimReal, percentual, observacao }
function salvarEtapaCronogramaManual(token, cronogramaId, dados) {
  var u = exigirPermissao_(token, 'projetos', 'editar');
  dados = dados || {};
  var nome = String(dados.nome || '').trim();
  if (!nome) throw new Error('Informe o nome da etapa.');
  var ip = cmData_(dados.inicioPrevisto), fp = cmData_(dados.fimPrevisto), ir = cmData_(dados.inicioReal), fr = cmData_(dados.fimReal);
  if (ip && fp && fp < ip) throw new Error('O fim previsto é antes do início previsto.');
  if (ir && fr && fr < ir) throw new Error('O fim real é antes do início real.');
  if (fr && !ir) throw new Error('Informe o início real antes do fim real.');
  var pct = cmPct_(dados.percentual);
  if (fr) pct = 100;
  if (pct > 0 && !ir) ir = cmHoje_();
  var abaE = cmAbaEtapas_(), de = cmDados_(CM_ABA_ETAPAS_), agora = cmAgora_();
  var valores = [nome, String(dados.responsavel || ''), ip, fp, ir, fr, pct, String(dados.observacao || ''), agora];
  if (dados.id) {
    for (var j = 1; j < de.length; j++) if (String(de[j][0]) === String(dados.id)) {
      abaE.getRange(j + 1, 4, 1, valores.length).setValues([valores]);
      invalidarCacheAba_(CM_ABA_ETAPAS_); cmTocar_(cronogramaId);
      return { sucesso: true, id: String(dados.id) };
    }
    throw new Error('Etapa não encontrada.');
  }
  var d = cmDados_(CM_ABA_), existe = false;
  for (var i = 1; i < d.length; i++) if (String(d[i][0]) === String(cronogramaId)) existe = true;
  if (!existe) throw new Error('Cronograma não encontrado.');
  var ordem = 0;
  for (var k = 1; k < de.length; k++) if (String(de[k][1]) === String(cronogramaId)) ordem = Math.max(ordem, Number(de[k][2]) || 0);
  var id = Utilities.getUuid();
  abaE.appendRow([id, String(cronogramaId), ordem + 1].concat(valores));
  invalidarCacheAba_(CM_ABA_ETAPAS_); cmTocar_(cronogramaId);
  registrarLog_(u.id, u.email, 'CRIAR_ETAPA_CRONOGRAMA_MANUAL', nome);
  return { sucesso: true, id: id };
}

function cmTocar_(cronogramaId) {
  var d = obterDadosAba_(CM_ABA_);
  for (var i = 1; i < d.length; i++) if (String(d[i][0]) === String(cronogramaId)) { cmAbaCrono_().getRange(i + 1, 9).setValue(cmAgora_()); invalidarCacheAba_(CM_ABA_); return; }
}

function excluirEtapaCronogramaManual(token, etapaId) {
  var u = exigirPermissao_(token, 'projetos', 'editar');
  var abaE = cmAbaEtapas_(), de = cmDados_(CM_ABA_ETAPAS_);
  for (var j = 1; j < de.length; j++) if (String(de[j][0]) === String(etapaId)) {
    abaE.deleteRow(j + 1); invalidarCacheAba_(CM_ABA_ETAPAS_);
    registrarLog_(u.id, u.email, 'EXCLUIR_ETAPA_CRONOGRAMA_MANUAL', String(de[j][3]));
    return { sucesso: true };
  }
  throw new Error('Etapa não encontrada.');
}

// direcao: -1 sobe, +1 desce
function moverEtapaCronogramaManual(token, etapaId, direcao) {
  exigirPermissao_(token, 'projetos', 'editar');
  var abaE = cmAbaEtapas_(), de = cmDados_(CM_ABA_ETAPAS_), alvo = null;
  for (var j = 1; j < de.length; j++) if (String(de[j][0]) === String(etapaId)) alvo = de[j][1];
  if (alvo === null) throw new Error('Etapa não encontrada.');
  var lista = [];
  for (var k = 1; k < de.length; k++) if (String(de[k][1]) === String(alvo)) lista.push({ linha: k + 1, id: String(de[k][0]), ordem: Number(de[k][2]) || 0 });
  lista.sort(function (a, b) { return a.ordem - b.ordem; });
  var pos = -1; lista.forEach(function (x, n) { if (x.id === String(etapaId)) pos = n; });
  var novo = pos + (Number(direcao) < 0 ? -1 : 1);
  if (novo < 0 || novo >= lista.length) return { sucesso: true };
  var tmp = lista[pos]; lista[pos] = lista[novo]; lista[novo] = tmp;
  lista.forEach(function (x, n) { abaE.getRange(x.linha, 3).setValue(n + 1); });
  invalidarCacheAba_(CM_ABA_ETAPAS_);
  return { sucesso: true };
}

function exportarCronogramaManualPdf(token, cronogramaId) {
  var u = exigirPermissao_(token, 'projetos', 'ver');
  var c = obterCronogramaManual(token, cronogramaId);
  if (!c.etapas.length) throw new Error('O cronograma não tem etapas.');
  var empresa = obterConfigEmpresa(token);
  var pasta = null;
  if (c.projetoId) { try { pasta = obterPastaProjeto_(c.projetoId); } catch (e) {} }
  if (!pasta) {
    var raizId = PropertiesService.getScriptProperties().getProperty('PASTA_RAIZ_ID');
    var raiz = raizId ? DriveApp.getFolderById(raizId) : DriveApp.getFileById(obterPlanilha_().getId()).getParents().next();
    pasta = obterOuCriarPasta_('Cronogramas avulsos', raiz);
  }
  var destino = c.projetoId ? obterOuCriarPasta_('Cronogramas', pasta) : pasta;

  var doc = criarDocumentoComLetterhead_('tmp-cronograma-manual-' + Utilities.getUuid(), empresa);
  var body = doc.getBody();
  tituloDocumento_(body, 'CRONOGRAMA');
  subtituloDocumento_(body, c.titulo + (c.nomeCliente ? '  —  Cliente: ' + c.nomeCliente : '') +
    '  —  Emitido em ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'));
  var resumo = body.appendParagraph('Avanço real: ' + c.percentualReal + '%   ·   Previsto para hoje: ' + c.percentualPrevisto + '%   ·   Etapas concluídas: ' + c.concluidas + ' de ' + c.qtdEtapas + (c.atrasadas ? '   ·   Em atraso: ' + c.atrasadas : ''));
  resumo.editAsText().setFontSize(9.5).setForegroundColor('#0B1A2E'); resumo.setSpacingAfter(8);

  var linhas = [['Etapa', 'Responsável', 'Início prev.', 'Fim prev.', 'Início real', 'Fim real', '%', 'Situação']];
  c.etapas.forEach(function (e) {
    linhas.push([e.numero + ' - ' + e.nome, e.responsavel || '', formatarDataBr_(e.inicioPrevisto), formatarDataBr_(e.fimPrevisto),
      formatarDataBr_(e.inicioReal), formatarDataBr_(e.fimReal), e.percentual + '%', e.situacao]);
  });
  var t = body.appendTable(linhas);
  [150, 70, 52, 52, 52, 52, 30, 80].forEach(function (w, i) { t.setColumnWidth(i, w); });
  compactarTabela_(t); formatarCabecalhoTabela_(t);

  var itensGantt = c.etapas.map(function (e) {
    return { numero: e.numero, nome: e.nome, dataInicioPrevista: e.inicioPrevisto, dataFimPrevista: e.fimPrevisto, dataInicioReal: e.inicioReal, dataFimReal: e.fimReal };
  }).filter(function (e) { return e.dataInicioPrevista && e.dataFimPrevista || e.dataInicioReal; });
  if (itensGantt.length) {
    var tg = body.appendParagraph('LINHA DO TEMPO — PROGRAMADO × EXECUTADO');
    tg.editAsText().setBold(true).setFontSize(11).setForegroundColor('#0B1A2E');
    tg.setSpacingBefore(16).setSpacingAfter(8);
    inserirGanttImagem_(body, itensGantt);
  }
  var obs = c.etapas.filter(function (e) { return e.observacao; });
  if (obs.length) {
    var to = body.appendParagraph('OBSERVAÇÕES');
    to.editAsText().setBold(true).setFontSize(11).setForegroundColor('#0B1A2E'); to.setSpacingBefore(12);
    obs.forEach(function (e) { body.appendParagraph(e.numero + ' - ' + e.nome + ': ' + e.observacao).editAsText().setFontSize(9); });
  }
  doc.saveAndClose();
  var pdf = exportarComoPdf_(doc.getId(), c.titulo + ' - CRONOGRAMA', destino);
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  registrarLog_(u.id, u.email, 'EXPORTAR_CRONOGRAMA_MANUAL', c.titulo);
  return { sucesso: true, url: pdf.getUrl(), nome: pdf.getName() };
}
