/* DNP Gestão — telas do celular para TODAS as funções do sistema.
   O servidor informa cada função (nome, parâmetros e campos); o app monta listas, fichas, formulários e ações. */
var A = { meta: null, mod: null, fn: null, res: null, resFn: null, item: null, cache: {}, busca: '', volta: [] };
var A_MODS = [
  ['orc', 'Orçamentos', '📄', 'orcamentos', /Orcamento|Etapa|ItemOrc|Composic|Subitem|Bdi|BDI|Proposta|Hh|ItemMaoDeObra|ItemMaterial|ItensMaoDeObra|ItensMaterial|ItensParaSelecao/],
  ['proj', 'Obras e projetos', '🏗️', 'projetos', /Projeto|Cronograma|Diario|Medic|Apontamento|Rdo/],
  ['fin', 'Financeiro', '💰', 'financeiro', /Lancamento|Financ|CustoFixo|CustosFixos|Projecao|Comparativo|Conta(?!to)/],
  ['req', 'Compras e reembolsos', '🛒', 'requisicoes', /Requisic|Reembolso|FormasPagamento|TiposDespesa/],
  ['crm', 'CRM e clientes', '🎯', 'crm', /Oportunidade|Cliente|Contato|Funil|Origem|Lead/],
  ['emp', 'Empresa', '🏢', 'usuarios', /Empresa/],
  ['folha', 'Folha de pagamento', '💵', 'rh', /^folha|Folha|Holerite/],
  ['freq', 'Frequência e ponto', '📅', 'frequencia', /Espelho|Frequencia|Ajuste|Ponto|Batida|appAdmin|Acesso|LocalObra/],
  ['rh', 'RH', '👷', 'rh', /Funcionari|Funcao|Funcoes|Encargo|HorasExtra|Adiantament|TiposDocumento|Documento|Ferias/],
  ['soc', 'Sócios', '🤝', 'socios', /Socio/],
  ['epi', 'EPI e treinamentos', '🦺', 'epi', /Epi|Treinament|Turma|Participante|Instrutor|Assinatura|Entrega|Presenca|OrdemServico|Cargo/],
  ['usu', 'Usuários e perfis', '🔐', 'usuarios', /Usuario|Perfil|Permiss|Log/],
  ['out', 'Outros', '⚙️', null, /./]
];
var A_VERBO = /^(listar|obter|criar|editar|atualizar|excluir|remover|alternar|registrar|gerar|aprovar|reprovar|marcar|salvar|adicionar|duplicar|converter|enviar|cancelar|definir|calcular|lancar|pagar|confirmar|darBaixa|reabrir|mover|vincular|desvincular|importar|baixar|resetar|redefinir|folha)/;
var A_ESCONDER = /^(logout|validarSessao|login)$|ParaSelecao$/;

function aNome(fn) { // "darBaixaLancamento" -> "Dar baixa lancamento"
  return fn.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); })
    .replace(/cao\b/g, 'ção').replace(/coes\b/g, 'ções').replace(/sao\b/g, 'são').replace(/ orcamento/g, ' orçamento').replace(/ socio/g, ' sócio').replace(/ funcionario/g, ' funcionário').replace(/ usuario/g, ' usuário').replace(/ lancamento/g, ' lançamento').replace(/ medica/g, ' medi').replace(/ servico/g, ' serviço');
}
function aMeta() {
  if (A.meta) return Promise.resolve(A.meta);
  return DB.get('g_meta').then(function (m) {
    var rede = navigator.onLine ? api('gMeta').then(function (r) { A.meta = r; DB.set('g_meta', r); return r; }) : null;
    if (m) { A.meta = m; if (rede) rede.catch(function () {}); return m; }
    if (!rede) throw new Error('Sem internet para carregar as telas.');
    return rede;
  });
}
function aModDe(n) { for (var i = 0; i < A_MODS.length; i++) if (A_MODS[i][4].test(n)) return A_MODS[i][0]; return 'out'; }
function aFns(mod) { return (A.meta || []).filter(function (f) { return !A_ESCONDER.test(f.n) && aModDe(f.n) === mod; }); }
function aParamItem(p) { return p === 'id' || /Id$/.test(p); }
function aEhConsulta(f) { return /^(listar|obter|calcular)/.test(f.n) && f.p.every(function (p) { return !aParamItem(p) || /^(projetoId|funcionarioId|clienteId)$/.test(p); }); }
function aSingular(fn) { // listarLancamentos -> Lancamento ; listarFuncoes -> Funcao ; listarItensEpi -> ItemEpi
  var r = fn.replace(A_VERBO, ''), w = r.match(/[A-Z][a-z]*/g) || [r];
  w[0] = w[0].replace(/oes$/, 'ao').replace(/aes$/, 'ao').replace(/ns$/, 'm').replace(/is$/, 'il').replace(/res$/, 'r').replace(/s$/, '');
  return w.join('');
}

