/* DNP Gestão — telas próprias: Obras (cronograma, diários), Frequência, Folha, Funil CRM, Treinamentos, EPI, Documentos, Resumo financeiro. */
var T = { mes: dataIso(Date.now()).slice(0, 7), proj: null, d: {}, func: null, opo: null, etapa: null, turma: null, dia: null };
function tCarrega(chave, fn, args, tela) { // busca no servidor e redesenha
  if (T.d[chave] !== undefined) return T.d[chave];
  T.d[chave] = null;
  if (navigator.onLine) sys(fn, args || []).then(function (r) { T.d[chave] = r; if (G.view === tela) render(); }).catch(function (e) { delete T.d[chave]; aviso(e.message, 'err'); });
  else aviso('Sem internet.', 'err');
  return null;
}
function tLimpa(prefixo) { Object.keys(T.d).forEach(function (k) { if (!prefixo || k.indexOf(prefixo) === 0) delete T.d[k]; }); }
function tCarregando() { return '<div class="card muted">Carregando...</div>'; }
function tH(t, sub) { return '<div class="card"><h2 style="margin:0">' + t + '</h2>' + (sub ? '<p class="muted" style="margin:4px 0 0">' + sub + '</p>' : '') + '</div>'; }
function tMesSel(tela) { return '<div class="card" style="display:flex;gap:8px;align-items:center"><label style="margin:0">Mês</label><input type="month" value="' + T.mes + '" onchange="T.mes=this.value;tLimpa();render()"></div>'; }
function tFn(fn, args, msg, depois) {
  if (!gOnline()) return Promise.reject();
  aviso(msg || 'Salvando...');
  return sys(fn, args).then(function (r) {
    if (r && typeof r === 'object' && r.url && !depois) { window.open(r.url, '_blank'); aviso('Pronto.', 'ok'); return r; }
    aviso((r && r.mensagem) || 'Feito.', 'ok'); if (depois) depois(r); return r;
  }).catch(function (e) { aviso(e.message, 'err'); throw e; });
}
function tPdf(fn, args) {
  if (!gOnline()) return;
  var w = window.open('', '_blank'); aviso('Gerando arquivo...');
  sys(fn, args).then(function (r) { var u = r && (r.url || r.link || r); aviso('Pronto.', 'ok'); if (typeof u === 'string' && /^http/.test(u)) { if (w) w.location = u; else window.open(u, '_blank'); } else { if (w) w.close(); aviso('Arquivo gerado.', 'ok'); } }).catch(function (e) { if (w) w.close(); aviso(e.message, 'err'); });
}
function tLi(onclick, titulo, badge, sub) { return '<li style="cursor:pointer;display:block" onclick="' + onclick + '"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + titulo + '</b>' + (badge ? aBadge(badge) : '') + '</div>' + (sub ? '<span class="muted" style="font-size:13px">' + sub + '</span>' : '') + '</li>'; }
function tBtn(txt, onclick, cls) { return '<button class="btn ' + (cls || '') + '" style="margin-top:8px" onclick="' + onclick + '">' + txt + '</button>'; }
function tId(s) { return String(s).replace(/'/g, "\\'"); }

// ================= OBRAS (hub) =================
function tTelaObras() {
  var l = tCarrega('projetos', 'listarProjetos', [], 'tObras');
  var h = gVoltar('auto') + tH('🏗️ Obras e projetos');
  if (!l) { $('tela').innerHTML = h + tCarregando(); return; }
  var ord = { 'Em Andamento': 0, 'Planejamento': 1, 'Pausado': 2 };
  l = l.slice().sort(function (a, b) { return (ord[a.status] != null ? ord[a.status] : 9) - (ord[b.status] != null ? ord[b.status] : 9); });
  $('tela').innerHTML = h + '<div class="card"><input id="t-busca" placeholder="🔎 Buscar obra"><ul class="lista" id="t-lista"></ul></div>';
  var pinta = function () { var q = aSemAcento($('t-busca').value); $('t-lista').innerHTML = l.filter(function (p) { return !q || aSemAcento(JSON.stringify(p)).indexOf(q) >= 0; }).map(function (p) { return tLi("T.proj={id:'" + tId(p.id) + "',nome:this.dataset.n};gIr('tObra')\" data-n=\"" + esc(mTitulo(p)), esc(mTitulo(p)), p.status === 'Em Andamento' ? 'Em Execução' : p.status, esc(p.clienteNome || p.nomeCliente || '')); }).join(''); };
  $('t-busca').oninput = pinta; pinta();
}
function tTelaObra() {
  var p = T.proj; if (!p) return gIr('tObras');
  var o = tCarrega('proj_' + p.id, 'obterProjeto', [p.id], 'tObra');
  var h = gVoltar('tObras') + tH('🏗️ ' + esc(p.nome), o ? 'Status: ' + esc(o.status === 'Em Andamento' ? 'Em Execução' : o.status || '') : '');
  h += '<div class="card"><div class="grade">' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="mdAbrirProjeto(T.proj.id, T.proj.nome)">📏 Medições<small>medir, PDF, faturar</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'tCrono\')">📊 Cronograma<small>etapas e prazos</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'tDiarios\')">📒 Diários (RDO)<small>lista e PDF</small></button>' +
    '<button class="bat" style="text-align:left;padding:14px" onclick="tObraStatus()">🚦 Status<small>executar, pausar, concluir</small></button></div></div>';
  if (o) {
    A.res = [o]; A.resFn = 'listarProjetos'; A.item = o; A.itemIdx = 0; A.info = aAnalisar([o]);
    h += '<button class="btn sec" onclick="gIr(\'autoItem\')">✏️ Editar dados da obra</button>';
  }
  $('tela').innerHTML = h;
}
function tObraStatus() {
  var st = [['Planejamento', 'Aprovado'], ['Em Andamento', 'Em Execução'], ['Pausado', 'Pausado'], ['Concluído', 'Concluído'], ['Faturado', 'Faturado'], ['Cancelado', 'Cancelado']];
  var s = prompt('Novo status:\n' + st.map(function (x, i) { return (i + 1) + ' - ' + x[1]; }).join('\n') + '\n\nDigite o número:');
  var i = parseInt(s, 10) - 1; if (!st[i]) return;
  tFn('atualizarStatusProjeto', [T.proj.id, st[i][0]], 'Atualizando...', function () { tLimpa('proj'); tLimpa('projetos'); render(); });
}
function tTelaCrono() {
  var p = T.proj; if (!p) return gIr('tObras');
  var c = tCarrega('crono_' + p.id, 'obterCronograma', [p.id], 'tCrono');
  var h = gVoltar('tObra') + tH('📊 Cronograma', esc(p.nome));
  if (!c) { $('tela').innerHTML = h + tCarregando(); return; }
  var et = c.etapas || c.itens || (Array.isArray(c) ? c : []);
  h += '<div class="card"><p class="muted" style="font-size:12px;margin:0 0 6px"><span style="display:inline-block;width:12px;height:8px;background:#9db7d9"></span> previsto &nbsp; <span style="display:inline-block;width:12px;height:8px;background:var(--laranja)"></span> realizado</p><ul class="lista">' + et.map(function (e, i) {
    var bp = e.barraPrevisto || {}, br = e.barraReal || {};
    return '<li style="display:block;cursor:pointer" onclick="tCronoEditar(' + i + ')"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc((e.numero ? e.numero + '. ' : '') + (e.nome || '')) + '</b><b>' + esc(mVal('percentual', e.percentualConcluido || 0)) + '%</b></div>' +
      '<div style="position:relative;height:16px;background:#eef1f5;border-radius:4px;margin:6px 0">' + (bp.larguraPct != null ? '<div style="position:absolute;top:2px;height:5px;left:' + bp.offsetPct + '%;width:' + Math.max(bp.larguraPct, 1) + '%;background:#9db7d9;border-radius:3px"></div>' : '') + (br.larguraPct != null ? '<div style="position:absolute;top:9px;height:5px;left:' + br.offsetPct + '%;width:' + Math.max(br.larguraPct, 1) + '%;background:var(--laranja);border-radius:3px"></div>' : '') + (c.hojePct != null ? '<div style="position:absolute;top:0;bottom:0;left:' + c.hojePct + '%;width:2px;background:#c62828"></div>' : '') + '</div>' +
      '<span class="muted" style="font-size:12px">Previsto: ' + mdData(e.dataInicioPrevista) + ' a ' + mdData(e.dataFimPrevista) + (e.dataInicioReal ? ' · Real: ' + mdData(e.dataInicioReal) + ' a ' + mdData(e.dataFimReal) : '') + '</span></li>';
  }).join('') + '</ul></div>' + tBtn('📄 PDF do cronograma', "tPdf('exportarCronogramaPdf',[T.proj.id])", 'lar');
  T.cronoEt = et; $('tela').innerHTML = h;
}
function tCronoEditar(i) {
  T.cronoI = i; var e = T.cronoEt && T.cronoEt[i]; if (!e) return gIr('tCrono');
  e = T.cronoEt[i], id = e.id || e.etapaId;
  var html = gVoltar('tCrono') + tH('Prazos da etapa', esc(e.nome || '')) + '<div class="card"><label>Início previsto</label><input type="date" id="tc-i" value="' + aIsoData(e.dataInicioPrevista) + '"><label>Fim previsto</label><input type="date" id="tc-f" value="' + aIsoData(e.dataFimPrevista) + '">' +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--texto);margin-top:10px"><input type="checkbox" id="tc-h" style="width:auto"' + (e.apontarPorHoras ? ' checked' : '') + '> Apontar por horas (mão de obra)</label>' +
    tBtn('Salvar', 'tCronoSalvar()', 'lar') + '</div>';
  T.cronoSel = { id: id, horas: !!e.apontarPorHoras };
  G.view = 'tCronoEd'; $('tela').innerHTML = html;
  T.cronoSel.ok = 1;
}
function tCronoSalvar() {
  var s = T.cronoSel, hrs = $('tc-h').checked;
  tFn('atualizarCronogramaEtapa', [s.id, { dataInicioPrevista: $('tc-i').value, dataFimPrevista: $('tc-f').value }]).then(function () {
    return hrs !== s.horas ? sys('definirApontarPorHorasEtapa', [s.id, hrs]) : null;
  }).then(function () { tLimpa('crono_'); gIr('tCrono'); }).catch(function () {});
}
function tTelaDiarios() {
  var p = T.proj; if (!p) return gIr('tObras');
  var l = tCarrega('diar_' + p.id, 'listarDiariosObra', [p.id], 'tDiarios');
  var h = gVoltar('tObra') + tH('📒 Diários de obra', esc(p.nome) + ' · novos RDOs são lançados pelo app DNP Campo');
  if (!l) { $('tela').innerHTML = h + tCarregando(); return; }
  l = l.slice().sort(function (a, b) { return (Number(b.numero) || 0) - (Number(a.numero) || 0); });
  $('tela').innerHTML = h + '<div class="card"><ul class="lista">' + (l.length ? l.map(function (d, i) {
    return '<li style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>RDO nº ' + esc(d.numero) + ' · ' + mdData(d.dataIso || d.data) + '</b>' + (d.medido ? aBadge('Medido') : '') + '</div><span class="muted" style="font-size:13px">' + esc(d.clima || '') + (d.efetivo != null ? ' · Efetivo: ' + esc(d.efetivo) : '') + (d.custoMaoDeObraTotal ? ' · M.O.: ' + mdBrl(d.custoMaoDeObraTotal) : '') + '</span>' +
      (d.atividades ? '<p style="margin:6px 0;font-size:13px">' + esc(String(d.atividades).slice(0, 220)) + '</p>' : '') +
      ((d.etapas || []).length ? '<p class="muted" style="font-size:12px;margin:4px 0">' + d.etapas.map(function (e) { return esc(e.nomeEtapa || e.descricao || '') + (e.percentualAcumulado != null ? ' ' + esc(mVal('percentual', e.percentualAcumulado)) + '%' : ''); }).join(' · ') + '</p>' : '') +
      '<button class="btn sec" style="padding:8px;margin-top:4px" onclick="tPdf(\'exportarDiarioObraPdf\',[T.proj.id,\'' + tId(d.id) + '\'])">📄 PDF</button></li>';
  }).join('') : '<li class="muted">Nenhum diário.</li>') + '</ul></div>';
}

// ================= FREQUÊNCIA =================
function tTelaFreq() {
  var l = tCarrega('freq_' + T.mes, 'listarResumoFrequencia', [T.mes], 'tFreq');
  var h = gVoltar('auto') + tH('📅 Frequência e ponto') + tMesSel();
  if (!l) { $('tela').innerHTML = h + tCarregando(); return; }
  $('tela').innerHTML = h + '<div class="card"><input id="t-busca" placeholder="🔎 Buscar funcionário"><ul class="lista" id="t-lista"></ul></div>';
  var pinta = function () {
    var q = aSemAcento($('t-busca').value);
    $('t-lista').innerHTML = l.filter(function (r) { return !q || aSemAcento(JSON.stringify(r.funcionario || r)).indexOf(q) >= 0; }).map(function (r) {
      var f = r.funcionario || {}, t = r.totais || {};
      var resumo = Object.keys(t).filter(function (k) { return t[k] && typeof t[k] !== 'object'; }).slice(0, 5).map(function (k) { return esc(mRot(k)) + ': ' + esc(mVal(k, t[k])); }).join(' · ');
      return tLi("T.func={id:'" + tId(f.id) + "',nome:this.dataset.n};gIr('tEspelho')\" data-n=\"" + esc(f.nome || ''), esc(f.nome || ''), '', resumo);
    }).join('');
  };
  $('t-busca').oninput = pinta; pinta();
}
function tTelaEspelho() {
  var f = T.func; if (!f) return gIr('tFreq');
  var e = tCarrega('esp_' + T.mes + f.id, 'obterEspelhoPonto', [T.mes, f.id], 'tEspelho');
  var h = gVoltar('tFreq') + tH('🕒 Espelho de ponto', esc(f.nome) + ' · ' + T.mes.split('-').reverse().join('/'));
  if (!e) { $('tela').innerHTML = h + tCarregando(); return; }
  T.esp = e;
  T.situacoes = e.situacoes || ['Trabalhado', 'Falta', 'Falta justificada', 'Atestado', 'Folga', 'Férias', 'Feriado', 'Afastado'];
  var t = e.totais || {};
  h += '<div class="card"><ul class="lista">' + Object.keys(t).filter(function (k) { return typeof t[k] !== 'object'; }).map(function (k) { return '<li><span>' + esc(mRot(k)) + '</span><b>' + esc(mVal(k, t[k])) + '</b></li>'; }).join('') + '</ul>' + tBtn('🖨️ Imprimir / PDF', 'tImprimirEspelho()', 'lar') + '</div>';
  T.dias = e.dias || [];
  h += '<div class="card"><p class="muted" style="margin:0 0 6px">Toque num dia para corrigir</p><ul class="lista">' + T.dias.map(function (d, i) {
    var r = d.registro || {}, bat = [1, 2, 3].map(function (n) { return r['entrada' + n] ? r['entrada' + n] + '–' + (r['saida' + n] || '…') : ''; }).filter(String).join('  ');
    var sit = r.situacao || (bat ? 'Trabalhado' : '');
    return '<li style="cursor:pointer;display:block" onclick="T.dia=' + i + ';gIr(\'tDia\')"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + mdData(d.data) + ' <span class="muted" style="font-weight:400">' + esc(d.diaSemana || '') + '</span></b>' + (sit && sit !== 'Trabalhado' ? aBadge(sit) : '') + '</div><span class="muted" style="font-size:13px">' + (bat || '—') + (r.horasTrabalhadas ? ' · ' + esc(r.horasTrabalhadas) + ' h' : '') + (r.horasExtra50 ? ' · HE50 ' + esc(r.horasExtra50) : '') + (r.horasExtra100 ? ' · HE100 ' + esc(r.horasExtra100) : '') + (r.feriado ? ' · Feriado' : '') + (r.observacao ? ' · ' + esc(r.observacao) : '') + '</span></li>';
  }).join('') + '</ul></div>';
  $('tela').innerHTML = h;
}

// Folha do espelho para imprimir ou salvar em PDF (mesmo layout do sistema web)
function tHHMM(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string' && v.indexOf(':') >= 0) return v;
  var n = Number(v); if (isNaN(n)) return esc(String(v)); if (!n) return '';
  var h = Math.floor(n), m = Math.round((n - h) * 60); if (m === 60) { h++; m = 0; }
  return h + ':' + (m < 10 ? '0' : '') + m;
}
function tImprimirEspelho() {
  var e = T.esp; if (!e) { aviso('Abra o espelho primeiro.', 'err'); return; }
  var f = e.funcionario || T.func || {}, t = e.totais || {}, ma = String(e.mesAno || T.mes);
  var meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var mes = (meses[Number(ma.slice(5, 7)) - 1] || '') + ' de ' + ma.slice(0, 4);
  var br = function (s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : ''; };
  var cols = ['entrada1', 'saida1', 'entrada2', 'saida2', 'entrada3', 'saida3'];
  var linhas = (e.dias || []).map(function (d) {
    var r = d.registro || {};
    return '<tr><td>' + br(d.data) + '</td><td>' + esc(d.diaSemana || '') + '</td><td>' + esc(d.obras || '') + '</td><td>' + esc(r.situacao || '') + '</td>' +
      cols.map(function (k) { return '<td>' + esc(r[k] || '') + '</td>'; }).join('') +
      '<td>' + tHHMM(r.horasNormais) + '</td><td>' + tHHMM(r.horasExtra50) + '</td><td>' + tHHMM(r.horasExtra100) + '</td><td>' + tHHMM(r.horasNoturnas) + '</td></tr>';
  }).join('');
  var css = '#t-print{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#fff;color:#000;overflow:auto;padding:16px;font-family:Arial,sans-serif;font-size:11px}' +
    '#t-print table{border-collapse:collapse;width:100%}#t-print td,#t-print th{border:1px solid #999;padding:3px;text-align:center;color:#000}' +
    '#t-print h2,#t-print p{margin:4px 0;color:#000}#t-print .ass{margin-top:50px;display:flex;justify-content:space-around}' +
    '#t-print .ass div{border-top:1px solid #000;width:40%;text-align:center;padding-top:4px}' +
    '#t-print .tp-bar{display:flex;gap:8px;margin-bottom:12px}#t-print .tp-bar button{flex:1;padding:12px;font-size:15px;border-radius:8px;border:0}' +
    '@media print{body>*:not(#t-print){display:none!important}#t-print{position:static;overflow:visible;padding:0}#t-print .tp-bar{display:none}@page{size:landscape;margin:10mm}}';
  var el = document.getElementById('t-print'); if (el) el.remove();
  el = document.createElement('div'); el.id = 't-print';
  el.innerHTML = '<style>' + css + '</style>' +
    '<div class="tp-bar"><button style="background:#0B1A2E;color:#fff" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>' +
    '<button style="background:#ddd;color:#000" onclick="document.getElementById(\'t-print\').remove()">Fechar</button></div>' +
    '<h2>Espelho de Ponto — ' + mes + '</h2><p><b>' + esc(e.empresa || '') + '</b></p>' +
    '<p>Funcionário: <b>' + esc(f.nome || '') + '</b> · Função: ' + esc(f.funcao || '-') + ' · CPF: ' + esc(f.cpf || '-') + ' · Admissão: ' + (br(f.admissao) || '-') + '</p>' +
    '<table><thead><tr><th>Data</th><th>Dia</th><th>Obra</th><th>Situação</th><th>Ent.1</th><th>Saí.1</th><th>Ent.2</th><th>Saí.2</th><th>Ent.3</th><th>Saí.3</th><th>Normais</th><th>HE50</th><th>HE100</th><th>Not.</th></tr></thead><tbody>' + linhas +
    '<tr style="font-weight:bold"><td colspan="10">Totais: ' + (t.diasTrabalhados || 0) + ' dias trab., ' + (t.faltas || 0) + ' faltas, ' + (t.faltasJustificadas || 0) + ' justificadas</td><td>' + tHHMM(t.horasNormais) + '</td><td>' + tHHMM(t.horasExtra50) + '</td><td>' + tHHMM(t.horasExtra100) + '</td><td>' + tHHMM(t.horasNoturnas) + '</td></tr></tbody></table>' +
    '<div class="ass"><div>Empregador</div><div>Empregado</div></div>';
  document.body.appendChild(el);
}

function tTelaDia() {
  var d = T.dias && T.dias[T.dia]; if (!d) return gIr('tEspelho');
  var r = d.registro || {};
  $('tela').innerHTML = gVoltar('tEspelho') + tH('Corrigir dia ' + mdData(d.data), esc(T.func.nome)) + '<div class="card">' +
    '<p class="muted">Batidas: ' + ([1, 2, 3].map(function (n) { return r['entrada' + n] ? r['entrada' + n] + '–' + (r['saida' + n] || '…') : ''; }).filter(String).join('  ') || 'nenhuma') + '</p>' +
    '<label>Situação</label><select id="td-s">' + T.situacoes.map(function (s) { return '<option' + (s === (r.situacao || 'Trabalhado') ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--texto);margin-top:10px"><input type="checkbox" id="td-f" style="width:auto"' + (r.feriado ? ' checked' : '') + '> Feriado</label>' +
    '<label>Observação</label><textarea id="td-o" rows="2">' + esc(r.observacao || '') + '</textarea>' +
    tBtn('Salvar dia', 'tDiaSalvar()', 'lar') + tBtn('↩️ Restaurar dia (desfazer correções)', 'tDiaRestaurar()', 'sec') + '</div>';
}
function tDiaSalvar() {
  var d = T.dias[T.dia];
  tFn('salvarDiaEspelho', [{ funcionarioId: T.func.id, data: aIsoData(d.data), situacao: $('td-s').value, feriado: $('td-f').checked, observacao: $('td-o').value }]).then(function () { tLimpa('esp_'); tLimpa('freq_'); gIr('tEspelho'); }).catch(function () {});
}
function tDiaRestaurar() {
  if (!confirm('Restaurar o dia com as batidas originais?')) return;
  tFn('restaurarDiaEspelho', [T.func.id, aIsoData(T.dias[T.dia].data)]).then(function () { tLimpa('esp_'); tLimpa('freq_'); gIr('tEspelho'); }).catch(function () {});
}

// ================= FOLHA =================
function tTelaFolha() {
  var f = tCarrega('folha_' + T.mes, 'folhaCalcularMes', [T.mes], 'tFolha');
  var h = gVoltar('auto') + tH('💵 Folha de pagamento') + tMesSel();
  if (!f) { $('tela').innerHTML = h + tCarregando(); return; }
  var it = f.itens || [], tb = 0, td = 0, tl = 0, pend = 0;
  it.forEach(function (x) { tb += +x.bruto || 0; td += +x.totalDescontos || 0; tl += +x.liquido || 0; if (!x.lancado) pend++; });
  h += '<div class="card"><ul class="lista"><li><span>Funcionários</span><b>' + it.length + '</b></li><li><span>Bruto</span><b>' + mdBrl(tb) + '</b></li><li><span>Descontos</span><b>' + mdBrl(td) + '</b></li><li><span>Líquido</span><b style="color:var(--laranja)">' + mdBrl(tl) + '</b></li>' + (f.calendario ? '<li><span>Dias úteis / descansos</span><b>' + esc(f.calendario.diasUteis) + ' / ' + esc(f.calendario.descansos) + '</b></li>' : '') + '</ul>' +
    (pend ? tBtn('💸 Lançar folha no financeiro (' + pend + ' pendente' + (pend > 1 ? 's' : '') + ')', 'tFolhaLancar()', 'lar') : '<p class="muted">Folha do mês já lançada.</p>') + '</div>';
  h += '<div class="card"><ul class="lista">' + it.map(function (x, i) {
    return tLi('T.folhaIdx=' + i + ";gIr('tFolhaFunc')", esc(x.nome), x.lancado ? 'Lançado' : 'Pendente', esc(x.funcao || '') + ' · Bruto ' + mdBrl(x.bruto) + ' · <b>Líquido ' + mdBrl(x.liquido) + '</b>');
  }).join('') + '</ul></div>';
  $('tela').innerHTML = h;
}
function tTelaFolhaFunc() {
  var f = T.d['folha_' + T.mes], x = f && f.itens[T.folhaIdx]; if (!x) return gIr('tFolha');
  var tab = function (l, cor) { return (l || []).map(function (p) { return '<li><span>' + esc(p.descricao) + (p.ref ? ' <span class="muted">(' + esc(p.ref) + ')</span>' : '') + '</span><b style="color:' + cor + '">' + mdBrl(p.valor) + '</b></li>'; }).join(''); };
  var h = gVoltar('tFolha') + tH(esc(x.nome), esc(x.funcao || '') + ' · ' + esc(x.vinculo || '') + (x.lancado ? ' · já lançado' : ''));
  h += '<div class="card"><h2 style="font-size:15px">Proventos</h2><ul class="lista">' + tab(x.proventos, '#1b7f3b') + '</ul><h2 style="font-size:15px;margin-top:10px">Descontos</h2><ul class="lista">' + tab(x.descontos, '#c62828') + '</ul>' +
    '<ul class="lista" style="margin-top:8px"><li><span>Bruto</span><b>' + mdBrl(x.bruto) + '</b></li><li><span>Descontos</span><b>' + mdBrl(x.totalDescontos) + '</b></li><li><span>Líquido</span><b style="color:var(--laranja)">' + mdBrl(x.liquido) + '</b></li><li><span>FGTS</span><b>' + mdBrl(x.fgts) + '</b></li><li><span>INSS / IRRF</span><b>' + mdBrl(x.inss) + ' / ' + mdBrl(x.irrf) + '</b></li></ul>' +
    tBtn('📄 Contracheque PDF', "tPdf('exportarContrachequePdf',[T.d['folha_'+T.mes].itens[T.folhaIdx].id,T.mes])", 'lar') + (x.lancado ? tBtn('↩️ Reabrir (desfazer lançamento)', 'tFolhaReabrir()', 'sec') : '') + '</div>';
  h += '<div class="card"><h2 style="font-size:15px">Avulsos do mês</h2><ul class="lista">' + ((x.avulsos || []).map(function (a) { return '<li><span>' + esc(a.tipo || '') + ' · ' + esc(a.descricao || '') + '</span><span><b>' + mdBrl(a.valor) + '</b> <a href="#" onclick="tFolhaExcluirAvulso(\'' + tId(a.id) + '\');return false" style="color:var(--erro)">🗑️</a></span></li>'; }).join('') || '<li class="muted">Nenhum</li>') + '</ul>' +
    '<div class="grade" style="margin-top:8px"><div><label>Tipo</label><select id="tf-t"><option>Provento</option><option>Desconto</option></select></div><div><label>Valor (R$)</label><input type="number" step="any" inputmode="decimal" id="tf-v"></div></div><label>Descrição</label><input id="tf-d" placeholder="Ex.: Bônus, vale, desconto de EPI"><label style="display:flex;gap:8px;align-items:center;color:var(--texto);margin-top:8px"><input type="checkbox" id="tf-tr" style="width:auto"> Tributável (entra no INSS/IRRF)</label>' + tBtn('+ Adicionar avulso', 'tFolhaAvulso()') + '</div>';
  h += '<div class="card"><h2 style="font-size:15px">Configurações do funcionário</h2><div class="grade"><div><label>Periculosidade (%)</label><input type="number" step="any" id="tf-pe" placeholder="0 ou 30"></div><div><label>Dependentes</label><input type="number" id="tf-de"></div><div><label>Diária (R$)</label><input type="number" step="any" id="tf-di"></div><div><label>Chave PIX</label><input id="tf-px"></div></div>' +
    '<p class="muted" style="font-size:12px">Preencha só o que quiser mudar.</p>' + tBtn('Salvar configurações', 'tFolhaCfg()') + '</div>';
  $('tela').innerHTML = h;
}
function tFolhaRecalc() { tLimpa('folha_'); render(); }
function tFolhaAtual() { return T.d['folha_' + T.mes].itens[T.folhaIdx]; }
function tFolhaAvulso() {
  var v = Number($('tf-v').value); if (!v || !$('tf-d').value) return aviso('Informe valor e descrição.', 'err');
  tFn('folhaSalvarAvulso', [{ mesAno: T.mes, funcionarioId: tFolhaAtual().id, tipo: $('tf-t').value, valor: v, descricao: $('tf-d').value, tributavel: $('tf-tr').checked }]).then(tFolhaRecalc).catch(function () {});
}
function tFolhaExcluirAvulso(id) { if (confirm('Excluir este avulso?')) tFn('folhaExcluirAvulso', [id]).then(tFolhaRecalc).catch(function () {}); }
function tFolhaCfg() {
  var id = tFolhaAtual().id, ps = [];
  if ($('tf-pe').value !== '') ps.push(['folhaSalvarPericulosidade', [id, Number($('tf-pe').value)]]);
  if ($('tf-de').value !== '') ps.push(['folhaSalvarDependentes', [id, Number($('tf-de').value)]]);
  if ($('tf-di').value !== '') ps.push(['folhaSalvarDiaria', [id, Number($('tf-di').value)]]);
  if ($('tf-px').value !== '') ps.push(['folhaSalvarPix', [id, $('tf-px').value]]);
  if (!ps.length) return aviso('Nada para salvar.', 'err');
  if (!gOnline()) return; aviso('Salvando...');
  ps.reduce(function (p, c) { return p.then(function () { return sys(c[0], c[1]); }); }, Promise.resolve()).then(function () { aviso('Configurações salvas.', 'ok'); tFolhaRecalc(); }).catch(function (e) { aviso(e.message, 'err'); });
}
function tFolhaReabrir() { if (confirm('Reabrir a folha deste funcionário? Os lançamentos do financeiro dele neste mês serão desfeitos.')) tFn('folhaReabrirFuncionario', [T.mes, tFolhaAtual().id]).then(tFolhaRecalc).catch(function () {}); }
function tFolhaLancar() {
  var f = T.d['folha_' + T.mes], ids = f.itens.filter(function (x) { return !x.lancado; }).map(function (x) { return x.id; });
  var pct = prompt('Percentual de adiantamento (%)', '40'); if (pct === null) return;
  var da = prompt('Dia do adiantamento', '20'); if (da === null) return;
  var ds = prompt('Dia do pagamento do saldo (mês seguinte)', '5'); if (ds === null) return;
  if (!confirm('Lançar a folha de ' + ids.length + ' funcionário(s) no financeiro?')) return;
  tFn('folhaLancarMes', [T.mes, { percentualAdiantamento: Number(pct), diaAdiantamento: Number(da), diaSaldo: Number(ds), ids: ids }], 'Lançando folha...').then(tFolhaRecalc).catch(function () {});
}

// ================= FUNIL CRM =================
function tTelaFunil() {
  var et = tCarrega('funil_et', 'listarEtapasFunil', [], 'tFunil'), op = tCarrega('funil_op', 'listarOportunidades', [], 'tFunil');
  var h = gVoltar('auto') + tH('🎯 Funil de vendas');
  if (!et || !op) { $('tela').innerHTML = h + tCarregando(); return; }
  et = et.map(function (e) { return typeof e === 'object' ? (e.nome || e.etapa || e.id) : e; });
  var cont = {}, soma = {}; op.forEach(function (o) { cont[o.etapa] = (cont[o.etapa] || 0) + 1; soma[o.etapa] = (soma[o.etapa] || 0) + (+o.valorEstimado || 0); });
  if (!T.etapa || et.indexOf(T.etapa) < 0) T.etapa = et.filter(function (e) { return cont[e]; })[0] || et[0];
  h += '<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:8px">' + et.map(function (e) { return '<button class="btn ' + (e === T.etapa ? '' : 'sec') + '" style="width:auto;flex:0 0 auto;padding:8px 12px;font-size:13px" onclick="T.etapa=this.dataset.e;render()" data-e="' + esc(e) + '">' + esc(e) + ' (' + (cont[e] || 0) + ')</button>'; }).join('') + '</div>';
  var l = op.filter(function (o) { return o.etapa === T.etapa; });
  h += '<div class="card"><p class="muted" style="margin:0 0 6px">' + l.length + ' oportunidade(s) · ' + mdBrl(soma[T.etapa] || 0) + '</p>' + tBtn('+ Nova oportunidade', "T.novaOpo=1;aAbrirFnNova('criarOportunidade')", 'lar') + '<ul class="lista" style="margin-top:8px">' + (l.map(function (o) {
    return tLi("tAbrirOpo('" + tId(o.id) + "')", esc(o.titulo || ''), '', esc(o.nomeCliente || '') + ' · <b>' + mdBrl(o.valorEstimado) + '</b>' + (o.dataPrevisaoFechamento ? ' · prev. ' + mdData(o.dataPrevisaoFechamento) : '') + (o.nomeResponsavel ? ' · ' + esc(o.nomeResponsavel) : ''));
  }).join('') || '<li class="muted">Nada nesta etapa.</li>') + '</ul></div>';
  h += tBtn('📋 Minhas atividades pendentes', "gIr('tAtiv')", 'sec');
  $('tela').innerHTML = h;
}
function aAbrirFnNova(fn) { A.resFn = 'listar' + fn.replace(/^criar/, '') + 's'; A.res = T.d.funil_op || []; aAbrirFn(fn); }
function tAbrirOpo(id) { T.opo = (T.d.funil_op || []).filter(function (o) { return String(o.id) === String(id); })[0]; delete T.d['ativ_opo']; gIr('tOpo'); }
function tTelaOpo() {
  var o = T.opo; if (!o) return gIr('tFunil');
  var at = tCarrega('ativ_opo', 'listarAtividadesCRM', [{ oportunidadeId: o.id }], 'tOpo');
  var et = (T.d.funil_et || []).map(function (e) { return typeof e === 'object' ? (e.nome || e.etapa || e.id) : e; });
  var h = gVoltar('tFunil') + '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">' + esc(o.titulo || '') + '</h2>' + aBadge(o.etapa) + '</div><p class="muted">' + esc(o.nomeCliente || '') + '</p><ul class="lista"><li><span>Valor estimado</span><b>' + mdBrl(o.valorEstimado) + '</b></li><li><span>Previsão de fechamento</span><b>' + mdData(o.dataPrevisaoFechamento) + '</b></li><li><span>Responsável</span><b>' + esc(o.nomeResponsavel || '—') + '</b></li><li><span>Origem</span><b>' + esc(o.origemLead || '—') + '</b></li>' + (o.motivoPerda ? '<li><span>Motivo da perda</span><b>' + esc(o.motivoPerda) + '</b></li>' : '') + '</ul></div>';
  h += '<div class="card"><h2 style="font-size:15px">Mover para etapa</h2><div style="display:flex;gap:6px"><select id="to-e" style="flex:1">' + et.map(function (e) { return '<option' + (e === o.etapa ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select><button class="btn" style="width:auto;padding:10px 14px" onclick="tOpoMover()">Mover</button></div></div>';
  h += '<div class="card"><h2 style="font-size:15px">Atividades</h2>' + (at ? '<ul class="lista">' + (at.map(function (a) { return '<li style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(a.titulo || a.tipo || '') + '</b>' + (a.concluida ? aBadge('Concluído') : '<a href="#" onclick="tAtivConcluir(\'' + tId(a.id) + '\');return false">✔️ concluir</a>') + '</div><span class="muted" style="font-size:13px">' + esc(a.tipo || '') + ' · ' + esc(String(a.dataHora || '').replace('T', ' ').slice(0, 16)) + (a.descricao ? ' · ' + esc(a.descricao) : '') + '</span></li>'; }).join('') || '<li class="muted">Nenhuma atividade.</li>') + '</ul>' : '<p class="muted">Carregando...</p>') +
    '<label>Nova atividade</label><div class="grade"><select id="ta-t"><option>Ligação</option><option>Reunião</option><option>Visita</option><option>E-mail</option><option>WhatsApp</option><option>Tarefa</option></select><input type="datetime-local" id="ta-d"></div><input id="ta-ti" placeholder="Título" style="margin-top:8px"><textarea id="ta-de" rows="2" placeholder="Descrição" style="margin-top:8px"></textarea>' + tBtn('+ Adicionar atividade', 'tAtivNova()') + '</div>';
  A.res = T.d.funil_op || [o]; A.resFn = 'listarOportunidades'; A.item = o; A.itemIdx = A.res.indexOf(o); A.info = aAnalisar(A.res);
  h += tBtn('✏️ Editar oportunidade', "gIr('autoItem')", 'sec') + tBtn('🗑️ Excluir oportunidade', 'tOpoExcluir()', 'sec');
  $('tela').innerHTML = h;
}
function tOpoMover() {
  var e = $('to-e').value, ex = {};
  if (/perd/i.test(e)) { var m = prompt('Motivo da perda:'); if (m === null) return; ex.motivoPerda = m; }
  tFn('moverEtapaOportunidade', [T.opo.id, e, ex]).then(function () { T.opo.etapa = e; if (ex.motivoPerda) T.opo.motivoPerda = ex.motivoPerda; T.etapa = e; render(); }).catch(function () {});
}
function tOpoExcluir() { if (confirm('Excluir esta oportunidade?')) tFn('excluirOportunidade', [T.opo.id]).then(function () { delete T.d.funil_op; gIr('tFunil'); }).catch(function () {}); }
function tAtivNova() {
  if (!$('ta-ti').value) return aviso('Informe o título.', 'err');
  var o = T.opo;
  tFn('criarAtividadeCRM', [{ oportunidadeId: o ? o.id : '', clienteId: o ? o.clienteId : '', tipo: $('ta-t').value, titulo: $('ta-ti').value, descricao: $('ta-de').value, dataHora: $('ta-d').value, responsavelId: o ? o.responsavelId : '' }]).then(function () { delete T.d.ativ_opo; delete T.d.ativ_minhas; render(); }).catch(function () {});
}
function tAtivConcluir(id) { tFn('concluirAtividadeCRM', [id]).then(function () { delete T.d.ativ_opo; delete T.d.ativ_minhas; render(); }).catch(function () {}); }
function tTelaAtiv() {
  var l = tCarrega('ativ_minhas', 'listarAtividadesCRM', [{ apenasMinhas: true, apenasPendentes: true }], 'tAtiv');
  var h = gVoltar('tFunil') + tH('📋 Minhas atividades pendentes');
  if (!l) { $('tela').innerHTML = h + tCarregando(); return; }
  $('tela').innerHTML = h + '<div class="card"><ul class="lista">' + (l.map(function (a) { return '<li style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(a.titulo || '') + '</b><a href="#" onclick="tAtivConcluir(\'' + tId(a.id) + '\');return false">✔️ concluir</a></div><span class="muted" style="font-size:13px">' + esc(a.tipo || '') + ' · ' + esc(String(a.dataHora || '').replace('T', ' ').slice(0, 16)) + ' · ' + esc(a.nomeCliente || '') + '</span></li>'; }).join('') || '<li class="muted">Tudo em dia! 🎉</li>') + '</ul></div>';
}

// ================= TREINAMENTOS =================
function tTelaTurmas() {
  var l = tCarrega('turmas', 'listarTurmas', [], 'tTurmas');
  var h = gVoltar('auto') + tH('🎓 Treinamentos (turmas)');
  if (!l) { $('tela').innerHTML = h + tCarregando(); return; }
  h += tBtn('+ Nova turma', "A.resFn='listarTurmas';A.res=T.d.turmas;aAbrirFn('criarTurma')", 'lar');
  $('tela').innerHTML = h + '<div class="card" style="margin-top:10px"><ul class="lista">' + (l.map(function (t) { return tLi("T.turma='" + tId(t.id) + "';delete T.d.turma;gIr('tTurma')", esc(t.nomeTreinamento || mTitulo(t)), t.status, mdData(t.dataInicio) + (t.dataFim ? ' a ' + mdData(t.dataFim) : '') + (t.instrutor ? ' · ' + esc(t.instrutor) : '')); }).join('') || '<li class="muted">Nenhuma turma.</li>') + '</ul></div>';
}
function tTelaTurma() {
  var t = tCarrega('turma', 'obterTurma', [T.turma], 'tTurma');
  var h = gVoltar('tTurmas');
  if (!t) { $('tela').innerHTML = h + tCarregando(); return; }
  var ps = t.participantes || Object.keys(t).map(function (k) { return t[k]; }).filter(function (v) { return Array.isArray(v) && v.length && v[0] && v[0].funcionarioId; })[0] || [];
  h += '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">' + esc(t.nomeTreinamento || '') + '</h2>' + (t.status ? aBadge(t.status) : '') + '</div><p class="muted">' + esc(t.norma || '') + ' · ' + esc(t.cargaHoraria || '') + 'h · ' + mdData(t.dataInicio) + (t.dataFim ? ' a ' + mdData(t.dataFim) : '') + '<br>Instrutor: ' + esc(t.instrutor || '—') + ' · Local: ' + esc(t.local || '—') + '</p></div>';
  h += '<div class="card"><h2 style="font-size:15px">Participantes (' + ps.length + ')</h2><ul class="lista">' + (ps.map(function (p) { return '<li><label style="display:flex;gap:8px;align-items:center;color:var(--texto);margin:0"><input type="checkbox" style="width:auto"' + (p.presente ? ' checked' : '') + ' onchange="tFn(\'marcarPresenca\',[\'' + tId(p.id) + '\',this.checked],\'Salvando presença...\')"> ' + esc(p.nome || '') + '</label><span>' + (p.certificadoUrl ? '<a href="' + esc(p.certificadoUrl) + '" target="_blank">📜</a> ' : '') + '<a href="#" style="color:var(--erro)" onclick="tTurmaRemover(\'' + tId(p.id) + '\');return false">🗑️</a></span></li>'; }).join('') || '<li class="muted">Nenhum participante.</li>') + '</ul>' +
    '<label>Adicionar funcionário</label><div style="display:flex;gap:6px"><select id="tt-f" style="flex:1"><option value="">Carregando...</option></select><button class="btn" style="width:auto;padding:10px 14px" onclick="tTurmaAdd()">+</button></div></div>';
  h += tBtn('📄 Lista de presença PDF', "tPdf('gerarListaPresencaPdf',[T.turma])", 'lar') + tBtn('🎓 Encerrar turma e gerar certificados', 'tTurmaEncerrar()') + tBtn('✏️ Editar turma', "A.resFn='listarTurmas';A.res=[T.d.turma];A.itemIdx=0;A.item=T.d.turma;A.info=aAnalisar(A.res);gIr('autoItem')", 'sec') + tBtn('🗑️ Excluir turma', "if(confirm('Excluir a turma?'))tFn('excluirTurma',[T.turma]).then(function(){delete T.d.turmas;gIr('tTurmas')})", 'sec');
  $('tela').innerHTML = h;
  aOpcoes('listarFuncionariosParaTreinamento').then(function (l) { var ja = {}; ps.forEach(function (p) { ja[p.funcionarioId] = 1; }); if ($('tt-f')) $('tt-f').innerHTML = '<option value="">— escolha —</option>' + l.filter(function (f) { return !ja[f.id]; }).map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(mTitulo(f)) + '</option>'; }).join(''); }).catch(function () {});
}
function tTurmaAdd() { var f = $('tt-f').value; if (!f) return; tFn('adicionarParticipante', [T.turma, f]).then(function () { delete T.d.turma; render(); }).catch(function () {}); }
function tTurmaRemover(id) { if (confirm('Remover participante?')) tFn('removerParticipante', [id]).then(function () { delete T.d.turma; render(); }).catch(function () {}); }
function tTurmaEncerrar() { if (confirm('Encerrar a turma e gerar os certificados dos presentes?')) tFn('encerrarTurmaEGerarCertificados', [T.turma], 'Gerando certificados... pode demorar.', function () { delete T.d.turma; delete T.d.turmas; render(); }).catch(function () {}); }

// ================= EPI POR FUNCIONÁRIO =================
function tTelaEpi() {
  var l = tCarrega('funcs', 'listarFuncionariosAtivos', [], 'tEpi');
  var h = gVoltar('auto') + tH('🦺 EPI por funcionário');
  if (!l) { $('tela').innerHTML = h + tCarregando(); return; }
  $('tela').innerHTML = h + '<div class="card"><input id="t-busca" placeholder="🔎 Buscar funcionário"><ul class="lista" id="t-lista"></ul></div>';
  var pinta = function () { var q = aSemAcento($('t-busca').value); $('t-lista').innerHTML = l.filter(function (f) { return !q || aSemAcento(JSON.stringify(f)).indexOf(q) >= 0; }).map(function (f) { return tLi("T.func={id:'" + tId(f.id) + "',nome:this.dataset.n};delete T.d.epi_ent;gIr('tEpiFunc')\" data-n=\"" + esc(mTitulo(f)), esc(mTitulo(f)), '', esc(f.funcao || f.nomeFuncao || '')); }).join(''); };
  $('t-busca').oninput = pinta; pinta();
}
function tTelaEpiFunc() {
  var f = T.func; if (!f) return gIr('tEpi');
  var l = tCarrega('epi_ent', 'listarEntregasFuncionario', [f.id], 'tEpiFunc');
  var h = gVoltar('tEpi') + tH('🦺 ' + esc(f.nome));
  h += '<div class="card"><h2 style="font-size:15px">Entregas</h2>' + (l ? '<ul class="lista">' + (l.map(function (e) { var venc = e.dataValidadeTroca && aIsoData(e.dataValidadeTroca) < dataIso(Date.now()); return '<li style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(e.nomeItem || '') + ' × ' + esc(e.quantidade) + '</b>' + (venc ? aBadge('Vencido') : '') + '</div><span class="muted" style="font-size:13px">' + (e.ca ? 'CA ' + esc(e.ca) + ' · ' : '') + 'Entregue ' + mdData(e.dataEntrega) + (e.dataValidadeTroca ? ' · Troca ' + mdData(e.dataValidadeTroca) : '') + ' · <a href="#" style="color:var(--erro)" onclick="tEpiExcluir(\'' + tId(e.id) + '\');return false">excluir</a></span></li>'; }).join('') || '<li class="muted">Nenhuma entrega.</li>') + '</ul>' : '<p class="muted">Carregando...</p>') + '</div>';
  h += '<div class="card"><h2 style="font-size:15px">Registrar entrega</h2><label>EPI</label><select id="te-i"><option value="">Carregando...</option></select><div class="grade"><div><label>Quantidade</label><input type="number" id="te-q" value="1"></div><div><label>Data</label><input type="date" id="te-d" value="' + dataIso(Date.now()) + '"></div></div><label>Validade / troca</label><input type="date" id="te-v">' + tBtn('Registrar entrega', 'tEpiEntregar()', 'lar') + '</div>';
  h += '<div class="card"><h2 style="font-size:15px">Documentos</h2>' + tBtn('📄 Ficha de EPI (PDF)', "tPdf('gerarFichaEpiPdf',[T.func.id])") + '<label>Cargo para Ordem de Serviço</label><select id="te-c"><option value="">Carregando...</option></select>' + tBtn('📄 Ordem de Serviço (PDF)', "if($('te-c').value)tPdf('gerarOrdemServicoPdf',[T.func.id,$('te-c').value])") + tBtn('📦 Baixar todos os documentos do colaborador', "if($('te-c').value)tPdf('baixarDocumentosColaboradorEpi',[T.func.id,$('te-c').value]);else aviso('Escolha o cargo.','err')", 'sec') + '</div>';
  $('tela').innerHTML = h;
  aOpcoes('listarItensEpi').then(function (l) { if ($('te-i')) $('te-i').innerHTML = '<option value="">— escolha —</option>' + l.filter(function (i) { return i.ativo !== false; }).map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(mTitulo(i)) + (i.ca ? ' (CA ' + esc(i.ca) + ')' : '') + '</option>'; }).join(''); }).catch(function () {});
  aOpcoes('listarCargosOrdemServicoEpi').then(function (l) { if ($('te-c')) $('te-c').innerHTML = '<option value="">— escolha —</option>' + l.map(function (c) { var id = c.id || c; return '<option value="' + esc(id) + '">' + esc(typeof c === 'object' ? mTitulo(c) : c) + '</option>'; }).join(''); }).catch(function () {});
}
function tEpiEntregar() {
  if (!$('te-i').value) return aviso('Escolha o EPI.', 'err');
  tFn('registrarEntregaEpi', [{ funcionarioId: T.func.id, itemId: $('te-i').value, quantidade: Number($('te-q').value) || 1, dataEntrega: $('te-d').value, dataValidadeTroca: $('te-v').value }]).then(function () { delete T.d.epi_ent; render(); }).catch(function () {});
}
function tEpiExcluir(id) { if (confirm('Excluir esta entrega?')) tFn('excluirEntregaEpi', [id]).then(function () { delete T.d.epi_ent; render(); }).catch(function () {}); }

// ================= FUNCIONÁRIO: documentos e adiantamentos =================
function tTelaFuncDocs() {
  var f = T.func; if (!f) return gIr('auto');
  var d = tCarrega('fdet_' + f.id, 'obterDetalheFuncionario', [f.id], 'tFuncDocs');
  var h = gVoltar('autoItem') + tH('📎 ' + esc(f.nome), 'Documentos e adiantamentos');
  if (!d) { $('tela').innerHTML = h + tCarregando(); return; }
  var fu = d.funcionario || {}, docs = fu.documentos || d.documentos || [];
  h += '<div class="card"><h2 style="font-size:15px">Documentos</h2><ul class="lista">' + (docs.map(function (x) { var venc = x.validade && aIsoData(x.validade) < dataIso(Date.now()); return '<li><span>' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank">' + esc(x.tipoDocumento || x.nome || 'Documento') + '</a>' : esc(x.tipoDocumento || x.nome || 'Documento')) + (x.validade ? ' <span class="muted">até ' + mdData(x.validade) + '</span>' : '') + (venc ? ' ' + aBadge('Vencido') : '') + '</span><a href="#" style="color:var(--erro)" onclick="tDocExcluir(\'' + tId(x.id) + '\');return false">🗑️</a></li>'; }).join('') || '<li class="muted">Nenhum documento.</li>') + '</ul>' +
    '<label>Tipo</label><select id="tdc-t">' + (d.tiposDocumento || []).map(function (t) { var n = typeof t === 'object' ? (t.nome || t.tipo) : t; return '<option>' + esc(n) + '</option>'; }).join('') + '</select><label>Validade</label><input type="date" id="tdc-v"><label>Arquivo (foto ou PDF)</label><input type="file" id="tdc-a" accept="image/*,application/pdf">' + tBtn('📎 Anexar documento', 'tDocAnexar()', 'lar') + '</div>';
  var ad = d.adiantamentos || [];
  h += '<div class="card"><h2 style="font-size:15px">Adiantamentos avulsos</h2><ul class="lista">' + (ad.map(function (a) { return '<li><span>' + mdData(a.data || a.dataPagamento) + ' · ' + esc(a.descricao || a.observacao || '') + '</span><span><b>' + mdBrl(a.valor) + '</b> <a href="#" style="color:var(--erro)" onclick="tAdExcluir(\'' + tId(a.id) + '\');return false">🗑️</a></span></li>'; }).join('') || '<li class="muted">Nenhum.</li>') + '</ul>' +
    '<div class="grade"><div><label>Valor (R$)</label><input type="number" step="any" id="tad-v"></div><div><label>Data</label><input type="date" id="tad-d" value="' + dataIso(Date.now()) + '"></div></div><label>Descrição</label><input id="tad-o">' + tBtn('+ Lançar adiantamento', 'tAdLancar()') + '</div>';
  $('tela').innerHTML = h;
}
function tDocAnexar() {
  var a = $('tdc-a').files[0]; if (!a) return aviso('Escolha o arquivo.', 'err');
  if (a.size > 15e6) return aviso('Arquivo muito grande (máx. 15 MB).', 'err');
  var r = new FileReader();
  r.onload = function () { tFn('anexarDocumentoFuncionario', [T.func.id, { tipoDocumento: $('tdc-t').value, validade: $('tdc-v').value, arquivo: { data: String(r.result).split(',')[1], mimeType: a.type || 'application/octet-stream', nome: a.name } }], 'Enviando documento...').then(function () { tLimpa('fdet_'); render(); }).catch(function () {}); };
  r.readAsDataURL(a);
}
function tDocExcluir(id) { if (confirm('Excluir este documento?')) tFn('excluirDocumentoFuncionario', [id]).then(function () { tLimpa('fdet_'); render(); }).catch(function () {}); }
function tAdLancar() { var v = Number($('tad-v').value); if (!v) return aviso('Informe o valor.', 'err'); tFn('lancarAdiantamentoAvulso', [{ funcionarioId: T.func.id, valor: v, data: $('tad-d').value, descricao: $('tad-o').value }]).then(function () { tLimpa('fdet_'); render(); }).catch(function () {}); }
function tAdExcluir(id) { if (confirm('Excluir este adiantamento?')) tFn('excluirAdiantamentoAvulso', [id]).then(function () { tLimpa('fdet_'); render(); }).catch(function () {}); }

// ================= RESUMO FINANCEIRO =================
function tTelaFin() {
  var r = tCarrega('finres', 'obterResumoFinanceiro', [], 'tFin');
  var h = gVoltar('auto') + tH('💰 Resumo financeiro');
  if (!r) { $('tela').innerHTML = h + tCarregando(); return; }
  var c = function (t, v, cor) { return '<div class="card" style="margin:0;padding:12px"><div class="muted" style="font-size:12px">' + t + '</div><b style="font-size:17px;color:' + (cor || 'var(--texto)') + '">' + mdBrl(v) + '</b></div>'; };
  h += '<div class="grade" style="margin-bottom:12px">' + c('A receber', r.totalAReceber, '#1b7f3b') + c('A pagar', r.totalAPagar, '#c62828') + c('Vencidos a receber', r.vencidosReceber, '#c77700') + c('Vencidos a pagar', r.vencidosPagar, '#c62828') + c('Receita do mês', r.receitaMes, '#1b7f3b') + c('Saídas do mês', r.saidasMes, '#c62828') + c('Aportes do mês', r.aportesMes) + c('Saldo do mês', r.saldoMes, (+r.saldoMes || 0) < 0 ? '#c62828' : '#1b7f3b') + c('Previsto entradas', r.previstoEntradas) + c('Previsto saídas', r.previstoSaidas) + c('A faturar (obras)', r.saldoAFaturarProjetos, 'var(--laranja)') + '</div>';
  h += '<div class="grade">' + ['listarLancamentos|📒 Lançamentos', 'listarCustosFixos|🔁 Custos fixos', 'listarComparativoCustosProjetos|📊 Custos por obra', 'listarProjecaoMedicoes|📈 Projeção de medições'].map(function (x) { x = x.split('|'); return '<button class="bat" style="text-align:left;padding:14px" onclick="A.mod=\'fin\';aAbrirFn(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>';
  $('tela').innerHTML = h;
}

// ================= rotas e ganchos =================
var _tRota = gRotaExtra;
var T_ROTAS = { tObras: tTelaObras, tObra: tTelaObra, tCrono: tTelaCrono, tDiarios: tTelaDiarios, tFreq: tTelaFreq, tEspelho: tTelaEspelho, tDia: tTelaDia, tFolha: tTelaFolha, tFolhaFunc: tTelaFolhaFunc, tFunil: tTelaFunil, tOpo: tTelaOpo, tAtiv: tTelaAtiv, tTurmas: tTelaTurmas, tTurma: tTelaTurma, tEpi: tTelaEpi, tEpiFunc: tTelaEpiFunc, tFuncDocs: tTelaFuncDocs, tFin: tTelaFin, tCronoEd: function () { tCronoEditar(T.cronoI); } };
gRotaExtra = function (v) { if (T_ROTAS[v]) { T_ROTAS[v](); return true; } return _tRota(v); };
// módulos genéricos que ganharam tela própria: abrem direto a tela nova
var T_ATALHO = { listarDiariosObra: 'tDiarios', obterCronograma: 'tCrono', listarResumoFrequencia: 'tFreq', obterEspelhoPonto: 'tFreq', folhaCalcularMes: 'tFolha', listarOportunidades: 'tFunil', listarAtividadesCRM: 'tAtiv', listarTurmas: 'tTurmas', obterResumoFinanceiro: 'tFin', listarEntregasFuncionario: 'tEpi', obterDetalheFuncionario: null };
var _tAbrir = aAbrirFn;
aAbrirFn = function (n, item) {
  if (/^(listarDiariosObra|obterCronograma)$/.test(n) && item && item.id) { T.proj = { id: item.id, nome: mTitulo(item) }; return gIr(T_ATALHO[n]); }
  if (n === 'obterDetalheFuncionario' && item && item.id) { T.func = { id: item.id, nome: mTitulo(item) }; return gIr('tFuncDocs'); }
  if (n === 'listarEntregasFuncionario' && item && item.id) { T.func = { id: item.id, nome: mTitulo(item) }; delete T.d.epi_ent; return gIr('tEpiFunc'); }
  if (T_ATALHO[n] && !(item && /^(listarAtividadesCRM)$/.test(n))) return gIr(T_ATALHO[n]);
  return _tAbrir(n, item);
};


// ================= DOCUMENTOS DA EMPRESA (pasta "DNP - Documentos da Empresa" no Drive) =================
// Lista a pasta e baixa cada arquivo pelo servidor (funciona sem acesso direto ao Drive).
function tTam(b) { b = Number(b) || 0; return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function tPodeCompartilhar() { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); } catch (e) { return false; } }
function tTelaDocsEmp() {
  var l = tCarrega('docsEmp', 'listarPastaDocumentosEmpresa', [], 'tDocsEmp');
  var h = gVoltar('menu') + tH('📁 Documentos da empresa', 'Certidões, contrato social, cartão CNPJ, alvará, PGR, PCMSO e outros');
  if (!l) { $('tela').innerHTML = h + tCarregando(); return; }
  var share = tPodeCompartilhar();
  h += '<div class="card">' + (l.length ? tBtn('⬇️ Baixar todos (' + l.length + ')', 'tDocBaixarTodos()', 'lar') : '') +
    tBtn('🔄 Atualizar lista', "delete T.d.docsEmp;render()", 'sec') + '</div>';
  h += '<div class="card"><ul class="lista">' + (l.map(function (f) {
    return '<li style="display:block"><div style="font-weight:600;word-break:break-word">' + esc(f.nome) + '</div>' +
      '<div class="muted" style="font-size:13px;margin:2px 0 6px">' + tTam(f.tamanho) + (f.atualizado ? ' · ' + esc(f.atualizado) : '') + '</div>' +
      '<div style="display:flex;gap:8px"><button class="btn" style="flex:1;margin:0" onclick="tDocBaixar(\'' + tId(f.id) + '\')">⬇️ Baixar</button>' +
      (share ? '<button class="btn sec" style="flex:1;margin:0" onclick="tDocBaixar(\'' + tId(f.id) + '\',true)">📤 Enviar</button>' : '') + '</div></li>';
  }).join('') || '<li class="muted">A pasta está vazia.</li>') + '</ul></div>';
  $('tela').innerHTML = h;
}
function tDocBaixar(id, compartilhar) {
  if (!gOnline()) return Promise.resolve();
  aviso('Baixando...');
  return sys('baixarArquivoDocumentosEmpresa', [id]).then(function (r) {
    var bin = atob(r.base64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var arq = new File([u8], r.nome, { type: r.mime || 'application/octet-stream' });
    if (compartilhar && navigator.canShare && navigator.canShare({ files: [arq] })) {
      aviso('Pronto.', 'ok');
      return navigator.share({ files: [arq], title: r.nome }).catch(function () {});
    }
    var url = URL.createObjectURL(arq), a = document.createElement('a');
    a.href = url; a.download = r.nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    aviso('Baixado: ' + r.nome, 'ok');
  }).catch(function (e) { aviso(e.message, 'err'); });
}
function tDocBaixarTodos() {
  var l = T.d.docsEmp || [], i = 0;
  if (!l.length || !gOnline()) return;
  (function prox() {
    if (i >= l.length) { aviso('Pronto: ' + l.length + ' arquivos baixados.', 'ok'); return; }
    var f = l[i++]; aviso('Baixando ' + i + ' de ' + l.length + '...');
    tDocBaixar(f.id).then(function () { setTimeout(prox, 800); });
  })();
}
T_ROTAS.tDocsEmp = tTelaDocsEmp;
var _tMenuExtra = gMenuExtra;
gMenuExtra = function () {
  return _tMenuExtra() + (gPode('usuarios', 'ver') ? '<button class="bat" style="text-align:left;padding:14px" onclick="gIr(\'tDocsEmp\')">📁 Documentos da empresa<small>certidões, alvará, PGR · baixar</small></button>' : '');
};
