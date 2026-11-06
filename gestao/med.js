/* DNP Gestão — Medições de obra: criar, editar seleção, status, ajustes, NF, faturamento e PDF. */
var MD = { proj: null, lista: null, med: null, form: null, sel: {}, ini: '', fim: '', editId: null };
var MD_STATUS = ['Rascunho', 'Enviada', 'Aprovada', 'Paga'];
function mdBrl(v) { return mVal('valor', Number(v) || 0); }
function mdData(v) { return v ? mVal('data', aIsoData(v)) : '—'; }
function mdAbrirProjeto(id, nome) { MD.proj = { id: id, nome: nome || '' }; MD.lista = null; gIr('medProj'); }

function mdTelaEscolher() {
  $('tela').innerHTML = gVoltar('auto') + '<div class="card"><h2>📏 Medições</h2><p class="muted">Escolha a obra</p><input id="md-busca" placeholder="🔎 Buscar obra"><div id="md-obras" style="margin-top:8px" class="muted">Carregando obras...</div></div>';
  if (!gOnline()) return;
  aOpcoes('listarProjetos').then(function (l) {
    var ord = { 'Em Andamento': 0, 'Planejamento': 1, 'Pausado': 2 };
    l = l.slice().sort(function (a, b) { return (ord[a.status] != null ? ord[a.status] : 9) - (ord[b.status] != null ? ord[b.status] : 9); });
    var pinta = function () {
      var q = aSemAcento($('md-busca').value);
      $('md-obras').innerHTML = '<ul class="lista">' + l.filter(function (p) { return !q || aSemAcento(JSON.stringify(p)).indexOf(q) >= 0; }).map(function (p) {
        return '<li style="cursor:pointer;display:block" onclick="mdAbrirProjeto(\'' + esc(p.id) + '\', this.dataset.n)" data-n="' + esc(mTitulo(p)) + '"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(mTitulo(p)) + '</b>' + (p.status ? aBadge(p.status === 'Em Andamento' ? 'Em Execução' : p.status) : '') + '</div><span class="muted" style="font-size:13px">' + esc(p.clienteNome || p.nomeCliente || p.cliente || '') + '</span></li>';
      }).join('') + '</ul>';
    };
    $('md-busca').oninput = pinta; pinta();
  }).catch(function (e) { aviso(e.message, 'err'); });
}

function mdTelaLista() {
  if (!MD.proj) return gIr('medEscolher');
  var html = gVoltar('medEscolher') + '<div class="card"><h2>📏 Medições</h2><p class="muted" style="margin-top:-4px">' + esc(MD.proj.nome) + '</p><button class="btn lar" onclick="mdNova()">+ Nova medição</button></div>';
  if (!MD.lista) {
    $('tela').innerHTML = html + '<div class="card muted">Carregando...</div>';
    if (gOnline()) sys('listarMedicoes', [MD.proj.id]).then(function (l) { MD.lista = l || []; if (G.view === 'medProj') mdTelaLista(); }).catch(function (e) { aviso(e.message, 'err'); });
    return;
  }
  var tot = 0; MD.lista.forEach(function (m) { tot += Number(m.valorFinal) || 0; });
  html += '<div class="card"><p class="muted" style="margin:0 0 6px">' + MD.lista.length + ' medição(ões) · Total: <b>' + mdBrl(tot) + '</b></p><ul class="lista">' + (MD.lista.length ? MD.lista.slice().sort(function (a, b) { return (Number(b.numero) || 0) - (Number(a.numero) || 0); }).map(function (m) {
    return '<li style="cursor:pointer;display:block" onclick="mdVer(\'' + esc(m.id) + '\')"><div style="display:flex;justify-content:space-between;gap:8px"><b>Medição nº ' + esc(m.numero) + '</b>' + aBadge(m.status || 'Rascunho') + '</div><span class="muted" style="font-size:13px">' + mdData(m.periodoInicio) + ' a ' + mdData(m.periodoFim) + ' · <b>' + mdBrl(m.valorFinal) + '</b>' + (m.notaFiscalEmitida ? ' · NF emitida' : '') + '</span></li>';
  }).join('') : '<li class="muted">Nenhuma medição nesta obra ainda.</li>') + '</ul></div>';
  $('tela').innerHTML = html;
}

