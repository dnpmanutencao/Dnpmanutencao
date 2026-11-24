/* DNP Gestão — Fluxo de caixa em calendário: saldo do banco, projeção diária, pendências, lançamento rápido e relatórios. */
var F = { mes: dataIso(Date.now()).slice(0, 7), vis: 'mes', dia: null, aba: 'cal', obra: '', cat: '', lanc: null, saldo: null, carregando: false, sel: {}, ed: null };
var F_NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var F_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function fHoje() { return dataIso(Date.now()); }
function fBrl(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fK(v) { v = Math.abs(Number(v) || 0); if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'mi'; if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.', ',') + 'k'; return String(Math.round(v)); }
function fDia(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; }
function fAdd(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return dataIso(d.getTime()); }
function fEnt(l) { return l.tipo === 'Entrada'; }
function fBaix(l) { return l.status === 'Baixado'; }
function fData(l) { return fBaix(l) ? (l.dataBaixa || l.dataVencimento) : l.dataVencimento; } // dia em que o dinheiro mexe
function fFiltra(l) { return (!F.obra || String(l.projetoId) === F.obra) && (!F.cat || l.categoria === F.cat); }

function fCarregar(forcar) {
  if (F.carregando) return;
  if (!F.lanc) DB.get('g_fluxo2').then(function (c) { if (c && !F.lanc) { F.todos = c.lanc; F.saldo = c.saldo; F.lanc = F.todos; if (G.view === 'tFluxo') fTela(); } });
  if (!navigator.onLine) return;
  F.carregando = true;
  sys('fxListar', []).then(function (r) {
    F.todos = (r.itens || []).map(fMapear); F.saldo = r.saldo || {}; F.lanc = F.todos; DB.set('g_fluxo2', { lanc: F.todos, saldo: F.saldo });
  }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { F.carregando = false; if (G.view === 'tFluxo') fTela(); });
}

// ---------- cálculo do saldo dia a dia ----------
// converte o registro da aba FluxoCaixa para o formato usado nas telas
function fMapear(o) { return { id: o.id, tipo: o.tipo, valorTotal: +o.valor || 0, descricao: o.descricao, categoria: o.categoria, projetoId: o.projetoId, nomeProjeto: o.nomeObra, fornecedorCliente: o.fornecedorCliente, formaPagamento: o.formaPagamento, dataVencimento: o.dataVencimento, dataBaixa: o.dataPagamento, status: o.status === 'Pago' ? 'Baixado' : o.status === 'Previsto' ? 'Previsto' : 'Aberto', origemTipo: o.origemTipo, origemId: o.origemId, comprovanteUrl: o.comprovanteUrl, dadosPagamento: o.dadosPagamento || null, obs: o.obs || '', funcionarioId: o.funcionarioId || '', funcionarioNome: o.funcionarioNome || '', dataLancamento: String(o.criadoEm || '').slice(0, 10) }; }
// (antigo) modo manual: só lançamentos feitos a partir da data de início; automáticos (folha, medição, custos fixos) só quando liberados
function fAplicar(l) {
  var s = F.saldo || {}, ini = s.inicio || '', lin = +s.linhaInicio || 0;
  return (l || []).filter(function (x) {
    if (lin && (+x.linha || 0) <= lin) return false;
    if (ini && String(x.dataLancamento || '') < ini) return false;
    if ((ini || lin) && !s.auto && x.origemTipo && x.origemTipo !== 'Manual') return false;
    return true;
  });
}
function fCalc() {
  var hoje = fHoje(), s = F.saldo || {}, ini = s.inicio || '';
  if (!ini && +s.linhaInicio) { ini = F.lanc.map(fData).filter(Boolean).sort()[0] || hoje; } // zerado: começa no primeiro lançamento novo
  var base = s.definido && (!ini || s.data >= fAdd(ini, -1)) ? { v: +s.valor || 0, d: s.data } : { v: 0, d: ini ? fAdd(ini, -1) : hoje };
  var real = {}, pend = {}, venc = { n: 0, v: 0, ent: 0, sai: 0 };
  F.lanc.forEach(function (l) {
    var s = fEnt(l) ? +l.valorTotal : -l.valorTotal;
    if (fBaix(l)) { var d = l.dataBaixa || l.dataVencimento; if (d) real[d] = (real[d] || 0) + s; }
    else if (l.dataVencimento) {
      var e = l.dataVencimento < hoje ? hoje : l.dataVencimento;
      if (l.dataVencimento < hoje && l.status !== 'Previsto') { venc.n++; venc.v += +l.valorTotal; if (fEnt(l)) venc.ent += +l.valorTotal; else venc.sai += +l.valorTotal; }
      pend[e] = (pend[e] || 0) + s;
    }
  });
  var rk = Object.keys(real).sort(), pk = Object.keys(pend).sort();
  return {
    base: base, venc: venc, hoje: hoje,
    saldo: function (d) { // saldo ao fim do dia d
      var s = base.v;
      rk.forEach(function (x) { if (x > base.d && x <= d) s += real[x]; if (x <= base.d && x > d) s -= real[x]; });
      if (d >= hoje) pk.forEach(function (x) { if (x <= d) s += pend[x]; });
      return s;
    }
  };
}
function fDoDia(d) { return F.lanc.filter(function (l) { return fFiltra(l) && fData(l) === d; }); }
function fTotDia(d) { var e = 0, s = 0; fDoDia(d).forEach(function (l) { if (fEnt(l)) e += +l.valorTotal; else s += +l.valorTotal; }); return { e: e, s: s }; }

// ---------- tela principal ----------
function fTela() {
  var main = document.querySelector('main'); if (main) main.style.maxWidth = '1180px';
  if (!F.lanc) { $('tela').innerHTML = gVoltar('auto') + '<div class="card muted">Carregando o financeiro...</div>'; fCarregar(); return; }
  var abas = [['cal', '📅 Calendário'], ['ext', '🏦 Extrato'], ['aprov', '📥 Aprovações' + (F.nAprov ? ' (' + F.nAprov + ')' : '')], ['pagar', '🧾 Contas a pagar'], ['pend', '⚠️ Pendências'], ['rel', '📊 Relatórios']];
  var h = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap"><button class="btn sec" style="width:auto;padding:8px 12px;font-size:13px" onclick="gIr(\'auto\')">←</button>' +
    abas.map(function (a) { return '<button class="btn ' + (F.aba === a[0] ? '' : 'sec') + '" style="width:auto;padding:8px 12px;font-size:13px" onclick="F.aba=\'' + a[0] + '\';fTela()">' + a[1] + '</button>'; }).join('') +
    '<button class="btn sec" style="width:auto;padding:8px 10px;font-size:13px;margin-left:auto" onclick="fCarregar(true)" title="Atualizar">🔄</button></div>';
  if (F.aba === 'ext') h += fHtmlExt(); else if (F.aba === 'aprov') h += fHtmlAprov(); else if (F.aba === 'pagar') h += fHtmlPagar(); else if (F.aba === 'pend') h += fHtmlPend(); else if (F.aba === 'rel') h += fHtmlRel(); else h += fHtmlCal();
  if (F.aba !== 'ext') h += '<button onclick="fNovo()" style="position:fixed;right:18px;bottom:84px;width:58px;height:58px;border-radius:50%;background:var(--laranja);color:#fff;font-size:30px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:6">+</button>';
  $('tela').innerHTML = h;
  fLigar();
}
function fCards(c) {
  var hoje = c.hoje, fimMes = F.mes + '-' + String(new Date(+F.mes.slice(0, 4), +F.mes.slice(5, 7), 0).getDate()).padStart(2, '0');
  var rec = 0, pag = 0; F.lanc.forEach(function (l) { if (!fBaix(l) && l.dataVencimento && l.dataVencimento.slice(0, 7) === F.mes) { if (fEnt(l)) rec += +l.valorTotal; else pag += +l.valorTotal; } });
  var sh = c.saldo(hoje), sf = c.saldo(fimMes < hoje ? hoje : fimMes);
  var card = function (t, v, cor, extra, onclick) { return '<div class="card" style="margin:0;padding:10px 12px' + (onclick ? ';cursor:pointer' : '') + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '><div class="muted" style="font-size:12px">' + t + '</div><b style="font-size:18px;color:' + cor + '">' + v + '</b>' + (extra ? '<div class="muted" style="font-size:11px">' + extra + '</div>' : '') + '</div>'; };
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px">' +
    card('Saldo hoje', fBrl(sh), sh < 0 ? '#c62828' : '#1b7f3b', F.saldo && F.saldo.definido ? 'banco em ' + fDia(F.saldo.data) + ' ⚙️' : 'toque para informar o banco', 'fSaldoForm()') +
    card('Previsto fim de ' + F_NOMES_MES[+F.mes.slice(5, 7) - 1].toLowerCase(), fBrl(sf), sf < 0 ? '#c62828' : '#1565c0') +
    card('A receber no mês', fBrl(rec), '#1b7f3b') + card('A pagar no mês', fBrl(pag), '#c62828') +
    (c.venc.n ? card('⚠️ Vencidos sem baixa', c.venc.n + ' · ' + fBrl(c.venc.v), '#c77700', 'toque para resolver', "F.aba='pend';fTela()") : '') + '</div>' +
    (F.saldo && (F.saldo.inicio || +F.saldo.linhaInicio) ? '<div class="card" style="background:#fff8e1;padding:10px 12px;font-size:13px">🧾 <b>Fluxo zerado</b>: ' + (F.saldo.inicio ? 'começou do zero em ' + fDia(F.saldo.inicio) + '/' + F.saldo.inicio.slice(0, 4) : (F.lanc.length ? 'começou no primeiro lançamento novo (' + fDia(F.lanc.map(fData).filter(Boolean).sort()[0]) + ')' : 'começa no seu primeiro lançamento novo — toque no + para lançar')) + ' · ' + (F.saldo.auto ? 'lançamentos automáticos incluídos' : 'lançamentos automáticos (folha, medições, custos fixos) desligados') + ' · ' + (F.todos ? (F.todos.length - F.lanc.length) + ' antigos ocultos' : '') + ' <a href="#" onclick="fSaldoForm();return false">alterar</a></div>' : '') +
    (F.saldo && (F.saldo.definido || F.saldo.inicio || +F.saldo.linhaInicio) ? '' : '<div class="card" style="border:2px solid var(--laranja)"><b>Informe o saldo do banco</b><p class="muted" style="margin:4px 0">Com o saldo de hoje o calendário mostra quanto vai ter em caixa em cada dia.</p><button class="btn lar" onclick="fSaldoForm()">Informar saldo</button></div>');
}
function fFiltrosHtml() {
  var obras = {}, cats = {}; F.lanc.forEach(function (l) { if (l.projetoId) obras[l.projetoId] = l.nomeProjeto || l.projetoId; if (l.categoria) cats[l.categoria] = 1; });
  return '<select id="f-obra" style="flex:1;min-width:0;padding:8px"><option value="">Todas as obras</option>' + Object.keys(obras).map(function (k) { return '<option value="' + esc(k) + '"' + (F.obra === k ? ' selected' : '') + '>' + esc(obras[k]) + '</option>'; }).join('') + '</select>' +
    '<select id="f-cat" style="flex:1;min-width:0;padding:8px"><option value="">Todas as categorias</option>' + Object.keys(cats).sort().map(function (k) { return '<option' + (F.cat === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>';
}
function fHtmlCal() {
  var c = fCalc(), hoje = c.hoje; if (!F.dia) F.dia = hoje.slice(0, 7) === F.mes ? hoje : F.mes + '-01';
  var a = +F.mes.slice(0, 4), m = +F.mes.slice(5, 7), nd = new Date(a, m, 0).getDate(), ini = new Date(a, m - 1, 1).getDay();
  var h = fCards(c);
  h += '<div class="fx-grid"><div>';
  h += '<div class="card" style="padding:10px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><button class="btn sec" style="width:auto;padding:6px 12px" onclick="fMes(-1)">‹</button><b style="flex:1;text-align:center;font-size:17px">' + F_NOMES_MES[m - 1] + ' ' + a + '</b><button class="btn sec" style="width:auto;padding:6px 12px" onclick="fMes(1)">›</button></div>' +
    '<div style="display:flex;gap:6px;margin-bottom:8px">' + fFiltrosHtml() + '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="F.vis=F.vis===\'mes\'?\'semana\':\'mes\';fTela()">' + (F.vis === 'mes' ? 'Semana' : 'Mês') + '</button></div>';
  if (F.vis === 'semana') {
    var d0 = fAdd(F.dia, -new Date(F.dia + 'T12:00:00').getDay());
    h += '<ul class="lista">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var d = fAdd(d0, i), t = fTotDia(d), s = c.saldo(d);
      return '<li style="cursor:pointer;display:flex;align-items:center;gap:10px;' + (d === F.dia ? 'background:#fff4ec;' : '') + (d === hoje ? 'font-weight:700' : '') + '" onclick="F.dia=\'' + d + '\';F.mes=F.dia.slice(0,7);fTela()"><span style="width:58px">' + F_SEM[i] + ' ' + fDia(d) + '</span><span style="flex:1;font-size:13px"><span style="color:#1b7f3b">' + (t.e ? '+' + fBrl(t.e) : '') + '</span> <span style="color:#c62828">' + (t.s ? '−' + fBrl(t.s) : '') + '</span></span><b style="font-size:13px;color:' + (s < 0 ? '#c62828' : '#555') + '">' + fBrl(s) + '</b></li>';
    }).join('') + '</ul>';
  } else {
    h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center">' + F_SEM.map(function (s) { return '<div class="muted" style="font-size:11px;padding:2px 0">' + s + '</div>'; }).join('');
    for (var i = 0; i < ini; i++) h += '<div></div>';
    for (var dd = 1; dd <= nd; dd++) {
      var d = F.mes + '-' + String(dd).padStart(2, '0'), t = fTotDia(d), s = c.saldo(d), venc = d < hoje && fDoDia(d).some(function (l) { return !fBaix(l) && l.status !== 'Previsto'; });
      var fundo = d === F.dia ? '#fff4ec' : (d < hoje ? '#fafafa' : '#fff');
      h += '<div onclick="F.dia=\'' + d + '\';fTela()" style="cursor:pointer;border:' + (d === hoje ? '2px solid var(--laranja)' : '1px solid var(--borda)') + ';border-radius:8px;background:' + fundo + ';min-height:64px;padding:3px 2px;display:flex;flex-direction:column;position:relative">' +
        '<span style="font-size:12px;font-weight:' + (d === hoje ? 700 : 500) + '">' + dd + '</span>' + (venc ? '<span style="position:absolute;top:3px;right:4px;width:7px;height:7px;border-radius:50%;background:#c62828"></span>' : '') +
        '<span style="font-size:10px;color:#1b7f3b;line-height:1.2">' + (t.e ? '+' + fK(t.e) : '&nbsp;') + '</span><span style="font-size:10px;color:#c62828;line-height:1.2">' + (t.s ? '−' + fK(t.s) : '&nbsp;') + '</span>' +
        '<span style="margin-top:auto;font-size:9px;border-radius:4px;padding:1px 0;color:#fff;background:' + (s < 0 ? '#c62828' : d >= hoje ? '#1565c0' : '#9aa5b1') + '">' + (s < 0 ? '−' : '') + fK(s) + '</span></div>';
    }
    h += '</div><p class="muted" style="font-size:11px;margin:6px 0 0">Verde = entradas · vermelho = saídas · faixa = saldo no fim do dia (azul previsto, vermelho negativo) · ● vencido sem baixa</p>';
  }
  h += '</div></div><div>' + fHtmlDia(c) + fGrafico(c) + '</div></div>';
  return h;
}
function fGrafico(c) {
  var a = +F.mes.slice(0, 4), m = +F.mes.slice(5, 7), nd = new Date(a, m, 0).getDate(), pts = [], min = 0, max = 0;
  for (var i = 1; i <= nd; i++) { var v = c.saldo(F.mes + '-' + String(i).padStart(2, '0')); pts.push(v); if (v < min) min = v; if (v > max) max = v; }
  if (max === min) max = min + 1;
  var W = 600, H = 150, x = function (i) { return 30 + i * (W - 40) / (nd - 1); }, y = function (v) { return 10 + (max - v) * (H - 30) / (max - min); };
  var path = pts.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
  var hi = c.hoje.slice(0, 7) === F.mes ? +c.hoje.slice(8) - 1 : -1;
  return '<div class="card" style="padding:10px"><b style="font-size:14px">Saldo dia a dia</b><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;margin-top:6px">' +
    (min < 0 ? '<rect x="30" y="' + y(0) + '" width="' + (W - 40) + '" height="' + (H - 20 - y(0)) + '" fill="#fdecea"/>' : '') +
    '<line x1="30" x2="' + (W - 10) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#999" stroke-dasharray="4 3"/>' +
    (hi >= 0 ? '<line x1="' + x(hi) + '" x2="' + x(hi) + '" y1="5" y2="' + (H - 18) + '" stroke="var(--laranja)" stroke-width="2"/>' : '') +
    '<path d="' + path + '" fill="none" stroke="#1565c0" stroke-width="2.5"/>' +
    pts.map(function (v, i) { return v < 0 ? '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="#c62828"/>' : ''; }).join('') +
    '<text x="2" y="14" font-size="11" fill="#666">' + fK(max) + '</text><text x="2" y="' + (H - 18) + '" font-size="11" fill="#666">' + (min < 0 ? '−' : '') + fK(min) + '</text>' +
    [1, 8, 15, 22, nd].map(function (d) { return '<text x="' + x(d - 1) + '" y="' + (H - 3) + '" font-size="11" fill="#666" text-anchor="middle">' + d + '</text>'; }).join('') +
    '</svg>' + (min < 0 ? '<p style="color:#c62828;font-size:13px;margin:4px 0 0">⚠️ O caixa fica negativo em algum dia deste mês.</p>' : '') + '</div>';
}
function fItem(l) {
  var e = fEnt(l), st = fBaix(l) ? (e ? 'Recebido' : 'Pago') : l.status === 'Previsto' ? 'Previsto' : (l.dataVencimento < fHoje() ? 'Vencido' : (e ? 'A receber' : 'A pagar'));
  var cor = { Recebido: '#1b7f3b', Pago: '#1b7f3b', Previsto: '#6a4fb3', Vencido: '#c62828', 'A receber': '#c77700', 'A pagar': '#c77700' }[st];
  var id = esc(l.id);
  return '<li style="display:block"><div style="display:flex;gap:8px;align-items:flex-start"><span style="font-size:18px">' + (e ? '🟢' : '🔴') + '</span><div style="flex:1;min-width:0"><b>' + esc(l.descricao || '') + '</b><br><span class="muted" style="font-size:12px">' + (l.origemTipo === 'Requisicao' ? '📦 Requisição · ' : l.origemTipo === 'Reembolso' ? '🧾 Reembolso · ' : '') + esc([l.categoria, l.nomeProjeto, l.fornecedorCliente, l.formaPagamento].filter(Boolean).join(' · ')) + (l.comprovanteUrl ? ' <a href="' + esc(l.comprovanteUrl) + '" target="_blank">📎 comprovante</a>' : '') + (fBaix(l) && l.dataBaixa !== l.dataVencimento ? ' · venc. ' + fDia(l.dataVencimento) : '') + '</span></div>' +
    '<div style="text-align:right"><b style="color:' + (e ? '#1b7f3b' : '#c62828') + '">' + (e ? '+' : '−') + fBrl(l.valorTotal) + '</b><br><span style="font-size:11px;font-weight:700;color:' + cor + '">' + st + '</span></div></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
    (!fBaix(l) && l.status !== 'Previsto' ? '<button class="btn" style="width:auto;padding:6px 10px;font-size:12px" onclick="fBaixar(\'' + id + '\')">✔ ' + (e ? 'Recebido' : 'Pago') + '</button>' : '') +
    (l.status === 'Previsto' ? '<button class="btn" style="width:auto;padding:6px 10px;font-size:12px" onclick="fAcao(\'fxConfirmar\',[\'' + id + '\'],\'Confirmado.\')">✔ Confirmar</button>' : '') +
    (!fBaix(l) ? '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fReagendar(\'' + id + '\')">📅 Mudar data</button>' : '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fAcao(\'fxReabrir\',[\'' + id + '\'],\'Reaberto.\')">↩ Desfazer baixa</button>') +
    '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fEditar(\'' + id + '\')">✏️</button>' +
    '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fAnexar(\'' + id + '\')" title="Anexar comprovante">📎</button>' +
    '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px;color:var(--erro)" onclick="fExcluir(\'' + id + '\')">🗑️</button></div></li>';
}
function fHtmlDia(c) {
  var d = F.dia, l = fDoDia(d), t = fTotDia(d), dt = new Date(d + 'T12:00:00');
  return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0;font-size:16px">' + F_SEM[dt.getDay()] + ', ' + fDia(d) + '</h2><button class="btn lar" style="width:auto;padding:6px 12px;font-size:13px" onclick="fNovo(F.dia)">+ Lançar</button></div>' +
    '<p class="muted" style="margin:4px 0 8px;font-size:13px">Entradas <b style="color:#1b7f3b">' + fBrl(t.e) + '</b> · Saídas <b style="color:#c62828">' + fBrl(t.s) + '</b> · Saldo no fim do dia <b>' + fBrl(c.saldo(d)) + '</b></p>' +
    '<ul class="lista">' + (l.length ? l.sort(function (a, b) { return fEnt(b) - fEnt(a); }).map(fItem).join('') : '<li class="muted">Nada neste dia.</li>') + '</ul>' +
    (d === c.hoje && c.venc.n ? '<p style="font-size:12px;color:#c77700">Obs.: no saldo de hoje entram também ' + c.venc.n + ' vencido(s) sem baixa. Veja em Pendências.</p>' : '') + '</div>';
}

// ---------- pendências ----------
function fHtmlPend() {
  var hoje = fHoje(), v = F.lanc.filter(function (l) { return !fBaix(l) && l.status !== 'Previsto' && l.dataVencimento && l.dataVencimento < hoje; }).sort(function (a, b) { return a.dataVencimento.localeCompare(b.dataVencimento); });
  var p = F.lanc.filter(function (l) { return l.status === 'Previsto' && l.dataVencimento && l.dataVencimento <= fAdd(hoje, 30); }).sort(function (a, b) { return a.dataVencimento.localeCompare(b.dataVencimento); });
  var lst = function (arr) { return arr.map(function (l) { return '<li style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="f-ck" data-id="' + esc(l.id) + '" style="width:auto"' + (F.sel[l.id] ? ' checked' : '') + '><div style="flex:1;min-width:0">' + fItem(l).replace(/^<li style="display:block">|<\/li>$/g, '') + '<span class="muted" style="font-size:12px">Vencimento: ' + fDia(l.dataVencimento) + '</span></div></li>'; }).join(''); };
  return '<div class="card"><h2>⚠️ Vencidos sem baixa (' + v.length + ')</h2><p class="muted" style="margin-top:-4px">Coisas que já passaram da data e não foram marcadas como pagas/recebidas. Dê baixa no que já aconteceu e mude a data do que vai acontecer depois.</p>' +
    (v.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fSelTodos(true)">Marcar todos</button><button class="btn" style="width:auto;padding:6px 10px;font-size:12px" onclick="fLote(\'venc\')">✔ Baixar marcados na data do vencimento</button><button class="btn" style="width:auto;padding:6px 10px;font-size:12px" onclick="fLote(\'hoje\')">✔ Baixar marcados com data de hoje</button><button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fLote(\'data\')">📅 Mudar data dos marcados</button></div>' : '') +
    '<ul class="lista">' + (lst(v) || '<li class="muted">Tudo em dia! 🎉</li>') + '</ul></div>' +
    '<div class="card"><h2>🟣 Previstos nos próximos 30 dias (' + p.length + ')</h2><p class="muted" style="margin-top:-4px">Lançamentos estimados. Confirme quando virarem conta de verdade.</p><ul class="lista">' + (p.map(fItem).join('') || '<li class="muted">Nenhum.</li>') + '</ul></div>';
}
function fSelTodos() { Array.prototype.forEach.call(document.querySelectorAll('.f-ck'), function (c) { c.checked = true; F.sel[c.dataset.id] = 1; }); }
function fLote(modo) {
  var ids = Object.keys(F.sel).filter(function (k) { return F.sel[k]; }); if (!ids.length) return aviso('Marque ao menos um lançamento.', 'err');
  var nova = null; if (modo === 'data') { nova = prompt('Nova data (dd/mm/aaaa):', fDia(fHoje()) + '/' + fHoje().slice(0, 4)); if (!nova) return; nova = fParseData(nova); if (!nova) return aviso('Data inválida.', 'err'); }
  if (!confirm((modo === 'data' ? 'Mudar a data de ' : 'Dar baixa em ') + ids.length + ' lançamento(s)?')) return;
  if (!gOnline()) return; aviso('Salvando ' + ids.length + '...');
  var mapa = {}; F.lanc.forEach(function (l) { mapa[l.id] = l; });
  ids.reduce(function (p, id) { return p.then(function () { var l = mapa[id]; if (!l) return; return modo === 'data' ? sys('fxAlterarData', [id, nova]) : sys('fxBaixar', [id, modo === 'venc' ? l.dataVencimento : fHoje()]); }); }, Promise.resolve())
    .then(function () { F.sel = {}; aviso('Pronto.', 'ok'); fCarregar(true); }).catch(function (e) { aviso(e.message, 'err'); fCarregar(true); });
}
function fParseData(s) { s = String(s).trim(); var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/); if (m) { var a = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : fHoje().slice(0, 4); return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); } return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }

// ---------- relatórios ----------
function fHtmlRel() {
  var a = +F.mes.slice(0, 4), m = +F.mes.slice(5, 7);
  var doMes = F.lanc.filter(function (l) { return fBaix(l) && (l.dataBaixa || '').slice(0, 7) === F.mes && fFiltra(l); });
  var agrupa = function (arr, campo) { var g = {}; arr.forEach(function (l) { var k = l[campo] || '(sem)'; g[k] = (g[k] || 0) + (+l.valorTotal); }); return Object.keys(g).map(function (k) { return [k, g[k]]; }).sort(function (x, y) { return y[1] - x[1]; }); };
  var barras = function (lista, cor) { var mx = lista.length ? lista[0][1] : 1; return lista.map(function (x) { return '<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span>' + esc(x[0]) + '</span><b>' + fBrl(x[1]) + '</b></div><div style="height:8px;background:#eef1f5;border-radius:4px"><div style="height:8px;width:' + Math.max(2, x[1] / mx * 100) + '%;background:' + cor + ';border-radius:4px"></div></div></div>'; }).join('') || '<p class="muted">Nada no período.</p>'; };
  var ent = doMes.filter(fEnt), sai = doMes.filter(function (l) { return !fEnt(l); }), te = 0, ts = 0; ent.forEach(function (l) { te += +l.valorTotal; }); sai.forEach(function (l) { ts += +l.valorTotal; });
  var meses = []; for (var i = 5; i >= 0; i--) { var d = new Date(a, m - 1 - i, 1); meses.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
  var serie = meses.map(function (mm) { var e = 0, s = 0; F.lanc.forEach(function (l) { if (fBaix(l) && (l.dataBaixa || '').slice(0, 7) === mm && fFiltra(l)) { if (fEnt(l)) e += +l.valorTotal; else s += +l.valorTotal; } }); return [mm, e, s]; });
  var mx = Math.max.apply(null, serie.map(function (x) { return Math.max(x[1], x[2]); }).concat([1]));
  var h = '<div class="card" style="padding:10px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><button class="btn sec" style="width:auto;padding:6px 12px" onclick="fMes(-1)">‹</button><b style="flex:1;text-align:center;font-size:17px">' + F_NOMES_MES[m - 1] + ' ' + a + ' · realizado</b><button class="btn sec" style="width:auto;padding:6px 12px" onclick="fMes(1)">›</button></div><div style="display:flex;gap:6px">' + fFiltrosHtml() + '</div></div>';
  h += '<div class="card"><h2 style="font-size:16px">Resultado do mês (DRE simples)</h2><ul class="lista"><li><span>Entradas recebidas</span><b style="color:#1b7f3b">' + fBrl(te) + '</b></li><li><span>Saídas pagas</span><b style="color:#c62828">' + fBrl(ts) + '</b></li><li><span>Resultado</span><b style="color:' + (te - ts < 0 ? '#c62828' : '#1b7f3b') + '">' + fBrl(te - ts) + '</b></li>' + (te ? '<li><span>Margem</span><b>' + ((te - ts) / te * 100).toFixed(1).replace('.', ',') + '%</b></li>' : '') + '</ul></div>';
  h += '<div class="card"><h2 style="font-size:16px">Últimos 6 meses</h2><div style="display:flex;align-items:flex-end;gap:8px;height:150px;padding-top:6px">' + serie.map(function (x) {
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="display:flex;align-items:flex-end;gap:2px;height:120px"><div title="Entradas" style="width:12px;height:' + (x[1] / mx * 120) + 'px;background:#2e9e57;border-radius:3px 3px 0 0"></div><div title="Saídas" style="width:12px;height:' + (x[2] / mx * 120) + 'px;background:#d9534f;border-radius:3px 3px 0 0"></div></div><span style="font-size:11px" class="muted">' + F_NOMES_MES[+x[0].slice(5, 7) - 1].slice(0, 3) + '</span><span style="font-size:10px;color:' + (x[1] - x[2] < 0 ? '#c62828' : '#1b7f3b') + '">' + (x[1] - x[2] < 0 ? '−' : '+') + fK(x[1] - x[2]) + '</span></div>';
  }).join('') + '</div><p class="muted" style="font-size:11px;margin:4px 0 0">🟩 entradas · 🟥 saídas · número = resultado</p></div>';
  h += '<div class="fx-grid"><div class="card"><h2 style="font-size:16px">Saídas por categoria</h2>' + barras(agrupa(sai, 'categoria'), '#d9534f') + '</div><div class="card"><h2 style="font-size:16px">Entradas por categoria</h2>' + barras(agrupa(ent, 'categoria'), '#2e9e57') + '</div></div>';
  var porObra = {}; doMes.forEach(function (l) { var k = l.nomeProjeto || 'Sem obra (empresa)'; porObra[k] = porObra[k] || [0, 0]; porObra[k][fEnt(l) ? 0 : 1] += +l.valorTotal; });
  h += '<div class="card"><h2 style="font-size:16px">Por obra</h2><ul class="lista">' + (Object.keys(porObra).map(function (k) { var x = porObra[k]; return '<li style="display:block"><b>' + esc(k) + '</b><br><span style="font-size:13px"><span style="color:#1b7f3b">+' + fBrl(x[0]) + '</span> · <span style="color:#c62828">−' + fBrl(x[1]) + '</span> · resultado <b>' + fBrl(x[0] - x[1]) + '</b></span></li>'; }).join('') || '<li class="muted">Nada no período.</li>') + '</ul></div>';
  return h;
}

// ---------- ações ----------
function fLigar() {
  if ($('f-obra')) $('f-obra').onchange = function () { if (F.aba === 'pagar') fPgCap(); F.obra = this.value; fTela(); };
  if ($('f-cat')) $('f-cat').onchange = function () { if (F.aba === 'pagar') fPgCap(); F.cat = this.value; fTela(); };
  Array.prototype.forEach.call(document.querySelectorAll('.f-ck'), function (c) { c.onchange = function () { F.sel[c.dataset.id] = c.checked ? 1 : 0; }; });
  if (F.aba === 'pagar') fPgLigar();
  if (F.aba === 'ext') fExLigar();
}
function fMes(n) { var d = new Date(+F.mes.slice(0, 4), +F.mes.slice(5, 7) - 1 + n, 1); F.mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); F.dia = null; fTela(); }
function fAcao(fn, args, ok) { if (!gOnline()) return; aviso('Salvando...'); return sys(fn, args).then(function () { aviso(ok || 'Feito.', 'ok'); fCarregar(true); }).catch(function (e) { aviso(e.message, 'err'); }); }
function fBaixar(id) {
  var l = F.lanc.filter(function (x) { return String(x.id) === String(id); })[0]; if (!l) return;
  var d = l.dataVencimento < fHoje() ? prompt('Data em que foi ' + (fEnt(l) ? 'recebido' : 'pago') + ' (dd/mm/aaaa):', fDia(fHoje()) + '/' + fHoje().slice(0, 4)) : fDia(fHoje()) + '/' + fHoje().slice(0, 4);
  if (!d) return; d = fParseData(d); if (!d) return aviso('Data inválida.', 'err');
  fAcao('fxBaixar', [id, d], fEnt(l) ? 'Recebimento registrado.' : 'Pagamento registrado.');
}
function fReagendar(id) {
  var l = F.lanc.filter(function (x) { return String(x.id) === String(id); })[0]; if (!l) return;
  var d = prompt('Nova data de vencimento (dd/mm/aaaa):', fDia(l.dataVencimento) + '/' + l.dataVencimento.slice(0, 4)); if (!d) return;
  d = fParseData(d); if (!d) return aviso('Data inválida.', 'err');
  fAcao('fxAlterarData', [id, d], 'Data alterada para ' + fDia(d) + '.');
}
function fExcluir(id) {
  var l = F.lanc.filter(function (x) { return String(x.id) === String(id); })[0]; if (!l) return;
  if (!confirm('Excluir "' + l.descricao + '" (' + fBrl(l.valorTotal) + ')?' + (l.origemTipo && l.origemTipo !== 'Manual' ? '\n\nEste lançamento veio de ' + (l.origemTipo === 'Requisicao' ? 'uma requisição' : 'um reembolso') + '. O pedido volta para Aprovações.' : ''))) return;
  fAcao('fxExcluir', [id], 'Excluído.');
}
function fSaldoForm() {
  var s = F.saldo || {};
  $('tela').innerHTML = '<div class="card"><h2>💰 Saldo do banco</h2><p class="muted">Some o saldo de todas as contas e do caixa (dinheiro) e informe o total de um dia. Daí para frente o app calcula sozinho com as baixas e os lançamentos.</p>' +
    '<label>Saldo total (R$)</label><input type="number" step="any" inputmode="decimal" id="fs-v" value="' + (s.definido ? s.valor : '') + '" style="font-size:22px">' +
    '<label>No fim do dia</label><input type="date" id="fs-d" value="' + (s.data || fHoje()) + '">' + (s.informadoPor ? '<p class="muted" style="font-size:12px">Último informado por ' + esc(s.informadoPor) + '</p>' : '') +
    '<div style="height:10px"></div><button class="btn lar" onclick="fSaldoSalvar()">Salvar saldo</button><button class="btn sec" style="margin-top:8px" onclick="fTela()">Voltar ao calendário</button></div>' +
    '<div style="display:none"><h2>🧾 Começar do zero</h2><p class="muted">Use para lançar tudo à mão primeiro. Os lançamentos antigos continuam guardados, só não entram no fluxo. Dá para desligar quando quiser e tudo volta a aparecer.</p>' +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--texto)"><input type="checkbox" id="fc-z" style="width:auto"' + (s.inicio || +s.linhaInicio ? ' checked' : '') + '> Começar o fluxo zerado ' + (+s.linhaInicio && !s.inicio ? '(ativo: a partir do primeiro lançamento novo)' : 'a partir de') + '</label>' + (+s.linhaInicio && !s.inicio ? '<input type="hidden" id="fc-d" value="">' : '<input type="date" id="fc-d" value="' + (s.inicio || fHoje()) + '">') +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--texto);margin-top:12px"><input type="checkbox" id="fc-a" style="width:auto"' + (s.auto ? ' checked' : '') + '> Incluir lançamentos automáticos (folha, medições, custos fixos, requisições)</label>' +
    '<p class="muted" style="font-size:12px">Deixe desmarcado enquanto faz a atualização manual. Marque quando quiser que o sistema alimente o fluxo sozinho.</p>' +
    '</div>';
}
function fConfigSalvar() {
  var z = $('fc-z').checked, d = $('fc-d').value, a = $('fc-a').checked, lin = z && !d && +(F.saldo || {}).linhaInicio;
  if (z && !d && !lin) return aviso('Informe a data de início.', 'err');
  if (z && d && !confirm('Começar o fluxo zerado em ' + d.split('-').reverse().join('/') + '?\nOs lançamentos anteriores ficam guardados, só não aparecem.')) return;
  if (!gOnline()) return; aviso('Salvando...');
  sys('salvarConfigFluxo', [z ? d : '', a, !!lin]).then(function () { aviso(z ? 'Fluxo começando do zero.' : 'Todos os lançamentos voltaram ao fluxo.', 'ok'); F.lanc = null; fCarregar(true); fTela(); }).catch(function (e) { aviso(e.message, 'err'); });
}
function fSaldoSalvar() {
  var v = $('fs-v').value, d = $('fs-d').value; if (v === '' || !d) return aviso('Informe valor e data.', 'err');
  if (!gOnline()) return; aviso('Salvando...');
  sys('fxSalvarSaldo', [Number(v), d]).then(function () { aviso('Saldo salvo.', 'ok'); fCarregar(true); fTela(); }).catch(function (e) { aviso(e.message, 'err'); });
}

// ---------- lançamento rápido ----------
function fNovo(dia) { F.ed = { novo: true, tipo: 'Saida', sit: (dia || fHoje()) <= fHoje() ? 'pago' : 'aberto', data: dia || fHoje() }; fForm(); }
function fEditar(id) { var l = F.lanc.filter(function (x) { return String(x.id) === String(id); })[0]; if (!l) return; F.ed = { novo: false, l: l, tipo: l.tipo, data: l.dataVencimento }; fForm(); }
function fForm() {
  var e = F.ed, l = e.l || {}, ent = e.tipo === 'Entrada';
  var cats = {}; F.lanc.forEach(function (x) { if (x.tipo === e.tipo && x.categoria) cats[x.categoria] = (cats[x.categoria] || 0) + 1; });
  var topo = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 8);
  var forn = {}; F.lanc.forEach(function (x) { if (x.fornecedorCliente) forn[x.fornecedorCliente] = 1; });
  var h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">' + (e.novo ? 'Novo lançamento' : 'Editar lançamento') + '</h2><button class="btn sec" style="width:auto;padding:6px 12px" onclick="fTela()">✕</button></div>';
  if (e.novo) h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0"><button class="btn" style="padding:14px;font-size:16px;background:' + (ent ? '#1b7f3b' : '#e7ebf0') + ';color:' + (ent ? '#fff' : '#333') + '" onclick="fCap();F.ed.tipo=\'Entrada\';fForm()">🟢 Entrada</button><button class="btn" style="padding:14px;font-size:16px;background:' + (!ent ? '#c62828' : '#e7ebf0') + ';color:' + (!ent ? '#fff' : '#333') + '" onclick="fCap();F.ed.tipo=\'Saida\';fForm()">🔴 Saída</button></div>';
  else h += '<p class="muted">' + (ent ? '🟢 Entrada' : '🔴 Saída') + ' · ' + esc(l.status) + '</p>';
  h += '<label>Valor (R$)</label><input type="number" step="any" inputmode="decimal" id="fe-v" value="' + esc(e.v != null ? e.v : (l.valorTotal || '')) + '" style="font-size:24px;font-weight:700">' +
    '<label>Descrição</label><input id="fe-d" value="' + esc(e.d != null ? e.d : (l.descricao || '')) + '" placeholder="' + (ent ? 'Ex.: Medição 3 obra Vale' : 'Ex.: Cimento, combustível, aluguel') + '">';
  if (e.novo) h += '<label>Situação</label><div style="display:flex;gap:6px;flex-wrap:wrap">' + [['pago', ent ? '✔ Já recebi' : '✔ Já paguei'], ['aberto', ent ? 'A receber' : 'A pagar'], ['previsto', 'Previsto (estimativa)']].map(function (s) { return '<button class="btn ' + (e.sit === s[0] ? '' : 'sec') + '" style="width:auto;padding:8px 12px;font-size:13px" onclick="fCap();F.ed.sit=\'' + s[0] + '\';fForm()">' + s[1] + '</button>'; }).join('') + '</div>';
  h += '<label>' + (e.novo && e.sit === 'pago' ? 'Data do pagamento' : 'Vencimento') + '</label><input type="date" id="fe-dt" value="' + esc(e.data) + '">';
  if (e.novo && e.sit === 'aberto') h += '<label>Parcelas</label><input type="number" id="fe-p" min="1" value="' + (e.p || 1) + '"><p class="muted" style="font-size:12px;margin:2px 0">Com mais de 1 parcela o valor é dividido e lançado mês a mês.</p>';
  h += '<label>Categoria</label><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' + topo.map(function (c) { return '<button class="btn sec" style="width:auto;padding:5px 10px;font-size:12px" onclick="$(\'fe-c\').value=this.textContent">' + esc(c) + '</button>'; }).join('') + '</div><input id="fe-c" list="fe-cl" value="' + esc(e.c != null ? e.c : (l.categoria || '')) + '"><datalist id="fe-cl">' + Object.keys(cats).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
    '<label>Obra (opcional)</label><select id="fe-o"><option value="">— nenhuma (despesa da empresa) —</option></select>' +
    '<label>Forma de pagamento</label><input id="fe-fp" list="fe-fpl" value="' + esc(e.fp != null ? e.fp : (l.formaPagamento || '')) + '"><datalist id="fe-fpl"><option value="PIX"><option value="Boleto"><option value="Cartão de crédito"><option value="Cartão de débito"><option value="Transferência"><option value="Dinheiro"></datalist>' +
    '<label>' + (ent ? 'Cliente' : 'Fornecedor') + ' (opcional)</label><input id="fe-f" list="fe-fl" value="' + esc(e.f != null ? e.f : (l.fornecedorCliente || '')) + '"><datalist id="fe-fl">' + Object.keys(forn).slice(0, 200).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
    '<div style="height:12px"></div><button class="btn lar" id="fe-ok" style="padding:14px;font-size:16px">Salvar</button></div>';
  $('tela').innerHTML = h; window.scrollTo(0, 0);
  var obraAtual = e.o != null ? e.o : (l.projetoId || F.obra || '');
  aOpcoes(aFn && aFn('listarProjetosParaSelecao') ? 'listarProjetosParaSelecao' : 'listarProjetos').then(function (ps) { if (!$('fe-o')) return; $('fe-o').innerHTML += ps.map(function (p) { var id = p.id || p.valor; return '<option value="' + esc(id) + '"' + (String(id) === String(obraAtual) ? ' selected' : '') + '>' + esc(p.titulo || mTitulo(p)) + '</option>'; }).join(''); }).catch(function () {});
  if (!e.v && $('fe-v')) $('fe-v').focus();
  $('fe-ok').onclick = fSalvar;
}
function fCap() { var e = F.ed; if (!$('fe-v')) return; e.fp = $('fe-fp') ? $('fe-fp').value : e.fp; e.v = $('fe-v').value; e.d = $('fe-d').value; e.data = $('fe-dt').value; e.c = $('fe-c').value; e.o = $('fe-o').value; e.f = $('fe-f').value; if ($('fe-p')) e.p = $('fe-p').value; }
function fSalvar() {
  fCap(); var e = F.ed, v = Number(e.v);
  if (!v || v <= 0) return aviso('Informe o valor.', 'err');
  if (!String(e.d || '').trim()) return aviso('Informe a descrição.', 'err');
  if (!e.data) return aviso('Informe a data.', 'err');
  if (!gOnline()) return;
  var b = $('fe-ok'); b.disabled = true; aviso('Salvando...');
  var p;
  var dd = { tipo: e.tipo, valor: v, descricao: e.d.trim(), categoria: e.c || 'Outro', projetoId: e.o || '', fornecedorCliente: e.f || '', formaPagamento: e.fp || '' };
  if (e.novo) { dd.status = e.sit === 'pago' ? 'Pago' : e.sit === 'previsto' ? 'Previsto' : 'A pagar'; dd.dataVencimento = e.data; dd.dataPagamento = e.sit === 'pago' ? e.data : ''; dd.parcelas = e.sit === 'aberto' ? (Number(e.p) || 1) : 1; }
  else { dd.id = e.l.id; dd.dataVencimento = e.data; }
  p = sys('fxSalvar', [dd]);
  p.then(function () { aviso('Lançamento salvo.', 'ok'); F.dia = e.data; F.mes = e.data.slice(0, 7); F.aba = 'cal'; F.ed = null; fCarregar(true); fTela(); })
    .catch(function (er) { aviso(er.message, 'err'); b.disabled = false; });
}

// ---------- aprovações: requisições e reembolsos ----------
function fHtmlAprov() {
  if (!F.aprov) { fContarAprov(); return '<div class="card muted">Carregando pedidos...</div>'; }
  var bloco = function (tit, lista, tipo) {
    return '<div class="card"><h2 style="font-size:16px">' + tit + ' (' + lista.length + ')</h2><ul class="lista">' + (lista.map(function (r) {
      var v = tipo === 'Requisicao' ? r.valorEstimado : r.valor;
      return '<li style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>nº ' + esc(r.numero || '') + ' · ' + esc(r.descricao || '') + '</b><b style="color:#c62828">' + (v ? fBrl(v) : '—') + '</b></div><span class="muted" style="font-size:12px">' + esc([r.nomeSolicitante, r.nomeProjeto || r.nomeCliente, r.formaPagamento, r.rotuloTipoDespesa, r.data ? fDia(String(r.data).slice(0, 10)) : '', r.status].filter(Boolean).join(' · ')) + (r.quantidade ? ' · ' + esc(r.quantidade) + ' ' + esc(r.unidade || '') : '') + (r.observacoes ? '<br>' + esc(r.observacoes) : '') + '</span>' +
        '<div style="margin-top:6px"><button class="btn" style="width:auto;padding:6px 12px;font-size:13px" onclick="fAprovarForm(\'' + tipo + '\',\'' + esc(r.id) + '\')">✔ Aprovar e lançar a pagar</button></div></li>';
    }).join('') || '<li class="muted">Nenhum pedido esperando.</li>') + '</ul></div>';
  };
  return '<div class="card" style="background:#fff8e1;font-size:13px">Ao aprovar, o pedido entra no fluxo como <b>a pagar</b> na data que você escolher. Quando você marcar como pago no calendário, o pedido também fica como pago.</div>' +
    bloco('📦 Requisições de compra', F.aprov.requisicoes || [], 'Requisicao') + bloco('🧾 Reembolsos', F.aprov.reembolsos || [], 'Reembolso') +
    '<button class="btn sec" onclick="F.aprov=null;fTela()">🔄 Atualizar pedidos</button>';
}
function fAprovarForm(tipo, id) {
  var lista = tipo === 'Requisicao' ? F.aprov.requisicoes : F.aprov.reembolsos, r = lista.filter(function (x) { return String(x.id) === String(id); })[0]; if (!r) return;
  var v = tipo === 'Requisicao' ? r.valorEstimado : r.valor;
  $('tela').innerHTML = '<div class="card"><h2>Aprovar ' + (tipo === 'Requisicao' ? 'requisição' : 'reembolso') + ' nº ' + esc(r.numero || '') + '</h2><p class="muted">' + esc(r.descricao || '') + (r.nomeSolicitante ? ' · ' + esc(r.nomeSolicitante) : '') + '</p>' +
    '<label>Valor a pagar (R$)</label><input type="number" step="any" inputmode="decimal" id="fa-v" value="' + esc(v || '') + '" style="font-size:22px;font-weight:700">' +
    '<label>Data prevista do pagamento</label><input type="date" id="fa-d" value="' + fHoje() + '">' +
    '<label>Categoria</label><input id="fa-c" value="' + (tipo === 'Requisicao' ? 'Compras' : 'Reembolso') + '">' +
    '<label>Forma de pagamento</label><input id="fa-fp" value="' + esc(r.formaPagamento || '') + '" list="fa-fpl"><datalist id="fa-fpl"><option value="PIX"><option value="Boleto"><option value="Cartão de crédito"><option value="Transferência"><option value="Dinheiro"></datalist>' +
    (tipo === 'Requisicao' ? '<label>Fornecedor (opcional)</label><input id="fa-f">' : '') +
    '<div style="height:12px"></div><button class="btn lar" id="fa-ok">✔ Aprovar e lançar a pagar</button><button class="btn sec" style="margin-top:8px" onclick="fTela()">Cancelar</button></div>';
  $('fa-ok').onclick = function () {
    var val = Number($('fa-v').value), dt = $('fa-d').value; if (!(val > 0)) return aviso('Informe o valor.', 'err');
    if (!gOnline()) return; this.disabled = true; aviso('Aprovando...');
    sys('fxAprovarPedido', [tipo, id, { valor: val, dataVencimento: dt, categoria: $('fa-c').value, formaPagamento: $('fa-fp').value, fornecedor: $('fa-f') ? $('fa-f').value : '' }])
      .then(function () { aviso('Aprovado e lançado no fluxo.', 'ok'); F.aprov = null; F.aba = 'cal'; F.dia = dt; F.mes = dt.slice(0, 7); fCarregar(true); fTela(); })
      .catch(function (e) { aviso(e.message, 'err'); $('fa-ok').disabled = false; });
  };
}
function fAnexar(id) {
  var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf';
  inp.onchange = function () {
    var a = inp.files[0]; if (!a) return; if (a.size > 15e6) return aviso('Arquivo muito grande (máx. 15 MB).', 'err');
    if (!gOnline()) return; var rd = new FileReader();
    rd.onload = function () { aviso('Enviando comprovante...'); sys('fxAnexar', [id, { data: String(rd.result).split(',')[1], mimeType: a.type, nome: a.name }]).then(function () { aviso('Comprovante anexado.', 'ok'); fCarregar(true); }).catch(function (e) { aviso(e.message, 'err'); }); };
    rd.readAsDataURL(a);
  };
  inp.click();
}
function fContarAprov() {
  if (!navigator.onLine || F.aprov || F.carregandoAprov) return; F.carregandoAprov = true;
  sys('fxPendentesAprovacao', []).then(function (r) { F.aprov = r; F.nAprov = (r.requisicoes || []).length + (r.reembolsos || []).length; })
    .catch(function (e) { F.aprov = { requisicoes: [], reembolsos: [] }; aviso(e.message, 'err'); })
    .then(function () { F.carregandoAprov = false; if (G.view === 'tFluxo' && !F.ed) fTela(); });
}

// ---------- contas a pagar do dia + relatório de pagamento para o financeiro ----------
var F_PG_METODOS = ['PIX', 'Boleto', 'Transferência (TED)', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Débito automático'];
function fPgEstado() { if (!F.pg) F.pg = { dia: fHoje(), venc: true, sel: {}, dd: {} }; return F.pg; }
function fPgContas() {
  var g = fPgEstado();
  return F.lanc.filter(function (l) {
    if (fEnt(l) || fBaix(l) || !l.dataVencimento || !fFiltra(l)) return false;
    return l.dataVencimento === g.dia || (g.venc && l.dataVencimento < g.dia && l.status !== 'Previsto');
  }).sort(function (a, b) { return a.dataVencimento.localeCompare(b.dataVencimento) || (+b.valorTotal) - (+a.valorTotal); });
}
// dados de pagamento: o que já foi digitado agora > o que está salvo no lançamento > o último usado com o mesmo fornecedor
function fPgUltimoDoFornecedor(nome) {
  if (!nome) return null; var achado = null, quando = '';
  F.lanc.forEach(function (l) { var d = l.dadosPagamento; if (d && (d.chave || d.metodo) && l.fornecedorCliente === nome && String(l.dataVencimento) >= quando) { achado = d; quando = String(l.dataVencimento); } });
  return achado;
}
function fPgDados(l) {
  var g = fPgEstado(); if (g.dd[l.id]) return g.dd[l.id];
  var base = l.dadosPagamento || fPgUltimoDoFornecedor(l.fornecedorCliente) || {};
  return { metodo: base.metodo || l.formaPagamento || '', chave: base.chave || '', favorecido: base.favorecido || l.fornecedorCliente || '', documento: base.documento || '', obs: (l.dadosPagamento && l.dadosPagamento.obs) || '' };
}
function fPgRotuloChave(m) { m = String(m || ''); return m === 'PIX' ? 'Chave PIX' : m === 'Boleto' ? 'Linha digitável / código de barras' : /Transfer/.test(m) ? 'Banco · agência · conta' : 'Detalhes do pagamento'; }
function fHtmlPagar() {
  var g = fPgEstado(), c = fCalc(), lista = fPgContas(), tot = 0, sel = 0, nsel = 0;
  lista.forEach(function (l) { tot += +l.valorTotal; if (g.sel[l.id]) { sel += +l.valorTotal; nsel++; } });
  var saldoAntes = c.saldo(fAdd(g.dia, -1) < c.hoje ? c.hoje : fAdd(g.dia, -1));
  var h = '<div class="card" style="padding:10px"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
    '<button class="btn sec" style="width:auto;padding:6px 12px" onclick="fPgCap();F.pg.dia=fAdd(F.pg.dia,-1);fTela()">‹</button>' +
    '<input type="date" id="pg-dia" value="' + g.dia + '" style="width:auto;flex:1;min-width:140px;margin:0">' +
    '<button class="btn sec" style="width:auto;padding:6px 12px" onclick="fPgCap();F.pg.dia=fAdd(F.pg.dia,1);fTela()">›</button>' +
    '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fPgCap();F.pg.dia=fHoje();fTela()">Hoje</button></div>' +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--texto);margin:8px 0 6px;font-size:13px"><input type="checkbox" id="pg-venc" style="width:auto"' + (g.venc ? ' checked' : '') + '> Incluir as vencidas antes deste dia (sem baixa)</label>' +
    '<div style="display:flex;gap:6px">' + fFiltrosHtml() + '</div></div>';
  var card = function (t, v, cor, extra) { return '<div class="card" style="margin:0;padding:10px 12px"><div class="muted" style="font-size:12px">' + t + '</div><b style="font-size:18px;color:' + cor + '">' + v + '</b>' + (extra ? '<div class="muted" style="font-size:11px">' + extra + '</div>' : '') + '</div>'; };
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px">' +
    card('A pagar (' + lista.length + ')', fBrl(tot), '#c62828', fDia(g.dia) + (g.venc ? ' + vencidas' : '')) +
    card('Escolhidas para pagar (' + nsel + ')', fBrl(sel), '#1565c0') +
    card('Caixa antes', fBrl(saldoAntes), saldoAntes < 0 ? '#c62828' : '#1b7f3b', 'saldo previsto') +
    card('Caixa depois de pagar', fBrl(saldoAntes - sel), saldoAntes - sel < 0 ? '#c62828' : '#1b7f3b', 'só as escolhidas') + '</div>';
  h += '<div class="card"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
    '<button class="btn sec" style="width:auto;padding:8px 12px;font-size:13px" onclick="fPgTodos(true)">Marcar todas</button>' +
    '<button class="btn sec" style="width:auto;padding:8px 12px;font-size:13px" onclick="fPgTodos(false)">Desmarcar</button>' +
    '<button class="btn sec" style="width:auto;padding:8px 12px;font-size:13px" onclick="fPgRelDia()">📄 Relatório do dia</button>' +
    '<button class="btn lar" style="width:auto;padding:8px 12px;font-size:13px" onclick="fPgRelFinanceiro()">📤 Relatório para o financeiro (' + nsel + ')</button></div>' +
    '<p class="muted" style="font-size:12px;margin:0 0 8px">Marque o que vai pagar e preencha a forma de pagamento e a chave PIX (ou o boleto / dados do banco). Fica salvo no lançamento e o app sugere a mesma chave da próxima vez que aparecer esse fornecedor.</p><ul class="lista">';
  h += lista.map(function (l) {
    var d = fPgDados(l), id = esc(l.id), on = !!g.sel[l.id], venc = l.dataVencimento < g.dia;
    return '<li style="display:block;' + (on ? 'background:#f2f7ff;' : '') + '"><label style="display:flex;gap:10px;align-items:flex-start;color:var(--texto);margin:0;cursor:pointer"><input type="checkbox" class="pg-ck" data-id="' + id + '" style="width:22px;height:22px;margin-top:2px"' + (on ? ' checked' : '') + '>' +
      '<div style="flex:1;min-width:0"><b>' + esc(l.descricao || '') + '</b><br><span class="muted" style="font-size:12px">' + esc([l.fornecedorCliente, l.nomeProjeto, l.categoria].filter(Boolean).join(' · ')) + '</span></div>' +
      '<div style="text-align:right"><b style="color:#c62828">' + fBrl(l.valorTotal) + '</b><br><span style="font-size:11px;font-weight:700;color:' + (venc ? '#c62828' : l.status === 'Previsto' ? '#6a4fb3' : '#c77700') + '">' + (venc ? 'Vencida ' + fDia(l.dataVencimento) : l.status === 'Previsto' ? 'Previsto' : 'Vence ' + fDia(l.dataVencimento)) + '</span></div></label>' +
      '<div class="pg-campos" style="display:' + (on ? 'grid' : 'none') + ';grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px;margin-top:8px" id="pg-c-' + id + '">' +
      '<div><label style="margin:0;font-size:12px">Forma de pagamento</label><select class="pg-in" data-id="' + id + '" data-k="metodo" style="margin:0"><option value="">—</option>' + F_PG_METODOS.concat(d.metodo && F_PG_METODOS.indexOf(d.metodo) < 0 ? [d.metodo] : []).map(function (m) { return '<option' + (m === d.metodo ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select></div>' +
      '<div style="grid-column:span 2"><label style="margin:0;font-size:12px" id="pg-r-' + id + '">' + fPgRotuloChave(d.metodo) + '</label><input class="pg-in" data-id="' + id + '" data-k="chave" value="' + esc(d.chave) + '" style="margin:0" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"></div>' +
      '<div><label style="margin:0;font-size:12px">Favorecido</label><input class="pg-in" data-id="' + id + '" data-k="favorecido" value="' + esc(d.favorecido) + '" style="margin:0"></div>' +
      '<div><label style="margin:0;font-size:12px">CPF / CNPJ do favorecido</label><input class="pg-in" data-id="' + id + '" data-k="documento" value="' + esc(d.documento) + '" style="margin:0"></div>' +
      '<div><label style="margin:0;font-size:12px">Observação para o financeiro</label><input class="pg-in" data-id="' + id + '" data-k="obs" value="' + esc(d.obs) + '" style="margin:0"></div></div></li>';
  }).join('') || '<li class="muted">Nenhuma conta a pagar neste dia. 🎉</li>';
  return h + '</ul></div>';
}
function fPgCap() {
  var g = fPgEstado();
  Array.prototype.forEach.call(document.querySelectorAll('.pg-in'), function (el) {
    var id = el.dataset.id, l = F.lanc.filter(function (x) { return String(x.id) === String(id); })[0]; if (!l) return;
    if (!g.dd[id]) g.dd[id] = fPgDados(l);
    g.dd[id][el.dataset.k] = el.value;
  });
}
function fPgLigar() {
  var g = fPgEstado();
  if ($('pg-dia')) $('pg-dia').onchange = function () { if (this.value) { fPgCap(); g.dia = this.value; fTela(); } };
  if ($('pg-venc')) $('pg-venc').onchange = function () { fPgCap(); g.venc = this.checked; fTela(); };
  Array.prototype.forEach.call(document.querySelectorAll('.pg-ck'), function (c) { c.onchange = function () { fPgCap(); g.sel[c.dataset.id] = c.checked ? 1 : 0; fTela(); }; });
  Array.prototype.forEach.call(document.querySelectorAll('.pg-in'), function (el) {
    el.onchange = function () { fPgCap(); if (el.dataset.k === 'metodo') { var r = $('pg-r-' + el.dataset.id); if (r) r.textContent = fPgRotuloChave(el.value); } };
  });
}
function fPgTodos(on) { fPgCap(); var g = fPgEstado(); fPgContas().forEach(function (l) { g.sel[l.id] = on ? 1 : 0; }); fTela(); }
function fPgEscolhidas() { var g = fPgEstado(); return fPgContas().filter(function (l) { return g.sel[l.id]; }); }

// folha para imprimir / salvar em PDF / compartilhar
function fPgFolha(titulo, corpo, texto) {
  var css = '#f-print{position:fixed;inset:0;z-index:9999;background:#fff;color:#000;overflow:auto;padding:16px;font-family:Arial,sans-serif;font-size:12px}' +
    '#f-print table{border-collapse:collapse;width:100%}#f-print td,#f-print th{border:1px solid #999;padding:4px 5px;text-align:left;color:#000;vertical-align:top}#f-print th{background:#eee}' +
    '#f-print .num{text-align:right;white-space:nowrap}#f-print h2,#f-print p{margin:4px 0;color:#000}#f-print .chave{font-family:monospace;font-size:13px;word-break:break-all}' +
    '#f-print .ass{margin-top:46px;display:flex;justify-content:space-around}#f-print .ass div{border-top:1px solid #000;width:40%;text-align:center;padding-top:4px}' +
    '#f-print .tp-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}#f-print .tp-bar button{flex:1;min-width:120px;padding:12px;font-size:15px;border-radius:8px;border:0}' +
    '@media print{body>*:not(#f-print){display:none!important}#f-print{position:static;overflow:visible;padding:0}#f-print .tp-bar{display:none}@page{margin:10mm}}';
  var el = document.getElementById('f-print'); if (el) el.remove();
  el = document.createElement('div'); el.id = 'f-print'; F.pgTexto = texto || '';
  el.innerHTML = '<style>' + css + '</style><div class="tp-bar"><button style="background:#0B1A2E;color:#fff" onclick="window.print()">🖨️ Imprimir / PDF</button>' +
    (texto ? '<button style="background:#25D366;color:#fff" onclick="fPgCompartilhar()">📲 Enviar (WhatsApp…)</button><button style="background:#e3f0fd;color:#0B1A2E" onclick="fPgCopiar()">📋 Copiar texto</button>' : '') +
    '<button style="background:#ddd;color:#000" onclick="document.getElementById(\'f-print\').remove()">Fechar</button></div><h2>' + titulo + '</h2>' + corpo;
  document.body.appendChild(el); window.scrollTo(0, 0);
}
function fPgCompartilhar() {
  var t = F.pgTexto || '';
  if (navigator.share) navigator.share({ title: 'Pagamentos', text: t }).catch(function () {});
  else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
}
function fPgCopiar() {
  var t = F.pgTexto || '';
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { aviso('Texto copiado.', 'ok'); })
    .catch(function () { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); aviso('Texto copiado.', 'ok'); } catch (e) {} a.remove(); });
}
function fPgCabecalho() { var g = fPgEstado(); return '<p>Data: <b>' + g.dia.split('-').reverse().join('/') + '</b>' + (g.venc ? ' (inclui vencidas sem baixa)' : '') + (F.obra ? ' · Obra filtrada' : '') + (F.cat ? ' · Categoria: ' + esc(F.cat) : '') + ' · Emitido em ' + new Date().toLocaleString('pt-BR').slice(0, 16) + '</p>'; }
function fPgRelDia() {
  fPgCap(); var g = fPgEstado(), lista = fPgContas(), tot = 0;
  if (!lista.length) return aviso('Nenhuma conta a pagar neste dia.', 'err');
  var linhas = lista.map(function (l) { tot += +l.valorTotal; var d = fPgDados(l); return '<tr><td>' + fDia(l.dataVencimento) + (l.dataVencimento < g.dia ? ' <b>(vencida)</b>' : '') + '</td><td>' + esc(l.descricao || '') + '</td><td>' + esc(l.fornecedorCliente || '') + '</td><td>' + esc(l.nomeProjeto || '') + '</td><td>' + esc(l.categoria || '') + '</td><td>' + esc(d.metodo || '') + '</td><td class="num">' + fBrl(l.valorTotal) + '</td><td>' + (g.sel[l.id] ? 'Sim' : '') + '</td></tr>'; }).join('');
  fPgFolha('Contas a pagar — ' + g.dia.split('-').reverse().join('/'), fPgCabecalho() +
    '<table><thead><tr><th>Venc.</th><th>Descrição</th><th>Fornecedor</th><th>Obra</th><th>Categoria</th><th>Forma</th><th class="num">Valor</th><th>Pagar?</th></tr></thead><tbody>' + linhas +
    '<tr><th colspan="6">Total (' + lista.length + ' conta(s))</th><th class="num">' + fBrl(tot) + '</th><th></th></tr></tbody></table>');
}
function fPgRelFinanceiro() {
  fPgCap(); var g = fPgEstado(), lista = fPgEscolhidas();
  if (!lista.length) return aviso('Marque as contas que vão ser pagas.', 'err');
  var faltando = lista.filter(function (l) { var d = fPgDados(l); return !d.metodo || (['PIX', 'Boleto'].indexOf(d.metodo) >= 0 || /Transfer/.test(d.metodo)) && !String(d.chave || '').trim(); });
  if (faltando.length && !confirm(faltando.length + ' conta(s) sem forma de pagamento ou sem chave PIX / boleto / dados do banco:\n\n' + faltando.slice(0, 6).map(function (l) { return '• ' + l.descricao; }).join('\n') + '\n\nGerar o relatório mesmo assim?')) return;
  var envio = lista.map(function (l) { var d = fPgDados(l); return { id: l.id, metodo: d.metodo, chave: d.chave, favorecido: d.favorecido, documento: d.documento, obs: d.obs }; });
  var gerar = function () {
    var tot = 0, txt = ['*Pagamentos a fazer — ' + g.dia.split('-').reverse().join('/') + '*', ''];
    var linhas = lista.map(function (l, i) {
      var d = fPgDados(l); tot += +l.valorTotal;
      txt.push((i + 1) + ') ' + (d.favorecido || l.fornecedorCliente || l.descricao) + ' — *' + fBrl(l.valorTotal) + '*');
      txt.push('   ' + l.descricao + (l.nomeProjeto ? ' · ' + l.nomeProjeto : '') + ' · venc. ' + fDia(l.dataVencimento));
      txt.push('   ' + (d.metodo || 'Forma não informada') + (d.chave ? ': ' + d.chave : '') + (d.documento ? ' · Doc.: ' + d.documento : ''));
      if (d.obs) txt.push('   Obs.: ' + d.obs);
      txt.push('');
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(d.favorecido || l.fornecedorCliente || '') + '</b>' + (d.documento ? '<br>' + esc(d.documento) : '') + '</td><td>' + esc(l.descricao || '') + (l.nomeProjeto ? '<br><i>' + esc(l.nomeProjeto) + '</i>' : '') + '</td><td>' + fDia(l.dataVencimento) + '</td><td>' + esc(d.metodo || '—') + '</td><td class="chave">' + esc(d.chave || '') + '</td><td>' + esc(d.obs || '') + '</td><td class="num"><b>' + fBrl(l.valorTotal) + '</b></td><td style="width:60px"></td></tr>';
    }).join('');
    txt.push('*Total: ' + fBrl(tot) + '* (' + lista.length + ' pagamento(s))');
    fPgFolha('Autorização de pagamentos — ' + g.dia.split('-').reverse().join('/'), fPgCabecalho() +
      '<table><thead><tr><th>#</th><th>Favorecido</th><th>Referente a</th><th>Venc.</th><th>Forma</th><th>Chave PIX / boleto / conta</th><th>Obs.</th><th class="num">Valor</th><th>Pago ✔</th></tr></thead><tbody>' + linhas +
      '<tr><th colspan="7">Total a pagar (' + lista.length + ')</th><th class="num">' + fBrl(tot) + '</th><th></th></tr></tbody></table>' +
      '<p style="margin-top:8px">Depois de pagar, anexe o comprovante no lançamento e dê baixa no fluxo de caixa.</p><div class="ass"><div>Autorizado por</div><div>Financeiro</div></div>', txt.join('\n'));
  };
  if (!navigator.onLine) { aviso('Sem internet: o relatório sai, mas as chaves não foram salvas.', 'err'); return gerar(); }
  aviso('Salvando dados de pagamento...');
  sys('fxSalvarPagamentos', [envio]).then(function () {
    lista.forEach(function (l) { var d = fPgDados(l); l.dadosPagamento = { metodo: d.metodo, chave: d.chave, favorecido: d.favorecido, documento: d.documento, obs: d.obs }; if (d.metodo) l.formaPagamento = d.metodo; });
    DB.set('g_fluxo2', { lanc: F.todos, saldo: F.saldo }); aviso('Dados de pagamento salvos.', 'ok'); gerar();
  }).catch(function (e) { aviso('Não salvou as chaves: ' + e.message, 'err'); gerar(); });
}

// estilo responsivo (computador: calendário + dia lado a lado)
(function () { var st = document.createElement('style'); st.textContent = '.fx-grid{display:grid;grid-template-columns:1fr;gap:0 12px}@media(min-width:900px){.fx-grid{grid-template-columns:3fr 2fr}}'; document.head.appendChild(st); })();

// rotas: Financeiro abre o fluxo; ao sair, a largura volta ao normal
// ---------- extrato: enviar o arquivo do banco e classificar cada lançamento em lista ----------
// Cada item do extrato entra com origemTipo 'Extrato' e origemId = chave do item: o que já foi lançado é pulado, nunca substituído.
var FX_TIPOS = ['Administrativo / escritório', 'Impostos e taxas', 'Tarifas bancárias', 'Folha de pagamento', 'Pró-labore / retirada de sócios', 'Combustível', 'Veículos e equipamentos', 'Aluguel', 'Empréstimo / financiamento', 'Transferência entre contas', 'Recebimento de cliente', 'Outro'];
function fEx() { if (!F.ex) F.ex = { sujo: {}, filtro: 'todos', busca: '', salvando: false }; return F.ex; }
function fExObras() { return (A.cache.listarProjetosParaSelecao || A.cache.listarProjetos || []).map(function (p) { return { id: String(p.id || p.valor), nome: p.titulo || mTitulo(p) }; }); }
function fExFuncs() { return (A.cache.listarFuncionariosAtivos || []).map(function (f) { return { id: String(f.id), nome: mTitulo(f) }; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); }); }
function fExCarregarListas() {
  var x = fEx(); if (x.listas) return; x.listas = 1;
  var fnObra = aFn && aFn('listarProjetosParaSelecao') ? 'listarProjetosParaSelecao' : 'listarProjetos';
  Promise.all([aOpcoes(fnObra).catch(function () { return []; }), aOpcoes('listarFuncionariosAtivos').catch(function () { return []; })])
    .then(function () { if (G.view === 'tFluxo' && F.aba === 'ext') { fExGuardarBusca(); fTela(); } });
}
function fExSalvo(l) {
  var dest = l.projetoId ? 'o:' + l.projetoId : (l.categoria && l.categoria !== 'A classificar' && l.categoria !== 'Obra' ? 'c:' + l.categoria : '');
  return { dest: dest, fck: !!l.funcionarioId, func: l.funcionarioId || '', funcNome: l.funcionarioNome || '', obs: l.obs || '' };
}
function fExAtual(l) { var a = fExSalvo(l), d = fEx().sujo[l.id] || {}; Object.keys(d).forEach(function (k) { a[k] = d[k]; }); return a; }
function fExLista() {
  var x = fEx(), b = x.busca.toLowerCase();
  return F.lanc.filter(function (l) {
    if (fData(l).slice(0, 7) !== F.mes || !fFiltra(l)) return false;
    var a = fExAtual(l);
    if (x.filtro === 'sem' && a.dest) return false;
    if (x.filtro === 'func' && !a.fck) return false;
    if (x.filtro === 'extrato' && l.origemTipo !== 'Extrato') return false;
    if (b && (String(l.descricao) + ' ' + a.obs + ' ' + a.funcNome + ' ' + (l.nomeProjeto || '') + ' ' + l.categoria + ' ' + String(l.valorTotal).replace('.', ',')).toLowerCase().indexOf(b) < 0) return false;
    return true;
  }).sort(function (p, q) { return fData(p) < fData(q) ? -1 : fData(p) > fData(q) ? 1 : String(p.origemId || '').localeCompare(String(q.origemId || '')); });
}
function fExOpcoesDest(v) {
  var obras = fExObras(), tipos = FX_TIPOS.slice();
  F.lanc.forEach(function (l) { if (l.categoria && ['A classificar', 'Obra'].indexOf(l.categoria) < 0 && tipos.indexOf(l.categoria) < 0) tipos.push(l.categoria); });
  if (v && v.indexOf('o:') === 0 && !obras.some(function (o) { return 'o:' + o.id === v; })) { var l0 = F.lanc.filter(function (l) { return 'o:' + l.projetoId === v; })[0]; obras.push({ id: v.slice(2), nome: (l0 && l0.nomeProjeto) || 'Obra' }); }
  if (v && v.indexOf('c:') === 0 && tipos.indexOf(v.slice(2)) < 0) tipos.push(v.slice(2));
  var op = function (val, txt) { return '<option value="' + esc(val) + '"' + (val === v ? ' selected' : '') + '>' + esc(txt) + '</option>'; };
  return op('', '— obra ou tipo de despesa —') + '<optgroup label="Obra">' + obras.map(function (o) { return op('o:' + o.id, o.nome); }).join('') + '</optgroup><optgroup label="Outro tipo de despesa">' + tipos.map(function (t) { return op('c:' + t, t); }).join('') + '</optgroup>';
}
function fExFuncSel(l, a) {
  var fs = fExFuncs(); if (a.func && !fs.some(function (f) { return f.id === a.func; })) fs.unshift({ id: a.func, nome: a.funcNome || 'Funcionário' });
  return '<select class="ex-func" data-id="' + esc(l.id) + '" style="padding:7px;margin-top:6px"><option value="">— escolha o funcionário —</option>' + fs.map(function (f) { return '<option value="' + esc(f.id) + '"' + (f.id === a.func ? ' selected' : '') + '>' + esc(f.nome) + '</option>'; }).join('') + '</select>';
}
function fExLinha(l) {
  var a = fExAtual(l), e = fEnt(l), sujo = !!fEx().sujo[l.id];
  return '<div class="ex-row" data-id="' + esc(l.id) + '" style="border:1px solid ' + (sujo ? 'var(--laranja)' : 'var(--borda)') + ';border-radius:10px;padding:10px;margin-bottom:8px;background:#fff">' +
    '<div style="display:flex;gap:8px;align-items:flex-start"><span class="muted" style="font-size:12px;min-width:38px">' + fDia(fData(l)) + '</span><div style="flex:1;min-width:0;font-size:13px">' + (l.origemTipo === 'Extrato' ? '🏦 ' : '') + esc(l.descricao || '') + '</div><b style="white-space:nowrap;color:' + (e ? '#1b7f3b' : '#c62828') + '">' + (e ? '+' : '−') + fBrl(l.valorTotal) + '</b></div>' +
    '<div class="ex-grid" style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:8px">' +
    '<select class="ex-dest" data-id="' + esc(l.id) + '" style="padding:7px' + (a.dest ? '' : ';border-color:#e0a100;background:#fffaf0') + '">' + fExOpcoesDest(a.dest) + '</select>' +
    '<div><label style="display:flex;align-items:center;gap:6px;margin:0;font-weight:400;font-size:13px"><input type="checkbox" class="ex-fck" data-id="' + esc(l.id) + '"' + (a.fck ? ' checked' : '') + ' style="width:auto;margin:0"> Pago a funcionário</label>' + (a.fck ? fExFuncSel(l, a) : '') + '</div>' +
    '<input class="ex-obs" data-id="' + esc(l.id) + '" value="' + esc(a.obs) + '" placeholder="Observação" style="padding:7px">' +
    '</div></div>';
}
function fHtmlExt() {
  var x = fEx(); fExCarregarListas();
  if (x.imp) return fExHtmlImp();
  var l = fExLista(), n = Object.keys(x.sujo).length, semDest = 0, tot = { e: 0, s: 0 };
  l.forEach(function (i) { if (!fExAtual(i).dest) semDest++; if (fEnt(i)) tot.e += i.valorTotal; else tot.s += i.valorTotal; });
  var nm = F_NOMES_MES[+F.mes.slice(5, 7) - 1] + ' ' + F.mes.slice(0, 4);
  var h = '<style>@media(min-width:900px){.ex-grid{grid-template-columns:1.3fr 1fr 1.3fr!important;align-items:start}}</style>' +
    '<div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="btn lar" style="width:auto;padding:12px 16px;margin:0;cursor:pointer">📤 Enviar extrato do banco<input type="file" id="ex-arq" accept=".ofx,.csv,.txt,.pdf,.OFX,.CSV,.PDF,text/csv,application/x-ofx,application/pdf" style="display:none"></label>' +
    '<span class="muted" style="font-size:12px;flex:1;min-width:180px">Arquivo <b>OFX</b> (melhor), <b>CSV</b> ou <b>PDF</b> do internet banking. Os lançamentos entram sozinhos e o que já existe é pulado.</span></div>' +
    '<div class="card"><div style="display:flex;align-items:center;gap:8px"><button class="btn sec" style="width:auto;padding:6px 12px" onclick="fExMes(-1)">‹</button><h2 style="margin:0;flex:1;text-align:center">' + nm + '</h2><button class="btn sec" style="width:auto;padding:6px 12px" onclick="fExMes(1)">›</button></div>' +
    '<p class="muted" style="margin:8px 0 0;font-size:13px">' + l.length + ' lançamentos · entradas ' + fBrl(tot.e) + ' · saídas ' + fBrl(tot.s) + (semDest ? ' · <b style="color:#b26a00">' + semDest + ' sem obra/tipo</b>' : '') + '</p>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + [['todos', 'Todos'], ['sem', 'Sem obra/tipo'], ['func', 'Funcionários'], ['extrato', 'Só do extrato']].map(function (f) { return '<button class="btn ' + (x.filtro === f[0] ? '' : 'sec') + '" style="width:auto;padding:6px 10px;font-size:12px" onclick="fExFiltro(\'' + f[0] + '\')">' + f[1] + '</button>'; }).join('') + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:8px">' + fFiltrosHtml() + '</div>' +
    '<input id="ex-busca" value="' + esc(x.busca) + '" placeholder="🔎 Buscar descrição, valor, observação" style="margin-top:8px"></div>';
  h += '<div class="card" style="padding:10px">' + (l.length ? l.map(fExLinha).join('') : '<p class="muted">Nenhum lançamento neste mês com esse filtro.</p>') + '</div>';
  h += '<div id="ex-barra" style="position:sticky;bottom:70px;z-index:5;display:' + (n ? 'block' : 'none') + '"><button class="btn lar" id="ex-salvar" style="padding:14px;font-size:16px;box-shadow:0 4px 14px rgba(0,0,0,.25)" onclick="fExSalvar()">Salvar ' + n + ' alteraç' + (n === 1 ? 'ão' : 'ões') + '</button></div>';
  return h;
}
function fExMes(n) { fExGuardarBusca(); fMes(n); }
function fExFiltro(f) { fExGuardarBusca(); fEx().filtro = f; fTela(); }
function fExGuardarBusca() { if ($('ex-busca')) fEx().busca = $('ex-busca').value; }
function fExMarca(id, campo, v, nome) {
  var x = fEx(), l = F.lanc.filter(function (i) { return String(i.id) === String(id); })[0]; if (!l) return;
  var d = x.sujo[id] || (x.sujo[id] = {}), o = fExSalvo(l); d[campo] = v; if (campo === 'func') d.funcNome = nome || '';
  var a = fExAtual(l);
  if (o.dest === a.dest && o.obs === a.obs && o.fck === a.fck && (!a.fck || o.func === a.func)) delete x.sujo[id];
  var n = Object.keys(x.sujo).length, bar = $('ex-barra'), row = document.querySelector('.ex-row[data-id="' + id + '"]');
  if (bar) { bar.style.display = n ? 'block' : 'none'; $('ex-salvar').textContent = 'Salvar ' + n + ' alteraç' + (n === 1 ? 'ão' : 'ões'); }
  if (row) row.style.borderColor = x.sujo[id] ? 'var(--laranja)' : 'var(--borda)';
}
function fExLigarFunc(sel) { sel.onchange = function () { fExMarca(sel.dataset.id, 'func', sel.value, sel.value ? sel.options[sel.selectedIndex].text : ''); }; }
function fExLigar() {
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
  each('.ex-dest', function (el) { el.onchange = function () { fExMarca(el.dataset.id, 'dest', el.value); el.style.borderColor = el.value ? '' : '#e0a100'; el.style.background = el.value ? '' : '#fffaf0'; }; });
  each('.ex-obs', function (el) { el.oninput = function () { fExMarca(el.dataset.id, 'obs', el.value); }; });
  each('.ex-func', fExLigarFunc);
  each('.ex-fck', function (el) { el.onchange = function () {
    fExMarca(el.dataset.id, 'fck', el.checked);
    var box = el.closest('div'), sel = box.querySelector('.ex-func');
    if (el.checked && !sel) { var l = F.lanc.filter(function (i) { return String(i.id) === el.dataset.id; })[0]; box.insertAdjacentHTML('beforeend', fExFuncSel(l, fExAtual(l))); var s2 = box.querySelector('.ex-func'); fExLigarFunc(s2); s2.focus(); }
    else if (!el.checked && sel) sel.remove();
  }; });
  if ($('ex-busca')) { $('ex-busca').oninput = function () { var v = this.value, pos = this.selectionStart; clearTimeout(F._exT); F._exT = setTimeout(function () { fEx().busca = v; fTela(); var b = $('ex-busca'); if (b) { b.focus(); b.setSelectionRange(pos, pos); } }, 350); }; }
  if ($('ex-arq')) $('ex-arq').onchange = function () { if (this.files[0]) fExLerArquivo(this.files[0]); this.value = ''; };
  if ($('ex-imp-ok')) $('ex-imp-ok').onclick = fExImportar;
}
function fExSalvar() {
  var x = fEx(); if (x.salvando || !gOnline()) return;
  var ids = Object.keys(x.sujo); if (!ids.length) return;
  var lista = [];
  for (var k = 0; k < ids.length; k++) {
    var id = ids[k], l = F.lanc.filter(function (i) { return String(i.id) === id; })[0]; if (!l) continue;
    var a = fExAtual(l), d = x.sujo[id], it = { id: id };
    if (a.fck && !a.func) return aviso('Escolha o funcionário em "' + (l.descricao || '').slice(0, 40) + '".', 'err');
    if ('dest' in d) { it.projetoId = a.dest.indexOf('o:') === 0 ? a.dest.slice(2) : ''; it.categoria = it.projetoId ? 'Obra' : (a.dest ? a.dest.slice(2) : 'A classificar'); }
    if ('fck' in d || 'func' in d) { it.funcionarioId = a.fck ? a.func : ''; it.funcionarioNome = a.fck ? a.funcNome : ''; }
    if ('obs' in d) it.obs = a.obs;
    lista.push(it);
  }
  x.salvando = true; var b = $('ex-salvar'); if (b) b.disabled = true; aviso('Salvando ' + lista.length + '...');
  sys('fxClassificar', [lista]).then(function () { x.sujo = {}; aviso('Alterações salvas.', 'ok'); fCarregar(true); })
    .catch(function (e) { aviso(e.message, 'err'); if (b) b.disabled = false; })
    .then(function () { x.salvando = false; });
}

