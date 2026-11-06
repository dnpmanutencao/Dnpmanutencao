/* DNP Campo — Inspeções: relatório item a item (foto, situação, recomendação, materiais, tempo) + plano de ação. Funciona sem internet. */
'use strict';

var INSP_PRIO = { 'Alta': 'Imediato', 'Média': 'Até 30 dias', 'Baixa': 'Até 90 dias' };
var I = { lista: null, atual: null, item: -1, servidor: null };

function inspNum(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
function inspTotais(d) {
  var vh = inspNum(d.valorHora), t = { materiais: 0, maoObra: 0, geral: 0, horas: 0 };
  (d.itens || []).forEach(function (it) {
    it.totMateriais = (it.materiais || []).reduce(function (a, m) { return a + inspNum(m.qtd) * inspNum(m.valor); }, 0);
    it.hh = inspNum(it.horas) * Math.max(1, inspNum(it.pessoas) || 1);
    it.totMaoObra = it.hh * vh; it.total = it.totMateriais + it.totMaoObra + inspNum(it.outros);
    t.materiais += it.totMateriais; t.maoObra += it.totMaoObra; t.horas += it.hh; t.geral += it.total;
  });
  return t;
}
// assinatura do conteúdo: só pede novo envio se algo mudou de verdade depois do último envio
function inspSig(d) {
  inspTotais(d);
  var a = [d.titulo, d.cliente, d.local, d.data, d.valorHora, d.objetivo, d.consideracoes, (d.itens || []).map(function (x) {
    return [x.equipamento, x.tag, x.situacao, x.recomendacao, x.prioridade, x.prazo, x.horas, x.pessoas, x.outros, JSON.stringify(x.materiais || []),
      (x.fotos || []).map(function (f) { return typeof f === 'string' ? f.length + ':' + f.slice(-30) : f.id; })];
  })];
  if (d.cargo || d.registro || (d.responsavel && d.responsavel !== S.sessao.funcionario.nome)) a.push([d.responsavel, d.cargo, d.registro]);
  return JSON.stringify(a);
}
function inspEnviada(d) { return d.enviadoSig ? inspSig(d) === d.enviadoSig : d.status === 'enviada'; }
function inspCarregar() { return DB.get('insp_lista').then(function (l) { I.lista = l || []; return I.lista; }); }
function inspSalvarLocal() { if (I.atual) { I.atual.atualizado = Date.now(); var ix = I.lista.findIndex(function (x) { return x.id === I.atual.id; }); if (ix < 0) I.lista.unshift(I.atual); else I.lista[ix] = I.atual; } return DB.set('insp_lista', I.lista); }
function inspCam() { // câmera traseira
  var el = document.getElementById('cam-tras');
  if (!el) { el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.capture = 'environment'; el.id = 'cam-tras'; el.className = 'hidden'; document.body.appendChild(el); }
  return el.id;
}
function inspBusca(site, q) {
  q = String(q || '').trim(); if (!q) return aviso('Escreva o nome do material primeiro.', 'err');
  var url = site === 'ml' ? 'https://lista.mercadolivre.com.br/' + encodeURIComponent(q.replace(/\s+/g, '-')) : 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(q + ' preço');
  window.open(url, '_blank');
}

// ---------- lista ----------
function gTelaInsps() {
  if (!I.lista) { inspCarregar().then(render); $('tela').innerHTML = gVoltar() + '<div class="card">Carregando...</div>'; return; }
  var html = gVoltar() + '<div class="card"><h2>🔎 Inspeções</h2><button class="btn lar" id="in-nova">+ Nova inspeção</button>' +
    '<p class="muted">Funciona sem internet. Faça item a item; no final envie e gere o PDF.</p></div><div class="card"><h2>No celular</h2>';
  html += I.lista.length ? '<ul class="lista">' + I.lista.map(function (d) {
    var t = inspTotais(d);
    return '<li style="cursor:pointer" onclick="inspAbrir(\'' + d.id + '\')"><span><b>' + esc(d.titulo || '(sem título)') + '</b><br><span class="muted">' + esc(d.cliente || '') + ' · ' + (d.data ? dataBr(d.data) : '') + ' · ' + (d.itens || []).length + ' itens</span></span>' +
      '<span style="text-align:right"><b>' + brl(t.geral) + '</b><br><span class="tag ' + (inspEnviada(d) ? 'ok' : 'pend') + '">' + (inspEnviada(d) ? 'enviada' : 'rascunho') + '</span></span></li>';
  }).join('') + '</ul>' : '<p class="muted">Nenhuma inspeção no celular.</p>';
  html += '</div><div class="card"><h2>No sistema</h2><div id="in-serv">' + (navigator.onLine ? 'Carregando...' : '<p class="muted">Sem internet.</p>') + '</div></div>';
  $('tela').innerHTML = html;
  $('in-nova').onclick = function () {
    I.atual = { id: uid(), titulo: '', cliente: '', local: '', data: dataIso(Date.now()), responsavel: S.sessao.funcionario.nome, valorHora: '', objetivo: '', consideracoes: '', itens: [], status: 'rascunho' };
    inspSalvarLocal().then(function () { gIr('insp'); });
  };
  if (navigator.onLine) api('inspecao', { op: 'listar' }).then(function (l) {
    I.servidor = l; var box = $('in-serv'); if (!box) return;
    box.innerHTML = l.length ? '<ul class="lista">' + l.map(function (d) {
      return '<li><span><b>' + esc(d.titulo) + '</b><br><span class="muted">' + esc(d.cliente) + ' · ' + dataBr(d.data || '') + ' · ' + esc(d.responsavel) + '</span>' +
        (d.pdfUrl ? '<br><a href="' + esc(d.pdfUrl) + '" target="_blank">📄 PDF</a>' : '') + '</span><span style="text-align:right"><b>' + brl(d.total) + '</b><br>' +
        (I.lista.some(function (x) { return x.id === d.id; }) ? '' : '<button class="btn sec" style="padding:4px 8px;font-size:12px;width:auto" onclick="inspBaixar(\'' + d.id + '\')">Abrir</button>') + '</span></li>';
    }).join('') + '</ul>' : '<p class="muted">Nenhuma inspeção enviada ainda.</p>';
  }).catch(function (e) { if ($('in-serv')) $('in-serv').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
}
function inspAbrir(id) { I.atual = I.lista.filter(function (x) { return x.id === id; })[0]; gIr('insp'); }
function inspBaixar(id) {
  if (!gOnline()) return; aviso('Baixando...');
  api('inspecao', { op: 'obter', id: id }).then(function (d) {
    d.itens.forEach(function (it) { it.fotos = (it.fotos || []).map(function (f) { return { id: f }; }); });
    I.atual = d; return inspSalvarLocal();
  }).then(function () { gIr('insp'); }).catch(function (e) { aviso(e.message, 'err'); });
}

// ---------- cabeçalho + itens + plano ----------
function gTelaInsp() {
  var d = I.atual; if (!d) return gIr('insps');
  var t = inspTotais(d), cli = (gCat().clientes || []).map(function (c) { return '<option value="' + esc(c.nomeEmpresa) + '">'; }).join('');
  var html = gVoltar('insps') + '<div class="card"><h2>Inspeção</h2>' +
    '<label>Título</label><input id="in-tit" value="' + esc(d.titulo) + '" placeholder="Ex.: Inspeção da planta de britagem">' +
    '<label>Cliente</label><input id="in-cli" list="in-clis" value="' + esc(d.cliente) + '"><datalist id="in-clis">' + cli + '</datalist>' +
    '<label>Local / unidade</label><input id="in-loc" value="' + esc(d.local) + '">' +
    '<label>Responsável pela inspeção</label><input id="in-resp" value="' + esc(d.responsavel || S.sessao.funcionario.nome) + '">' +
    '<div class="row"><div><label>Cargo / função</label><input id="in-cargo" value="' + esc(d.cargo || '') + '" placeholder="Ex.: Eng. eletricista"></div><div><label>Registro (CREA/CFT)</label><input id="in-reg" value="' + esc(d.registro || '') + '" placeholder="opcional"></div></div>' +
    '<div class="row"><div><label>Data</label><input id="in-data" type="date" value="' + esc(d.data) + '"></div><div><label>Valor hora (R$)</label><input id="in-vh" type="number" step="any" value="' + esc(d.valorHora) + '" placeholder="mão de obra"></div></div>' +
    '<label>Objetivo (opcional)</label><textarea id="in-obj" rows="2">' + esc(d.objetivo) + '</textarea></div>';
  html += '<div class="card"><h2>Itens inspecionados (' + d.itens.length + ')</h2><ul class="lista">' + d.itens.map(function (it, k) {
    var f = it.fotos && it.fotos[0], src = f ? (typeof f === 'string' ? f : '') : '';
    return '<li style="cursor:pointer;align-items:center" onclick="inspItem(' + k + ')">' + (src ? '<img src="' + src + '" style="width:52px;height:52px;object-fit:cover;border-radius:8px;flex:none">' : '<span style="width:52px;height:52px;border-radius:8px;background:#e7ebf0;display:flex;align-items:center;justify-content:center;flex:none">' + (f ? '☁️' : '📷') + '</span>') +
      '<span style="flex:1"><b>' + (k + 1) + '. ' + esc(it.equipamento || '(sem nome)') + '</b><br><span class="muted">' + esc(it.prioridade || '') + ' · ' + String(Math.round(it.hh * 10) / 10).replace('.', ',') + ' HH</span></span><b>' + brl(it.total) + '</b></li>';
  }).join('') + '</ul><button class="btn lar" id="in-add">+ Adicionar item</button></div>';
  var porP = {}; d.itens.forEach(function (it) { var p = it.prioridade || '—'; porP[p] = (porP[p] || 0) + it.total; });
  html += '<div class="card"><h2>Plano de ação e valores</h2><ul class="lista">' + ['Alta', 'Média', 'Baixa', '—'].filter(function (p) { return porP[p]; }).map(function (p) {
    return '<li><span><b>' + p + '</b><br><span class="muted">' + (INSP_PRIO[p] || '') + ' · ' + d.itens.filter(function (it) { return (it.prioridade || '—') === p; }).length + ' item(ns)</span></span><b>' + brl(porP[p]) + '</b></li>';
  }).join('') + '<li><span>Materiais</span><b>' + brl(t.materiais) + '</b></li><li><span>Mão de obra (' + String(Math.round(t.horas * 10) / 10).replace('.', ',') + ' HH)</span><b>' + brl(t.maoObra) + '</b></li>' +
    '<li><span><b>TOTAL ESTIMADO</b></span><b style="color:var(--laranja);font-size:17px">' + brl(t.geral) + '</b></li></ul>' +
    '<label>Considerações finais</label><textarea id="in-cons" rows="3">' + esc(d.consideracoes) + '</textarea></div>';
  html += '<div class="card"><button class="btn lar" id="in-env">📤 Enviar para o sistema</button><div style="height:8px"></div><button class="btn" id="in-pdf">📄 Gerar relatório PDF</button><div id="in-pdf-l"></div>' +
    '<div style="height:8px"></div><button class="btn sec" id="in-del" style="color:#b91c1c">🗑 Apagar do celular</button>' +
    '<p class="muted">' + (inspEnviada(d) ? 'Já enviada. Se alterar, envie de novo antes de gerar o PDF.' : 'Rascunho salvo no celular.') + '</p></div>';
  $('tela').innerHTML = html;
  var ler = function () { d.titulo = $('in-tit').value; d.cliente = $('in-cli').value; d.local = $('in-loc').value; d.data = $('in-data').value; d.valorHora = $('in-vh').value; d.objetivo = $('in-obj').value; d.consideracoes = $('in-cons').value; d.responsavel = $('in-resp').value.trim() || S.sessao.funcionario.nome; d.cargo = $('in-cargo').value.trim(); d.registro = $('in-reg').value.trim(); };
  ['in-tit', 'in-cli', 'in-loc', 'in-resp', 'in-cargo', 'in-reg', 'in-data', 'in-vh', 'in-obj', 'in-cons'].forEach(function (k) { $(k).onchange = function () { ler(); d.status = 'rascunho'; inspSalvarLocal(); }; });
  $('in-add').onclick = function () { ler(); d.itens.push({ id: uid(), equipamento: '', tag: '', fotos: [], situacao: '', recomendacao: '', prioridade: 'Média', prazo: INSP_PRIO['Média'], horas: '', pessoas: 1, materiais: [], outros: '' }); d.status = 'rascunho'; inspSalvarLocal().then(function () { inspItem(d.itens.length - 1); }); };
  $('in-env').onclick = function () {
    ler(); if (!d.titulo.trim()) return aviso('Informe o título.', 'err'); if (!d.itens.length) return aviso('Adicione pelo menos um item.', 'err');
    var copia = JSON.parse(JSON.stringify(d)); copia.itens.forEach(function (it) { it.fotos = it.fotos.map(function (f) { return typeof f === 'string' ? f : f.id; }); });
    d.status = 'enviada'; d.enviadoSig = inspSig(d);
    inspSalvarLocal().then(function () { return enfileirar({ tipo: 'inspecao', insp: copia, resumo: 'Inspeção ' + d.titulo }); })
      .then(function () { aviso(navigator.onLine ? 'Enviando... acompanhe em Envios.' : 'Salva. Será enviada quando tiver internet.', 'ok'); });
  };
  $('in-pdf').onclick = function () {
    if (!gOnline('Gerar o PDF precisa de internet.')) return;
    if ((S.fila || []).some(function (x) { return x.tipo === 'inspecao' && x.insp && x.insp.id === d.id; })) return aviso('Aguarde o envio terminar (aba Envios).', 'err');
    if (!inspEnviada(d) && !confirm('Esta inspeção tem alterações que ainda não foram enviadas.\n\nOK = gerar o PDF com a versão que já está no sistema\nCancelar = voltar e tocar em "Enviar para o sistema"')) return;
    var b = this; b.disabled = true; b.textContent = 'Gerando PDF (até 1 minuto)...';
    api('inspecao', { op: 'pdf', id: d.id }).then(function (r) {
      d.pdfUrl = r.url; inspSalvarLocal();
      $('in-pdf-l').innerHTML = '<div class="mdo"><a href="' + esc(r.url) + '" target="_blank">📄 ' + esc(r.nome) + '</a>' + (navigator.share ? '<div style="height:6px"></div><button class="btn sec" id="in-share">📤 Compartilhar (WhatsApp, e-mail)</button>' : '') + '</div>';
      if ($('in-share')) $('in-share').onclick = function () { navigator.share({ title: r.nome, url: r.url }).catch(function () {}); };
    }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { b.disabled = false; b.textContent = '📄 Gerar relatório PDF'; });
  };
  $('in-del').onclick = function () { if (!confirm('Apagar esta inspeção do celular? (o que já foi enviado continua no sistema)')) return; I.lista = I.lista.filter(function (x) { return x.id !== d.id; }); I.atual = null; DB.set('insp_lista', I.lista).then(function () { gIr('insps'); }); };
}

// ---------- item ----------
function inspItem(k) { I.item = k; gIr('inspItem'); }
function gTelaInspItem() {
  var d = I.atual, it = d && d.itens[I.item]; if (!it) return gIr('insp');
  inspTotais(d);
  var html = gVoltar('insp') + '<div class="card"><h2>Item ' + (I.item + 1) + '</h2>' +
    '<label>Equipamento / item</label><input id="it-eq" value="' + esc(it.equipamento) + '" placeholder="Ex.: Transportador TC-03">' +
    '<label>Tag / localização (opcional)</label><input id="it-tag" value="' + esc(it.tag) + '">' +
    '<label>Fotos (' + it.fotos.length + ')</label><div class="fotos">' + it.fotos.map(function (f, i) {
      return '<span style="position:relative;display:inline-block">' + (typeof f === 'string' ? '<img src="' + f + '">' : '<span style="display:inline-flex;width:80px;height:80px;align-items:center;justify-content:center;background:#e7ebf0;border-radius:8px">☁️</span>') +
        '<button onclick="inspRemFoto(' + i + ')" style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;padding:0;background:#b91c1c;color:#fff;font-size:12px">✕</button></span>';
    }).join('') + '</div><div class="row" style="margin-top:6px"><button class="btn sec" id="it-cam">📷 Tirar foto</button><button class="btn sec" id="it-gal">🖼️ Galeria</button></div>' +
    '<label>Situação encontrada</label><textarea id="it-sit" rows="3" placeholder="O que foi observado">' + esc(it.situacao) + '</textarea>' +
    '<label>Recomendação</label><textarea id="it-rec" rows="3" placeholder="O que deve ser feito">' + esc(it.recomendacao) + '</textarea>' +
    '<div class="row"><div><label>Prioridade</label><select id="it-pri">' + Object.keys(INSP_PRIO).map(function (p) { return '<option' + (p === it.prioridade ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
    '<div><label>Prazo</label><input id="it-prz" value="' + esc(it.prazo) + '"></div></div>' +
    '<div class="row"><div><label>Tempo (horas)</label><input id="it-h" type="number" step="any" value="' + esc(it.horas) + '"></div><div><label>Nº de pessoas</label><input id="it-p" type="number" min="1" value="' + esc(it.pessoas) + '"></div></div></div>';
  html += '<div class="card"><h2>Materiais / recursos</h2>' + it.materiais.map(function (m, i) {
    return '<div class="mdo"><div class="row"><input class="it-md" data-i="' + i + '" value="' + esc(m.desc) + '" placeholder="Material"><button class="btn sec" style="flex:0 0 auto;width:auto" onclick="inspRemMat(' + i + ')">✕</button></div>' +
      '<div class="row" style="margin-top:6px"><input class="it-mq" data-i="' + i + '" type="number" step="any" value="' + esc(m.qtd) + '" placeholder="Qtd"><input class="it-mu" data-i="' + i + '" value="' + esc(m.un) + '" placeholder="Un" style="flex:0 0 70px"><input class="it-mv" data-i="' + i + '" type="number" step="any" value="' + esc(m.valor) + '" placeholder="Valor unit. R$"></div>' +
      '<div class="row" style="margin-top:6px"><button class="btn sec" style="padding:6px;font-size:13px" onclick="inspBuscaMat(' + i + ',\'g\')">🔎 Google</button><button class="btn sec" style="padding:6px;font-size:13px" onclick="inspBuscaMat(' + i + ',\'ml\')">🛒 Mercado Livre</button><b class="it-mt" data-i="' + i + '" style="flex:0 0 auto;text-align:right">' + brl(inspNum(m.qtd) * inspNum(m.valor)) + '</b></div></div>';
  }).join('') + '<div style="height:8px"></div><button class="btn sec" id="it-addm">+ Material</button>' +
    '<label>Outros custos (R$, opcional)</label><input id="it-out" type="number" step="any" value="' + esc(it.outros) + '" placeholder="Ex.: locação de equipamento">' +
    '<ul class="lista" id="it-tot" style="margin-top:8px">' + inspTotHtml(d, it) + '</ul>' +
    (inspNum(d.valorHora) ? '' : '<p class="muted">Informe o <b>valor hora</b> na tela da inspeção para calcular a mão de obra.</p>') + '</div>' +
    '<div class="row"><button class="btn sec" id="it-del" style="color:#b91c1c">🗑 Excluir item</button><button class="btn lar" id="it-ok">✔ Concluir item</button></div>';
  $('tela').innerHTML = html;
  var ler = function () {
    it.equipamento = $('it-eq').value; it.tag = $('it-tag').value; it.situacao = $('it-sit').value; it.recomendacao = $('it-rec').value;
    it.prioridade = $('it-pri').value; it.prazo = $('it-prz').value; it.horas = $('it-h').value; it.pessoas = $('it-p').value; it.outros = $('it-out').value;
    Array.prototype.forEach.call(document.querySelectorAll('.it-md'), function (e) { it.materiais[e.dataset.i].desc = e.value; });
    Array.prototype.forEach.call(document.querySelectorAll('.it-mq'), function (e) { it.materiais[e.dataset.i].qtd = e.value; });
    Array.prototype.forEach.call(document.querySelectorAll('.it-mu'), function (e) { it.materiais[e.dataset.i].un = e.value; });
    Array.prototype.forEach.call(document.querySelectorAll('.it-mv'), function (e) { it.materiais[e.dataset.i].valor = e.value; });
  };
  I.lerItem = ler;
  var salvar = function (rerender) { ler(); inspTotais(d);
    Array.prototype.forEach.call(document.querySelectorAll('.it-mt'), function (e) { var m = it.materiais[e.dataset.i]; e.textContent = brl(inspNum(m.qtd) * inspNum(m.valor)); });
    if ($('it-tot')) $('it-tot').innerHTML = inspTotHtml(d, it);
    return inspSalvarLocal().then(function () { if (rerender) { var y = window.scrollY; render(); window.scrollTo(0, y); } }); };
  Array.prototype.forEach.call(document.querySelectorAll('#tela input, #tela textarea, #tela select'), function (e) {
    e.onchange = function () { if (e.id === 'it-pri') $('it-prz').value = INSP_PRIO[e.value] || ''; salvar(false); };
  });
  var addFoto = function (campo) { ler(); tirarFoto(campo).then(function (a) { return Promise.all(a.slice(0, 4).map(function (f) { return lerFoto(f, 1280, 0.7); })); }).then(function (l) { if (!l.length) return; it.fotos = it.fotos.concat(l).slice(0, 6); salvar(true); }).catch(function (e) { aviso(e.message, 'err'); }); };
  $('it-cam').onclick = function () { addFoto(inspCam()); };
  $('it-gal').onclick = function () { addFoto('galeria'); };
  $('it-addm').onclick = function () { ler(); it.materiais.push({ desc: '', qtd: 1, un: 'un', valor: '' }); salvar(true); };
  $('it-ok').onclick = function () { salvar(false).then(function () { gIr('insp'); }); };
  $('it-del').onclick = function () { if (!confirm('Excluir este item?')) return; d.itens.splice(I.item, 1); inspSalvarLocal().then(function () { gIr('insp'); }); };
}
function inspTotHtml(d, it) {
  return '<li><span>Materiais</span><b>' + brl(it.totMateriais) + '</b></li><li><span>Mão de obra (' + String(Math.round(it.hh * 10) / 10).replace('.', ',') + ' HH × ' + brl(inspNum(d.valorHora)) + ')</span><b>' + brl(it.totMaoObra) + '</b></li>' +
    (inspNum(it.outros) ? '<li><span>Outros</span><b>' + brl(inspNum(it.outros)) + '</b></li>' : '') + '<li><span><b>Total do item</b></span><b style="color:var(--laranja)">' + brl(it.total) + '</b></li>';
}
function inspRemFoto(i) { I.lerItem(); I.atual.itens[I.item].fotos.splice(i, 1); inspSalvarLocal().then(render); }
function inspRemMat(i) { I.lerItem(); I.atual.itens[I.item].materiais.splice(i, 1); inspSalvarLocal().then(render); }
function inspBuscaMat(i, site) { I.lerItem(); inspSalvarLocal(); inspBusca(site, I.atual.itens[I.item].materiais[i].desc); }
