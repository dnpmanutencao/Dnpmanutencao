/* DNP Gestão — demais módulos do sistema (financeiro, RH, frequência, CRM, sócios, usuários, EPI, empresa).
   Consulta nativa no celular; para editar, "Sistema completo" abre as telas do sistema dentro do app. */
var MODS = [
  { k: 'fin', t: 'Financeiro', ic: '💰', p: 'financeiro', f: [['obterResumoFinanceiro', 'Resumo'], ['listarLancamentos', 'Lançamentos'], ['listarCustosFixos', 'Custos fixos'], ['listarProjecaoMedicoes', 'Projeção de medições'], ['listarComparativoCustosProjetos', 'Custo x projeto']] },
  { k: 'rh', t: 'RH', ic: '👷', p: 'rh', f: [['listarFuncionarios', 'Funcionários'], ['listarFuncoes', 'Funções']] },
  { k: 'freq', t: 'Frequência', ic: '📅', p: 'frequencia', f: [['listarResumoFrequencia', 'Resumo do mês', 'mes']] },
  { k: 'crm', t: 'CRM', ic: '🎯', p: 'crm', f: [['listarOportunidades', 'Oportunidades'], ['listarClientes', 'Clientes'], ['obterRelatorioFunil', 'Funil']] },
  { k: 'soc', t: 'Sócios', ic: '🤝', p: 'socios', f: [['obterResumoSocios', 'Resumo'], ['listarSocios', 'Sócios']] },
  { k: 'usu', t: 'Usuários', ic: '🔐', p: 'usuarios', f: [['listarUsuarios', 'Usuários'], ['listarPerfis', 'Perfis']] },
  { k: 'epi', t: 'EPI / Treinamentos', ic: '🦺', p: 'epi', f: [['listarTurmas', 'Turmas'], ['listarItensEpi', 'Itens de EPI'], ['listarCatalogoTreinamentos', 'Treinamentos']] },
  { k: 'emp', t: 'Empresa', ic: '🏢', p: 'usuarios', f: [['listarDocumentosEmpresa', 'Documentos']] }
];
var M = { mod: null, fonte: 0, dados: {}, busca: '', item: null, mes: dataIso(Date.now()).slice(0, 7) };

function gMenuExtra() {
  var h = MODS.filter(function (m) { return gPode(m.p, 'ver'); }).map(function (m) {
    return '<button class="bat" style="text-align:left;padding:14px" onclick="mAbrir(\'' + m.k + '\')">' + m.ic + ' ' + m.t + '<small>consultar</small></button>';
  }).join('');
  return h + '<button class="bat" style="text-align:left;padding:14px;border:2px solid var(--laranja)" onclick="gSistemaCompleto()">🖥️ Sistema completo<small>todas as telas, para editar</small></button>';
}
function gRotaExtra(v) { if (v === 'mod') { mTela(); return true; } if (v === 'modItem') { mTelaItem(); return true; } return false; }
function mAbrir(k) { M.mod = MODS.filter(function (m) { return m.k === k; })[0]; M.fonte = 0; M.busca = ''; gIr('mod'); }

function mRot(k) { return String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, function (c) { return c.toUpperCase(); }); }
function mVal(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return /valor|total|saldo|custo|preco|receita|despesa|lucro|aport|retir|salario|pago|venda|medi/i.test(k) && !/percent|qtd|quant|horas|dias|numero/i.test(k) ? brl(v) : String(Math.round(v * 100) / 100).replace('.', ',');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10).split('-').reverse().join('/');
  if (typeof v === 'object') return Array.isArray(v) ? v.length + ' item(ns)' : '…';
  return String(v);
}
function mCampos(o) { return Object.keys(o).filter(function (k) { return !/^id$|Id$|^_/.test(k) && typeof o[k] !== 'object'; }); }
function mTitulo(o) { var k = ['titulo', 'nome', 'nomeFantasia', 'descricao', 'razaoSocial', 'email'].filter(function (x) { return o[x]; })[0]; return k ? String(o[k]) : mVal('', o[mCampos(o)[0]]); }