function mdVer(id) {
  if (!gOnline()) return;
  aviso('Abrindo medição...');
  sys('obterMedicao', [id]).then(function (m) { MD.med = m; $('aviso').style.display = 'none'; gIr('medVer'); }).catch(function (e) { aviso(e.message, 'err'); });
}
function mdTelaVer() {
  var m = MD.med; if (!m) return gIr('medProj');
  var rasc = (m.status || 'Rascunho') === 'Rascunho';
  var html = gVoltar('medProj') + '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">Medição nº ' + esc(m.numero) + '</h2>' + aBadge(m.status || 'Rascunho') + '</div><p class="muted">' + esc(MD.proj ? MD.proj.nome : '') + '<br>Período: ' + mdData(m.periodoInicio) + ' a ' + mdData(m.periodoFim) + '</p>' +
    '<ul class="lista"><li><span>Valor medido</span><b>' + mdBrl(m.valorTotal) + '</b></li><li><span>Desconto</span><b>' + mdBrl(m.desconto) + '</b></li><li><span>Acréscimo</span><b>' + mdBrl(m.acrescimo) + '</b></li><li><span>Valor final</span><b style="color:var(--laranja)">' + mdBrl(m.valorFinal) + '</b></li></ul></div>';
  var itens = m.itens || [];
  html += '<div class="card"><h2 style="font-size:15px">Itens medidos (' + itens.length + ')</h2><ul class="lista">' + itens.map(function (it) {
    return '<li style="display:block"><b>' + esc(it.descricao || '') + '</b><br><span class="muted" style="font-size:13px">' + (it.quantidade != null && it.quantidade !== '' ? esc(mVal('qtd', it.quantidade)) + ' ' + esc(it.unidade || '') + ' · ' : '') + (it.percentualAtual != null ? esc(mVal('percentual', it.percentualAtual)) + '% · ' : '') + '<b>' + mdBrl(it.valorMedido) + '</b></span></li>';
  }).join('') + '</ul>' + (rasc ? '<button class="btn sec" style="margin-top:8px" onclick="mdEditarSelecao()">✏️ Alterar apontamentos medidos</button>' : '') + '</div>';
  html += '<div class="card"><h2 style="font-size:15px">Status</h2><div style="display:flex;gap:6px">' + '<select id="md-st" style="flex:1">' + MD_STATUS.map(function (s) { return '<option' + (s === (m.status || 'Rascunho') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select><button class="btn" style="width:auto;padding:10px 14px" onclick="mdAcao(\'atualizarStatusMedicao\', [$(\'md-st\').value])">Salvar</button></div></div>';
  html += '<div class="card"><h2 style="font-size:15px">Ajustes</h2><div class="grade"><div><label>Desconto (R$)</label><input type="number" step="any" inputmode="decimal" id="md-des" value="' + esc(m.desconto || 0) + '"></div><div><label>Acréscimo (R$)</label><input type="number" step="any" inputmode="decimal" id="md-acr" value="' + esc(m.acrescimo || 0) + '"></div></div><button class="btn" style="margin-top:8px" onclick="mdAcao(\'salvarAjustesMedicao\', [Number($(\'md-des\').value) || 0, Number($(\'md-acr\').value) || 0])">Salvar ajustes</button></div>';
  html += '<div class="card"><h2 style="font-size:15px">Faturamento</h2><label style="display:flex;gap:8px;align-items:center;color:var(--texto)"><input type="checkbox" id="md-nf" style="width:auto"' + (m.notaFiscalEmitida ? ' checked' : '') + ' onchange="mdAcao(\'alternarNotaFiscalMedicao\', [this.checked])"> Nota fiscal emitida</label>' +
    '<label>Forma de pagamento</label><input id="md-fp" value="' + esc(m.formaPagamento || '') + '" list="md-fpl"><datalist id="md-fpl"><option value="PIX"><option value="Boleto"><option value="Transferência"><option value="Dinheiro"></datalist>' +
    '<label>Previsão de recebimento</label><input type="date" id="md-pr" value="' + esc(aIsoData(m.previsaoRecebimento)) + '"><button class="btn" style="margin-top:8px" onclick="mdAcao(\'atualizarFaturamentoMedicao\', [{ formaPagamento: $(\'md-fp\').value, previsaoRecebimento: $(\'md-pr\').value }])">Salvar faturamento</button></div>';
  html += '<div class="card"><h2 style="font-size:15px">PDF da medição</h2><label style="display:flex;gap:8px;align-items:center;color:var(--texto)"><input type="checkbox" id="md-p1" style="width:auto"> Incluir diários de obra</label><label style="display:flex;gap:8px;align-items:center;color:var(--texto)"><input type="checkbox" id="md-p2" style="width:auto"> Incluir detalhamento diário</label><button class="btn lar" style="margin-top:8px" onclick="mdPdf()">📄 Gerar PDF</button></div>';
  html += '<button class="btn sec" style="color:var(--erro);margin-bottom:20px" onclick="mdExcluir()">🗑️ Excluir medição</button>';
  $('tela').innerHTML = html;
}
function mdAcao(fn, extra) {
  if (!gOnline()) return;
  aviso('Salvando...');
  sys(fn, [MD.med.id].concat(extra)).then(function () {
    MD.lista = null;
    return sys('obterMedicao', [MD.med.id]).then(function (m) { MD.med = m; aviso('Salvo.', 'ok'); if (G.view === 'medVer') mdTelaVer(); });
  }).catch(function (e) { aviso(e.message, 'err'); if (G.view === 'medVer') mdTelaVer(); });
}
function mdPdf() {
  if (!gOnline()) return;
  var w = window.open('', '_blank'); aviso('Gerando PDF... pode levar alguns segundos.');
  sys('exportarMedicaoPdf', [MD.med.id, $('md-p1').checked, $('md-p2').checked]).then(function (r) {
    var u = r && (r.url || r); aviso('PDF pronto.', 'ok');
    if (w) w.location = u; else window.open(u, '_blank');
  }).catch(function (e) { if (w) w.close(); aviso(e.message, 'err'); });
}
function mdExcluir() {
  if (!confirm('Excluir a medição nº ' + MD.med.numero + '? Os apontamentos voltam a ficar pendentes.')) return;
  if (!gOnline()) return;
  aviso('Excluindo...');
  sys('excluirMedicao', [MD.med.id]).then(function () { MD.lista = null; aviso('Medição excluída.', 'ok'); gIr('medProj'); }).catch(function (e) { aviso(e.message, 'err'); });
}

// ---------- nova medição / alterar seleção ----------
function mdNova() {
  if (!gOnline()) return;
  MD.editId = null; MD.form = null; MD.sel = {}; MD.ini = ''; MD.fim = '';
  gIr('medForm');
  sys('obterFormularioMedicao', [MD.proj.id]).then(function (f) { MD.form = f.apontamentos || []; if (G.view === 'medForm') mdTelaForm(); }).catch(function (e) { aviso(e.message, 'err'); gIr('medProj'); });
}
function mdEditarSelecao() {
  if (!gOnline()) return;
  MD.editId = MD.med.id; MD.form = null; MD.sel = {}; MD.ini = aIsoData(MD.med.periodoInicio); MD.fim = aIsoData(MD.med.periodoFim);
  gIr('medForm');
  sys('obterFormularioEdicaoMedicao', [MD.editId]).then(function (f) {
    MD.form = f.apontamentos || []; (f.idsSelecionados || []).forEach(function (id) { MD.sel[id] = 1; });
    if (G.view === 'medForm') mdTelaForm();
  }).catch(function (e) { aviso(e.message, 'err'); gIr('medVer'); });
}
function mdTelaForm() {
  var html = gVoltar(MD.editId ? 'medVer' : 'medProj') + '<div class="card"><h2>' + (MD.editId ? 'Alterar medição nº ' + esc(MD.med.numero) : 'Nova medição') + '</h2><p class="muted" style="margin-top:-4px">' + esc(MD.proj.nome) + '</p>';
  if (!MD.form) { $('tela').innerHTML = html + '<p class="muted">Carregando apontamentos dos diários...</p></div>'; return; }
  html += '<div class="grade"><div><label>Período de</label><input type="date" id="md-ini" value="' + MD.ini + '"></div><div><label>até</label><input type="date" id="md-fim" value="' + MD.fim + '"></div></div></div>';
  if (!MD.form.length) { $('tela').innerHTML = html + '<div class="card muted">Não há apontamentos de diário pendentes de medição nesta obra.</div>'; return; }
  var grupos = {}, ordem = [];
  MD.form.forEach(function (a) { var k = a.nomeEtapa || a.descricao || 'Etapa'; if (!grupos[k]) { grupos[k] = []; ordem.push(k); } grupos[k].push(a); });
  html += '<div class="card" style="position:sticky;top:0;z-index:2"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span id="md-tot"></span><button class="btn sec" style="width:auto;padding:8px 12px" onclick="mdTodos()">Marcar todos</button></div></div>';
  ordem.forEach(function (k) {
    html += '<div class="card"><h2 style="font-size:15px">' + esc(k) + '</h2><ul class="lista">' + grupos[k].map(function (a) {
      var id = a.diarioEtapaId;
      return '<li style="display:block"><label style="display:flex;gap:10px;align-items:flex-start;color:var(--texto);margin:0"><input type="checkbox" class="md-ck" data-id="' + esc(id) + '" style="width:auto;margin-top:3px"' + (MD.sel[id] ? ' checked' : '') + '><span>RDO nº ' + esc(a.diarioNumero || a.numero || '') + ' · ' + mdData(a.diarioData || a.data) + '<br><span class="muted" style="font-size:13px">' + (a.percentualAcumulado != null ? 'Acumulado: ' + esc(mVal('percentual', a.percentualAcumulado)) + '% · ' : '') + 'A faturar: <b>' + mdBrl(a.valorAFaturar) + '</b></span></span></label></li>';
    }).join('') + '</ul></div>';
  });
  html += '<p class="muted" style="font-size:12px">Ao marcar um apontamento, os anteriores pendentes da mesma etapa entram juntos na medição.</p><button class="btn lar" id="md-salvar" style="margin-bottom:20px">' + (MD.editId ? 'Salvar alterações' : 'Criar medição') + '</button>';
  $('tela').innerHTML = html;
  Array.prototype.forEach.call(document.querySelectorAll('.md-ck'), function (c) { c.onchange = function () { if (c.checked) MD.sel[c.dataset.id] = 1; else delete MD.sel[c.dataset.id]; mdTotal(); }; });
  $('md-ini').onchange = function () { MD.ini = this.value; }; $('md-fim').onchange = function () { MD.fim = this.value; };
  $('md-salvar').onclick = mdSalvar;
  mdTotal();
}
function mdTotal() {
  var n = 0, t = 0, dts = [];
  MD.form.forEach(function (a) { if (MD.sel[a.diarioEtapaId]) { n++; t += Number(a.valorAFaturar) || 0; var d = aIsoData(a.diarioData || a.data); if (d) dts.push(d); } });
  dts.sort();
  if (dts.length && !MD.editId) { if (!$('md-ini').value) { $('md-ini').value = MD.ini = dts[0]; } if (!$('md-fim').value || $('md-fim').value < dts[dts.length - 1]) { $('md-fim').value = MD.fim = dts[dts.length - 1]; } }
  $('md-tot').innerHTML = n + ' selecionado(s) · <b>' + mdBrl(t) + '</b>';
}
function mdTodos() {
  var todos = MD.form.every(function (a) { return MD.sel[a.diarioEtapaId]; });
  MD.sel = {}; if (!todos) MD.form.forEach(function (a) { MD.sel[a.diarioEtapaId] = 1; });
  Array.prototype.forEach.call(document.querySelectorAll('.md-ck'), function (c) { c.checked = !!MD.sel[c.dataset.id]; });
  mdTotal();
}
function mdSalvar() {
  var ids = Object.keys(MD.sel);
  MD.ini = $('md-ini').value; MD.fim = $('md-fim').value;
  if (!MD.ini || !MD.fim) return aviso('Informe o período da medição.', 'err');
  if (!ids.length) return aviso('Marque ao menos um apontamento.', 'err');
  if (!gOnline()) return;
  var dados = { periodoInicio: MD.ini, periodoFim: MD.fim, diarioEtapaIds: ids }, b = $('md-salvar'); b.disabled = true; aviso('Salvando medição...');
  var p = MD.editId ? sys('editarMedicao', [MD.editId, dados]) : sys('criarMedicao', [MD.proj.id, dados]);
  p.then(function (r) {
    MD.lista = null; aviso(MD.editId ? 'Medição atualizada.' : 'Medição criada.', 'ok');
    var id = MD.editId || (r && (r.id || r.medicaoId)) || (typeof r === 'string' ? r : null);
    if (id) mdVer(id); else gIr('medProj');
  }).catch(function (e) { aviso(e.message, 'err'); b.disabled = false; });
}

// rotas
var _mdRota = gRotaExtra;
gRotaExtra = function (v) {
  if (v === 'medEscolher') { mdTelaEscolher(); return true; }
  if (v === 'medProj') { mdTelaLista(); return true; }
  if (v === 'medVer') { mdTelaVer(); return true; }
  if (v === 'medForm') { mdTelaForm(); return true; }
  return _mdRota(v);
};
