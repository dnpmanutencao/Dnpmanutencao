// ================= CRONOGRAMA MANUAL =================
// Cronogramas livres (de uma obra ou avulsos), com etapas digitadas à mão:
// programação (início/fim previstos) × execução (início/fim reais e %), sem ligação com o orçamento.
// Servidor: CronogramasManuais.gs (listar/obter/salvar/excluir cronograma e etapas, PDF).
var CM = { filtroProj: null, id: null, etapa: null, novo: null, mudou: false };
var CM_SIT = { 'Concluída': '#2e7d32', 'Concluída com atraso': '#558b2f', 'Em andamento': '#1565c0', 'Em andamento (atrás do previsto)': '#ef6c00', 'Atrasada': '#c62828', 'Início atrasado': '#d84315', 'Não iniciada': '#757575' };
function cmBadge(s) { return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:' + (CM_SIT[s] || '#555') + '">' + esc(s) + '</span>'; }
function cmPct(v) { return mVal('percentual', Number(v) || 0) + '%'; }
function cmBr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—'; }
function cmDia(iso) { return iso ? Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000) : null; }
function cmHoje() { return dataIso(Date.now()); }
function cmBarraAvanco(real, prev) {
  return '<div style="position:relative;height:10px;background:#eef1f5;border-radius:5px;margin:6px 0 2px">' +
    '<div style="position:absolute;left:0;top:0;bottom:0;width:' + Math.min(100, real) + '%;background:var(--laranja);border-radius:5px"></div>' +
    '<div title="previsto hoje" style="position:absolute;top:-3px;bottom:-3px;left:calc(' + Math.min(100, prev) + '% - 1px);width:2px;background:#0B2A5B"></div></div>';
}

// ---------- lista ----------
function cmAbrirLista(projId, nome) { CM.filtroProj = projId ? { id: projId, nome: nome || '' } : null; tLimpa('cm_lista'); gIr('tCms'); }
function cmTelaLista() {
  var f = CM.filtroProj, ch = 'cm_lista' + (f ? '_' + f.id : '');
  var l = tCarrega(ch, 'listarCronogramasManuais', [f ? { projetoId: f.id } : {}], 'tCms');
  var h = gVoltar(f ? 'tObra' : 'auto') + tH('🗓️ Cronogramas', f ? esc(f.nome) : 'Programado × executado, com etapas lançadas à mão');
  h += tBtn('➕ Novo cronograma', 'cmNovo()', 'lar');
  if (!l) { $('tela').innerHTML = h + tCarregando(); return; }
  if (!l.length) { $('tela').innerHTML = h + '<div class="card muted">Nenhum cronograma ainda. Toque em <b>Novo cronograma</b> para criar.</div>'; return; }
  var ord = { 'Ativo': 0, 'Concluído': 1, 'Arquivado': 2 };
  l = l.slice().sort(function (a, b) { return (ord[a.status] || 0) - (ord[b.status] || 0); });
  h += '<div class="card"><input id="cm-busca" placeholder="🔎 Buscar"><ul class="lista" id="cm-l"></ul></div>';
  $('tela').innerHTML = h;
  var pinta = function () {
    var q = aSemAcento($('cm-busca').value);
    $('cm-l').innerHTML = l.filter(function (c) { return !q || aSemAcento(c.titulo + ' ' + c.projetoTitulo + ' ' + c.nomeCliente).indexOf(q) >= 0; }).map(function (c) {
      var sub = (c.avulso ? '📌 Avulso' : '🏗️ ' + esc(c.projetoTitulo)) + (c.nomeCliente ? ' · ' + esc(c.nomeCliente) : '') +
        '<br>' + c.qtdEtapas + ' etapa(s)' + (c.inicio ? ' · ' + cmBr(c.inicio) + ' a ' + cmBr(c.fim) : '') +
        ' · real <b>' + cmPct(c.percentualReal) + '</b> / previsto ' + cmPct(c.percentualPrevisto) +
        (c.atrasadas ? ' · <b style="color:#c62828">' + c.atrasadas + ' em atraso</b>' : '') + cmBarraAvanco(c.percentualReal, c.percentualPrevisto);
      return tLi("cmAbrir('" + tId(c.id) + "')", esc(c.titulo), c.status, sub);
    }).join('');
  };
  $('cm-busca').oninput = pinta; pinta();
}
function cmAbrir(id) { CM.id = id; delete T.d['cm_' + id]; gIr('tCm'); }