// ---------- telas ----------
function aTelaHome() {
  var html = '<div class="card"><h2>Gestão DNP</h2><p class="muted">Todas as funções do sistema, por área.</p><div class="grade">' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'orcs\')">📄 Orçamentos<small>lista, status, PDF</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="G.novo=null;gIr(\'novoOrc\')">➕ Novo orçamento<small>funciona sem internet</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'projs\')">🏗️ Obras<small>colocar em execução</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'medEscolher\')">📏 Medições<small>medir obra, PDF, faturar</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'novaReq\')">🛒 Nova requisição<small>sem internet</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'novoReemb\')">🧾 Novo reembolso<small>foto do recibo</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'insps\')">🔎 Inspeções<small>relatório com fotos</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="S.tela=\'sistema\';render()">🖥️ Sistema web<small>tela do computador</small></button></div></div>';
  if (!A.meta) {
    $('tela').innerHTML = html + '<div class="card muted">Carregando as áreas do sistema...</div>';
    aMeta().then(function () { if (G.view === 'auto') aTelaHome(); }).catch(function (e) { aviso(e.message, 'err'); });
    return;
  }
  html += '<div class="card"><h2>Todas as áreas</h2><div class="grade">' + A_MODS.filter(function (m) { return (!m[3] || gPode(m[3], 'ver')) && aFns(m[0]).length; }).map(function (m) {
    return '<button class="bat" style="text-align:left;padding:14px" onclick="A.mod=\'' + m[0] + '\';gIr(\'autoMod\')">' + m[2] + ' ' + m[1] + '<small>' + aFns(m[0]).length + ' funções</small></button>';
  }).join('') + '</div></div>';
  $('tela').innerHTML = html;
}
function aTelaMod() {
  var m = A_MODS.filter(function (x) { return x[0] === A.mod; })[0]; if (!m || !A.meta) return gIr('auto');
  var fs = aFns(m[0]), cons = fs.filter(aEhConsulta), acoes = fs.filter(function (f) { return !aEhConsulta(f) && !f.p.some(aParamItem); });
  var bt = function (f) { return '<li style="cursor:pointer" onclick="aAbrirFn(\'' + f.n + '\')"><span>' + esc(aNome(f.n)) + '</span><span class="muted">›</span></li>'; };
  $('tela').innerHTML = gVoltar('auto') + '<div class="card"><h2>' + m[2] + ' ' + esc(m[1]) + '</h2>' +
    (cons.length ? '<h2 style="font-size:15px;margin-top:6px">Consultar</h2><ul class="lista">' + cons.map(bt).join('') + '</ul>' : '') + '</div>' +
    (acoes.length ? '<div class="card"><h2 style="font-size:15px">Cadastrar e outras ações</h2><ul class="lista">' + acoes.map(bt).join('') + '</ul></div>' : '') +
    '<p class="muted">Ações sobre um registro (editar, excluir, aprovar, PDF...) aparecem ao abrir o registro.</p>';
}
function aFn(n) { return (A.meta || []).filter(function (f) { return f.n === n; })[0]; }
function aAbrirFn(n, item) {
  if (n === 'listarMedicoes' && typeof mdAbrirProjeto === 'function') { if (item && item.id) return mdAbrirProjeto(item.id, mTitulo(item)); return gIr('medEscolher'); }
  var f = aFn(n); if (!f) return;
  A.fn = f; A.item = item || null;
  var precisa = f.p.some(function (p, i) { return !(item && i === 0 && aParamItem(p)); });
  if (!precisa) return aExecutar();
  gIr('autoForm');
}

