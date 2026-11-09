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
  if (!F.lanc) DB.get('g_fluxo').then(function (c) { if (c && !F.lanc) { F.todos = c.lanc; F.saldo = c.saldo; F.lanc = fAplicar(F.todos); if (G.view === 'tFluxo') fTela(); } });
  if (!navigator.onLine) return;
  F.carregando = true;
  Promise.all([sys('listarLancamentos', [{}]), sys('obterSaldoCaixa', [])]).then(function (r) {
    F.todos = r[0] || []; F.saldo = r[1] || {}; F.lanc = fAplicar(F.todos); DB.set('g_fluxo', { lanc: F.todos, saldo: F.saldo });
  }).catch(function (e) { aviso(e.message, 'err'); }).then(function () { F.carregando = false; if (G.view === 'tFluxo') fTela(); });
}

// ---------- cálculo do saldo dia a dia ----------
// modo manual: só lançamentos feitos a partir da data de início; automáticos (folha, medição, custos fixos) só quando liberados
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
  var abas = [['cal', '📅 Calendário'], ['pend', '⚠️ Pendências'], ['rel', '📊 Relatórios']];
  var h = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap"><button class="btn sec" style="width:auto;padding:8px 12px;font-size:13px" onclick="gIr(\'auto\')">←</button>' +
    abas.map(function (a) { return '<button class="btn ' + (F.aba === a[0] ? '' : 'sec') + '" style="width:auto;padding:8px 12px;font-size:13px" onclick="F.aba=\'' + a[0] + '\';fTela()">' + a[1] + '</button>'; }).join('') +
    '<button class="btn sec" style="width:auto;padding:8px 10px;font-size:13px;margin-left:auto" onclick="fCarregar(true)" title="Atualizar">🔄</button></div>';
  if (F.aba === 'pend') h += fHtmlPend(); else if (F.aba === 'rel') h += fHtmlRel(); else h += fHtmlCal();
  h += '<button onclick="fNovo()" style="position:fixed;right:18px;bottom:84px;width:58px;height:58px;border-radius:50%;background:var(--laranja);color:#fff;font-size:30px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:6">+</button>';
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
  return '<li style="display:block"><div style="display:flex;gap:8px;align-items:flex-start"><span style="font-size:18px">' + (e ? '🟢' : '🔴') + '</span><div style="flex:1;min-width:0"><b>' + esc(l.descricao || '') + '</b><br><span class="muted" style="font-size:12px">' + esc([l.categoria, l.nomeProjeto, l.fornecedorCliente].filter(Boolean).join(' · ')) + (fBaix(l) && l.dataBaixa !== l.dataVencimento ? ' · venc. ' + fDia(l.dataVencimento) : '') + '</span></div>' +
    '<div style="text-align:right"><b style="color:' + (e ? '#1b7f3b' : '#c62828') + '">' + (e ? '+' : '−') + fBrl(l.valorTotal) + '</b><br><span style="font-size:11px;font-weight:700;color:' + cor + '">' + st + '</span></div></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
    (!fBaix(l) && l.status !== 'Previsto' ? '<button class="btn" style="width:auto;padding:6px 10px;font-size:12px" onclick="fBaixar(\'' + id + '\')">✔ ' + (e ? 'Recebido' : 'Pago') + '</button>' : '') +
    (l.status === 'Previsto' ? '<button class="btn" style="width:auto;padding:6px 10px;font-size:12px" onclick="fAcao(\'confirmarLancamentoPrevisto\',[\'' + id + '\'],\'Confirmado.\')">✔ Confirmar</button>' : '') +
    (!fBaix(l) ? '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fReagendar(\'' + id + '\')">📅 Mudar data</button>' : '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fAcao(\'reabrirLancamento\',[\'' + id + '\'],\'Reaberto.\')">↩ Desfazer baixa</button>') +
    '<button class="btn sec" style="width:auto;padding:6px 10px;font-size:12px" onclick="fEditar(\'' + id + '\')">✏️</button>' +
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
  ids.reduce(function (p, id) { return p.then(function () { var l = mapa[id]; if (!l) return; return modo === 'data' ? sys('alterarVencimentoLancamento', [id, nova]) : sys('darBaixaLancamento', [id, modo === 'venc' ? l.dataVencimento : fHoje()]); }); }, Promise.resolve())
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
  if ($('f-obra')) $('f-obra').onchange = function () { F.obra = this.value; fTela(); };
  if ($('f-cat')) $('f-cat').onchange = function () { F.cat = this.value; fTela(); };
  Array.prototype.forEach.call(document.querySelectorAll('.f-ck'), function (c) { c.onchange = function () { F.sel[c.dataset.id] = c.checked ? 1 : 0; }; });
}
function fMes(n) { var d = new Date(+F.mes.slice(0, 4), +F.mes.slice(5, 7) - 1 + n, 1); F.mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); F.dia = null; fTela(); }
function fAcao(fn, args, ok) { if (!gOnline()) return; aviso('Salvando...'); return sys(fn, args).then(function () { aviso(ok || 'Feito.', 'ok'); fCarregar(true); }).catch(function (e) { aviso(e.message, 'err'); }); }
function fBaixar(id) {
  var l = F.lanc.filter(function (x) { return String(x.id) === String(id); })[0]; if (!l) return;
  var d = l.dataVencimento < fHoje() ? prompt('Data em que foi ' + (fEnt(l) ? 'recebido' : 'pago') + ' (dd/mm/aaaa):', fDia(fHoje()) + '/' + fHoje().slice(0, 4)) : fDia(fHoje()) + '/' + fHoje().slice(0, 4);
  if (!d) return; d = fParseData(d); if (!d) return aviso('Data inválida.', 'err');
  fAcao('darBaixaLancamento', [id, d], fEnt(l) ? 'Recebimento registrado.' : 'Pagamento registrado.');
}
function fReagendar(id) {
  var l = F.lanc.filter(function (x) { return String(x.id) === String(id); })[0]; if (!l) return;
  var d = prompt('Nova data de vencimento (dd/mm/aaaa):', fDia(l.dataVencimento) + '/' + l.dataVencimento.slice(0, 4)); if (!d) return;
  d = fParseData(d); if (!d) return aviso('Data inválida.', 'err');
  fAcao('alterarVencimentoLancamento', [id, d], 'Data alterada para ' + fDia(d) + '.');
}
function fExcluir(id) {
  var l = F.lanc.filter(function (x) { return String(x.id) === String(id); })[0]; if (!l) return;
  if (!confirm('Excluir "' + l.descricao + '" (' + fBrl(l.valorTotal) + ')?' + (l.origemTipo && l.origemTipo !== 'Manual' ? '\n\nAtenção: este lançamento veio de ' + l.origemTipo + '.' : ''))) return;
  fAcao('excluirLancamento', [id], 'Excluído.');
}
function fSaldoForm() {
  var s = F.saldo || {};
  $('tela').innerHTML = '<div class="card"><h2>💰 Saldo do banco</h2><p class="muted">Some o saldo de todas as contas e do caixa (dinheiro) e informe o total de um dia. Daí para frente o app calcula sozinho com as baixas e os lançamentos.</p>' +
    '<label>Saldo total (R$)</label><input type="number" step="any" inputmode="decimal" id="fs-v" value="' + (s.definido ? s.valor : '') + '" style="font-size:22px">' +
    '<label>No fim do dia</label><input type="date" id="fs-d" value="' + (s.data || fHoje()) + '">' + (s.informadoPor ? '<p class="muted" style="font-size:12px">Último informado por ' + esc(s.informadoPor) + '</p>' : '') +
    '<div style="height:10px"></div><button class="btn lar" onclick="fSaldoSalvar()">Salvar saldo</button></div>' +
    '<div class="card"><h2>🧾 Começar do zero</h2><p class="muted">Use para lançar tudo à mão primeiro. Os lançamentos antigos continuam guardados, só não entram no fluxo. Dá para desligar quando quiser e tudo volta a aparecer.</p>' +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--texto)"><input type="checkbox" id="fc-z" style="width:auto"' + (s.inicio || +s.linhaInicio ? ' checked' : '') + '> Começar o fluxo zerado ' + (+s.linhaInicio && !s.inicio ? '(ativo: a partir do primeiro lançamento novo)' : 'a partir de') + '</label>' + (+s.linhaInicio && !s.inicio ? '<input type="hidden" id="fc-d" value="">' : '<input type="date" id="fc-d" value="' + (s.inicio || fHoje()) + '">') +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--texto);margin-top:12px"><input type="checkbox" id="fc-a" style="width:auto"' + (s.auto ? ' checked' : '') + '> Incluir lançamentos automáticos (folha, medições, custos fixos, requisições)</label>' +
    '<p class="muted" style="font-size:12px">Deixe desmarcado enquanto faz a atualização manual. Marque quando quiser que o sistema alimente o fluxo sozinho.</p>' +
    '<button class="btn lar" onclick="fConfigSalvar()">Salvar modo de início</button><button class="btn sec" style="margin-top:8px" onclick="fTela()">Voltar ao calendário</button></div>';
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
  sys('salvarSaldoCaixa', [Number(v), d]).then(function () { aviso('Saldo salvo.', 'ok'); fCarregar(true); fTela(); }).catch(function (e) { aviso(e.message, 'err'); });
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
    '<label>' + (ent ? 'Cliente' : 'Fornecedor') + ' (opcional)</label><input id="fe-f" list="fe-fl" value="' + esc(e.f != null ? e.f : (l.fornecedorCliente || '')) + '"><datalist id="fe-fl">' + Object.keys(forn).slice(0, 200).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
    '<div style="height:12px"></div><button class="btn lar" id="fe-ok" style="padding:14px;font-size:16px">Salvar</button></div>';
  $('tela').innerHTML = h; window.scrollTo(0, 0);
  var obraAtual = e.o != null ? e.o : (l.projetoId || F.obra || '');
  aOpcoes(aFn && aFn('listarProjetosParaSelecao') ? 'listarProjetosParaSelecao' : 'listarProjetos').then(function (ps) { if (!$('fe-o')) return; $('fe-o').innerHTML += ps.map(function (p) { var id = p.id || p.valor; return '<option value="' + esc(id) + '"' + (String(id) === String(obraAtual) ? ' selected' : '') + '>' + esc(p.titulo || mTitulo(p)) + '</option>'; }).join(''); }).catch(function () {});
  if (!e.v && $('fe-v')) $('fe-v').focus();
  $('fe-ok').onclick = fSalvar;
}
function fCap() { var e = F.ed; if (!$('fe-v')) return; e.v = $('fe-v').value; e.d = $('fe-d').value; e.data = $('fe-dt').value; e.c = $('fe-c').value; e.o = $('fe-o').value; e.f = $('fe-f').value; if ($('fe-p')) e.p = $('fe-p').value; }
function fSalvar() {
  fCap(); var e = F.ed, v = Number(e.v);
  if (!v || v <= 0) return aviso('Informe o valor.', 'err');
  if (!String(e.d || '').trim()) return aviso('Informe a descrição.', 'err');
  if (!e.data) return aviso('Informe a data.', 'err');
  if (!gOnline()) return;
  var b = $('fe-ok'); b.disabled = true; aviso('Salvando...');
  var p;
  if (e.novo) p = sys('criarLancamento', [{ tipo: e.tipo, valorTotal: v, descricao: e.d.trim(), situacao: e.sit, dataVencimento: e.data, dataPagamento: e.sit === 'pago' ? e.data : '', numeroParcelas: e.sit === 'aberto' ? (Number(e.p) || 1) : 1, categoria: e.c || 'Outro', projetoId: e.o || '', fornecedorCliente: e.f || '' }]);
  else p = sys('editarLancamento', [e.l.id, { descricao: e.d.trim(), valorTotal: v, categoria: e.c || 'Outro', projetoId: e.o || '', fornecedorCliente: e.f || '' }]).then(function () { if (e.data !== e.l.dataVencimento && !fBaix(e.l)) return sys('alterarVencimentoLancamento', [e.l.id, e.data]); });
  p.then(function () { aviso('Lançamento salvo.', 'ok'); F.dia = e.data; F.mes = e.data.slice(0, 7); F.aba = 'cal'; F.ed = null; fCarregar(true); fTela(); })
    .catch(function (er) { aviso(er.message, 'err'); b.disabled = false; });
}

// estilo responsivo (computador: calendário + dia lado a lado)
(function () { var st = document.createElement('style'); st.textContent = '.fx-grid{display:grid;grid-template-columns:1fr;gap:0 12px}@media(min-width:900px){.fx-grid{grid-template-columns:3fr 2fr}}'; document.head.appendChild(st); })();

// rotas: Financeiro abre o fluxo; ao sair, a largura volta ao normal
var _fRota = gRotaExtra;
gRotaExtra = function (v) {
  var main = document.querySelector('main'); if (main && v !== 'tFluxo') main.style.maxWidth = '';
  if (v === 'tFluxo') { if (F.ed) fForm(); else fTela(); return true; }
  return _fRota(v);
};
if (typeof T_ROTAS !== 'undefined') T_ROTAS.tFin = function () { gIr('tFluxo'); };
