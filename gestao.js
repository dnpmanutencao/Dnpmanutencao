/* DNP Campo — módulo Gestão: orçamentos, catálogo, clientes, requisições e reembolsos.
   Usa o usuário do sistema vinculado ao funcionário (mesmas permissões do perfil). */
'use strict';

var G = { view: 'menu', cat: null, orcs: null, reqs: null, reembs: null, orc: null, novo: null, form: null, busca: '' };
var TIPO_ITEM = { mao_de_obra: 'Mão de obra', material: 'Material', composicao: 'Composição' };
var STATUS_ORC = ['Rascunho', 'Enviado', 'Aprovado', 'Reprovado', 'Arquivado'];

function gPode(mod, acao) { var p = S.dados && S.dados.sistema && S.dados.sistema.permissoes; return !!(p && p[mod] && p[mod][acao]); }
function gVinculado() { return !!(S.dados && S.dados.sistema && S.dados.sistema.vinculado); }
function sys(fn, args) { return api('sistema', { fn: fn, args: args || [] }); }
function brl(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function gIr(view) { G.view = view; S.tela = 'gestao'; render(); window.scrollTo(0, 0); }
function gVoltar(view) { return '<button class="btn sec" style="margin-bottom:10px" onclick="gIr(\'' + (view || 'menu') + '\')">← Voltar</button>'; }
function gOnline(msg) { if (navigator.onLine) return true; aviso(msg || 'Isso precisa de internet.', 'err'); return false; }
function gOpts(lista, sel, rot, vazio) { return (vazio ? '<option value="">' + vazio + '</option>' : '') + lista.map(function (x) { return '<option value="' + esc(x.id) + '"' + (String(x.id) === String(sel) ? ' selected' : '') + '>' + esc(rot(x)) + '</option>'; }).join(''); }

// ---------- dados de apoio (guardados no celular) ----------
function gCarregarCatalogo(forcar) {
  return DB.get('g_cat').then(function (c) {
    if (c) G.cat = c;
    if (!navigator.onLine || (c && !forcar && Date.now() - c.em < 6 * 3600000)) return G.cat;
    var pedidos = {};
    if (gPode('orcamentos', 'ver')) { pedidos.maoDeObra = sys('listarItensMaoDeObra'); pedidos.materiais = sys('listarItensMaterial'); pedidos.composicoes = sys('listarComposicoes'); }
    if (gPode('crm', 'ver')) pedidos.clientes = sys('listarClientes');
    if (gPode('requisicoes', 'ver') || gPode('financeiro', 'ver')) {
      pedidos.projetos = sys('listarProjetosParaSelecao'); pedidos.clientesSel = sys('listarClientesParaSelecao');
      pedidos.formas = sys('listarFormasPagamento'); pedidos.tiposDespesa = sys('listarTiposDespesaReembolso');
      if (!pedidos.materiais) pedidos.materiais = sys('listarItensParaSelecao');
    }
    var chaves = Object.keys(pedidos);
    return Promise.all(chaves.map(function (k) { return pedidos[k].catch(function () { return null; }); })).then(function (rs) {
      var cat = { em: Date.now() };
      chaves.forEach(function (k, i) { cat[k] = rs[i] || []; });
      if (!cat.clientes || !cat.clientes.length) cat.clientes = (cat.clientesSel || []).map(function (c) { return { id: c.id, nomeEmpresa: c.nomeEmpresa }; });
      G.cat = cat;
      return DB.set('g_cat', cat).then(function () { return cat; });
    });
  });
}
function gCat() { return G.cat || { maoDeObra: [], materiais: [], composicoes: [], clientes: [], projetos: [], formas: [], tiposDespesa: [] }; }
function gItensPorTipo(tipo) {
  var c = gCat(), l = tipo === 'material' ? c.materiais : tipo === 'composicao' ? c.composicoes : c.maoDeObra;
  return (l || []).filter(function (x) { return x.ativo !== false && x.ativo !== 'FALSE'; });
}
function gNomeCliente(id) { var c = gCat().clientes.filter(function (x) { return String(x.id) === String(id); })[0]; return c ? c.nomeEmpresa : ''; }

// ---------- tela principal ----------
function telaGestao() {
  if (!gVinculado()) { $('tela').innerHTML = '<div class="card"><h2>Gestão</h2><p class="muted">Seu acesso ainda não está vinculado a um usuário do sistema. Peça ao escritório (Frequência → App de Campo).</p></div>'; return; }
  if (!G.cat && !G._catCarregando) { G._catCarregando = true; gCarregarCatalogo(false).then(function () { G._catCarregando = false; if (!G.cat) G.cat = gCat(); render(); }).catch(function (e) { G._catCarregando = false; G.cat = G.cat || gCat(); aviso(e.message, 'err'); }); }
  var v = G.view;
  if (v === 'orcs') return gTelaOrcamentos();
  if (v === 'orc') return gTelaOrcamento();
  if (v === 'novoOrc') return gTelaNovoOrcamento();
  if (v === 'catalogo') return gTelaCatalogo();
  if (v === 'novoItem') return gTelaNovoItem();
  if (v === 'novaComp') return gTelaNovaComposicao();
  if (v === 'novoCliente') return gTelaNovoCliente();
  if (v === 'reqs') return gTelaRequisicoes();
  if (v === 'novaReq') return gTelaNovaRequisicao();
  if (v === 'reembs') return gTelaReembolsos();
  if (v === 'novoReemb') return gTelaNovoReembolso();
  var b = function (view, ic, txt, sub) { return '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'' + view + '\')">' + ic + ' ' + txt + '<small>' + sub + '</small></button>'; };
  var html = '<div class="card"><h2>Gestão</h2><p class="muted">Usuário do sistema: <b>' + esc(S.dados.sistema.usuario) + '</b>' + (G.cat && G.cat.em ? ' · dados de ' + new Date(G.cat.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</p><div class="grade">';
  if (gPode('orcamentos', 'ver')) html += b('orcs', '📄', 'Orçamentos', 'consultar, status, PDF');
  if (gPode('orcamentos', 'criar')) html += b('novoOrc', '➕', 'Novo orçamento', 'funciona sem internet');
  if (gPode('orcamentos', 'ver')) html += b('catalogo', '🧰', 'Itens e composições', 'catálogo de preços');
  if (gPode('crm', 'criar')) html += b('novoCliente', '🏢', 'Novo cliente', 'com consulta de CNPJ');
  if (gPode('requisicoes', 'ver') || gPode('financeiro', 'ver')) html += b('reqs', '🛒', 'Requisições de compra', 'acompanhar / aprovar');
  if (gPode('requisicoes', 'criar')) html += b('novaReq', '➕', 'Nova requisição', 'funciona sem internet');
  if (gPode('requisicoes', 'ver') || gPode('financeiro', 'ver')) html += b('reembs', '🧾', 'Reembolsos', 'acompanhar / pagar');
  if (gPode('requisicoes', 'criar')) html += b('novoReemb', '➕', 'Novo reembolso', 'com foto do recibo');
  html += '</div><div style="height:10px"></div><button class="btn sec" id="g-atual">⬇️ Atualizar dados (clientes, itens, obras)</button></div>';
  $('tela').innerHTML = html;
  $('g-atual').onclick = function () { if (!gOnline()) return; aviso('Atualizando...'); gCarregarCatalogo(true).then(function () { aviso('Dados atualizados.', 'ok'); render(); }).catch(function (e) { aviso(e.message, 'err'); }); };
}

// ---------- orçamentos ----------
function gTelaOrcamentos() {
  var l = G.orcs, html = gVoltar() + '<div class="card"><h2>Orçamentos</h2><input id="g-busca" placeholder="Buscar por título ou cliente" value="' + esc(G.busca) + '">';
  if (!l) html += '<p class="muted">Carregando...</p>';
  else {
    var q = G.busca.toLowerCase();
    html += '<ul class="lista">' + l.filter(function (o) { return !q || (o.titulo + ' ' + o.nomeCliente).toLowerCase().indexOf(q) >= 0; }).slice(0, 80).map(function (o) {
      return '<li style="cursor:pointer" onclick="gAbrirOrc(\'' + o.id + '\')"><span><b>' + esc(o.titulo) + '</b><br><span class="muted">' + esc(o.nomeCliente) + (o.numeroProposta ? ' · nº ' + o.numeroProposta + '/' + o.anoProposta : '') + '</span></span><span style="text-align:right"><b>' + brl(o.vendaTotal) + '</b><br><span class="tag">' + esc(o.status) + '</span></span></li>';
    }).join('') + '</ul>';
  }
  $('tela').innerHTML = html + '</div>';
  $('g-busca').oninput = function () { G.busca = this.value; var pos = this.selectionStart; gTelaOrcamentos(); var b = $('g-busca'); b.focus(); b.setSelectionRange(pos, pos); };
  if (!l) DB.get('g_orcs').then(function (c) { if (c) { G.orcs = c; gTelaOrcamentos(); } });
  if (!G._orcsCarregando && navigator.onLine) {
    G._orcsCarregando = true;
    sys('listarOrcamentos').then(function (r) { G.orcs = r; DB.set('g_orcs', r); if (G.view === 'orcs') gTelaOrcamentos(); }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { G._orcsCarregando = false; });
  }
}
function gAbrirOrc(id) {
  if (!gOnline('Abrir o orçamento precisa de internet.')) return;
  G.orc = null; gIr('orc');
  sys('obterOrcamento', [id]).then(function (o) { G.orc = o; if (G.view === 'orc') render(); }).catch(function (e) { aviso(e.message, 'err'); gIr('orcs'); });
}
function gTelaOrcamento() {
  var o = G.orc;
  if (!o) { $('tela').innerHTML = gVoltar('orcs') + '<div class="card">Carregando orçamento...</div>'; return; }
  var ed = gPode('orcamentos', 'editar'), cr = gPode('orcamentos', 'criar'), rasc = o.status === 'Rascunho';
  var html = gVoltar('orcs') + '<div class="card"><h2>' + esc(o.titulo) + '</h2><p class="muted">' + esc(o.nomeCliente) + (o.numeroProposta ? ' · Proposta nº ' + o.numeroProposta + '/' + o.anoProposta : '') + '</p>' +
    '<div class="grade" style="font-size:14px"><div><span class="muted">Custo</span><br><b>' + brl(o.custoTotal) + '</b></div><div><span class="muted">Venda</span><br><b>' + brl(o.vendaTotal) + '</b></div></div>' +
    (ed ? '<label>Status</label><select id="g-st">' + STATUS_ORC.map(function (s) { return '<option' + (s === o.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '<p>Status: <span class="tag">' + esc(o.status) + '</span></p>') +
    (ed ? '<div style="height:10px"></div><button class="btn" id="g-pdf">📄 Gerar PDF da proposta</button>' : '') +
    '<div style="height:8px"></div><button class="btn sec" id="g-props">📂 Propostas já geradas</button><div id="g-props-l"></div></div>';
  (o.etapas || []).forEach(function (e) {
    html += '<div class="card"><h2>' + esc(e.numero + ' – ' + e.nome) + ' <span class="muted" style="font-weight:400">' + brl(e.subtotalVenda) + '</span></h2><ul class="lista">' + e.itens.map(function (it) {
      return '<li><span>' + esc(it.descricao) + '<br><span class="muted">' + (TIPO_ITEM[it.tipoItem] || it.tipoItem) + ' · ' + brl(it.vendaUnitario) + '/' + esc(it.unidade || 'un') + '</span></span><span style="text-align:right;white-space:nowrap">' +
        (cr && rasc ? '<input type="number" step="any" value="' + it.quantidade + '" style="width:80px;padding:6px" onchange="gQtd(\'' + it.id + '\', this.value)"> ' + esc(it.unidade || '') + '<br><button class="btn sec" style="padding:4px 8px;font-size:12px;width:auto" onclick="gRemoverItem(\'' + it.id + '\')">remover</button>' : it.quantidade + ' ' + esc(it.unidade || '')) +
        '<br><b>' + brl(it.vendaTotal) + '</b></span></li>';
    }).join('') + '</ul>' + (cr && rasc ? '<button class="btn sec" onclick="gAddItemForm(\'' + e.id + '\')">+ Item nesta etapa</button><div id="g-add-' + e.id + '"></div>' : '') + '</div>';
  });
  if (cr && rasc) html += '<div class="card"><label>Nova etapa</label><div class="row"><input id="g-nova-et" placeholder="Nome da etapa"><button class="btn sec" style="flex:0 0 auto;width:auto" id="g-add-et">Adicionar</button></div></div>';
  if (!rasc && cr) html += '<p class="muted">Itens só podem ser alterados com o orçamento em Rascunho.</p>';
  $('tela').innerHTML = html;
  if ($('g-st')) $('g-st').onchange = function () { var st = this.value; if (!gOnline()) return; sys('atualizarStatusOrcamento', [o.id, st]).then(function () { aviso('Status alterado para ' + st + '.', 'ok'); o.status = st; G.orcs = null; render(); }).catch(function (e) { aviso(e.message, 'err'); render(); }); };
  if ($('g-pdf')) $('g-pdf').onclick = function () {
    if (!gOnline()) return; var b = this; b.disabled = true; b.textContent = 'Gerando PDF (pode levar 1 minuto)...';
    sys('gerarPropostas', [o.id]).then(function (r) { $('g-props-l').innerHTML = gLinksProposta(r); b.disabled = false; b.textContent = '📄 Gerar PDF da proposta'; aviso('Proposta Rev. ' + r.revisao + ' gerada.', 'ok'); })
      .catch(function (e) { aviso(e.message, 'err'); b.disabled = false; b.textContent = '📄 Gerar PDF da proposta'; });
  };
  $('g-props').onclick = function () { if (!gOnline()) return; $('g-props-l').innerHTML = '<p class="muted">Carregando...</p>'; sys('listarPropostasGeradas', [o.id]).then(function (l) { $('g-props-l').innerHTML = l.length ? l.map(gLinksProposta).join('') : '<p class="muted">Nenhuma proposta gerada ainda.</p>'; }).catch(function (e) { aviso(e.message, 'err'); }); };
  if ($('g-add-et')) $('g-add-et').onclick = function () { var n = $('g-nova-et').value.trim(); if (!n || !gOnline()) return; sys('criarEtapa', [o.id, { nome: n }]).then(function () { gAbrirOrc(o.id); }).catch(function (e) { aviso(e.message, 'err'); }); };
}
function gLinksProposta(r) {
  return '<div class="mdo"><b>Revisão ' + r.revisao + '</b>' + (r.criadoEm ? ' <span class="muted">' + esc(r.criadoEm) + '</span>' : '') +
    '<br><a href="' + esc(r.comercialUrl) + '" target="_blank">📄 Proposta comercial</a><br><a href="' + esc(r.tecnicaUrl) + '" target="_blank">📄 Proposta técnica</a></div>';
}
function gQtd(itemId, q) { if (!gOnline()) return; sys('editarQuantidadeItemOrcamento', [itemId, Number(q)]).then(function () { gAbrirOrc(G.orc.id); }).catch(function (e) { aviso(e.message, 'err'); }); }
function gRemoverItem(itemId) { if (!confirm('Remover este item?') || !gOnline()) return; sys('removerItemOrcamento', [itemId]).then(function () { gAbrirOrc(G.orc.id); }).catch(function (e) { aviso(e.message, 'err'); }); }
function gAddItemForm(etapaId) {
  var box = $('g-add-' + etapaId);
  box.innerHTML = '<div class="mdo"><select id="ga-tipo-' + etapaId + '">' + Object.keys(TIPO_ITEM).map(function (t) { return '<option value="' + t + '">' + TIPO_ITEM[t] + '</option>'; }).join('') + '</select>' +
    '<input id="ga-busca-' + etapaId + '" placeholder="Buscar item" style="margin-top:6px"><select id="ga-item-' + etapaId + '" style="margin-top:6px"></select>' +
    '<input id="ga-qtd-' + etapaId + '" type="number" step="any" placeholder="Quantidade" style="margin-top:6px"><div style="height:6px"></div><button class="btn" id="ga-ok-' + etapaId + '">Adicionar</button></div>';
  var preencher = function () {
    var q = $('ga-busca-' + etapaId).value.toLowerCase(), t = $('ga-tipo-' + etapaId).value;
    $('ga-item-' + etapaId).innerHTML = gOpts(gItensPorTipo(t).filter(function (x) { return !q || (x.nome + ' ' + (x.codigo || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 100), '', function (x) { return x.nome + ' (' + (x.unidade || 'un') + ') ' + brl(x.custoUnitario); }, '— escolha —');
  };
  $('ga-tipo-' + etapaId).onchange = preencher; $('ga-busca-' + etapaId).oninput = preencher; preencher();
  $('ga-ok-' + etapaId).onclick = function () {
    var ref = $('ga-item-' + etapaId).value, q = Number($('ga-qtd-' + etapaId).value);
    if (!ref || !(q > 0)) return aviso('Escolha o item e a quantidade.', 'err');
    if (!gOnline()) return;
    sys('adicionarItemOrcamento', [G.orc.id, { etapaId: etapaId, tipoItem: $('ga-tipo-' + etapaId).value, referenciaId: ref, quantidade: q }]).then(function () { gAbrirOrc(G.orc.id); }).catch(function (e) { aviso(e.message, 'err'); });
  };
}

// ---------- novo orçamento (offline) ----------
function gTelaNovoOrcamento() {
  var n = G.novo || (G.novo = { clienteId: '', novoCliente: null, titulo: '', etapas: [{ nome: 'Mão de obra', itens: [] }] });
  var c = gCat();
  var html = gVoltar() + '<div class="card"><h2>Novo orçamento</h2>' +
    '<label>Cliente</label><select id="no-cli">' + gOpts(c.clientes, n.clienteId, function (x) { return x.nomeEmpresa; }, '— escolha —') + '<option value="__novo"' + (n.novoCliente ? ' selected' : '') + '>+ Cliente novo</option></select>' +
    (n.novoCliente ? '<div class="mdo"><input id="no-nc-nome" placeholder="Nome da empresa" value="' + esc(n.novoCliente.nomeEmpresa) + '"><div class="row" style="margin-top:6px"><input id="no-nc-cid" placeholder="Cidade" value="' + esc(n.novoCliente.cidade) + '"><input id="no-nc-uf" placeholder="UF" maxlength="2" style="flex:0 0 70px" value="' + esc(n.novoCliente.estado) + '"></div></div>' : '') +
    '<label>Título</label><input id="no-tit" value="' + esc(n.titulo) + '" placeholder="Ex.: Manutenção do britador"></div>';
  n.etapas.forEach(function (e, ie) {
    html += '<div class="card"><div class="row"><input class="no-et" data-ie="' + ie + '" value="' + esc(e.nome) + '" placeholder="Nome da etapa"><button class="btn sec" style="flex:0 0 auto;width:auto" onclick="gNoRemEtapa(' + ie + ')">✕</button></div>';
    e.itens.forEach(function (it, ii) {
      var lista = gItensPorTipo(it.tipoItem);
      html += '<div class="mdo"><div class="row"><select class="no-tp" data-ie="' + ie + '" data-ii="' + ii + '">' + Object.keys(TIPO_ITEM).map(function (t) { return '<option value="' + t + '"' + (t === it.tipoItem ? ' selected' : '') + '>' + TIPO_ITEM[t] + '</option>'; }).join('') + '</select>' +
        '<button class="btn sec" style="flex:0 0 auto;width:auto" onclick="gNoRemItem(' + ie + ',' + ii + ')">✕</button></div>' +
        (it.novo ? '<input class="no-nv-nome" data-ie="' + ie + '" data-ii="' + ii + '" placeholder="Nome do item novo" value="' + esc(it.novo.nome) + '" style="margin-top:6px"><div class="row" style="margin-top:6px"><input class="no-nv-un" data-ie="' + ie + '" data-ii="' + ii + '" placeholder="Unid." value="' + esc(it.novo.unidade) + '"><input class="no-nv-custo" data-ie="' + ie + '" data-ii="' + ii + '" type="number" step="any" placeholder="Custo unit. R$" value="' + (it.novo.custoUnitario || '') + '"></div>'
          : '<select class="no-it" data-ie="' + ie + '" data-ii="' + ii + '" style="margin-top:6px">' + gOpts(lista, it.referenciaId, function (x) { return x.nome + ' (' + (x.unidade || 'un') + ') ' + brl(x.custoUnitario); }, '— escolha o item —') + (it.tipoItem !== 'composicao' ? '<option value="__novo">+ Item novo (cadastrar)</option>' : '') + '</select>') +
        '<input class="no-qt" data-ie="' + ie + '" data-ii="' + ii + '" type="number" step="any" placeholder="Quantidade" value="' + (it.quantidade || '') + '" style="margin-top:6px"></div>';
    });
    html += '<div style="height:8px"></div><button class="btn sec" onclick="gNoAddItem(' + ie + ')">+ Item</button></div>';
  });
  html += '<button class="btn sec" id="no-add-et">+ Etapa</button><div style="height:10px"></div><button class="btn lar" id="no-salvar">Salvar orçamento</button>' +
    '<p class="muted">Sem internet o orçamento fica guardado e é criado no sistema quando o sinal voltar (os preços e o BDI são os do sistema).</p>';
  $('tela').innerHTML = html;
  $('no-cli').onchange = function () { gNoLer(); if (this.value === '__novo') { n.clienteId = ''; n.novoCliente = { nomeEmpresa: '', cidade: '', estado: '' }; } else { n.clienteId = this.value; n.novoCliente = null; } render(); };
  Array.prototype.forEach.call(document.querySelectorAll('.no-tp'), function (s) { s.onchange = function () { gNoLer(); var it = n.etapas[s.dataset.ie].itens[s.dataset.ii]; it.tipoItem = s.value; it.referenciaId = ''; it.novo = null; render(); }; });
  Array.prototype.forEach.call(document.querySelectorAll('.no-it'), function (s) { s.onchange = function () { if (s.value !== '__novo') return; gNoLer(); n.etapas[s.dataset.ie].itens[s.dataset.ii].novo = { nome: '', unidade: 'un', custoUnitario: '' }; render(); }; });
  $('no-add-et').onclick = function () { gNoLer(); n.etapas.push({ nome: '', itens: [] }); render(); };
  $('no-salvar').onclick = gNoSalvar;
}
function gNoLer() {
  var n = G.novo; if (!n || !$('no-tit')) return;
  n.titulo = $('no-tit').value;
  if (n.novoCliente) n.novoCliente = { nomeEmpresa: $('no-nc-nome').value, cidade: $('no-nc-cid').value, estado: $('no-nc-uf').value.toUpperCase() };
  var q = function (cls, f) { Array.prototype.forEach.call(document.querySelectorAll('.' + cls), function (el) { f(el, n.etapas[el.dataset.ie], el.dataset.ii !== undefined ? n.etapas[el.dataset.ie].itens[el.dataset.ii] : null); }); };
  q('no-et', function (el, e) { e.nome = el.value; });
  q('no-it', function (el, e, it) { if (el.value !== '__novo') it.referenciaId = el.value; });
  q('no-qt', function (el, e, it) { it.quantidade = el.value; });
  q('no-nv-nome', function (el, e, it) { it.novo.nome = el.value; });
  q('no-nv-un', function (el, e, it) { it.novo.unidade = el.value; });
  q('no-nv-custo', function (el, e, it) { it.novo.custoUnitario = el.value; });
}
function gNoAddItem(ie) { gNoLer(); G.novo.etapas[ie].itens.push({ tipoItem: 'mao_de_obra', referenciaId: '', quantidade: '', novo: null }); render(); }
function gNoRemItem(ie, ii) { gNoLer(); G.novo.etapas[ie].itens.splice(ii, 1); render(); }
function gNoRemEtapa(ie) { gNoLer(); if (G.novo.etapas[ie].itens.length && !confirm('Remover a etapa e seus itens?')) return; G.novo.etapas.splice(ie, 1); render(); }
function gNoSalvar() {
  gNoLer(); var n = G.novo;
  if (!n.clienteId && !(n.novoCliente && n.novoCliente.nomeEmpresa.trim())) return aviso('Escolha o cliente.', 'err');
  if (!n.titulo.trim()) return aviso('Informe o título.', 'err');
  var etapas = n.etapas.filter(function (e) { return e.nome.trim(); }).map(function (e) {
    return { nome: e.nome.trim(), itens: e.itens.filter(function (it) { return Number(it.quantidade) > 0 && (it.referenciaId || (it.novo && it.novo.nome.trim())); })
      .map(function (it) { return { tipoItem: it.tipoItem, referenciaId: it.novo ? '' : it.referenciaId, quantidade: Number(it.quantidade), novo: it.novo ? { nome: it.novo.nome.trim(), unidade: it.novo.unidade || 'un', custoUnitario: Number(it.novo.custoUnitario) || 0 } : null }; }) };
  });
  var nItens = etapas.reduce(function (a, e) { return a + e.itens.length; }, 0);
  if (!confirm('Salvar o orçamento "' + n.titulo + '" com ' + etapas.length + ' etapa(s) e ' + nItens + ' item(ns)?')) return;
  enfileirar({ tipo: 'orcamentoNovo', orc: { clienteId: n.clienteId, novoCliente: n.novoCliente, titulo: n.titulo.trim(), etapas: etapas }, resumo: 'Orçamento ' + n.titulo.trim() })
    .then(function () { G.novo = null; G.orcs = null; gIr('menu'); aviso('Orçamento salvo' + (navigator.onLine ? ' e enviado.' : '. Será enviado quando tiver internet.'), 'ok'); });
}

// ---------- catálogo ----------
function gTelaCatalogo() {
  var c = gCat(), q = G.busca.toLowerCase(), aba = G.catAba || 'mao_de_obra';
  var lista = gItensPorTipo(aba).filter(function (x) { return !q || (x.nome + ' ' + (x.codigo || '')).toLowerCase().indexOf(q) >= 0; });
  var html = gVoltar() + '<div class="card"><h2>Itens e composições</h2><div class="row">' + Object.keys(TIPO_ITEM).map(function (t) { return '<button class="btn ' + (t === aba ? '' : 'sec') + '" style="padding:8px 4px;font-size:13px" onclick="G.catAba=\'' + t + '\';render()">' + TIPO_ITEM[t] + '</button>'; }).join('') + '</div>' +
    '<input id="g-busca" placeholder="Buscar" value="' + esc(G.busca) + '" style="margin-top:8px">' +
    (gPode('orcamentos', 'criar') ? '<div style="height:8px"></div><button class="btn lar" onclick="' + (aba === 'composicao' ? 'G.form=null;gIr(\'novaComp\')' : 'G.form={tipo:\'' + aba + '\'};gIr(\'novoItem\')') + '">+ ' + (aba === 'composicao' ? 'Nova composição' : 'Novo item') + '</button>' : '') +
    '<ul class="lista">' + lista.slice(0, 150).map(function (x) { return '<li><span>' + esc(x.nome) + '<br><span class="muted">' + esc(x.codigo || '') + ' · ' + esc(x.unidade || 'un') + '</span></span><b>' + brl(x.custoUnitario) + '</b></li>'; }).join('') + '</ul>' +
    (lista.length > 150 ? '<p class="muted">Mostrando 150 de ' + lista.length + '. Use a busca.</p>' : '') + '</div>';
  $('tela').innerHTML = html;
  $('g-busca').oninput = function () { G.busca = this.value; var pos = this.selectionStart; render(); var b = $('g-busca'); b.focus(); b.setSelectionRange(pos, pos); };
}
function gTelaNovoItem() {
  var f = G.form || (G.form = { tipo: 'mao_de_obra' });
  $('tela').innerHTML = gVoltar('catalogo') + '<div class="card"><h2>Novo item</h2><label>Tipo</label><select id="ni-tipo"><option value="mao_de_obra"' + (f.tipo === 'mao_de_obra' ? ' selected' : '') + '>Mão de obra</option><option value="material"' + (f.tipo === 'material' ? ' selected' : '') + '>Material</option></select>' +
    '<label>Nome</label><input id="ni-nome"><div class="row"><div><label>Unidade</label><input id="ni-un" value="' + (f.tipo === 'mao_de_obra' ? 'H' : 'un') + '"></div><div><label>Custo unitário (R$)</label><input id="ni-custo" type="number" step="any"></div></div>' +
    '<div style="height:12px"></div><button class="btn lar" id="ni-ok">Salvar item</button></div>';
  $('ni-ok').onclick = function () {
    var tipo = $('ni-tipo').value, d = { nome: $('ni-nome').value.trim(), unidade: $('ni-un').value.trim() || 'un', custoUnitario: Number($('ni-custo').value) || 0 };
    if (!d.nome) return aviso('Informe o nome.', 'err');
    var fn = tipo === 'material' ? 'criarItemMaterial' : 'criarItemMaoDeObra';
    gLocalAddItem(tipo, d);
    enfileirar({ tipo: 'sistema', fn: fn, args: [d], resumo: TIPO_ITEM[tipo] + ': ' + d.nome }).then(function () { G.catAba = tipo; gIr('catalogo'); aviso('Item salvo.', 'ok'); });
  };
}
function gLocalAddItem(tipo, d) { // aparece na lista já (sem id até sincronizar)
  var c = gCat(), k = tipo === 'material' ? 'materiais' : tipo === 'composicao' ? 'composicoes' : 'maoDeObra';
  (c[k] = c[k] || []).push({ id: '', codigo: 'novo', nome: d.nome + ' (aguardando envio)', unidade: d.unidade, custoUnitario: d.custoUnitario || 0, ativo: false });
}
function gTelaNovaComposicao() {
  var f = G.form || (G.form = { nome: '', unidade: 'un', descricao: '', itens: [] });
  var html = gVoltar('catalogo') + '<div class="card"><h2>Nova composição</h2><label>Nome</label><input id="nc-nome" value="' + esc(f.nome) + '">' +
    '<div class="row"><div><label>Unidade</label><input id="nc-un" value="' + esc(f.unidade) + '"></div></div><label>Descrição</label><textarea id="nc-desc">' + esc(f.descricao) + '</textarea></div><div class="card"><h2>Itens da composição</h2>';
  f.itens.forEach(function (it, i) {
    html += '<div class="mdo"><div class="row"><select class="nc-tp" data-i="' + i + '"><option value="mao_de_obra"' + (it.tipoItem === 'mao_de_obra' ? ' selected' : '') + '>Mão de obra</option><option value="material"' + (it.tipoItem === 'material' ? ' selected' : '') + '>Material</option></select><button class="btn sec" style="flex:0 0 auto;width:auto" onclick="gNcLer();G.form.itens.splice(' + i + ',1);render()">✕</button></div>' +
      '<select class="nc-it" data-i="' + i + '" style="margin-top:6px">' + gOpts(gItensPorTipo(it.tipoItem), it.itemId, function (x) { return x.nome + ' (' + (x.unidade || 'un') + ') ' + brl(x.custoUnitario); }, '— escolha —') + '</select>' +
      '<input class="nc-qt" data-i="' + i + '" type="number" step="any" placeholder="Quantidade" value="' + (it.quantidade || '') + '" style="margin-top:6px"></div>';
  });
  html += '<div style="height:8px"></div><button class="btn sec" id="nc-add">+ Item</button></div><button class="btn lar" id="nc-ok">Salvar composição</button>';
  $('tela').innerHTML = html;
  Array.prototype.forEach.call(document.querySelectorAll('.nc-tp'), function (s) { s.onchange = function () { gNcLer(); f.itens[s.dataset.i] = { tipoItem: s.value, itemId: '', quantidade: f.itens[s.dataset.i].quantidade }; render(); }; });
  $('nc-add').onclick = function () { gNcLer(); f.itens.push({ tipoItem: 'material', itemId: '', quantidade: '' }); render(); };
  $('nc-ok').onclick = function () {
    gNcLer();
    if (!f.nome.trim()) return aviso('Informe o nome.', 'err');
    var itens = f.itens.filter(function (it) { return it.itemId && Number(it.quantidade) > 0; }).map(function (it) { return { tipoItem: it.tipoItem, itemId: it.itemId, quantidade: Number(it.quantidade) }; });
    gLocalAddItem('composicao', { nome: f.nome, unidade: f.unidade });
    enfileirar({ tipo: 'composicaoNova', comp: { nome: f.nome.trim(), unidade: f.unidade || 'un', descricao: f.descricao, itens: itens }, resumo: 'Composição ' + f.nome.trim() })
      .then(function () { G.form = null; G.catAba = 'composicao'; gIr('catalogo'); aviso('Composição salva.', 'ok'); });
  };
}
function gNcLer() {
  var f = G.form; if (!$('nc-nome')) return;
  f.nome = $('nc-nome').value; f.unidade = $('nc-un').value; f.descricao = $('nc-desc').value;
  Array.prototype.forEach.call(document.querySelectorAll('.nc-it'), function (s) { f.itens[s.dataset.i].itemId = s.value; });
  Array.prototype.forEach.call(document.querySelectorAll('.nc-qt'), function (s) { f.itens[s.dataset.i].quantidade = s.value; });
}

// ---------- clientes ----------
function gTelaNovoCliente() {
  $('tela').innerHTML = gVoltar() + '<div class="card"><h2>Novo cliente</h2><label>CNPJ (opcional)</label><div class="row"><input id="ncl-cnpj" inputmode="numeric" placeholder="00.000.000/0000-00"><button class="btn sec" style="flex:0 0 auto;width:auto" id="ncl-cons">Consultar</button></div>' +
    '<label>Nome da empresa</label><input id="ncl-nome"><div class="row"><div><label>Cidade</label><input id="ncl-cid"></div><div style="flex:0 0 80px"><label>UF</label><input id="ncl-uf" maxlength="2"></div></div>' +
    '<label>Status</label><select id="ncl-st"><option>Prospecto</option><option>Ativo</option></select><div style="height:12px"></div><button class="btn lar" id="ncl-ok">Salvar cliente</button></div>';
  $('ncl-cons').onclick = function () {
    if (!gOnline('A consulta de CNPJ precisa de internet.')) return;
    sys('consultarCnpj', [$('ncl-cnpj').value]).then(function (r) { $('ncl-nome').value = r.nomeEmpresa; $('ncl-cid').value = r.cidade; $('ncl-uf').value = r.estado; aviso('Situação: ' + (r.situacao || '—'), 'ok'); }).catch(function (e) { aviso(e.message, 'err'); });
  };
  $('ncl-ok').onclick = function () {
    var d = { cnpj: $('ncl-cnpj').value, nomeEmpresa: $('ncl-nome').value.trim(), cidade: $('ncl-cid').value.trim(), estado: $('ncl-uf').value.trim().toUpperCase(), status: $('ncl-st').value };
    if (!d.nomeEmpresa) return aviso('Informe o nome da empresa.', 'err');
    gCat().clientes.push({ id: '', nomeEmpresa: d.nomeEmpresa + ' (aguardando envio)' });
    enfileirar({ tipo: 'sistema', fn: 'criarCliente', args: [d], resumo: 'Cliente ' + d.nomeEmpresa }).then(function () { gIr('menu'); aviso('Cliente salvo.', 'ok'); });
  };
}

// ---------- requisições de compra ----------
function gTelaRequisicoes() {
  var l = G.reqs, ger = gPode('requisicoes', 'editar') || gPode('financeiro', 'editar');
  var html = gVoltar() + '<div class="card"><h2>Requisições de compra</h2>' + (gPode('requisicoes', 'criar') ? '<button class="btn lar" onclick="gIr(\'novaReq\')">+ Nova requisição</button>' : '');
  if (!l) html += '<p class="muted">Carregando...</p>';
  else html += '<ul class="lista">' + l.slice(0, 60).map(function (r, i) {
    var cls = r.status === 'Pago' ? 'ok' : r.status === 'Ciente' ? '' : 'pend';
    return '<li><span><b>nº ' + r.numero + '</b> ' + esc(r.descricao) + '<br><span class="muted">' + esc(r.nomeProjeto || r.nomeCliente || '') + ' · ' + r.quantidade + ' ' + esc(r.unidade || '') + ' · ' + dataBr(r.data || '') + '<br>' + esc(r.nomeSolicitante) + '</span></span>' +
      '<span style="text-align:right"><b>' + brl(r.valorEstimado) + '</b><br><span class="tag ' + cls + '">' + esc(r.status) + '</span>' +
      (ger && r.status === 'Pendente' ? '<br><button class="btn sec" style="padding:4px 8px;font-size:12px;width:auto;margin-top:4px" onclick="gReqCiente(' + i + ')">Dar ciência</button>' : '') +
      (ger && r.status === 'Ciente' ? '<br><button class="btn sec" style="padding:4px 8px;font-size:12px;width:auto;margin-top:4px" onclick="gReqPagar(' + i + ')">Marcar paga</button>' : '') + '</span></li>';
  }).join('') + '</ul>';
  $('tela').innerHTML = html + '</div>';
  if (!l) DB.get('g_reqs').then(function (c) { if (c && G.view === 'reqs') { G.reqs = c; gTelaRequisicoes(); } });
  if (!G._reqsCarregando && navigator.onLine) { G._reqsCarregando = true; sys('listarRequisicoesCompra').then(function (r) { G.reqs = r; DB.set('g_reqs', r); if (G.view === 'reqs') gTelaRequisicoes(); }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { G._reqsCarregando = false; }); }
}
function gReqCiente(i) { var r = G.reqs[i]; if (!gOnline() || !confirm('Dar ciência na requisição nº ' + r.numero + '?')) return; sys('marcarRequisicaoCompraCiente', [r.id]).then(function () { aviso('Ciência registrada.', 'ok'); G.reqs = null; gTelaRequisicoes(); }).catch(function (e) { aviso(e.message, 'err'); }); }
function gReqPagar(i) {
  var r = G.reqs[i]; if (!gOnline()) return;
  var formas = gCat().formas || ['Pix', 'Boleto', 'Dinheiro', 'Cartão', 'Transferência'];
  var forma = prompt('Forma de pagamento da requisição nº ' + r.numero + ' (' + brl(r.valorEstimado) + '):\n' + formas.join(', '), formas[0]); if (!forma) return;
  forma = formas.filter(function (f) { return f.toLowerCase() === forma.trim().toLowerCase(); })[0]; if (!forma) return aviso('Forma de pagamento inválida.', 'err');
  var parc = prompt('Número de parcelas:', '1'); if (!parc) return;
  sys('marcarRequisicaoCompraPaga', [r.id, { formaPagamento: forma, numeroParcelas: Number(parc) || 1 }]).then(function () { aviso('Requisição marcada como paga (lançada no Financeiro).', 'ok'); G.reqs = null; gTelaRequisicoes(); }).catch(function (e) { aviso(e.message, 'err'); });
}
function gDestinoHtml(pref, d, opcoes) {
  var c = gCat();
  return '<label>Destino</label><select id="' + pref + '-dest">' + opcoes.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === d ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
    (d === 'Projeto' ? '<label>Obra</label><select id="' + pref + '-proj">' + gOpts(c.projetos || [], S.obraId, function (x) { return x.titulo; }, '— escolha a obra —') + '</select>' : '') +
    (d === 'VisitaTecnica' ? '<label>Cliente</label><select id="' + pref + '-cli">' + gOpts(c.clientesSel && c.clientesSel.length ? c.clientesSel : c.clientes, '', function (x) { return x.nomeEmpresa; }, '— escolha o cliente —') + '</select>' : '');
}
function gTelaNovaRequisicao() {
  var f = G.form && G.form._t === 'req' ? G.form : (G.form = { _t: 'req', dest: 'Projeto' });
  $('tela').innerHTML = gVoltar('reqs') + '<div class="card"><h2>Nova requisição de compra</h2>' + gDestinoHtml('rq', f.dest, [['Projeto', 'Obra'], ['VisitaTecnica', 'Visita técnica']]) +
    '<label>Item do cadastro (opcional)</label><select id="rq-item">' + gOpts(gItensPorTipo('material'), '', function (x) { return x.nome + ' (' + (x.unidade || 'un') + ')'; }, '— nenhum / descrever abaixo —') + '</select>' +
    '<label>O que precisa ser comprado</label><input id="rq-desc"><div class="row"><div><label>Quantidade</label><input id="rq-qtd" type="number" step="any"></div><div><label>Unidade</label><input id="rq-un" value="un"></div></div>' +
    '<div class="row"><div><label>Valor estimado (R$)</label><input id="rq-valor" type="number" step="any"></div><div><label>Data</label><input id="rq-data" type="date" value="' + dataIso(Date.now()) + '"></div></div>' +
    '<label>Observações</label><textarea id="rq-obs"></textarea><div style="height:12px"></div><button class="btn lar" id="rq-ok">Enviar requisição</button></div>';
  $('rq-dest').onchange = function () { f.dest = this.value; render(); };
  $('rq-item').onchange = function () { var it = gItensPorTipo('material').filter(function (x) { return String(x.id) === $('rq-item').value; })[0]; if (it) { $('rq-desc').value = it.nome; $('rq-un').value = it.unidade || 'un'; } };
  $('rq-ok').onclick = function () {
    var d = { tipoDestino: f.dest, projetoId: $('rq-proj') ? $('rq-proj').value : '', clienteId: $('rq-cli') ? $('rq-cli').value : '', itemId: $('rq-item').value,
      descricao: $('rq-desc').value.trim(), quantidade: Number($('rq-qtd').value), unidade: $('rq-un').value || 'un', valorEstimado: Number($('rq-valor').value), data: $('rq-data').value, observacoes: $('rq-obs').value };
    if (d.tipoDestino === 'Projeto' && !d.projetoId) return aviso('Escolha a obra.', 'err');
    if (d.tipoDestino === 'VisitaTecnica' && !d.clienteId) return aviso('Escolha o cliente.', 'err');
    if (!d.descricao || !(d.quantidade > 0) || !(d.valorEstimado > 0) || !d.data) return aviso('Preencha descrição, quantidade, valor e data.', 'err');
    enfileirar({ tipo: 'sistema', fn: 'criarRequisicaoCompra', args: [d], resumo: 'Requisição: ' + d.descricao }).then(function () { G.form = null; G.reqs = null; gIr('reqs'); aviso('Requisição ' + (navigator.onLine ? 'enviada.' : 'salva. Será enviada quando tiver internet.'), 'ok'); });
  };
}

// ---------- reembolsos ----------
function gTelaReembolsos() {
  var l = G.reembs, ger = gPode('requisicoes', 'editar') || gPode('financeiro', 'editar');
  var html = gVoltar() + '<div class="card"><h2>Reembolsos</h2>' + (gPode('requisicoes', 'criar') ? '<button class="btn lar" onclick="gIr(\'novoReemb\')">+ Novo reembolso</button>' : '');
  if (!l) html += '<p class="muted">Carregando...</p>';
  else html += '<ul class="lista">' + l.slice(0, 60).map(function (r, i) {
    var comp = (String(r.observacoes || '').match(/https:\/\/drive\.google\.com\/file\/d\/[^\s]+/) || [])[0];
    return '<li><span><b>nº ' + r.numero + '</b> ' + esc(r.descricao) + '<br><span class="muted">' + esc(r.rotuloTipoDespesa) + ' · ' + esc(r.nomeProjeto || r.nomeCliente || r.tipoDestino) + ' · ' + dataBr(r.data || '') + '<br>' + esc(r.nomeResponsavel) + '</span>' + (comp ? '<br><a href="' + comp + '" target="_blank">🧾 comprovante</a>' : '') + '</span>' +
      '<span style="text-align:right"><b>' + brl(r.valor) + '</b><br><span class="tag ' + (r.status === 'Pago' ? 'ok' : 'pend') + '">' + esc(r.status) + '</span>' +
      (ger && r.status === 'Aberto' ? '<br><button class="btn sec" style="padding:4px 8px;font-size:12px;width:auto;margin-top:4px" onclick="gReembPagar(' + i + ')">Marcar pago</button>' : '') + '</span></li>';
  }).join('') + '</ul>';
  $('tela').innerHTML = html + '</div>';
  if (!l) DB.get('g_reembs').then(function (c) { if (c && G.view === 'reembs') { G.reembs = c; gTelaReembolsos(); } });
  if (!G._rbCarregando && navigator.onLine) { G._rbCarregando = true; sys('listarReembolsos').then(function (r) { G.reembs = r; DB.set('g_reembs', r); if (G.view === 'reembs') gTelaReembolsos(); }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { G._rbCarregando = false; }); }
}
function gReembPagar(i) { var r = G.reembs[i]; if (!gOnline() || !confirm('Marcar o reembolso nº ' + r.numero + ' (' + brl(r.valor) + ') como pago?')) return; sys('marcarReembolsoPago', [r.id]).then(function () { aviso('Reembolso pago.', 'ok'); G.reembs = null; gTelaReembolsos(); }).catch(function (e) { aviso(e.message, 'err'); }); }
function gTelaNovoReembolso() {
  var f = G.form && G.form._t === 'rb' ? G.form : (G.form = { _t: 'rb', dest: 'Projeto', foto: '' });
  var c = gCat(), tipos = c.tiposDespesa && c.tiposDespesa.length ? c.tiposDespesa : [{ valor: 'Combustivel', rotulo: 'Combustível' }, { valor: 'Pedagio', rotulo: 'Pedágio' }, { valor: 'Refeicao', rotulo: 'Refeição' }, { valor: 'Outro', rotulo: 'Outro' }];
  var formas = c.formas && c.formas.length ? c.formas : ['Pix', 'Boleto', 'Dinheiro', 'Cartão', 'Transferência'];
  $('tela').innerHTML = gVoltar('reembs') + '<div class="card"><h2>Novo reembolso</h2>' + gDestinoHtml('rb', f.dest, [['Projeto', 'Obra'], ['VisitaTecnica', 'Visita técnica'], ['Administrativo', 'Administrativo']]) +
    '<label>Tipo de despesa</label><select id="rb-tipo">' + tipos.map(function (t) { return '<option value="' + t.valor + '">' + esc(t.rotulo) + '</option>'; }).join('') + '</select>' +
    '<div class="row"><div><label>Valor (R$)</label><input id="rb-valor" type="number" step="any"></div><div><label>Data</label><input id="rb-data" type="date" value="' + dataIso(Date.now()) + '"></div></div>' +
    '<label>Forma de pagamento</label><select id="rb-forma">' + formas.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select>' +
    '<label>Descrição (opcional)</label><input id="rb-desc"><label>Observações</label><textarea id="rb-obs"></textarea>' +
    '<label>Foto do recibo / nota</label><button class="btn sec" id="rb-foto">' + (f.foto ? '✅ Foto adicionada (trocar)' : '📷 Tirar/escolher foto') + '</button>' + (f.foto ? '<div class="fotos"><img src="' + f.foto + '"></div>' : '') +
    '<div style="height:12px"></div><button class="btn lar" id="rb-ok">Enviar reembolso</button></div>';
  $('rb-dest').onchange = function () { f.dest = this.value; render(); };
  $('rb-foto').onclick = function () { tirarFoto('galeria').then(function (a) { return a.length ? lerFoto(a[0], 1400, 0.65) : ''; }).then(function (x) { if (x) { f.foto = x; render(); } }); };
  $('rb-ok').onclick = function () {
    var d = { tipoDestino: f.dest, projetoId: $('rb-proj') ? $('rb-proj').value : '', clienteId: $('rb-cli') ? $('rb-cli').value : '', tipoDespesa: $('rb-tipo').value,
      valor: Number($('rb-valor').value), data: $('rb-data').value, formaPagamento: $('rb-forma').value, descricao: $('rb-desc').value.trim(), observacoes: $('rb-obs').value, foto: f.foto || '' };
    if (d.tipoDestino === 'Projeto' && !d.projetoId) return aviso('Escolha a obra.', 'err');
    if (d.tipoDestino === 'VisitaTecnica' && !d.clienteId) return aviso('Escolha o cliente.', 'err');
    if (!(d.valor > 0) || !d.data) return aviso('Informe valor e data.', 'err');
    if (!d.foto && !confirm('Enviar sem foto do comprovante?')) return;
    enfileirar({ tipo: 'sistema', fn: 'criarReembolso', args: [d], resumo: 'Reembolso ' + brl(d.valor) }).then(function () { G.form = null; G.reembs = null; gIr('reembs'); aviso('Reembolso ' + (navigator.onLine ? 'enviado.' : 'salvo. Será enviado quando tiver internet.'), 'ok'); });
  };
}