// ---------- criar / editar cronograma ----------
function cmNovo() { CM.novo = { id: '', titulo: '', descricao: '', status: 'Ativo', projetoId: CM.filtroProj ? CM.filtroProj.id : '', clienteId: '' }; gIr('tCmForm'); }
function cmEditar() { var c = T.d['cm_' + CM.id]; if (!c) return; CM.novo = { id: c.id, titulo: c.titulo, descricao: c.descricao, status: c.status, projetoId: c.projetoId, clienteId: c.avulso ? c.clienteId : '' }; gIr('tCmForm'); }
function cmTelaForm() {
  var n = CM.novo; if (!n) return gIr('tCms');
  var projs = tCarrega('projetos', 'listarProjetos', [], 'tCmForm') || [];
  var clis = tCarrega('cm_clientes', 'listarClientes', [], 'tCmForm') || [];
  var po = projs.map(function (p) { return { id: p.id, nome: mTitulo(p) + (p.nomeCliente ? ' — ' + p.nomeCliente : '') }; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  var co = clis.map(function (c) { return { id: c.id, nome: c.nomeEmpresa || mTitulo(c) }; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  var h = gVoltar(n.id ? 'tCm' : 'tCms') + tH(n.id ? '✏️ Editar cronograma' : '➕ Novo cronograma');
  h += '<div class="card"><label>Título</label><input id="cmf-t" value="' + esc(n.titulo) + '" placeholder="Ex.: Parada geral - britagem primária">' +
    '<label>Obra</label><select id="cmf-p" onchange="cmFormObra()">' + gOpts(po, n.projetoId, function (x) { return x.nome; }, projs.length ? '📌 Avulso (sem obra)' : 'Carregando obras...') + '</select>' +
    '<div id="cmf-cw"' + (n.projetoId ? ' style="display:none"' : '') + '><label>Cliente (opcional)</label><select id="cmf-c">' + gOpts(co, n.clienteId, function (x) { return x.nome; }, clis.length ? 'Sem cliente' : 'Carregando clientes...') + '</select></div>' +
    '<label>Descrição (opcional)</label><textarea id="cmf-d" rows="3">' + esc(n.descricao) + '</textarea>' +
    (n.id ? '<label>Status</label><select id="cmf-s">' + ['Ativo', 'Concluído', 'Arquivado'].map(function (s) { return '<option' + (s === n.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '') +
    tBtn('💾 Salvar', 'cmFormSalvar()', 'lar') + '</div>';
  $('tela').innerHTML = h;
}
function cmFormLer() { var n = CM.novo; if (!n || !$('cmf-t')) return; n.titulo = $('cmf-t').value; n.projetoId = $('cmf-p').value; n.clienteId = $('cmf-c') ? $('cmf-c').value : ''; n.descricao = $('cmf-d').value; if ($('cmf-s')) n.status = $('cmf-s').value; }
function cmFormObra() { var p = $('cmf-p').value; $('cmf-cw').style.display = p ? 'none' : ''; if (p && !$('cmf-t').value.trim()) { var o = $('cmf-p').selectedOptions[0]; if (o) $('cmf-t').value = 'Cronograma - ' + o.text.split(' — ')[0]; } }
function cmFormSalvar() {
  cmFormLer(); var n = CM.novo;
  if (!String(n.titulo).trim()) return aviso('Informe o título.', 'err');
  var dados = { id: n.id, titulo: n.titulo.trim(), projetoId: n.projetoId, clienteId: n.projetoId ? '' : n.clienteId, descricao: n.descricao, status: n.status };
  tFn('salvarCronogramaManual', [dados], 'Salvando...').then(function (r) {
    tLimpa('cm_'); CM.novo = null; CM.id = (r && r.id) || n.id; gIr('tCm');
  }).catch(function () {});
}

// ---------- detalhe: gráfico + etapas ----------
function cmGantt(c) {
  var es = c.etapas.filter(function (e) { return e.inicioPrevisto || e.inicioReal; });
  if (!es.length) return '';
  var hoje = cmDia(c.hoje || cmHoje()), ini = cmDia(c.inicio), fim = cmDia(c.fim);
  ini = Math.min(ini, hoje); fim = Math.max(fim, hoje); var tot = Math.max(1, fim - ini + 1);
  var pos = function (d) { return ((d - ini) / tot) * 100; };
  var marcas = [], passo = tot > 120 ? 30 : tot > 45 ? 14 : tot > 14 ? 7 : 1;
  for (var d = ini; d <= fim; d += passo) { var dt = new Date(d * 86400000); marcas.push('<span style="position:absolute;left:' + pos(d) + '%;font-size:10px;color:#888;transform:translateX(-1px)">' + ('0' + dt.getUTCDate()).slice(-2) + '/' + ('0' + (dt.getUTCMonth() + 1)).slice(-2) + '</span>'); }
  var linhas = c.etapas.map(function (e) {
    var ip = cmDia(e.inicioPrevisto), fp = cmDia(e.fimPrevisto), ir = cmDia(e.inicioReal), fr = cmDia(e.fimReal);
    var bp = (ip !== null && fp !== null) ? '<div style="position:absolute;top:3px;height:7px;left:' + pos(ip) + '%;width:' + Math.max(0.8, (fp - ip + 1) / tot * 100) + '%;background:#9db7d9;border-radius:3px"></div>' : '';
    var br = '';
    if (ir !== null) { var f2 = fr !== null ? fr : hoje; br = '<div style="position:absolute;top:12px;height:7px;left:' + pos(ir) + '%;width:' + Math.max(0.8, (f2 - ir + 1) / tot * 100) + '%;background:' + (fr !== null ? 'var(--laranja)' : 'repeating-linear-gradient(45deg,var(--laranja) 0 6px,#ffb366 6px 10px)') + ';border-radius:3px"></div>'; }
    return '<div style="margin:6px 0" onclick="cmEtapaAbrir(\'' + tId(e.id) + '\')"><div style="font-size:12px;display:flex;justify-content:space-between;gap:6px"><span>' + e.numero + '. ' + esc(e.nome) + '</span><b>' + cmPct(e.percentual) + '</b></div>' +
      '<div style="position:relative;height:22px;background:#f5f7fa;border-radius:4px">' + bp + br + '<div style="position:absolute;top:0;bottom:0;left:' + pos(hoje) + '%;width:2px;background:#c62828"></div></div></div>';
  }).join('');
  return '<div class="card"><h2 style="font-size:15px;margin:0 0 4px">📊 Programado × executado</h2>' +
    '<p class="muted" style="font-size:11px;margin:0 0 6px"><span style="display:inline-block;width:12px;height:7px;background:#9db7d9"></span> programado &nbsp; <span style="display:inline-block;width:12px;height:7px;background:var(--laranja)"></span> executado &nbsp; <span style="display:inline-block;width:12px;height:7px;background:repeating-linear-gradient(45deg,var(--laranja) 0 4px,#ffb366 4px 7px)"></span> em andamento &nbsp; <span style="display:inline-block;width:2px;height:10px;background:#c62828"></span> hoje</p>' +
    '<div style="position:relative;height:14px">' + marcas.join('') + '</div>' + linhas + '</div>';
}
function cmTelaDet() {
  if (!CM.id) return gIr('tCms');
  var c = tCarrega('cm_' + CM.id, 'obterCronogramaManual', [CM.id], 'tCm');
  var h = gVoltar('tCms');
  if (!c) { $('tela').innerHTML = h + tCarregando(); return; }
  h += '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">🗓️ ' + esc(c.titulo) + '</h2>' + aBadge(c.status) + '</div>' +
    '<p class="muted" style="margin:4px 0 0">' + (c.avulso ? '📌 Avulso' : '🏗️ ' + esc(c.projetoTitulo)) + (c.nomeCliente ? ' · ' + esc(c.nomeCliente) : '') + (c.inicio ? ' · ' + cmBr(c.inicio) + ' a ' + cmBr(c.fim) : '') + '</p>' +
    (c.descricao ? '<p style="margin:6px 0 0;font-size:13px">' + esc(c.descricao) + '</p>' : '') +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px;text-align:center">' +
    '<div><div class="muted" style="font-size:11px">Executado</div><b style="font-size:18px;color:var(--laranja)">' + cmPct(c.percentualReal) + '</b></div>' +
    '<div><div class="muted" style="font-size:11px">Previsto hoje</div><b style="font-size:18px">' + cmPct(c.percentualPrevisto) + '</b></div>' +
    '<div><div class="muted" style="font-size:11px">Etapas</div><b style="font-size:18px">' + c.concluidas + '/' + c.qtdEtapas + '</b>' + (c.atrasadas ? '<div style="font-size:11px;color:#c62828;font-weight:700">' + c.atrasadas + ' em atraso</div>' : '') + '</div></div>' +
    cmBarraAvanco(c.percentualReal, c.percentualPrevisto) + '</div>';
  h += cmGantt(c);
  h += '<div class="card"><h2 style="font-size:15px;margin:0 0 6px">📋 Etapas (' + c.etapas.length + ')</h2>';
  if (!c.etapas.length) h += '<p class="muted">Nenhuma etapa. Toque em <b>Adicionar etapa</b>.</p>';
  else h += '<ul class="lista">' + c.etapas.map(function (e) {
    var sub = 'Programado: ' + cmBr(e.inicioPrevisto) + ' a ' + cmBr(e.fimPrevisto) +
      '<br>Executado: ' + (e.inicioReal ? cmBr(e.inicioReal) + ' a ' + (e.fimReal ? cmBr(e.fimReal) : 'em andamento') : 'não iniciado') +
      (e.responsavel ? '<br>👷 ' + esc(e.responsavel) : '') +
      (e.desvioFimDias > 0 ? '<br><b style="color:#c62828">' + e.desvioFimDias + ' dia(s) de atraso no término</b>' : e.desvioFimDias < 0 ? '<br><b style="color:#2e7d32">' + (-e.desvioFimDias) + ' dia(s) adiantado</b>' : '');
    return '<li style="cursor:pointer;display:block" onclick="cmEtapaAbrir(\'' + tId(e.id) + '\')"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + e.numero + '. ' + esc(e.nome) + '</b><b>' + cmPct(e.percentual) + '</b></div>' +
      '<div style="margin:3px 0">' + cmBadge(e.situacao) + '</div><span class="muted" style="font-size:12px">' + sub + '</span></li>';
  }).join('') + '</ul>';
  h += tBtn('➕ Adicionar etapa', "cmEtapaAbrir('')", 'lar') + '</div>';
  h += '<div class="card">' + tBtn('📄 PDF do cronograma', "tPdf('exportarCronogramaManualPdf',[CM.id])", 'sec') + tBtn('✏️ Editar dados do cronograma', 'cmEditar()', 'sec') + tBtn('🗑️ Excluir cronograma', 'cmExcluir()', 'sec') + '</div>';
  $('tela').innerHTML = h;
}
function cmExcluir() {
  var c = T.d['cm_' + CM.id]; if (!c) return;
  if (!confirm('Excluir o cronograma "' + c.titulo + '" e suas ' + c.etapas.length + ' etapa(s)? Não dá para desfazer.')) return;
  tFn('excluirCronogramaManual', [CM.id], 'Excluindo...').then(function () { tLimpa('cm_'); CM.id = null; gIr('tCms'); }).catch(function () {});
}

// ---------- etapa ----------
function cmEtapaAbrir(id) {
  var c = T.d['cm_' + CM.id]; if (!c) return;
  var e = c.etapas.filter(function (x) { return x.id === id; })[0];
  CM.etapa = e ? JSON.parse(JSON.stringify(e)) : { id: '', nome: '', responsavel: '', inicioPrevisto: '', fimPrevisto: '', inicioReal: '', fimReal: '', percentual: 0, observacao: '' };
  CM.mudou = false; gIr('tCmEtapa');
}
function cmTelaEtapa() {
  var e = CM.etapa; if (!e) return gIr('tCm');
  var c = T.d['cm_' + CM.id] || { etapas: [] };
  var i = c.etapas.map(function (x) { return x.id; }).indexOf(e.id);
  var dt = function (id, v) { return '<input type="date" id="' + id + '" value="' + esc(v || '') + '" style="min-width:0">'; };
  var h = '<button class="btn sec" style="margin-bottom:10px" onclick="cmEtapaVoltar()">← Voltar</button>' + tH(e.id ? '✏️ Etapa ' + (i + 1) : '➕ Nova etapa', esc(c.titulo || ''));
  h += '<div class="card"><label>Nome da etapa</label><input id="cme-n" value="' + esc(e.nome) + '" placeholder="Ex.: Desmontagem do britador">' +
    '<label>Responsável (opcional)</label><input id="cme-r" value="' + esc(e.responsavel) + '" placeholder="Ex.: Ueder / equipe mecânica"></div>';
  h += '<div class="card"><h2 style="font-size:15px;margin:0 0 6px">📅 Programação</h2><div class="row"><div><label>Início previsto</label>' + dt('cme-ip', e.inicioPrevisto) + '</div><div><label>Fim previsto</label>' + dt('cme-fp', e.fimPrevisto) + '</div></div>' +
    '<label>Duração (dias)</label><input id="cme-du" inputmode="numeric" placeholder="preenche o fim previsto" oninput="cmEtapaDur()"></div>';
  h += '<div class="card"><h2 style="font-size:15px;margin:0 0 6px">🔨 Execução</h2><div class="row"><div><label>Início real</label>' + dt('cme-ir', e.inicioReal) + '</div><div><label>Fim real</label>' + dt('cme-fr', e.fimReal) + '</div></div>' +
    '<label>% concluído: <b id="cme-pv">' + (Number(e.percentual) || 0) + '%</b></label><input type="range" id="cme-p" min="0" max="100" step="5" value="' + (Number(e.percentual) || 0) + '" oninput="$(\'cme-pv\').textContent=this.value+\'%\'" style="width:100%">' +
    '<div class="row"><button class="btn sec" style="margin-top:8px" onclick="cmEtapaRapido(\'ini\')">▶ Iniciou hoje</button><button class="btn sec" style="margin-top:8px" onclick="cmEtapaRapido(\'fim\')">✔ Terminou hoje</button></div>' +
    '<label>Observação</label><textarea id="cme-o" rows="3" placeholder="Motivo de atraso, pendências...">' + esc(e.observacao) + '</textarea></div>';
  h += tBtn('💾 Salvar etapa', 'cmEtapaSalvar()', 'lar');
  if (e.id) h += '<div class="card"><div class="row">' + (i > 0 ? '<button class="btn sec" onclick="cmEtapaMover(-1)">⬆ Subir</button>' : '') + (i < c.etapas.length - 1 ? '<button class="btn sec" onclick="cmEtapaMover(1)">⬇ Descer</button>' : '') + '</div>' + tBtn('🗑️ Excluir etapa', 'cmEtapaExcluir()', 'sec') + '</div>';
  $('tela').innerHTML = h;
  Array.prototype.forEach.call(document.querySelectorAll('#tela input,#tela textarea'), function (el) { el.addEventListener('input', function () { CM.mudou = true; }); el.addEventListener('change', function () { CM.mudou = true; }); });
}
function cmEtapaLer() {
  var e = CM.etapa; if (!e || !$('cme-n')) return e;
  e.nome = $('cme-n').value; e.responsavel = $('cme-r').value; e.inicioPrevisto = $('cme-ip').value; e.fimPrevisto = $('cme-fp').value;
  e.inicioReal = $('cme-ir').value; e.fimReal = $('cme-fr').value; e.percentual = Number($('cme-p').value) || 0; e.observacao = $('cme-o').value;
  return e;
}
function cmEtapaDur() {
  var n = parseInt($('cme-du').value, 10), ip = $('cme-ip').value; if (!n || n < 1) return;
  if (!ip) { ip = cmHoje(); $('cme-ip').value = ip; }
  $('cme-fp').value = dataIso((cmDia(ip) + n - 1) * 86400000 + 43200000);
}
function cmEtapaRapido(q) {
  var h = cmHoje();
  if (q === 'ini') { if (!$('cme-ir').value) $('cme-ir').value = h; if (Number($('cme-p').value) === 0) { $('cme-p').value = 5; $('cme-pv').textContent = '5%'; } }
  else { if (!$('cme-ir').value) $('cme-ir').value = h; $('cme-fr').value = h; $('cme-p').value = 100; $('cme-pv').textContent = '100%'; }
  CM.mudou = true;
}
function cmEtapaVoltar() { if (CM.mudou && !confirm('Sair sem salvar a etapa?')) return; CM.etapa = null; gIr('tCm'); }
function cmEtapaSalvar() {
  var e = cmEtapaLer();
  if (!String(e.nome).trim()) return aviso('Informe o nome da etapa.', 'err');
  if (e.inicioPrevisto && e.fimPrevisto && e.fimPrevisto < e.inicioPrevisto) return aviso('O fim previsto está antes do início previsto.', 'err');
  if (e.fimReal && !e.inicioReal) return aviso('Informe o início real.', 'err');
  if (e.inicioReal && e.fimReal && e.fimReal < e.inicioReal) return aviso('O fim real está antes do início real.', 'err');
  if (CM.salvando) return;
  CM.salvando = true;
  var dados = { id: e.id, nome: e.nome.trim(), responsavel: e.responsavel, inicioPrevisto: e.inicioPrevisto, fimPrevisto: e.fimPrevisto, inicioReal: e.inicioReal, fimReal: e.fimReal, percentual: e.percentual, observacao: e.observacao };
  tFn('salvarEtapaCronogramaManual', [CM.id, dados], 'Salvando etapa...').then(function () {
    CM.salvando = false; CM.mudou = false; CM.etapa = null; tLimpa('cm_'); gIr('tCm');
  }).catch(function () { CM.salvando = false; });
}
function cmEtapaMover(d) { var e = CM.etapa; tFn('moverEtapaCronogramaManual', [e.id, d], 'Movendo...').then(function () { CM.mudou = false; CM.etapa = null; tLimpa('cm_'); gIr('tCm'); }).catch(function () {}); }
function cmEtapaExcluir() {
  var e = CM.etapa; if (!confirm('Excluir a etapa "' + e.nome + '"?')) return;
  tFn('excluirEtapaCronogramaManual', [e.id], 'Excluindo...').then(function () { CM.mudou = false; CM.etapa = null; tLimpa('cm_'); gIr('tCm'); }).catch(function () {});
}

T_ROTAS.tCms = cmTelaLista; T_ROTAS.tCm = cmTelaDet; T_ROTAS.tCmForm = cmTelaForm; T_ROTAS.tCmEtapa = cmTelaEtapa;