function mTela() {
  var m = M.mod; if (!m) return gIr('menu');
  var f = m.f[M.fonte], ch = m.k + '|' + M.fonte + (f[2] ? '|' + M.mes : ''), d = M.dados[ch];
  var html = gVoltar() + '<div class="card"><h2>' + m.ic + ' ' + esc(m.t) + '</h2>' +
    (m.f.length > 1 ? '<div class="row" style="flex-wrap:wrap;gap:6px">' + m.f.map(function (x, i) { return '<button class="btn ' + (i === M.fonte ? '' : 'sec') + '" style="width:auto;flex:0 0 auto;padding:8px 12px;font-size:13px" onclick="M.fonte=' + i + ';M.busca=\'\';mTela()">' + esc(x[1]) + '</button>'; }).join('') + '</div>' : '') +
    (f[2] === 'mes' ? '<label>Mês</label><input type="month" id="m-mes" value="' + M.mes + '">' : '') +
    '<div style="height:8px"></div><input id="m-busca" placeholder="Buscar" value="' + esc(M.busca) + '"></div>';
  if (d === undefined) html += '<div class="card muted">Carregando...</div>';
  else if (d && d.erro) html += '<div class="card" style="color:var(--erro)">' + esc(d.erro) + '</div>';
  else html += mHtml(d, ch);
  html += '<button class="btn sec" onclick="gSistemaCompleto()">🖥️ Editar no sistema completo</button>';
  $('tela').innerHTML = html;
  $('m-busca').oninput = function () { M.busca = this.value; var p = this.selectionStart; mTela(); var b = $('m-busca'); b.focus(); b.setSelectionRange(p, p); };
  if ($('m-mes')) $('m-mes').onchange = function () { M.mes = this.value; mTela(); };
  if (d === undefined && !M['_c' + ch]) {
    if (!gOnline()) return;
    M['_c' + ch] = 1;
    sys(f[0], f[2] === 'mes' ? [M.mes] : []).then(function (r) { M.dados[ch] = r; }).catch(function (e) { M.dados[ch] = { erro: e.message }; })
      .then(function () { delete M['_c' + ch]; if (G.view === 'mod') mTela(); });
  }
}
function mHtml(d, ch) {
  if (Array.isArray(d)) {
    var q = M.busca.toLowerCase(), l = d.map(function (o, i) { return [o, i]; }).filter(function (x) { return !q || JSON.stringify(x[0]).toLowerCase().indexOf(q) >= 0; });
    if (!l.length) return '<div class="card muted">Nada encontrado.</div>';
    return '<div class="card"><p class="muted">' + l.length + ' registro(s)</p><ul class="lista">' + l.slice(0, 150).map(function (x) {
      var o = x[0]; if (typeof o !== 'object') return '<li>' + esc(mVal('', o)) + '</li>';
      var cs = mCampos(o).filter(function (k) { return String(o[k]) !== mTitulo(o); }).slice(0, 4);
      return '<li style="cursor:pointer;display:block" onclick="mVer(\'' + ch + '\',' + x[1] + ')"><b>' + esc(mTitulo(o)) + '</b><br><span class="muted">' + cs.map(function (k) { return esc(mRot(k)) + ': ' + esc(mVal(k, o[k])); }).join(' · ') + '</span></li>';
    }).join('') + '</ul></div>';
  }
  if (d && typeof d === 'object') return mObj(d);
  return '<div class="card">' + esc(mVal('', d)) + '</div>';
}
function mObj(o) {
  var simples = Object.keys(o).filter(function (k) { return typeof o[k] !== 'object' || o[k] === null; });
  var h = '<div class="card"><ul class="lista">' + simples.filter(function (k) { return !/^id$|Id$/.test(k); }).map(function (k) { return '<li><span>' + esc(mRot(k)) + '</span><b style="text-align:right">' + esc(mVal(k, o[k])) + '</b></li>'; }).join('') + '</ul></div>';
  Object.keys(o).filter(function (k) { return o[k] && typeof o[k] === 'object'; }).forEach(function (k) {
    var v = o[k];
    h += '<div class="card"><h2>' + esc(mRot(k)) + '</h2>' + (Array.isArray(v) ? '<ul class="lista">' + v.slice(0, 100).map(function (x) {
      return typeof x === 'object' && x ? '<li style="display:block"><b>' + esc(mTitulo(x)) + '</b><br><span class="muted">' + mCampos(x).filter(function (c) { return String(x[c]) !== mTitulo(x); }).slice(0, 5).map(function (c) { return esc(mRot(c)) + ': ' + esc(mVal(c, x[c])); }).join(' · ') + '</span></li>' : '<li>' + esc(mVal(k, x)) + '</li>';
    }).join('') + '</ul>' : '<ul class="lista">' + Object.keys(v).map(function (c) { return '<li><span>' + esc(mRot(c)) + '</span><b>' + esc(mVal(c, v[c])) + '</b></li>'; }).join('') + '</ul>') + '</div>';
  });
  return h;
}
function mVer(ch, i) { M.item = M.dados[ch][i]; gIr('modItem'); }
function mTelaItem() {
  if (!M.item) return gIr('mod');
  $('tela').innerHTML = gVoltar('mod') + '<div class="card"><h2>' + esc(mTitulo(M.item)) + '</h2></div>' + mObj(M.item) + '<button class="btn sec" onclick="gSistemaCompleto()">🖥️ Editar no sistema completo</button>';
}