// ---------- leitura do arquivo do banco (OFX ou CSV) ----------
function fExNorm(s) { return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim(); }
function fExNum(s) {
  s = String(s == null ? '' : s).replace(/R\$|\s| /g, ''); if (!s) return NaN;
  var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s) || /D$/i.test(s); s = s.replace(/[()\-+CD]/gi, '');
  var c = s.lastIndexOf(','), p = s.lastIndexOf('.');
  if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (p >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  var v = parseFloat(s); return isNaN(v) ? NaN : (neg ? -v : v);
}
function fExDataTxt(s) {
  s = String(s || '').trim(); var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { var a = m[3].length === 2 ? '20' + m[3] : m[3]; return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}
function fExChaves(itens, pref) { // mesma data+valor+descrição repetidos no arquivo ganham #1, #2... (re-enviar o mesmo período dá as mesmas chaves)
  var cont = {};
  itens.forEach(function (i) { if (i.chave) return; var b = pref + ':' + i.data + '|' + i.valor.toFixed(2) + '|' + fExNorm(i.descricao).slice(0, 80) + (i.doc ? '|' + fExNorm(i.doc) : ''); cont[b] = (cont[b] || 0) + 1; i.chave = b + '#' + cont[b]; });
  return itens;
}
function fExLerOfx(t) {
  var tag = function (b, n) { var m = b.match(new RegExp('<' + n + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  var conta = tag(t, 'ACCTID'), itens = [], re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi, m;
  while ((m = re.exec(t))) {
    var b = m[1], d = tag(b, 'DTPOSTED'), v = fExNum(tag(b, 'TRNAMT').replace(',', '.')), desc = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' · ');
    if (!/^\d{8}/.test(d) || !v) continue;
    var fit = tag(b, 'FITID');
    itens.push({ data: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), valor: Math.round(v * 100) / 100, descricao: desc, doc: tag(b, 'CHECKNUM') || tag(b, 'REFNUM'), chave: fit ? 'ofx:' + conta + ':' + fit : '' });
  }
  var saldo = null, lb = t.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i);
  if (lb) { var bv = fExNum(tag(lb[1], 'BALAMT').replace(',', '.')), bd = tag(lb[1], 'DTASOF'); if (!isNaN(bv) && /^\d{8}/.test(bd)) saldo = { valor: bv, data: bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8) }; }
  return { itens: fExChaves(itens, 'ofx:' + conta), saldo: saldo, formato: 'OFX' };
}
function fExSplit(linha, sep) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < linha.length; i++) { var ch = linha[i]; if (ch === '"') { if (q && linha[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out.map(function (c) { return c.trim(); });
}
function fExLerCsv(t) {
  var linhas = t.split(/\r?\n/).filter(function (l) { return l.trim(); });
  var amostra = linhas.slice(0, 30).join('\n'), sep = [';', '\t', ','].sort(function (a, b) { return amostra.split(b).length - amostra.split(a).length; })[0];
  var rows = linhas.map(function (l) { return fExSplit(l, sep); }), hi = -1, col = {};
  var acha = function (cab, re) { for (var i = 0; i < cab.length; i++) if (re.test(fExNorm(cab[i]))) return i; return -1; };
  for (var r = 0; r < Math.min(rows.length, 40); r++) {
    var cab = rows[r], cd = acha(cab, /^DATA|^DT\b|^DATE/);
    if (cd < 0) continue;
    var cv = acha(cab, /^VALOR|^VLR|^MONTANTE|^QUANTIA|^AMOUNT/), cc = acha(cab, /CREDITO|^ENTRADA/), cdb = acha(cab, /DEBITO|^SAIDA/);
    if (cv < 0 && cc < 0 && cdb < 0) continue;
    hi = r; col = { d: cd, v: cv, c: cc, db: cdb, h: acha(cab, /HISTORICO|DESCRI|LANCAMENTO|DETALH|MEMO|ESTABELEC|TITULO|^TRANSAC|NOME/), doc: acha(cab, /DOCUMENTO|^DOC\b|^N DOC|IDENTIFICADOR|^ID\b|^REFER/), dc: acha(cab, /^D C$|^C D$|^TIPO$|^NATUREZA|^SINAL/) };
    if (col.h === col.d) col.h = -1;
    break;
  }
  var itens = [];
  rows.slice(hi + 1).forEach(function (c) {
    var d = fExDataTxt(c[hi >= 0 ? col.d : 0]); if (!d) return;
    var v;
    if (hi < 0) { var nums = c.map(fExNum); v = NaN; for (var k = c.length - 1; k > 0; k--) if (!isNaN(nums[k]) && /\d[,.]\d{2}\b/.test(c[k])) { v = nums[k]; break; } if (k > 0 && c.length > 2) { var vv = nums[k - 1]; if (!isNaN(vv) && /\d[,.]\d{2}\b/.test(c[k - 1])) v = vv; } }
    else if (col.v >= 0 && c[col.v] !== '' && c[col.v] != null) v = fExNum(c[col.v]);
    else { var cr = fExNum(c[col.c]), db = fExNum(c[col.db]); v = (!isNaN(cr) && cr ? Math.abs(cr) : 0) - (!isNaN(db) && db ? Math.abs(db) : 0); }
    if (hi >= 0 && col.dc >= 0 && /^D/i.test(c[col.dc] || '') && v > 0) v = -v;
    if (isNaN(v) || !v) return;
    var desc = hi >= 0 && col.h >= 0 ? c[col.h] : c.filter(function (x, i) { return i !== 0 && isNaN(fExNum(x)); }).join(' ');
    if (/^SALDO|SALDO ANTERIOR|SALDO DO DIA|SALDO FINAL|S A L D O/.test(fExNorm(desc))) return;
    itens.push({ data: d, valor: Math.round(v * 100) / 100, descricao: desc, doc: hi >= 0 && col.doc >= 0 ? c[col.doc] : '' });
  });
  return { itens: fExChaves(itens, 'csv'), saldo: null, formato: 'CSV' };
}
// PDF do banco: lê o texto do PDF (não funciona em PDF escaneado/foto) e monta os lançamentos por linha.
var FX_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
function fExPdfLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(function (ok, er) {
    var s = document.createElement('script'); s.src = FX_PDFJS + 'pdf.min.js';
    s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = FX_PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = function () { er(new Error('sem internet para abrir o leitor de PDF')); }; document.head.appendChild(s);
  });
}
function fExPdfLinhas(buf) { // devolve linhas [{y, itens:[{x, t}]}] de todas as páginas
  return fExPdfLib().then(function (lib) { return lib.getDocument({ data: buf }).promise; }).then(function (doc) {
    var ps = []; for (var p = 1; p <= doc.numPages; p++) ps.push(doc.getPage(p).then(function (pg) { return pg.getTextContent(); }));
    return Promise.all(ps);
  }).then(function (pgs) {
    var linhas = [];
    pgs.forEach(function (tc, pi) {
      var its = tc.items.filter(function (i) { return String(i.str).trim(); }).map(function (i) { return { x: i.transform[4], cx: i.transform[4] + (i.width || 0) / 2, y: i.transform[5], t: String(i.str).trim() }; });
      its.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
      var cur = null;
      its.forEach(function (i) { if (!cur || Math.abs(cur.y - i.y) > 2.5) { cur = { y: i.y, pg: pi, itens: [] }; linhas.push(cur); } cur.itens.push(i); });
      linhas.forEach(function (l) { l.itens.sort(function (a, b) { return a.x - b.x; }); });
    });
    return linhas;
  });
}
var FX_RE_VAL = /^\(?-?\s?(R\$\s?)?-?\d{1,3}(\.\d{3})*,\d{2}\)?(\s?-|\s?[DC])?$/i;
function fExLerPdfLinhas(linhas) {
  var txt = linhas.map(function (l) { return l.itens.map(function (i) { return i.t; }).join(' '); }).join('\n');
  var anoM = txt.match(/\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/) || txt.match(/\b(20\d{2})\b/), anoPadrao = anoM ? anoM[1] : fHoje().slice(0, 4);
  var colC = null, colD = null, colS = null, colV = null; // centro x das colunas, se o PDF tiver cabeçalho
  linhas.forEach(function (l) { l.itens.forEach(function (i) { var n = fExNorm(i.t); if (colC == null && /^(CREDITO|CREDITOS|ENTRADAS?)( R)?$/.test(n)) colC = i.cx; if (colD == null && /^(DEBITO|DEBITOS|SAIDAS?)( R)?$/.test(n)) colD = i.cx; if (colS == null && /^SALDO( R)?$/.test(n)) colS = i.cx; if (colV == null && /^VALOR( R)?$/.test(n)) colV = i.cx; }); });
  var perto = function (x, c) { return c == null ? 1e9 : Math.abs(x - c); };
  var LIXO = /HISTORICO|DOCUMENTO|PERIODO|AGENCIA|PAGINA|DATA HORA|SALDO DISPONIVEL|APLICATIVO|CENTRAL DE ATEND|^EXTRATO|LANCAMENTOS FUTUROS|^\d{1,3} \d{1,3}$/;
  // 1ª passada: separa linhas com valor (lançamentos) e pedaços de descrição (linhas sem valor, acima/abaixo, como no Santander)
  var ancoras = [], pedacos = [], parar = false, ultData = null;
  linhas.forEach(function (l) {
    if (parar) return;
    var tk = []; l.itens.forEach(function (i) { var t = i.t; if (tk.length && /^[-DC]$/i.test(t) && FX_RE_VAL.test(tk[tk.length - 1].t + t)) { tk[tk.length - 1].t += t; return; } tk.push({ x: i.cx, t: t }); });
    var linhaN = fExNorm(tk.map(function (i) { return i.t; }).join(' '));
    if (/^SALDO$|POSICAO EM|ENTENDA A COMPOSICAO|^RESUMO DO PERIODO/.test(linhaN)) { parar = true; return; }
    var primeiro = tk[0] ? tk[0].t : '', dm = primeiro.match(/^(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?$/), data = null;
    if (dm) { var a = dm[4] ? (dm[4].length === 2 ? '20' + dm[4] : dm[4]) : anoPadrao; data = a + '-' + dm[2].padStart(2, '0') + '-' + dm[1].padStart(2, '0'); tk.shift(); }
    var vals = tk.filter(function (i) { return FX_RE_VAL.test(i.t); });
    var desc = tk.filter(function (i) { return !FX_RE_VAL.test(i.t); }).map(function (i) { return i.t; }).join(' ').replace(/\s+/g, ' ').trim();
    if (!vals.length) { if (desc && !data && !LIXO.test(fExNorm(desc))) pedacos.push({ y: l.y, pg: l.pg, t: desc }); return; }
    if (!data) { if (!ultData || !desc || LIXO.test(fExNorm(desc))) return; data = ultData; }
    ultData = data;
    ancoras.push({ y: l.y, pg: l.pg, data: data, vals: vals, desc: desc, acima: [], abaixo: [] });
  });
  // cada pedaço vai para o lançamento mais próximo na mesma página (empate: o de cima)
  pedacos.forEach(function (p) {
    var melhor = null, dist = 1e9;
    ancoras.forEach(function (a) { if (a.pg !== p.pg) return; var d = Math.abs(a.y - p.y); if (d < dist - 0.01 || (Math.abs(d - dist) < 0.01 && a.y > melhor.y)) { dist = d; melhor = a; } });
    if (melhor && dist <= 15) (p.y > melhor.y ? melhor.acima : melhor.abaixo).push(p);
  });
  // 2ª passada: valor, sinal e saldo (o extrato pode vir do mais novo para o mais antigo)
  var itens = [], ultSaldo = null;
  ancoras.forEach(function (a) {
    var desc = a.acima.sort(function (p, q) { return q.y - p.y; }).map(function (p) { return p.t; }).concat(a.desc ? [a.desc] : [], a.abaixo.sort(function (p, q) { return q.y - p.y; }).map(function (p) { return p.t; })).join(' ').replace(/\s+/g, ' ').trim();
    var n = fExNorm(desc), vals = a.vals, saldoLinha = null, vtk = vals[0];
    if (vals.length >= 2) saldoLinha = fExNum(vals[vals.length - 1].t);
    else if (colS != null && (colV != null || colC != null || colD != null) && perto(vals[0].x, colS) < Math.min(perto(vals[0].x, colV), perto(vals[0].x, colC), perto(vals[0].x, colD))) { saldoLinha = fExNum(vals[0].t); vtk = null; }
    if (/^SALDO|SALDO ANTERIOR|SALDO DO DIA|SALDO FINAL|SDO /.test(n) || !vtk) { if (saldoLinha != null && !isNaN(saldoLinha)) ultSaldo = saldoLinha; return; }
    var v = fExNum(vtk.t); if (isNaN(v) || !v) return;
    var temSinal = /-|\(|D$/i.test(vtk.t) || /C$/i.test(vtk.t);
    if (!temSinal) {
      if (colC != null && colD != null) v = perto(vtk.x, colD) < perto(vtk.x, colC) ? -Math.abs(v) : Math.abs(v);
      else if (saldoLinha != null && ultSaldo != null && !isNaN(saldoLinha) && colS == null) v = saldoLinha < ultSaldo ? -Math.abs(v) : Math.abs(v);
    }
    if (saldoLinha != null && !isNaN(saldoLinha)) ultSaldo = saldoLinha;
    itens.push({ data: a.data, valor: Math.round(v * 100) / 100, descricao: desc || '(sem descrição)', doc: '' });
  });
  return { itens: fExChaves(itens, 'pdf'), saldo: null, formato: 'PDF' };
}
function fExLerArquivo(arq) {
  var ler = function (enc) { return new Promise(function (ok, er) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = er; r.readAsText(arq, enc); }); };
  aviso('Lendo o arquivo...');
  var mostrar = function (r) {
    if (!r.itens.length) return aviso('Não encontrei lançamentos nesse arquivo. Se for PDF escaneado (foto), exporte o extrato em OFX, CSV ou PDF do internet banking.', 'err');
    var ja = {}; F.todos.forEach(function (l) { if (l.origemTipo === 'Extrato') ja[l.origemId] = 1; });
    r.novos = r.itens.filter(function (i) { return !ja[i.chave]; }).length;
    r.nome = arq.name; r.usarSaldo = false; fEx().imp = r; fTela();
  };
  if (/\.pdf$/i.test(arq.name) || arq.type === 'application/pdf') {
    return arq.arrayBuffer().then(fExPdfLinhas).then(function (ls) { mostrar(fExLerPdfLinhas(ls)); }).catch(function (e) { aviso('Não consegui ler o PDF: ' + e.message, 'err'); });
  }
  ler('utf-8').then(function (t) { return /�/.test(t) ? ler('windows-1252') : t; }).then(function (t) {
    mostrar(/<OFX>|OFXHEADER|<STMTTRN>/i.test(t) ? fExLerOfx(t) : fExLerCsv(t));
  }).catch(function (e) { aviso('Não consegui ler o arquivo: ' + e.message, 'err'); });
}
function fExHtmlImp() {
  var r = fEx().imp, ds = r.itens.map(function (i) { return i.data; }).sort(), e = 0, s = 0;
  r.itens.forEach(function (i) { if (i.valor > 0) e += i.valor; else s -= i.valor; });
  var h = '<div class="card"><h2 style="margin-top:0">📤 Enviar extrato</h2><p><b>' + esc(r.nome) + '</b> (' + r.formato + ')</p>' +
    '<ul class="lista"><li><span>Período</span><b>' + fDia(ds[0]) + '/' + ds[0].slice(0, 4) + ' a ' + fDia(ds[ds.length - 1]) + '/' + ds[ds.length - 1].slice(0, 4) + '</b></li>' +
    '<li><span>Lançamentos no arquivo</span><b>' + r.itens.length + '</b></li><li><span>Novos (serão lançados)</span><b style="color:#1b7f3b">' + r.novos + '</b></li><li><span>Já lançados (serão pulados)</span><b>' + (r.itens.length - r.novos) + '</b></li>' +
    '<li><span>Entradas no arquivo</span><b style="color:#1b7f3b">' + fBrl(e) + '</b></li><li><span>Saídas no arquivo</span><b style="color:#c62828">' + fBrl(s) + '</b></li></ul>';
  if (r.saldo) h += '<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:400"><input type="checkbox" id="ex-imp-saldo" style="width:auto"' + (r.usarSaldo ? ' checked' : '') + ' onchange="fEx().imp.usarSaldo=this.checked"> Ajustar o saldo do fluxo pelo extrato: ' + fBrl(r.saldo.valor) + ' em ' + r.saldo.data.split('-').reverse().join('/') + '</label>';
  h += '<div style="max-height:260px;overflow:auto;margin-top:10px;border:1px solid var(--borda);border-radius:8px;padding:6px 8px"><ul class="lista">' + r.itens.slice(0, 300).map(function (i) { return '<li><span style="font-size:12px"><span class="muted">' + fDia(i.data) + '</span> ' + esc(i.descricao) + '</span><b style="white-space:nowrap;color:' + (i.valor > 0 ? '#1b7f3b' : '#c62828') + '">' + (i.valor > 0 ? '+' : '−') + fBrl(Math.abs(i.valor)) + '</b></li>'; }).join('') + (r.itens.length > 300 ? '<li class="muted">… e mais ' + (r.itens.length - 300) + '</li>' : '') + '</ul></div>' +
    '<div style="height:12px"></div><button class="btn lar" id="ex-imp-ok" style="padding:14px;font-size:16px"' + (r.novos || r.saldo ? '' : ' disabled') + '>' + (r.novos ? 'Lançar ' + r.novos + ' lançamento' + (r.novos === 1 ? '' : 's') : 'Nada novo para lançar') + '</button>' +
    '<button class="btn sec" style="margin-top:8px" onclick="fEx().imp=null;fTela()">Cancelar</button></div>';
  return h;
}
function fExImportar() {
  var x = fEx(), r = x.imp; if (!r || !gOnline()) return;
  var b = $('ex-imp-ok'); b.disabled = true; aviso('Lançando ' + r.novos + '...');
  var itens = r.itens.map(function (i) { return { data: i.data, valor: i.valor, descricao: i.descricao + (i.doc && String(i.descricao).indexOf(i.doc) < 0 ? ' · doc ' + i.doc : ''), chave: i.chave }; });
  sys('fxImportarExtrato', [itens, r.usarSaldo && r.saldo ? r.saldo : null]).then(function (res) {
    aviso(res.novos + ' lançamento' + (res.novos === 1 ? '' : 's') + ' novo' + (res.novos === 1 ? '' : 's') + (res.duplicados ? ' · ' + res.duplicados + ' já existia' + (res.duplicados === 1 ? '' : 'm') : '') + (res.saldo ? ' · saldo ajustado' : '') + '. Agora é só completar.', 'ok');
    var ds = r.itens.map(function (i) { return i.data; }).sort(); F.mes = ds[0].slice(0, 7); x.imp = null; x.filtro = 'sem'; fCarregar(true); fTela();
  }).catch(function (e) { aviso(e.message, 'err'); b.disabled = false; });
}

var _fRota = gRotaExtra;
gRotaExtra = function (v) {
  var main = document.querySelector('main'); if (main && v !== 'tFluxo') main.style.maxWidth = '';
  if (v === 'tFluxo') { if (F.ed) fForm(); else { fTela(); fContarAprov(); } return true; }
  return _fRota(v);
};
if (typeof T_ROTAS !== 'undefined') T_ROTAS.tFin = function () { gIr('tFluxo'); };