// ---------- formulário genérico ----------
function aTipo(k) {
  if (/^mesAno$|^mes$|competencia/i.test(k)) return 'month';
  if (/^data|Data[A-Z]?|data$|vencimento|nascimento|admissao|demissao/.test(k)) return 'date';
  if (/^(ativo|principal|pago|recebido|presente|feriado|gestor|podeRdo|ehFeriado|vinculado)$|^(e|tem|pode|is|usa)[A-Z]/.test(k)) return 'check';
  if (/valor|preco|custo|percentual|quantidade|qtd|horas|salario|aliquota|taxa|raio|parcelas|total|peso|bdi|desconto|acrescimo|lucro|imposto/i.test(k)) return 'number';
  if (/observ|descricao|texto|escopo|condic|motivo|atividades|ocorrencias|recomend|justific|endereco|conteudo|mensagem/i.test(k)) return 'area';
  if (aParamItem(k)) return 'ref';
  return 'text';
}
function aFonteRef(k) {
  var b = k.replace(/Id$/, ''), B = b.charAt(0).toUpperCase() + b.slice(1);
  var pl = [B + 's', B.replace(/ao$/, 'oes'), B.replace(/m$/, 'ns'), B.replace(/l$/, 'is'), B + 'es'];
  var cand = [];
  pl.forEach(function (p) { cand.push('listar' + p + 'ParaSelecao', 'listar' + p + 'Ativos', 'listar' + p); });
  cand.push('listar' + B + 'ParaSelecao');
  for (var i = 0; i < cand.length; i++) { var f = aFn(cand[i]); if (f && !f.p.length) return f.n; }
  return null;
}
function aOpcoes(fn) {
  if (A.cache[fn]) return Promise.resolve(A.cache[fn]);
  return sys(fn, []).then(function (r) { A.cache[fn] = Array.isArray(r) ? r : []; return A.cache[fn]; });
}
function aValItem(k, i) { var it = A.item; if (!it) return ''; if (it[k] !== undefined) return it[k]; if (i === 0 && aParamItem(k)) return it.id || ''; return ''; }
function aCampoHtml(nome, k, v) {
  var t = aTipo(k), rot = esc(mRot(k)), id = 'af-' + nome.replace(/\./g, '_');
  if (v && typeof v === 'object') v = '';
  if (t === 'check') return '<label style="display:flex;gap:8px;align-items:center;color:var(--texto)"><input type="checkbox" id="' + id + '" data-n="' + nome + '" data-t="check" style="width:auto"' + (v === true || v === 'true' || v === 'Sim' ? ' checked' : '') + '> ' + rot + '</label>';
  if (t === 'area') return '<label>' + rot + '</label><textarea id="' + id + '" data-n="' + nome + '" rows="3">' + esc(v) + '</textarea>';
  if (t === 'date') { var s = String(v || ''); if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) s = s.slice(6, 10) + '-' + s.slice(3, 5) + '-' + s.slice(0, 2); return '<label>' + rot + '</label><input type="date" id="' + id + '" data-n="' + nome + '" value="' + esc(s.slice(0, 10)) + '">'; }
  if (t === 'month') return '<label>' + rot + '</label><input type="month" id="' + id + '" data-n="' + nome + '" value="' + esc(String(v || dataIso(Date.now()).slice(0, 7)).slice(0, 7)) + '">';
  if (t === 'number') return '<label>' + rot + '</label><input type="number" step="any" inputmode="decimal" id="' + id + '" data-n="' + nome + '" data-t="number" value="' + esc(v === '' || v === null ? '' : v) + '">';
  if (t === 'ref') { var src = aFonteRef(k); if (src) return '<label>' + rot + '</label><select id="' + id + '" data-n="' + nome + '" data-src="' + src + '" data-v="' + esc(v) + '"><option value="">Carregando...</option></select>'; }
  var vistos = {}; (Array.isArray(A.res) ? A.res : []).forEach(function (o) { if (o && o[k] !== undefined && typeof o[k] !== 'object' && String(o[k]).length < 40) vistos[o[k]] = 1; });
  var dl = Object.keys(vistos).slice(0, 30);
  return '<label>' + rot + '</label><input id="' + id + '" data-n="' + nome + '" value="' + esc(v) + '"' + (dl.length ? ' list="' + id + '-l"><datalist id="' + id + '-l">' + dl.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist' : '') + '>';
}
function aTelaForm() {
  var f = A.fn; if (!f) return gIr('auto');
  var html = gVoltar(A.item ? 'autoItem' : 'autoMod') + '<div class="card"><h2>' + esc(aNome(f.n)) + '</h2>' + (A.item ? '<p class="muted">' + esc(mTitulo(A.item)) + '</p>' : '');
  f.p.forEach(function (p, i) {
    if (A.item && i === 0 && aParamItem(p) && aValItem(p, 0)) return; // o próprio registro
    if (f.c[p]) f.c[p].forEach(function (k) { html += aCampoHtml(p + '.' + k, k, aValItem(k)); });
    else html += aCampoHtml(p, p, aValItem(p));
  });
  html += '<div style="height:14px"></div><button class="btn lar" id="af-ok">' + (/^(listar|obter|calcular)/.test(f.n) ? 'Consultar' : 'Salvar') + '</button></div>';
  $('tela').innerHTML = html;
  aCarregarSelects();
  $('af-ok').onclick = function () { aExecutar(true); };
}
function aArgs() {
  var f = A.fn, vals = {};
  Array.prototype.forEach.call(document.querySelectorAll('#tela [data-n]'), function (e) {
    var v = e.dataset.t === 'check' ? e.checked : e.value;
    if (e.dataset.t === 'number' && v !== '') v = Number(v);
    vals[e.dataset.n] = v;
  });
  return f.p.map(function (p, i) {
    if (A.item && i === 0 && aParamItem(p) && vals[p] === undefined) return aValItem(p, 0);
    if (f.c[p]) { var o = {}; f.c[p].forEach(function (k) { if (vals[p + '.' + k] !== undefined) o[k] = vals[p + '.' + k]; }); return o; }
    return vals[p] === undefined ? '' : vals[p];
  });
}
function aExecutar(doForm) {
  var f = A.fn, args = doForm ? aArgs() : f.p.map(function (p, i) { return aValItem(p, i); });
  var leitura = /^(listar|obter|calcular)/.test(f.n);
  if (!leitura && !doForm && !confirm(aNome(f.n) + (A.item ? ' — ' + mTitulo(A.item) : '') + '?')) return;
  if (!gOnline()) return;
  aviso(leitura ? 'Carregando...' : 'Salvando...');
  sys(f.n, args).then(function (r) {
    if (typeof r === 'string' && /^https?:\/\//.test(r)) { window.open(r, '_blank'); return; }
    if (r && typeof r === 'object' && !Array.isArray(r) && (r.url || r.link || r.pdfUrl)) { window.open(r.url || r.link || r.pdfUrl, '_blank'); aviso('Pronto.', 'ok'); return; }
    if (leitura) { if (A.resFn !== f.n) { A.filtros = {}; A.busca = ''; A.ordem = ''; A.de = A.ate = ''; } A.res = r; A.resFn = f.n; $('aviso').style.display = 'none'; gIr('autoRes'); return; }
    aviso((r && (r.mensagem || r.msg)) || 'Feito.', 'ok');
    A.cache = {};
    if (A.resFn && aFn(A.resFn)) { var lf = aFn(A.resFn); A.fn = lf; A.item = null; if (!lf.p.length) return aExecutar(false); }
    gIr('autoMod');
  }).catch(function (e) { aviso(e.message, 'err'); });
}

// ---------- resultado: lista com filtros, ordenação e totais ----------
A.filtros = {}; A.ordem = ''; A.desc = true; A.de = ''; A.ate = '';
var A_CORES = { pago: '#1b7f3b', recebido: '#1b7f3b', aprovado: '#1b7f3b', concluido: '#1b7f3b', ativo: '#1b7f3b', faturado: '#1b7f3b', 'em andamento': '#1565c0', pendente: '#c77700', previsto: '#c77700', planejamento: '#6a4fb3', enviado: '#1565c0', rascunho: '#777', pausado: '#c77700', cancelado: '#c62828', reprovado: '#c62828', atrasado: '#c62828', vencido: '#c62828', inativo: '#777' };
function aSemAcento(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function aBadge(v) { var c = A_CORES[aSemAcento(v)] || '#555'; return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:' + c + '">' + esc(v) + '</span>'; }
function aAnalisar(l) { // descobre campos de filtro, data, valor e status
  var objs = l.filter(function (o) { return o && typeof o === 'object'; }), n = objs.length, info = { enums: [], datas: [], nums: [], status: null, campos: [] };
  if (!n) return info;
  var ks = {}; objs.slice(0, 300).forEach(function (o) { Object.keys(o).forEach(function (k) { if (typeof o[k] !== 'object') ks[k] = 1; }); });
  info.campos = Object.keys(ks).filter(function (k) { return !/^id$|Id$|^_/.test(k); });
  info.campos.forEach(function (k) {
    var vs = {}, cheios = 0, num = 0, dt = 0;
    objs.forEach(function (o) { var v = o[k]; if (v === '' || v === null || v === undefined) return; cheios++; if (typeof v === 'number') num++; else if (/^\d{4}-\d{2}-\d{2}/.test(String(v)) || /^\d{2}\/\d{2}\/\d{4}/.test(String(v))) dt++; vs[String(v)] = 1; });
    var dist = Object.keys(vs).length;
    if (dt && dt >= cheios * 0.8) info.datas.push(k);
    else if (num && num >= cheios * 0.8) { if (!/numero|ordem|^ano$|^mes$/i.test(k)) info.nums.push(k); }
    else if (!/descri|nome|titulo|observ|email|telefone|endereco/i.test(k) && dist >= 2 && dist <= 15 && cheios >= n * 0.4 && Object.keys(vs).every(function (x) { return x.length <= 30; })) info.enums.push(k);
  });
  info.status = info.enums.filter(function (k) { return /status|situacao|etapa|fase/i.test(k); })[0] || null;
  return info;
}
function aIsoData(v) { var s = String(v || ''); if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(6, 10) + '-' + s.slice(3, 5) + '-' + s.slice(0, 2); return s.slice(0, 10); }
function aFiltrada() {
  var l = Array.isArray(A.res) ? A.res.map(function (o, i) { return [o, i]; }) : [], q = aSemAcento(A.busca), inf = A.info, dk = inf.datas[0];
  l = l.filter(function (x) {
    var o = x[0]; if (!o || typeof o !== 'object') return !q || aSemAcento(o).indexOf(q) >= 0;
    for (var k in A.filtros) if (A.filtros[k] !== '' && String(o[k]) !== A.filtros[k]) return false;
    if (dk && (A.de || A.ate)) { var d = aIsoData(o[dk]); if (A.de && d < A.de) return false; if (A.ate && d > A.ate) return false; }
    return !q || aSemAcento(JSON.stringify(o)).indexOf(q) >= 0;
  });
  if (A.ordem) l.sort(function (a, b) {
    var x = a[0][A.ordem], y = b[0][A.ordem]; if (inf.datas.indexOf(A.ordem) >= 0) { x = aIsoData(x); y = aIsoData(y); }
    var r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x || '').localeCompare(String(y || ''), 'pt', { numeric: true });
    return A.desc ? -r : r;
  });
  return l;
}
function aSel(id, rot, opts, val) { return '<select id="' + id + '" style="flex:1 1 45%;min-width:0;padding:8px">' + '<option value="">' + esc(rot) + '</option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
function aTelaRes() {
  var r = A.res, html = gVoltar('autoMod') + '<div class="card"><h2>' + esc(aNome(A.resFn || '').replace(/^Listar (.)/, function (m, c) { return c.toUpperCase(); })) + '</h2>';
  var criar = aFns(aModDe(A.resFn || '')).filter(function (f) { return /^(criar|adicionar|registrar|cadastrar|novo)/.test(f.n) && f.n.indexOf(aSingular(A.resFn)) > 0; })[0];
  if (criar) html += '<button class="btn lar" onclick="A.item=null;aAbrirFn(\'' + criar.n + '\')">+ Novo</button><div style="height:8px"></div>';
  if (!Array.isArray(r)) {
    if (r && typeof r === 'object') { A.item = r; $('tela').innerHTML = html + '</div>'; return aTelaItem(true); }
    $('tela').innerHTML = html + '<p>' + esc(mVal('', r)) + '</p></div>'; return;
  }
  var inf = A.info = aAnalisar(r);
  html += '<input id="ar-busca" placeholder="🔎 Buscar em tudo" value="' + esc(A.busca) + '">' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' +
    inf.enums.slice(0, 6).map(function (k) { var vs = {}; r.forEach(function (o) { if (o && o[k] !== '' && o[k] != null) vs[o[k]] = (vs[o[k]] || 0) + 1; }); return aSel('ar-f-' + k, mRot(k) + ': todos', Object.keys(vs).sort().map(function (v) { return [v, v + ' (' + vs[v] + ')']; }), A.filtros[k] || ''); }).join('') +
    aSel('ar-ord', 'Ordenar por...', inf.campos.map(function (k) { return [k, mRot(k)]; }), A.ordem) +
    (A.ordem ? '<button class="btn sec" id="ar-dir" style="width:auto;padding:8px 12px">' + (A.desc ? '↓' : '↑') + '</button>' : '') + '</div>' +
    (inf.datas.length ? '<div style="display:flex;gap:6px;margin-top:8px;align-items:center"><span class="muted" style="font-size:12px">' + esc(mRot(inf.datas[0])) + '</span><input type="date" id="ar-de" value="' + A.de + '" style="padding:8px"><input type="date" id="ar-ate" value="' + A.ate + '" style="padding:8px"></div>' : '') +
    '<button class="btn sec" id="ar-limpa" style="margin-top:8px;padding:8px">Limpar filtros</button></div><div id="ar-lista"></div>';
  $('tela').innerHTML = html;
  $('ar-busca').oninput = function () { A.busca = this.value; aListar(); };
  inf.enums.slice(0, 6).forEach(function (k) { $('ar-f-' + k).onchange = function () { A.filtros[k] = this.value; aListar(); }; });
  $('ar-ord').onchange = function () { A.ordem = this.value; aTelaRes(); };
  if ($('ar-dir')) $('ar-dir').onclick = function () { A.desc = !A.desc; aTelaRes(); };
  if ($('ar-de')) { $('ar-de').onchange = function () { A.de = this.value; aListar(); }; $('ar-ate').onchange = function () { A.ate = this.value; aListar(); }; }
  $('ar-limpa').onclick = function () { A.filtros = {}; A.busca = ''; A.de = A.ate = ''; A.ordem = ''; aTelaRes(); };
  aListar();
}
function aListar() {
  var l = aFiltrada(), inf = A.info, tot = '';
  var nk = inf.nums.filter(function (k) { return /valor|total|saldo|custo|preco|receita|despesa/i.test(k); })[0];
  if (nk) { var s = 0; l.forEach(function (x) { s += Number(x[0][nk]) || 0; }); tot = ' · ' + esc(mRot(nk)) + ': <b>' + esc(mVal(nk, s)) + '</b>'; }
  $('ar-lista').innerHTML = '<div class="card"><p class="muted" style="margin:0 0 6px">' + l.length + ' de ' + A.res.length + ' registro(s)' + tot + '</p><ul class="lista">' + l.slice(0, 300).map(function (x) {
    var o = x[0]; if (!o || typeof o !== 'object') return '<li>' + esc(mVal('', o)) + '</li>';
    var tit = mTitulo(o), cs = mCampos(o).filter(function (k) { return String(o[k]) !== tit && k !== inf.status && o[k] !== '' && o[k] != null; });
    cs.sort(function (a, b) { return (inf.nums.indexOf(b) >= 0 || inf.datas.indexOf(b) >= 0) - (inf.nums.indexOf(a) >= 0 || inf.datas.indexOf(a) >= 0); });
    return '<li style="cursor:pointer;display:block" onclick="aVerItem(' + x[1] + ')"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(tit) + '</b>' + (inf.status && o[inf.status] ? aBadge(o[inf.status]) : '') + '</div><span class="muted" style="font-size:13px">' + cs.slice(0, 4).map(function (k) { return esc(mRot(k)) + ': ' + esc(mVal(k, o[k])); }).join(' · ') + '</span></li>';
  }).join('') + '</ul>' + (l.length > 300 ? '<p class="muted">Mostrando 300. Use a busca ou os filtros.</p>' : '') + '</div>';
}
function aVerItem(i) {
  A.item = A.res[i]; A.itemIdx = i;
  var s = aSingular(A.resFn), ob = aFn('obter' + s);
  if (ob && ob.p.length === 1 && A.item && A.item.id && navigator.onLine) {
    aviso('Abrindo...');
    sys(ob.n, [A.item.id]).then(function (r) { if (r && typeof r === 'object' && !Array.isArray(r)) A.item = Object.assign({}, A.item, r); $('aviso').style.display = 'none'; }).catch(function () {}).then(function () { gIr('autoItem'); });
  } else gIr('autoItem');
}

// ---------- ficha do registro: edição direta ----------
function aFnEditar() {
  var s = aSingular(A.resFn || ''); if (!s) return null;
  return aFns(aModDe(A.resFn || '')).filter(function (f) {
    return /^(editar|atualizar|salvar|alterar)/.test(f.n) && f.n.replace(/^(editar|atualizar|salvar|alterar)/, '') === s && f.p.length >= 1;
  })[0] || null;
}
function aCamposEditar(f) {
  var it = A.item || {}, pd = f.p.length >= 2 ? f.p[1] : f.p[0], cs = f.c[pd] && f.c[pd].length ? f.c[pd].slice() : Object.keys(it).filter(function (k) { return typeof it[k] !== 'object' && !/^_|criado|atualizado|^data(Criacao|Atualizacao|Cadastro)$|^(criadoPor|usuario)$/i.test(k); });
  return { pd: pd, cs: cs.filter(function (k) { return k !== 'id'; }) };
}
function aTelaItem(semVoltar) {
  var it = A.item; if (!it) return gIr('autoRes');
  var inf = A.info || aAnalisar([it]), st = inf.status && it[inf.status];
  var html = (semVoltar ? '' : gVoltar('autoRes')) + '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">' + esc(mTitulo(it)) + '</h2>' + (st ? aBadge(st) : '') + '</div></div>';
  var ed = it.id ? aFnEditar() : null, ce = ed ? aCamposEditar(ed) : null;
  if (ed && ce.cs.length) {
    A.edFn = ed; A.edCampos = ce;
    html += '<div class="card" id="ai-form"><h2 style="font-size:15px">✏️ Editar</h2>' + ce.cs.map(function (k) { return aCampoHtml('e.' + k, k, it[k] === undefined ? '' : it[k]); }).join('') +
      '<div style="height:12px"></div><button class="btn lar" id="ai-salvar">Salvar alterações</button></div>';
    var resto = Object.keys(it).filter(function (k) { return ce.cs.indexOf(k) < 0 && !/^id$|^_/.test(k); });
    var so = {}; resto.forEach(function (k) { so[k] = it[k]; });
    if (resto.length) html += '<details class="card"><summary style="font-weight:700;cursor:pointer">Mais informações</summary>' + mObj(so) + '</details>';
  } else html += mObj(it);
  if (/^Projeto/.test(aSingular(A.resFn || '')) && it.id && typeof mdAbrirProjeto === 'function') html += '<button class="btn lar" style="margin-bottom:12px" onclick="mdAbrirProjeto(A.item.id, mTitulo(A.item))">📏 Medições desta obra</button>';
  html += aAcoesHtml(ed);
  if (semVoltar) $('tela').insertAdjacentHTML('beforeend', html); else $('tela').innerHTML = html;
  aCarregarSelects();
  if ($('ai-salvar')) $('ai-salvar').onclick = aSalvarItem;
}
function aCarregarSelects() {
  Array.prototype.forEach.call(document.querySelectorAll('select[data-src]'), function (s) {
    aOpcoes(s.dataset.src).then(function (l) {
      s.innerHTML = '<option value="">— escolha —</option>' + l.map(function (o) { var id = o.id || o.valor || o; return '<option value="' + esc(id) + '"' + (String(id) === s.dataset.v ? ' selected' : '') + '>' + esc(typeof o === 'object' ? mTitulo(o) : o) + '</option>'; }).join('');
    }).catch(function () { s.outerHTML = '<input data-n="' + s.dataset.n + '" value="' + esc(s.dataset.v) + '">'; });
  });
}
function aSalvarItem() {
  if (!gOnline()) return;
  var f = A.edFn, dados = {};
  Array.prototype.forEach.call(document.querySelectorAll('#ai-form [data-n]'), function (e) {
    var k = e.dataset.n.slice(2), v = e.dataset.t === 'check' ? e.checked : e.value;
    if (e.dataset.t === 'number' && v !== '') v = Number(v);
    dados[k] = v;
  });
  var args = f.p.length >= 2 ? [A.item.id, dados].concat(f.p.slice(2).map(function () { return ''; })) : [Object.assign({ id: A.item.id }, dados)];
  var b = $('ai-salvar'); b.disabled = true; aviso('Salvando...');
  sys(f.n, args).then(function (r) {
    Object.assign(A.item, dados);
    if (Array.isArray(A.res) && A.itemIdx != null && A.res[A.itemIdx]) Object.assign(A.res[A.itemIdx], dados);
    A.cache = {};
    aviso((r && (r.mensagem || r.msg)) || 'Alterações salvas.', 'ok');
    aTelaItem();
  }).catch(function (e) { aviso(e.message, 'err'); b.disabled = false; });
}
function aAcoesHtml(ed) {
  var s = aSingular(A.resFn || ''), mod = aModDe(A.resFn || ''), it = A.item || {};
  if (!it.id) return '';
  var fs = aFns(mod).filter(function (f) { return f.p.length && aParamItem(f.p[0]) && !/^listar/.test(f.n) && f !== ed; });
  var meus = fs.filter(function (f) { return s && f.n.indexOf(s) > 0 && f.n !== 'obter' + s; });
  var b = function (f) { var perigo = /^(excluir|remover|cancelar)/.test(f.n); return '<button class="btn ' + (perigo ? 'sec' : '') + '" style="margin-top:8px' + (perigo ? ';color:var(--erro)' : '') + '" onclick="aAbrirFn(\'' + f.n + '\', A.item)">' + (perigo ? '🗑️ ' : /pdf|gerar/i.test(f.n) ? '📄 ' : '▶️ ') + esc(aNome(f.n)) + '</button>'; };
  meus.sort(function (a, b2) { return /^(excluir|remover)/.test(a.n) - /^(excluir|remover)/.test(b2.n); });
  var outros = fs.filter(function (f) { return meus.indexOf(f) < 0 && /^(listar|obter|gerar)/.test(f.n) && f.p.length === 1; });
  return (meus.length ? '<div class="card"><h2 style="font-size:15px">Ações</h2>' + meus.map(b).join('') + '</div>' : '') +
    (outros.length ? '<div class="card"><h2 style="font-size:15px">Relacionados</h2><ul class="lista">' + outros.map(function (f) { return '<li style="cursor:pointer" onclick="aAbrirFn(\'' + f.n + '\', A.item)"><span>' + esc(aNome(f.n)) + '</span><span class="muted">›</span></li>'; }).join('') + '</ul></div>' : '');
}

// rotas dentro da aba Gestão
var _gRotaAntiga = typeof gRotaExtra === 'function' ? gRotaExtra : null;
gRotaExtra = function (v) {
  if (v === 'auto' || v === 'menu') { aTelaHome(); return true; }
  if (v === 'autoMod') { aTelaMod(); return true; }
  if (v === 'autoForm') { aTelaForm(); return true; }
  if (v === 'autoRes') { aTelaRes(); return true; }
  if (v === 'autoItem') { aTelaItem(); return true; }
  return _gRotaAntiga ? _gRotaAntiga(v) : false;
};

if (typeof G !== 'undefined' && !G.view) G.view = 'auto';
