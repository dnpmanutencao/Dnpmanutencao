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
function gIr(view) { if (view === 'orcs') G._orcsOk = false; if (view === 'projs') G.projs = null; G.view = view; S.tela = 'gestao'; render(); window.scrollTo(0, 0); }
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
  if (v === 'comp') return gTelaComp();
  if (v === 'insps') return gTelaInsps();
  if (v === 'insp') return gTelaInsp();
  if (v === 'inspItem') return gTelaInspItem();
  if (v === 'bdi') return gTelaBdi();
  if (v === 'novoItem') return gTelaNovoItem();
  if (v === 'novaComp') return gTelaNovaComposicao();
  if (v === 'novoCliente') return gTelaNovoCliente();
  if (v === 'reqs') return gTelaRequisicoes();
  if (v === 'novaReq') return gTelaNovaRequisicao();
  if (v === 'reembs') return gTelaReembolsos();
  if (v === 'projs') return gTelaProjetos();
  if (v === 'novoReemb') return gTelaNovoReembolso();
  var b = function (view, ic, txt, sub) { return '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'' + view + '\')">' + ic + ' ' + txt + '<small>' + sub + '</small></button>'; };
  var html = '<div class="card"><h2>Gestão</h2><p class="muted">Usuário do sistema: <b>' + esc(S.dados.sistema.usuario) + '</b>' + (G.cat && G.cat.em ? ' · dados de ' + new Date(G.cat.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</p><div class="grade">';
  html += b('insps', '🔎', 'Inspeções', 'relatório com fotos, sem internet');
  if (gPode('orcamentos', 'ver')) html += b('orcs', '📄', 'Orçamentos', 'consultar, status, PDF');
  if (gPode('orcamentos', 'criar')) html += b('novoOrc', '➕', 'Novo orçamento', 'funciona sem internet');
  if (gPode('orcamentos', 'ver')) html += b('catalogo', '🧰', 'Itens e composições', 'catálogo de preços');
  if (gPode('orcamentos', 'ver')) html += b('bdi', '％', 'BDI padrão', 'imposto, taxas, lucro');
  if (gPode('crm', 'criar')) html += b('novoCliente', '🏢', 'Novo cliente', 'com consulta de CNPJ');
  if (gPode('projetos', 'ver')) html += b('projs', '🏗️', 'Obras / projetos', 'status: colocar em execução');
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
  var l = G.orcs, html = gVoltar() + '<div class="card"><h2>Orçamentos</h2>' + (gPode('orcamentos', 'criar') ? '<button class="btn lar" onclick="G.novo=null;gIr(\'novoOrc\')">+ Novo orçamento</button><div style="height:8px"></div>' : '') +
    '<input id="g-busca" placeholder="Buscar por título ou cliente" value="' + esc(G.busca) + '"><div class="row" style="margin-top:6px"><select id="g-fst"><option value="">Todos os status</option>' + STATUS_ORC.map(function (s) { return '<option' + (G.fst === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>';
  if (!l) html += '<p class="muted">Carregando...</p>';
  else {
    var q = G.busca.toLowerCase();
    html += '<ul class="lista">' + l.filter(function (o) { return (!q || (o.titulo + ' ' + o.nomeCliente).toLowerCase().indexOf(q) >= 0) && (!G.fst || o.status === G.fst); }).slice(0, 80).map(function (o) {
      return '<li style="cursor:pointer" onclick="gAbrirOrc(\'' + o.id + '\')"><span><b>' + esc(o.titulo) + '</b><br><span class="muted">' + esc(o.nomeCliente) + (o.numeroProposta ? ' · nº ' + o.numeroProposta + '/' + o.anoProposta : '') + '</span></span><span style="text-align:right"><b>' + brl(o.vendaTotal) + '</b><br><span class="tag">' + esc(o.status) + '</span></span></li>';
    }).join('') + '</ul>';
  }
  $('tela').innerHTML = html + '</div>';
  $('g-busca').oninput = function () { G.busca = this.value; var pos = this.selectionStart; gTelaOrcamentos(); var b = $('g-busca'); b.focus(); b.setSelectionRange(pos, pos); };
  $('g-fst').onchange = function () { G.fst = this.value; gTelaOrcamentos(); };
  if (!l) DB.get('g_orcs').then(function (c) { if (c && !G.orcs) { G.orcs = c; if (G.view === 'orcs') gTelaOrcamentos(); } });
  if (!G._orcsCarregando && navigator.onLine && !G._orcsOk) {
    G._orcsCarregando = true;
    sys('listarOrcamentos').then(function (r) { G.orcs = r; G._orcsOk = true; DB.set('g_orcs', r); if (G.view === 'orcs') gTelaOrcamentos(); }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { G._orcsCarregando = false; });
  }
}
function gRecarregarLista() { G._orcsOk = false; G.orcs = null; }
function gAbrirOrc(id) {
  if (!gOnline('Abrir o orçamento precisa de internet.')) return;
  if (!G.orc || G.orc.id !== id) G.orc = null;
  gIr('orc');
  sys('obterOrcamento', [id]).then(function (o) { G.orc = o; if (G.view === 'orc') render(); }).catch(function (e) { aviso(e.message, 'err'); gIr('orcs'); });
}
function gAcao(fn, args, msg, depois) { // chamada on-line com aviso e recarga do orçamento
  if (!gOnline()) return Promise.resolve();
  aviso('Salvando...');
  return sys(fn, args).then(function (r) { if (msg) aviso(msg, 'ok'); gRecarregarLista(); if (depois) depois(r); else if (G.orc) gAbrirOrc(G.orc.id); return r; })
    .catch(function (e) { aviso(e.message, 'err'); });
}
function gSec(id, titulo, corpo, aberta) {
  var ab = G.secs[id] !== undefined ? G.secs[id] : !!aberta;
  return '<div class="card"><h2 style="cursor:pointer;margin-bottom:' + (ab ? '10px' : '0') + '" onclick="G.secs[\'' + id + '\']=' + (!ab) + ';render()">' + (ab ? '▾ ' : '▸ ') + titulo + '</h2>' + (ab ? corpo : '') + '</div>';
}
G.secs = {};
function gTelaOrcamento() {
  var o = G.orc;
  if (!o) { $('tela').innerHTML = gVoltar('orcs') + '<div class="card">Carregando orçamento...</div>'; return; }
  var ed = gPode('orcamentos', 'editar'), cr = gPode('orcamentos', 'criar'), ex = gPode('orcamentos', 'excluir'), rasc = o.status === 'Rascunho', c = gCat();
  var dis = ed ? '' : ' disabled';
  var html = gVoltar('orcs') + '<div class="card"><h2>' + esc(o.titulo) + '</h2><p class="muted">' + esc(o.nomeCliente) + (o.numeroProposta ? ' · Proposta nº ' + o.numeroProposta + '/' + o.anoProposta : '') + '</p>' +
    '<div class="grade" style="font-size:14px"><div><span class="muted">Custo</span><br><b>' + brl(o.custoTotal) + '</b></div><div><span class="muted">Venda</span><br><b>' + brl(o.vendaTotal) + '</b></div>' +
    '<div><span class="muted">Imposto</span><br>' + brl(o.valorImposto) + '</div><div><span class="muted">Taxa adm.</span><br>' + brl(o.valorTaxaAdm) + '</div>' +
    '<div><span class="muted">Taxa eng.</span><br>' + brl(o.valorTaxaEng) + '</div><div><span class="muted">Lucro</span><br>' + brl(o.valorLucro) + '</div></div>' +
    (ed ? '<label>Status</label><select id="g-st">' + STATUS_ORC.map(function (s) { return '<option' + (s === o.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '<p>Status: <span class="tag">' + esc(o.status) + '</span></p>') +
    (ed ? '<div style="height:10px"></div><button class="btn" id="g-pdf">📄 Gerar PDF da proposta</button>' : '') +
    '<div style="height:8px"></div><button class="btn sec" id="g-props">📂 Propostas já geradas</button><div id="g-props-l"></div>' +
    '<div class="row" style="margin-top:8px">' + (cr ? '<button class="btn sec" id="g-dup">⧉ Duplicar</button>' : '') + (ex ? '<button class="btn sec" id="g-exc" style="color:#b91c1c">🗑 Excluir</button>' : '') + '</div>' +
    (o.status === 'Aprovado' && gPode('projetos', 'criar') ? '<div style="height:8px"></div><button class="btn lar" id="g-conv">🏗 Converter em projeto</button><div id="g-conv-f"></div>' : '') + '</div>';

  html += gSec('dados', 'Dados do orçamento', '<label>Cliente</label><select id="od-cli"' + dis + '>' + gOpts(c.clientes, o.clienteId, function (x) { return x.nomeEmpresa; }, '— escolha —') + '</select>' +
    '<label>Título</label><input id="od-tit" value="' + esc(o.titulo) + '"' + dis + '>' + (ed ? '<div style="height:10px"></div><button class="btn sec" id="od-ok">Salvar dados</button>' : ''));

  html += gSec('cond', 'Escopo e condições comerciais', '<label>Escopo</label><select id="oc-tipo"' + dis + '><option value="tabela"' + (o.escopoTipo !== 'manual' ? ' selected' : '') + '>Copiar tabela do orçamento (sem valores)</option><option value="manual"' + (o.escopoTipo === 'manual' ? ' selected' : '') + '>Escrever manualmente</option></select>' +
    '<textarea id="oc-texto" rows="6" placeholder="' + (o.escopoTipo === 'manual' ? 'Descreva o escopo do fornecimento...' : 'Observações (opcional) — a tabela de itens sem valores entra automaticamente.') + '"' + dis + '>' + esc(o.escopoTexto) + '</textarea>' +
    '<label>Forma de pagamento</label><input id="oc-pag" placeholder="Ex: 30 DDL ao final do aceite" value="' + esc(o.formaPagamento) + '"' + dis + '>' +
    '<div class="row"><div><label>Prazo de execução</label><input id="oc-prazo" placeholder="Ex: 15 dias úteis" value="' + esc(o.prazoExecucao) + '"' + dis + '></div><div style="flex:0 0 110px"><label>Validade (dias)</label><input id="oc-val" type="number" min="1" value="' + esc(o.validadeProposta) + '"' + dis + '></div></div>' +
    '<label>Exclusões</label><textarea id="oc-exc" rows="4" placeholder="Uma exclusão por linha"' + dis + '>' + esc(o.exclusoes) + '</textarea>' +
    (ed ? '<div style="height:10px"></div><button class="btn lar" id="oc-ok">Salvar escopo e condições</button>' : ''), true);

  var itensHtml = '';
  (o.etapas || []).forEach(function (e) {
    itensHtml += '<div class="mdo"><div class="row"><b style="flex:1">' + esc(e.numero + ' – ' + e.nome) + '</b><span class="muted" style="flex:0 0 auto">' + brl(e.subtotalVenda) + '</span></div>' +
      (ed && rasc ? '<div class="row" style="margin-top:6px"><button class="btn sec" style="padding:4px 8px;font-size:12px" onclick="gEtapaRenomear(\'' + e.id + '\')">✏️ Renomear</button><button class="btn sec" style="padding:4px 8px;font-size:12px" onclick="gEtapaRemover(\'' + e.id + '\')">🗑 Remover etapa</button></div>' : '') +
      '<ul class="lista">' + e.itens.map(function (it) {
        var podeIt = cr && rasc;
        return '<li style="flex-wrap:wrap"><span style="flex:1 1 100%">' + esc(it.descricao) + '<br><span class="muted">' + (TIPO_ITEM[it.tipoItem] || it.tipoItem) + ' · custo ' + brl(it.custoUnitario) + (it.custoPersonalizado ? ' (personalizado)' : '') + ' · BDI ' + (Number(it.bdi) * 100).toFixed(2).replace('.', ',') + '%' + (it.personalizado ? ' (personalizado)' : '') + ' · venda ' + brl(it.vendaUnitario) + '/' + esc(it.unidade || 'un') + '</span></span>' +
          '<span style="flex:1 1 100%;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px">' +
          (podeIt ? 'Qtd <input type="number" step="any" value="' + it.quantidade + '" style="width:80px;padding:6px" onchange="gQtd(\'' + it.id + '\', this.value)"> ' + esc(it.unidade || '') : it.quantidade + ' ' + esc(it.unidade || '')) +
          '<b style="margin-left:auto">' + brl(it.vendaTotal) + '</b></span>' +
          (podeIt && ed ? '<span style="flex:1 1 100%;display:flex;gap:6px;margin-top:4px"><button class="btn sec" style="padding:4px 6px;font-size:12px" onclick="gCustoItem(\'' + it.id + '\',' + it.custoUnitario + ',' + !!it.custoPersonalizado + ')">Custo</button><button class="btn sec" style="padding:4px 6px;font-size:12px" onclick="gBdiItem(\'' + it.id + '\')">BDI</button><button class="btn sec" style="padding:4px 6px;font-size:12px" onclick="gRemoverItem(\'' + it.id + '\')">Remover</button></span>' : podeIt ? '<span style="flex:1 1 100%;margin-top:4px"><button class="btn sec" style="padding:4px 6px;font-size:12px;width:auto" onclick="gRemoverItem(\'' + it.id + '\')">Remover</button></span>' : '') + '</li>';
      }).join('') + '</ul>' + (cr && rasc ? '<button class="btn sec" onclick="gAddItemForm(\'' + e.id + '\')">+ Item nesta etapa</button><div id="g-add-' + e.id + '"></div>' : '') + '</div>';
  });
  if (cr && rasc) itensHtml += '<div class="mdo"><label>Nova etapa</label><div class="row"><input id="g-nova-et" placeholder="Nome da etapa"><button class="btn sec" style="flex:0 0 auto;width:auto" id="g-add-et">Adicionar</button></div></div>';
  if (!rasc) itensHtml += '<p class="muted">Itens e etapas só podem ser alterados com o orçamento em Rascunho.</p>';
  html += gSec('itens', 'Etapas e itens (' + (o.etapas || []).reduce(function (a, e) { return a + e.itens.length; }, 0) + ')', itensHtml, true);

  html += gSec('hh', 'Tabela de HH (valor da hora por função)', '<div id="g-hh">' + (G.hh && G.hh.orcamentoId === o.id ? gHhHtml() : '<button class="btn sec" onclick="gHhCarregar()">Abrir tabela de HH</button>') + '</div>');
  html += gSec('hhi', 'HH do orçamento (profissionais × horas)', '<div id="g-hhi">' + (G.hhi && G.hhi.orcamentoId === o.id ? gHhiHtml() : '<button class="btn sec" onclick="gHhiCarregar()">Abrir HH do orçamento</button>') + '</div>');
  $('tela').innerHTML = html;

  if ($('g-st')) $('g-st').onchange = function () { var st = this.value; gAcao('atualizarStatusOrcamento', [o.id, st], 'Status alterado para ' + st + '.'); };
  if ($('g-pdf')) $('g-pdf').onclick = function () {
    if (!gOnline()) return; var b = this; b.disabled = true; b.textContent = 'Gerando PDF (pode levar 1 minuto)...';
    sys('gerarPropostas', [o.id]).then(function (r) { $('g-props-l').innerHTML = gLinksProposta(r); b.disabled = false; b.textContent = '📄 Gerar PDF da proposta'; aviso('Proposta Rev. ' + r.revisao + ' gerada.', 'ok'); })
      .catch(function (e) { aviso(e.message, 'err'); b.disabled = false; b.textContent = '📄 Gerar PDF da proposta'; });
  };
  $('g-props').onclick = function () { if (!gOnline()) return; $('g-props-l').innerHTML = '<p class="muted">Carregando...</p>'; sys('listarPropostasGeradas', [o.id]).then(function (l) { $('g-props-l').innerHTML = l.length ? l.map(gLinksProposta).join('') : '<p class="muted">Nenhuma proposta gerada ainda.</p>'; }).catch(function (e) { aviso(e.message, 'err'); }); };
  if ($('g-dup')) $('g-dup').onclick = function () { if (!confirm('Duplicar este orçamento (cria uma cópia em Rascunho)?')) return; gAcao('duplicarOrcamento', [o.id], 'Orçamento duplicado.', function (r) { if (r && r.id) gAbrirOrc(r.id); else gIr('orcs'); }); };
  if ($('g-exc')) $('g-exc').onclick = function () { if (!confirm('EXCLUIR o orçamento "' + o.titulo + '"? Não dá para desfazer.')) return; gAcao('excluirOrcamento', [o.id], 'Orçamento excluído.', function () { G.orc = null; gIr('orcs'); }); };
  if ($('g-conv')) $('g-conv').onclick = function () {
    $('g-conv-f').innerHTML = '<div class="mdo"><label>Responsável técnico</label><input id="cv-resp"><label>Data de início</label><input type="date" id="cv-ini" value="' + dataIso(Date.now()) + '"><div style="height:8px"></div><button class="btn" id="cv-ok">Criar projeto</button></div>';
    $('cv-ok').onclick = function () { gAcao('converterOrcamentoEmProjeto', [o.id, { responsavelTecnico: $('cv-resp').value.trim(), dataInicio: $('cv-ini').value }], 'Projeto criado a partir do orçamento.', function () { gAbrirOrc(o.id); }); };
  };
  if ($('od-ok')) $('od-ok').onclick = function () { gAcao('editarDadosOrcamento', [o.id, { clienteId: $('od-cli').value, titulo: $('od-tit').value }], 'Dados salvos.'); };
  if ($('oc-tipo')) $('oc-tipo').onchange = function () { $('oc-texto').placeholder = this.value === 'manual' ? 'Descreva o escopo do fornecimento...' : 'Observações (opcional) — a tabela de itens sem valores entra automaticamente.'; };
  if ($('oc-ok')) $('oc-ok').onclick = function () {
    gAcao('atualizarCondicoesOrcamento', [o.id, { escopoTipo: $('oc-tipo').value, escopoTexto: $('oc-texto').value, formaPagamento: $('oc-pag').value.trim(), prazoExecucao: $('oc-prazo').value.trim(), validadeProposta: $('oc-val').value, exclusoes: $('oc-exc').value }], 'Escopo e condições salvos.');
  };
  if ($('g-add-et')) $('g-add-et').onclick = function () { var n = $('g-nova-et').value.trim(); if (!n) return; gAcao('criarEtapa', [o.id, { nome: n }], 'Etapa criada.'); };
}
function gLinksProposta(r) {
  return '<div class="mdo"><b>Revisão ' + r.revisao + '</b>' + (r.criadoEm ? ' <span class="muted">' + esc(r.criadoEm) + '</span>' : '') +
    '<br><a href="' + esc(r.comercialUrl) + '" target="_blank">📄 Proposta comercial</a><br><a href="' + esc(r.tecnicaUrl) + '" target="_blank">📄 Proposta técnica</a></div>';
}
function gQtd(itemId, q) { gAcao('editarQuantidadeItemOrcamento', [itemId, Number(q)], 'Quantidade alterada.'); }
function gRemoverItem(itemId) { if (!confirm('Remover este item?')) return; gAcao('removerItemOrcamento', [itemId], 'Item removido.'); }
function gEtapaRenomear(id) { var e = G.orc.etapas.filter(function (x) { return x.id === id; })[0]; var n = prompt('Nome da etapa:', e.nome); if (!n || !n.trim()) return; gAcao('editarEtapa', [id, { nome: n.trim(), numero: e.numero }], 'Etapa renomeada.'); }
function gEtapaRemover(id) { if (!confirm('Remover a etapa e todos os itens dela?')) return; gAcao('removerEtapa', [id], 'Etapa removida.'); }
function gCustoItem(id, atual, pers) {
  var v = prompt('Custo unitário deste item no orçamento (R$).\nDeixe em branco para voltar ao custo do cadastro.', pers ? String(atual).replace('.', ',') : '');
  if (v === null) return;
  v = v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'));
  if (v !== null && !(v >= 0)) return aviso('Valor inválido.', 'err');
  gAcao('definirCustoOverrideItemOrcamento', [id, v], v === null ? 'Custo voltou ao padrão.' : 'Custo personalizado salvo.');
}
function gBdiItem(id) {
  var it = null; G.orc.etapas.forEach(function (e) { e.itens.forEach(function (x) { if (x.id === id) it = x; }); });
  var box = document.querySelector('[onclick="gBdiItem(\'' + id + '\')"]').parentNode;
  var f = function (k, r) { return '<div><label>' + r + ' %</label><input type="number" step="any" id="bd-' + k + '" value="' + (it[k] || 0) + '"></div>'; };
  box.outerHTML = '<div class="mdo" style="flex:1 1 100%"><b>BDI deste item</b><div class="grade">' + f('imposto', 'Imposto') + f('taxaAdministrativa', 'Taxa adm.') + f('taxaEngenharia', 'Taxa eng.') + f('lucroEsperado', 'Lucro') + '</div><div class="row" style="margin-top:8px"><button class="btn" id="bd-ok">Salvar BDI</button>' + (it.personalizado ? '<button class="btn sec" id="bd-pad">Usar padrão</button>' : '') + '</div></div>';
  $('bd-ok').onclick = function () { var d = {}; ['imposto', 'taxaAdministrativa', 'taxaEngenharia', 'lucroEsperado'].forEach(function (k) { d[k] = Number($('bd-' + k).value) || 0; }); gAcao('definirBDIItemOrcamento', [id, d], 'BDI do item salvo.'); };
  if ($('bd-pad')) $('bd-pad').onclick = function () { gAcao('definirBDIItemOrcamento', [id, null], 'Item voltou ao BDI padrão.'); };
}
function gAddItemForm(etapaId) {
  var box = $('g-add-' + etapaId), k = etapaId;
  box.innerHTML = '<div class="mdo"><select id="ga-tipo-' + k + '">' + Object.keys(TIPO_ITEM).map(function (t) { return '<option value="' + t + '">' + TIPO_ITEM[t] + '</option>'; }).join('') + '</select>' +
    '<input id="ga-busca-' + k + '" placeholder="Buscar item" style="margin-top:6px"><select id="ga-item-' + k + '" style="margin-top:6px"></select>' +
    '<div id="ga-novo-' + k + '"></div><input id="ga-qtd-' + k + '" type="number" step="any" placeholder="Quantidade" style="margin-top:6px"><div style="height:6px"></div><button class="btn" id="ga-ok-' + k + '">Adicionar</button></div>';
  var preencher = function () {
    var q = $('ga-busca-' + k).value.toLowerCase(), t = $('ga-tipo-' + k).value;
    $('ga-item-' + k).innerHTML = gOpts(gItensPorTipo(t).filter(function (x) { return x.id && (!q || (x.nome + ' ' + (x.codigo || '')).toLowerCase().indexOf(q) >= 0); }).slice(0, 100), '', function (x) { return x.nome + ' (' + (x.unidade || 'un') + ') ' + brl(x.custoUnitario); }, '— escolha —') +
      (t !== 'composicao' && gPode('orcamentos', 'criar') ? '<option value="__novo">+ Cadastrar item novo</option>' : '');
    $('ga-novo-' + k).innerHTML = '';
  };
  $('ga-tipo-' + k).onchange = preencher; $('ga-busca-' + k).oninput = preencher; preencher();
  $('ga-item-' + k).onchange = function () {
    var t = $('ga-tipo-' + k).value;
    $('ga-novo-' + k).innerHTML = this.value === '__novo' ? '<input id="ga-nn-' + k + '" placeholder="Nome do item novo" style="margin-top:6px"><div class="row" style="margin-top:6px"><input id="ga-nu-' + k + '" placeholder="Unid." value="' + (t === 'mao_de_obra' ? 'H' : 'un') + '"><input id="ga-nc-' + k + '" type="number" step="any" placeholder="Custo unit. R$"></div>' : '';
  };
  $('ga-ok-' + k).onclick = function () {
    var ref = $('ga-item-' + k).value, q = Number($('ga-qtd-' + k).value), t = $('ga-tipo-' + k).value;
    if (!ref || !(q > 0)) return aviso('Escolha o item e a quantidade.', 'err');
    if (!gOnline()) return;
    var p;
    if (ref === '__novo') {
      var d = { nome: $('ga-nn-' + k).value.trim(), unidade: $('ga-nu-' + k).value.trim() || 'un', custoUnitario: Number($('ga-nc-' + k).value) || 0 };
      if (!d.nome) return aviso('Informe o nome do item novo.', 'err');
      p = sys(t === 'material' ? 'criarItemMaterial' : 'criarItemMaoDeObra', [d]).then(function (r) { G.cat = null; DB.set('g_cat', null); return r.id; });
    } else p = Promise.resolve(ref);
    aviso('Salvando...');
    p.then(function (id) { return sys('adicionarItemOrcamento', [G.orc.id, { etapaId: etapaId, tipoItem: t, referenciaId: id, quantidade: q }]); })
      .then(function () { aviso('Item adicionado.', 'ok'); gRecarregarLista(); gAbrirOrc(G.orc.id); })
      .catch(function (e) { aviso(e.message, 'err'); });
  };
}

// ---- tabela de HH (valor da hora por função) ----
function gHhCarregar() { if (!gOnline()) return; $('g-hh').innerHTML = '<p class="muted">Carregando...</p>'; sys('obterTabelaHhOrcamento', [G.orc.id]).then(function (t) { G.hh = t; render(); }).catch(function (e) { aviso(e.message, 'err'); }); }
function gHhHtml() {
  var t = G.hh, ed = gPode('orcamentos', 'editar');
  return '<p class="muted">BDI padrão ' + t.bdiPadrao + '% · HE ' + t.percentualExtra50 + '% / ' + t.percentualExtra100 + '% · noturno ' + t.percentualNoturno + '%</p><ul class="lista">' + t.linhas.map(function (l, i) {
    return '<li style="flex-wrap:wrap"><span style="flex:1 1 100%">' + (ed ? '<input type="checkbox" style="width:auto" ' + (l.incluir ? 'checked' : '') + ' onchange="gHhSalvar(' + i + ',{incluir:this.checked})"> ' : '') + '<b>' + esc(l.nome) + '</b>' + (l.nomeOverride ? ' <span class="muted">(' + esc(l.nomePadrao) + ')</span>' : '') + '</span>' +
      '<span class="muted" style="flex:1 1 100%">Custo ' + brl(l.custo) + (l.custoOverride !== null ? ' (pers.)' : '') + ' · BDI ' + l.bdi + '%' + (l.bdiOverride !== null ? ' (pers.)' : '') + '<br>Normal ' + brl(l.normal) + ' · HE50 ' + brl(l.extra50) + ' · HE100 ' + brl(l.extra100) + ' · Not. ' + brl(l.noturno) + '</span>' +
      (ed ? '<span style="flex:1 1 100%;display:flex;gap:6px;margin-top:4px"><button class="btn sec" style="padding:4px 6px;font-size:12px" onclick="gHhCampo(' + i + ',\'nome\')">Nome</button><button class="btn sec" style="padding:4px 6px;font-size:12px" onclick="gHhCampo(' + i + ',\'custo\')">Custo</button><button class="btn sec" style="padding:4px 6px;font-size:12px" onclick="gHhCampo(' + i + ',\'bdi\')">BDI</button></span>' : '') + '</li>';
  }).join('') + '</ul>' + (ed ? '<div style="height:8px"></div><button class="btn" id="hh-pdf" onclick="gHhPdf(this)">📄 Gerar PDF da tabela de HH</button><div id="hh-pdf-l"></div>' : '');
}
function gHhCampo(i, campo) {
  var l = G.hh.linhas[i], atual = campo === 'nome' ? l.nomeOverride : campo === 'custo' ? l.custoOverride : l.bdiOverride;
  var v = prompt((campo === 'nome' ? 'Nome na tabela' : campo === 'custo' ? 'Custo por hora (R$)' : 'BDI (%)') + ' — em branco volta ao padrão:', atual === null || atual === undefined ? '' : String(atual));
  if (v === null) return;
  var o = {}; o[campo] = v.trim() === '' ? null : (campo === 'nome' ? v.trim() : Number(v.replace(',', '.')));
  gHhSalvar(i, o);
}
function gHhSalvar(i, campos) { if (!gOnline()) return; sys('salvarLinhaHhOrcamento', [G.orc.id, G.hh.linhas[i].itemId, campos]).then(function (t) { G.hh = t; aviso('Salvo.', 'ok'); render(); }).catch(function (e) { aviso(e.message, 'err'); }); }
function gHhPdf(b) {
  if (!gOnline()) return; b.disabled = true; b.textContent = 'Gerando...';
  sys('gerarTabelaHhPdf', [G.orc.id]).then(function (r) { $('hh-pdf-l').innerHTML = '<a href="' + esc(r.url) + '" target="_blank">📄 ' + esc(r.nome) + '</a>'; b.disabled = false; b.textContent = '📄 Gerar PDF da tabela de HH'; })
    .catch(function (e) { aviso(e.message, 'err'); b.disabled = false; b.textContent = '📄 Gerar PDF da tabela de HH'; });
}
// ---- HH do orçamento (profissionais × horas) ----
function gHhiCarregar() { if (!gOnline()) return; $('g-hhi').innerHTML = '<p class="muted">Carregando...</p>'; sys('obterItensHhOrcamento', [G.orc.id]).then(function (t) { G.hhi = t; render(); }).catch(function (e) { aviso(e.message, 'err'); }); }
function gHhiHtml() {
  var t = G.hhi, ed = gPode('orcamentos', 'editar'), tt = t.totais;
  return '<div class="grade" style="font-size:14px"><div><span class="muted">Total HH</span><br><b>' + tt.totalHH + '</b></div><div><span class="muted">Valor</span><br><b>' + brl(tt.valor) + '</b></div><div><span class="muted">Custo</span><br>' + brl(tt.custoTotal) + '</div><div><span class="muted">Margem</span><br>' + brl(tt.margemBruta) + ' (' + tt.margemPercentual + '%)</div></div>' +
    '<ul class="lista">' + t.itens.map(function (it) {
      return '<li><span><b>' + esc(it.funcao) + '</b><br><span class="muted">' + it.quantidade + ' prof. × ' + it.horas + ' h = ' + it.totalHH + ' HH · ' + brl(it.precoHora) + '/h' + (it.desatualizado ? ' ⚠️ preço desatualizado' : '') + (it.funcaoRemovida ? ' ⚠️ função removida' : '') + '</span></span><span style="text-align:right"><b>' + brl(it.precoTotal) + '</b>' +
        (ed ? '<br><button class="btn sec" style="padding:4px 8px;font-size:12px;width:auto;margin-top:4px" onclick="gHhiEditar(\'' + it.id + '\')">Editar</button> <button class="btn sec" style="padding:4px 8px;font-size:12px;width:auto;margin-top:4px" onclick="gHhiRemover(\'' + it.id + '\')">✕</button>' : '') + '</span></li>';
    }).join('') + '</ul>' +
    (ed ? '<div class="mdo" id="hhi-form"><b id="hhi-tit">Adicionar função</b><select id="hhi-f">' + gOpts(t.funcoesDisponiveis, '', function (f) { return f.funcao + ' – ' + brl(f.precoHora) + '/h'; }, '— função —') + '</select><div class="row" style="margin-top:6px"><input id="hhi-q" type="number" step="any" placeholder="Profissionais"><input id="hhi-h" type="number" step="any" placeholder="Horas por prof."></div><div style="height:6px"></div><button class="btn" onclick="gHhiSalvar()">Salvar</button></div>' +
      (t.itens.some(function (x) { return x.desatualizado; }) ? '<div style="height:8px"></div><button class="btn sec" onclick="gHhiAtualizar()">🔄 Atualizar preços pela tabela atual</button>' : '') : '');
}
function gHhiEditar(id) { var it = G.hhi.itens.filter(function (x) { return x.id === id; })[0]; G.hhiEd = id; $('hhi-tit').textContent = 'Editar ' + it.funcao; $('hhi-f').value = it.funcaoId; $('hhi-q').value = it.quantidade; $('hhi-h').value = it.horas; $('hhi-form').scrollIntoView({ behavior: 'smooth' }); }
function gHhiSalvar() {
  if (!gOnline()) return;
  var d = { id: G.hhiEd || '', funcaoId: $('hhi-f').value, quantidade: Number($('hhi-q').value), horas: Number($('hhi-h').value) };
  if (!d.funcaoId) return aviso('Escolha a função.', 'err');
  sys('salvarItemHhOrcamento', [G.orc.id, d]).then(function (t) { G.hhi = t; G.hhiEd = null; aviso('Salvo.', 'ok'); render(); }).catch(function (e) { aviso(e.message, 'err'); });
}
function gHhiRemover(id) { if (!confirm('Remover esta função do HH?') || !gOnline()) return; sys('removerItemHhOrcamento', [G.orc.id, id]).then(function (t) { G.hhi = t; render(); }).catch(function (e) { aviso(e.message, 'err'); }); }
function gHhiAtualizar() { if (!gOnline()) return; sys('atualizarItensHhOrcamento', [G.orc.id, '']).then(function (t) { G.hhi = t && t.itens ? t : G.hhi; if (!(t && t.itens)) gHhiCarregar(); else render(); aviso('Preços atualizados.', 'ok'); }).catch(function (e) { aviso(e.message, 'err'); }); }

// ---- BDI padrão ----
function gTelaBdi() {
  var b = G.bdi;
  $('tela').innerHTML = gVoltar() + '<div class="card"><h2>BDI padrão</h2>' + (!b ? '<p class="muted">Carregando...</p>' :
    '<div class="grade">' + [['imposto', 'Imposto'], ['taxaAdministrativa', 'Taxa administrativa'], ['taxaEngenharia', 'Taxa de engenharia'], ['lucroEsperado', 'Lucro esperado']].map(function (x) { return '<div><label>' + x[1] + ' %</label><input type="number" step="any" id="bp-' + x[0] + '" value="' + b[x[0]] + '"' + (gPode('orcamentos', 'editar') ? '' : ' disabled') + '></div>'; }).join('') + '</div>' +
    '<p class="muted" id="bp-res"></p>' + (gPode('orcamentos', 'editar') ? '<button class="btn lar" id="bp-ok">Salvar BDI padrão</button><p class="muted">Vale para os itens sem BDI personalizado dos orçamentos que ainda não foram enviados/aprovados.</p>' : '')) + '</div>';
  if (!b) { if (gOnline()) sys('obterConfigBDI').then(function (r) { G.bdi = r; if (G.view === 'bdi') render(); }).catch(function (e) { aviso(e.message, 'err'); }); return; }
  var calc = function () { var s = 0; ['imposto', 'taxaAdministrativa', 'taxaEngenharia', 'lucroEsperado'].forEach(function (k) { s += Number($('bp-' + k).value) || 0; }); $('bp-res').textContent = s >= 100 ? 'A soma não pode chegar a 100%.' : 'BDI resultante: ' + ((1 / (1 - s / 100) - 1) * 100).toFixed(2).replace('.', ',') + '%'; };
  Array.prototype.forEach.call(document.querySelectorAll('[id^=bp-]'), function (i) { if (i.tagName === 'INPUT') i.oninput = calc; }); calc();
  if ($('bp-ok')) $('bp-ok').onclick = function () { var d = {}; ['imposto', 'taxaAdministrativa', 'taxaEngenharia', 'lucroEsperado'].forEach(function (k) { d[k] = Number($('bp-' + k).value) || 0; }); gAcao('salvarConfigBDI', [d], 'BDI padrão salvo.', function () { G.bdi = d; render(); }); };
}

// ---------- novo orçamento (offline) ----------
function gTelaNovoOrcamento() {
  var n = G.novo || (G.novo = { clienteId: '', novoCliente: null, titulo: '', etapas: [{ nome: 'Mão de obra', itens: [] }], cond: { escopoTipo: 'tabela', escopoTexto: '', formaPagamento: '', prazoExecucao: '', validadeProposta: '', exclusoes: '' } });
  n.cond = n.cond || { escopoTipo: 'tabela' };
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
  html += '<div class="card"><h2>Escopo e condições</h2><select id="no-ctipo"><option value="tabela"' + (n.cond.escopoTipo !== 'manual' ? ' selected' : '') + '>Escopo: copiar tabela do orçamento (sem valores)</option><option value="manual"' + (n.cond.escopoTipo === 'manual' ? ' selected' : '') + '>Escopo: escrever manualmente</option></select>' +
    '<textarea id="no-ctexto" rows="4" placeholder="Escopo / observações" style="margin-top:6px">' + esc(n.cond.escopoTexto || '') + '</textarea>' +
    '<label>Forma de pagamento</label><input id="no-cpag" placeholder="Ex: 30 DDL ao final do aceite" value="' + esc(n.cond.formaPagamento || '') + '">' +
    '<div class="row"><div><label>Prazo de execução</label><input id="no-cprazo" placeholder="Ex: 15 dias úteis" value="' + esc(n.cond.prazoExecucao || '') + '"></div><div style="flex:0 0 110px"><label>Validade (dias)</label><input id="no-cval" type="number" min="1" value="' + esc(n.cond.validadeProposta || '') + '"></div></div>' +
    '<label>Exclusões</label><textarea id="no-cexc" rows="3" placeholder="Uma por linha">' + esc(n.cond.exclusoes || '') + '</textarea></div>';
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
  if ($('no-ctipo')) n.cond = { escopoTipo: $('no-ctipo').value, escopoTexto: $('no-ctexto').value, formaPagamento: $('no-cpag').value.trim(), prazoExecucao: $('no-cprazo').value.trim(), validadeProposta: $('no-cval').value, exclusoes: $('no-cexc').value };
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
  enfileirar({ tipo: 'orcamentoNovo', orc: { clienteId: n.clienteId, novoCliente: n.novoCliente, titulo: n.titulo.trim(), etapas: etapas, condicoes: n.cond }, resumo: 'Orçamento ' + n.titulo.trim() })
    .then(function () { G.novo = null; gRecarregarLista(); gIr('menu'); aviso('Orçamento salvo' + (navigator.onLine ? ' e enviado.' : '. Será enviado quando tiver internet.'), 'ok'); });
}

// ---------- catálogo ----------
function gTelaCatalogo() {
  var q = G.busca.toLowerCase(), aba = G.catAba || 'mao_de_obra', c = gCat(), ed = gPode('orcamentos', 'editar');
  var todos = (aba === 'material' ? c.materiais : aba === 'composicao' ? c.composicoes : c.maoDeObra) || [];
  var lista = todos.filter(function (x) { return (G.catInat || x.ativo !== false && x.ativo !== 'FALSE') && (!q || (x.nome + ' ' + (x.codigo || '')).toLowerCase().indexOf(q) >= 0); });
  var html = gVoltar() + '<div class="card"><h2>Itens e composições</h2><div class="row">' + Object.keys(TIPO_ITEM).map(function (t) { return '<button class="btn ' + (t === aba ? '' : 'sec') + '" style="padding:8px 4px;font-size:13px" onclick="G.catAba=\'' + t + '\';render()">' + TIPO_ITEM[t] + '</button>'; }).join('') + '</div>' +
    '<input id="g-busca" placeholder="Buscar" value="' + esc(G.busca) + '" style="margin-top:8px"><label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" style="width:auto" ' + (G.catInat ? 'checked' : '') + ' onchange="G.catInat=this.checked;render()"> mostrar inativos</label>' +
    (gPode('orcamentos', 'criar') ? '<div style="height:8px"></div><button class="btn lar" onclick="' + (aba === 'composicao' ? 'G.form=null;gIr(\'novaComp\')' : 'G.form={tipo:\'' + aba + '\'};gIr(\'novoItem\')') + '">+ ' + (aba === 'composicao' ? 'Nova composição' : 'Novo item') + '</button>' : '') +
    '<ul class="lista">' + lista.slice(0, 150).map(function (x) {
      var inat = x.ativo === false || x.ativo === 'FALSE';
      return '<li style="cursor:' + (x.id ? 'pointer' : 'default') + (inat ? ';opacity:.55' : '') + '" onclick="' + (x.id ? (aba === 'composicao' ? 'gAbrirComp(\'' + x.id + '\')' : (ed ? 'gEditarItem(\'' + aba + '\',\'' + x.id + '\')' : '')) : '') + '"><span>' + esc(x.nome) + (inat ? ' <span class="tag">inativo</span>' : '') + '<br><span class="muted">' + esc(x.codigo || '') + ' · ' + esc(x.unidade || 'un') + '</span></span><b>' + brl(x.custoUnitario) + '</b></li>';
    }).join('') + '</ul>' + (lista.length > 150 ? '<p class="muted">Mostrando 150 de ' + lista.length + '. Use a busca.</p>' : '') +
    '<div style="height:8px"></div><button class="btn sec" onclick="if(gOnline()){aviso(\'Atualizando...\');gCarregarCatalogo(true).then(function(){aviso(\'Catálogo atualizado.\',\'ok\');render();})}">🔄 Atualizar catálogo</button></div>';
  $('tela').innerHTML = html;
  $('g-busca').oninput = function () { G.busca = this.value; var pos = this.selectionStart; render(); var b = $('g-busca'); b.focus(); b.setSelectionRange(pos, pos); };
}
function gEditarItem(tipo, id) {
  var c = gCat(), it = ((tipo === 'material' ? c.materiais : c.maoDeObra) || []).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!it) return;
  G.form = { tipo: tipo, id: id, nome: it.nome, unidade: it.unidade, custoUnitario: it.custoUnitario, ativo: !(it.ativo === false || it.ativo === 'FALSE') };
  gIr('novoItem');
}
function gTelaNovoItem() {
  var f = G.form || (G.form = { tipo: 'mao_de_obra' }), edit = !!f.id;
  $('tela').innerHTML = gVoltar('catalogo') + '<div class="card"><h2>' + (edit ? 'Editar item' : 'Novo item') + '</h2><label>Tipo</label><select id="ni-tipo"' + (edit ? ' disabled' : '') + '><option value="mao_de_obra"' + (f.tipo === 'mao_de_obra' ? ' selected' : '') + '>Mão de obra</option><option value="material"' + (f.tipo === 'material' ? ' selected' : '') + '>Material</option></select>' +
    '<label>Nome</label><input id="ni-nome" value="' + esc(f.nome || '') + '"><div class="row"><div><label>Unidade</label><input id="ni-un" value="' + esc(f.unidade || (f.tipo === 'mao_de_obra' ? 'H' : 'un')) + '"></div><div><label>Custo unitário (R$)</label><input id="ni-custo" type="number" step="any" value="' + (f.custoUnitario !== undefined ? f.custoUnitario : '') + '"></div></div>' +
    '<div style="height:12px"></div><button class="btn lar" id="ni-ok">' + (edit ? 'Salvar alterações' : 'Salvar item') + '</button>' +
    (edit ? '<div style="height:8px"></div><button class="btn sec" id="ni-at">' + (f.ativo ? 'Desativar item' : 'Ativar item') + '</button>' : '') + '</div>';
  $('ni-ok').onclick = function () {
    var tipo = $('ni-tipo').value, d = { nome: $('ni-nome').value.trim(), unidade: $('ni-un').value.trim() || 'un', custoUnitario: Number($('ni-custo').value) || 0 };
    if (!d.nome) return aviso('Informe o nome.', 'err');
    if (edit) return gAcao(tipo === 'material' ? 'editarItemMaterial' : 'editarItemMaoDeObra', [f.id, d], 'Item alterado.', function () { gCarregarCatalogo(true).then(function () { G.form = null; G.catAba = tipo; gIr('catalogo'); }); });
    gLocalAddItem(tipo, d);
    enfileirar({ tipo: 'sistema', fn: tipo === 'material' ? 'criarItemMaterial' : 'criarItemMaoDeObra', args: [d], resumo: TIPO_ITEM[tipo] + ': ' + d.nome }).then(function () { G.form = null; G.catAba = tipo; gIr('catalogo'); aviso('Item salvo.', 'ok'); setTimeout(function () { if (navigator.onLine) gCarregarCatalogo(true); }, 8000); });
  };
  if ($('ni-at')) $('ni-at').onclick = function () {
    gAcao(f.tipo === 'material' ? 'alternarStatusItemMaterial' : 'alternarStatusItemMaoDeObra', [f.id, !f.ativo], f.ativo ? 'Item desativado.' : 'Item ativado.', function () { gCarregarCatalogo(true).then(function () { G.form = null; gIr('catalogo'); }); });
  };
}
function gLocalAddItem(tipo, d) { // aparece na lista já (sem id até sincronizar)
  var c = gCat(), k = tipo === 'material' ? 'materiais' : tipo === 'composicao' ? 'composicoes' : 'maoDeObra';
  (c[k] = c[k] || []).push({ id: '', codigo: 'novo', nome: d.nome + ' (aguardando envio)', unidade: d.unidade, custoUnitario: d.custoUnitario || 0, ativo: true });
}
function gAbrirComp(id) {
  if (!gOnline('Abrir a composição precisa de internet.')) return;
  G.comp = null; gIr('comp');
  sys('obterComposicao', [id]).then(function (c) { G.comp = c; if (G.view === 'comp') render(); }).catch(function (e) { aviso(e.message, 'err'); gIr('catalogo'); });
}
function gTelaComp() {
  var c = G.comp, ed = gPode('orcamentos', 'editar'), cr = gPode('orcamentos', 'criar');
  if (!c) { $('tela').innerHTML = gVoltar('catalogo') + '<div class="card">Carregando...</div>'; return; }
  var html = gVoltar('catalogo') + '<div class="card"><h2>' + esc(c.codigo) + ' – ' + esc(c.nome) + '</h2><p>Custo unitário: <b>' + brl(c.custoUnitario) + '</b> / ' + esc(c.unidade) + '</p>' +
    (ed ? '<label>Nome</label><input id="cp-nome" value="' + esc(c.nome) + '"><div class="row"><div><label>Unidade</label><input id="cp-un" value="' + esc(c.unidade) + '"></div></div><label>Descrição</label><textarea id="cp-desc">' + esc(c.descricao || '') + '</textarea><div style="height:8px"></div><button class="btn sec" id="cp-ok">Salvar dados</button>' : '<p class="muted">' + esc(c.descricao || '') + '</p>') + '</div>' +
    '<div class="card"><h2>Itens da composição</h2><ul class="lista">' + (c.subitens || []).map(function (s) {
      return '<li><span>' + esc(s.nomeItem) + '<br><span class="muted">' + (TIPO_ITEM[s.tipoItem] || s.tipoItem) + ' · ' + s.quantidade + ' ' + esc(s.unidade) + ' × ' + brl(s.custoUnitario) + '</span></span><span style="text-align:right"><b>' + brl(s.custoTotal) + '</b>' + (ed ? '<br><button class="btn sec" style="padding:4px 8px;font-size:12px;width:auto;margin-top:4px" onclick="gCompRemSub(\'' + s.id + '\')">remover</button>' : '') + '</span></li>';
    }).join('') + '</ul>' +
    (cr ? '<div class="mdo"><b>Adicionar item</b><select id="cs-tp"><option value="mao_de_obra">Mão de obra</option><option value="material">Material</option></select><input id="cs-busca" placeholder="Buscar" style="margin-top:6px"><select id="cs-it" style="margin-top:6px"></select><input id="cs-q" type="number" step="any" placeholder="Quantidade" style="margin-top:6px"><div style="height:6px"></div><button class="btn" id="cs-ok">Adicionar</button></div>' : '') + '</div>';
  $('tela').innerHTML = html;
  if ($('cp-ok')) $('cp-ok').onclick = function () { gAcao('editarComposicao', [c.id, { nome: $('cp-nome').value.trim(), unidade: $('cp-un').value.trim() || 'un', descricao: $('cp-desc').value }], 'Composição salva.', function () { gAbrirComp(c.id); gCarregarCatalogo(true); }); };
  if ($('cs-ok')) {
    var fill = function () { var q = $('cs-busca').value.toLowerCase(); $('cs-it').innerHTML = gOpts(gItensPorTipo($('cs-tp').value).filter(function (x) { return x.id && (!q || x.nome.toLowerCase().indexOf(q) >= 0); }).slice(0, 100), '', function (x) { return x.nome + ' (' + (x.unidade || 'un') + ') ' + brl(x.custoUnitario); }, '— escolha —'); };
    $('cs-tp').onchange = fill; $('cs-busca').oninput = fill; fill();
    $('cs-ok').onclick = function () { var d = { tipoItem: $('cs-tp').value, itemId: $('cs-it').value, quantidade: Number($('cs-q').value) }; if (!d.itemId || !(d.quantidade > 0)) return aviso('Escolha o item e a quantidade.', 'err'); gAcao('adicionarSubitemComposicao', [c.id, d], 'Item adicionado.', function () { gAbrirComp(c.id); }); };
  }
}
function gCompRemSub(id) { if (!confirm('Remover este item da composição?')) return; gAcao('removerSubitemComposicao', [id], 'Item removido.', function () { gAbrirComp(G.comp.id); }); }
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

// ---------- Obras / projetos: status (em execução, pausado, concluído...) ----------
var PJ_STATUS = ['Planejamento', 'Em Andamento', 'Pausado', 'Concluído', 'Faturado', 'Cancelado'];
var PJ_ROTULO = { 'Planejamento': 'Aprovado', 'Em Andamento': 'Em Execução' };
function pjRot(st) { return PJ_ROTULO[st] || st; }
function gTelaProjetos() {
  var l = G.projs, pode = gPode('projetos', 'editar');
  var html = gVoltar() + '<div class="card"><h2>🏗️ Obras / projetos</h2><p class="muted">Para bater ponto e lançar RDO a obra precisa estar em <b>Aprovado</b>, <b>Em Execução</b> ou <b>Pausado</b>.' + (pode ? ' Troque o status no seletor.' : '') + '</p>';
  if (!l) html += '<p class="muted">Carregando...</p>';
  else if (!l.length) html += '<p class="muted">Nenhum projeto ainda. Converta um orçamento aprovado em projeto.</p>';
  else html += '<ul class="lista">' + l.map(function (p) {
    return '<li style="flex-wrap:wrap;gap:6px"><span style="flex:1;min-width:58%"><b>' + esc(p.titulo) + '</b><br><span class="muted">' + esc(p.nomeCliente) + (p.dataInicio ? ' · início ' + esc(p.dataInicio) : '') + ' · ' + Math.round(Number(p.percentualConcluido) || 0) + '% concluído</span></span>' +
      (pode ? '<select data-pj="' + esc(p.id) + '" style="width:auto;max-width:42%">' + PJ_STATUS.map(function (st) { return '<option value="' + st + '"' + (st === p.status ? ' selected' : '') + '>' + pjRot(st) + '</option>'; }).join('') + '</select>'
        : '<span class="tag">' + esc(pjRot(p.status)) + '</span>') + '</li>';
  }).join('') + '</ul>';
  $('tela').innerHTML = html + '</div>';
  Array.prototype.forEach.call(document.querySelectorAll('[data-pj]'), function (sel) {
    sel.onchange = function () {
      var st = sel.value, p = (G.projs || []).filter(function (x) { return String(x.id) === sel.dataset.pj; })[0];
      if (!confirm('Mudar "' + (p ? p.titulo : '') + '" para ' + pjRot(st) + '?')) { gTelaProjetos(); return; }
      if (!gOnline()) { gTelaProjetos(); return; }
      aviso('Salvando...');
      sys('atualizarStatusProjeto', [sel.dataset.pj, st]).then(function () {
        if (p) p.status = st;
        aviso('Status alterado para ' + pjRot(st) + '.', 'ok');
        return api('baixar').then(function (d) { S.dados = d; return DB.set('dados', d); }).catch(function () {}); // a obra aparece no Ponto e no RDO
      }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { if (G.view === 'projs') gTelaProjetos(); });
    };
  });
  if (!l && !G._pjCarregando && navigator.onLine) {
    G._pjCarregando = true;
    sys('listarProjetos').then(function (r) { G.projs = r || []; if (G.view === 'projs') gTelaProjetos(); }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { G._pjCarregando = false; });
  }
}
