/* DNP Campo — ponto pelo celular + RDO offline.
   Tudo é salvo no aparelho (IndexedDB) e enviado ao sistema quando há internet. */
'use strict';

var API_URL = 'https://script.google.com/macros/s/AKfycbwlOXiIzS4mSxtW_xriuBU3rhlDIqp4fPvYOD7_o82ctZgL4AIuUVuXfIokqmQ67DiJ/exec';
var VERSAO = '1.5.6';
var ESP_INICIO = '2026-11'; // espelho só pode ser consultado a partir deste mês
var TIPOS_AJUSTE = ['Corrigir horário', 'Esqueci de bater o ponto', 'Falta justificada / atestado', 'Outro'];
var TIPOS = { ENTRADA: 'Entrada', SAIDA_INTERVALO: 'Saída intervalo', VOLTA_INTERVALO: 'Volta intervalo', SAIDA: 'Saída' };
var ORDEM = ['ENTRADA', 'SAIDA_INTERVALO', 'VOLTA_INTERVALO', 'SAIDA'];

// ---------------- armazenamento local (IndexedDB) ----------------
var DB = {
  _db: null,
  abrir: function () {
    if (DB._db) return Promise.resolve(DB._db);
    return new Promise(function (ok, erro) {
      var r = indexedDB.open('dnp-campo', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('fila')) d.createObjectStore('fila', { keyPath: 'uid' });
      };
      r.onsuccess = function () { DB._db = r.result; ok(DB._db); };
      r.onerror = function () { erro(r.error); };
    });
  },
  _tx: function (store, modo, fn) {
    return DB.abrir().then(function (d) {
      return new Promise(function (ok, erro) {
        var t = d.transaction(store, modo), s = t.objectStore(store), res = fn(s);
        t.oncomplete = function () { ok(res && 'result' in res ? res.result : undefined); };
        t.onerror = function () { erro(t.error); };
      });
    });
  },
  get: function (k) { return DB._tx('kv', 'readonly', function (s) { return s.get(k); }); },
  set: function (k, v) { return DB._tx('kv', 'readwrite', function (s) { s.put(v, k); }); },
  del: function (k) { return DB._tx('kv', 'readwrite', function (s) { s.delete(k); }); },
  filaTodos: function () { return DB._tx('fila', 'readonly', function (s) { return s.getAll(); }); },
  filaPut: function (it) { return DB._tx('fila', 'readwrite', function (s) { s.put(it); }); },
  filaDel: function (uid) { return DB._tx('fila', 'readwrite', function (s) { s.delete(uid); }); }
};

// ---------------- estado ----------------
var S = { sessao: null, dados: null, fila: [], tela: 'ponto', obraId: null, gps: null, sincronizando: false, rdoFotos: [], historico: [] };

function $(id) { return document.getElementById(id); }
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)) ; }
function hhmm(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function dataIso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function dataBr(iso) { return iso.split('-').reverse().join('/'); }
function aviso(msg, tipo) {
  var a = $('aviso'); a.textContent = msg; a.className = 'aviso ' + (tipo || ''); a.style.display = 'block';
  clearTimeout(aviso._t); aviso._t = setTimeout(function () { a.style.display = 'none'; }, tipo === 'err' ? 6000 : 3500);
}
function obraNome(o) { return (o.cliente ? o.cliente + ' – ' : '') + o.titulo; }
function obraPorId(id) { return ((S.dados && S.dados.obras) || []).filter(function (o) { return o.id === id; })[0] || null; }

// ---------------- API ----------------
function api(acao, corpo) {
  corpo = corpo || {}; corpo.acao = acao;
  if (S.sessao) corpo.token = S.sessao.token;
  var ctl = window.AbortController ? new AbortController() : null, tempo = ctl ? setTimeout(function () { ctl.abort(); }, (acao === 'sistema' || acao === 'inspecao') ? 120000 : 60000) : 0;
  return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo), redirect: 'follow', signal: ctl ? ctl.signal : undefined })
    .catch(function (e) { throw new Error(e && e.name === 'AbortError' ? 'O servidor demorou para responder. Tente de novo em alguns minutos.' : 'Sem conexão com o servidor. Tente de novo.'); })
    .then(function (r) { clearTimeout(tempo); return r.json(); })
    .then(function (r) {
      if (!r.ok) { var e = new Error(r.erro || 'Erro no servidor'); e.servidor = true; throw e; }
      return r.dados;
    });
}

// ---------------- rede / sincronização ----------------
function atualizarRede() {
  var on = navigator.onLine, r = $('rede');
  r.textContent = on ? 'online' : 'sem internet'; r.className = 'rede' + (on ? '' : ' off');
}
function contarPendentes() {
  var n = S.fila.filter(function (i) { return !i.erro; }).length, e = S.fila.filter(function (i) { return i.erro; }).length;
  $('nav-pend').textContent = (n + e) ? '(' + (n + e) + ')' : '';
}
function carregarFila() { return DB.filaTodos().then(function (f) { S.fila = (f || []).sort(function (a, b) { return a.criado - b.criado; }); contarPendentes(); }); }

function sincronizar(manual) {
  if (S.sincronizando || !S.sessao) return Promise.resolve();
  if (!navigator.onLine) { if (manual) aviso('Sem internet. Os dados ficam guardados no celular.', 'err'); return Promise.resolve(); }
  S.sincronizando = true;
  var enviados = 0, erros = 0;
  return carregarFila().then(function () {
    var pend = S.fila.filter(function (i) { return !i.erro || manual; });
    // um por vez (fotos), na ordem em que foram criados
    return pend.reduce(function (p, item) {
      return p.then(function () { return prepararInspecao(item); }).then(function () {
        var envio = Object.assign({}, item); delete envio.erro; delete envio.criado; delete envio.resumo;
        return api('sincronizar', { itens: [envio] }).then(function (r) {
          var res = r.resultados[0];
          if (r.agora) DB.set('relogio', r.agora - Date.now());
          if (res.ok) {
            enviados++; S.historico.unshift({ ms: Date.now(), txt: res.msg || item.resumo, ok: true });
            if ((item.tipo === 'orcamentoNovo' || item.tipo === 'composicaoNova') && typeof G !== 'undefined') { // a lista de orçamentos passa a mostrar o novo
              G._orcsOk = false; G._recarregarOrcs = true;
            }
            if (item.tipo === 'batida' && S.dados) { // mantém a batida visível mesmo se a atualização falhar
              (S.dados.batidas = S.dados.batidas || []).push({ uid: item.uid, projetoId: item.projetoId, tipo: item.tipoBatida, ms: item.ms });
              (S.dados.batidasEquipe = S.dados.batidasEquipe || []).push({ funcionarioId: S.sessao.funcionario.id, projetoId: item.projetoId, tipo: item.tipoBatida, ms: item.ms });
              DB.set('dados', S.dados);
            }
            return DB.filaDel(item.uid);
          }
          erros++; item.erro = res.erro; return DB.filaPut(item);
        });
      });
    }, Promise.resolve());
  }).then(function () {
    return api('baixar').then(function (d) { S.dados = d; return DB.set('dados', d); }).catch(function () {})
      .then(function () { if (enviados || S.tela === 'espelho') return baixarEspelho(S.espMes || mesAtual()).catch(function () {}); });
  }).catch(function (e) {
    if (String(e.message).indexOf('SESSAO') === 0) { aviso('Sua sessão expirou. Entre de novo (nada foi perdido).', 'err'); return sair(true); }
    if (manual) aviso('Não consegui enviar agora: ' + e.message, 'err');
  }).then(function () {
    S.sincronizando = false;
    DB.set('historico', S.historico.slice(0, 50));
    return carregarFila();
  }).then(function () {
    if (manual || enviados || erros) aviso(enviados + ' enviado(s)' + (erros ? ', ' + erros + ' com problema (veja em Envios)' : ''), erros ? 'err' : 'ok');
    if (typeof G !== 'undefined' && G._recarregarOrcs) { G._recarregarOrcs = false; if (S.tela === 'gestao' && G.view === 'orcs' && typeof gTelaOrcamentos === 'function') { gTelaOrcamentos(); return; } }
    if (manual) render(); else renderFundo();
  });
}

// atualização automática (a cada 2 min, ao voltar para o app, ao voltar a internet):
// nunca redesenha uma tela de formulário, para não apagar o que a pessoa está digitando
function renderFundo() {
  var el = document.activeElement, tela = $('tela');
  var digitando = el && tela && tela.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  if (digitando || ['rdo', 'ajuste', 'gestao'].indexOf(S.tela) >= 0) { contarPendentes(); return; }
  render();
}

// inspeção: manda as fotos uma a uma antes (envio grande demais travava). O progresso fica salvo na fila.
function prepararInspecao(item) {
  if (item.tipo !== 'inspecao' || !item.insp) return Promise.resolve();
  var tarefas = [];
  (item.insp.itens || []).forEach(function (it, ix) { (it.fotos || []).forEach(function (f, k) { if (typeof f === 'string' && f.indexOf('data:') === 0) tarefas.push([it, k, ix]); }); });
  if (!tarefas.length) return Promise.resolve();
  var chave = function (f) { return f.length + ':' + f.slice(-60); }; // foto já enviada antes não sobe de novo
  return DB.get('inspFotoIds').then(function (mapa) {
    mapa = mapa || {};
    return tarefas.reduce(function (p, t, n) {
      return p.then(function () {
        var f = t[0].fotos[t[1]], k = chave(f);
        if (mapa[k]) { t[0].fotos[t[1]] = mapa[k]; return DB.filaPut(item); }
        aviso('Enviando fotos da inspeção ' + (n + 1) + '/' + tarefas.length + '...');
        return api('inspFoto', { foto: f, nome: 'inspecao_' + String(item.insp.titulo || '').slice(0, 30) + '_' + (t[2] + 1) + '_' + (t[1] + 1) + '.jpg' })
          .then(function (id) { t[0].fotos[t[1]] = id; mapa[k] = id; return DB.set('inspFotoIds', mapa).then(function () { return DB.filaPut(item); }); });
      });
    }, Promise.resolve());
  });
}

function enfileirar(item) {
  item.uid = item.uid || uid(); item.criado = Date.now();
  return DB.filaPut(item).then(carregarFila).then(function () { render(); sincronizar(false); });
}

// ---------------- GPS e foto ----------------
function pegarGps() {
  return new Promise(function (ok) {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(function (p) {
      S.gps = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy), ms: Date.now() };
      ok(S.gps);
    }, function () { ok(null); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 20000 });
  });
}
function distancia(a, b) {
  var R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}
function situacaoCerca(obra, gps) {
  if (!obra || obra.lat === null || obra.lat === undefined) return { tem: false };
  if (!gps) return { tem: true, semGps: true };
  var d = distancia(gps, obra);
  return { tem: true, dist: d, dentro: d - Math.min(gps.precisao || 0, 100) <= obra.raio };
}
function lerFoto(arquivo, max, qualidade) {
  return new Promise(function (ok, erro) {
    var img = new Image(), url = URL.createObjectURL(arquivo);
    img.onload = function () {
      var f = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', qualidade));
    };
    img.onerror = function () { URL.revokeObjectURL(url); erro(new Error('Não consegui ler a foto.')); };
    img.src = url;
  });
}
function tirarFoto(campoId, multiplas) {
  return new Promise(function (ok) {
    var inp = $(campoId); inp.value = '';
    inp.onchange = function () { ok(Array.prototype.slice.call(inp.files || [])); };
    inp.click();
  });
}

// ---------------- telas ----------------
function render() {
  if (!S.sessao) return telaLogin();
  $('nav').classList.remove('hidden');
  $('quem').textContent = S.sessao.funcionario.nome;
  $('nav-rdo').classList.toggle('hidden', !(S.dados && S.dados.podeRdo));
  $('nav-gestao').classList.toggle('hidden', !gVinculado());
  Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) { b.classList.toggle('ativo', b.dataset.t === (S.tela === 'ajuste' ? 'espelho' : S.tela)); });
  if (S.tela === 'rdo') return telaRdo();
  if (S.tela === 'gestao') return telaGestao();
  if (S.tela === 'envios') return telaEnvios();
  if (S.tela === 'conta') return telaConta();
  if (S.tela === 'espelho') return telaEspelho();
  if (S.tela === 'ajuste') return telaAjuste();
  return telaPonto();
}

function telaLogin() {
  $('nav').classList.add('hidden'); $('quem').textContent = '';
  $('tela').innerHTML = '<div class="card"><h2>Entrar</h2><p class="muted">Use o seu CPF e o PIN que o escritório te passou.</p>' +
    '<label>CPF</label><input id="l-cpf" inputmode="numeric" autocomplete="username" placeholder="000.000.000-00">' +
    '<label>PIN</label><input id="l-pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="6 números">' +
    '<div style="height:14px"></div><button class="btn lar" id="l-ok">Entrar</button>' +
    '<p class="muted" style="margin-top:12px">Precisa de internet só para entrar. Depois o app funciona sem sinal.</p></div>';
  $('l-ok').onclick = function () {
    var b = this; b.disabled = true; b.textContent = 'Entrando...';
    if (!navigator.onLine) { aviso('Para entrar a primeira vez é preciso internet.', 'err'); b.disabled = false; b.textContent = 'Entrar'; return; }
    api('login', { cpf: $('l-cpf').value, pin: $('l-pin').value, dispositivo: navigator.userAgent.slice(0, 100) }).then(function (r) {
      S.sessao = r; return DB.set('sessao', r);
    }).then(function () { return api('baixar'); }).then(function (d) {
      S.dados = d; S.tela = 'ponto'; return DB.set('dados', d);
    }).then(function () { render(); aviso('Bem-vindo, ' + S.sessao.funcionario.nome.split(' ')[0] + '!', 'ok'); })
      .catch(function (e) { aviso(e.message, 'err'); b.disabled = false; b.textContent = 'Entrar'; });
  };
}

// batidas do dia (servidor + fila local) para sugerir a próxima
function minhasBatidas() {
  var lista = ((S.dados && S.dados.batidas) || []).map(function (b) { return { ms: b.ms, tipo: b.tipo, projetoId: b.projetoId, enviada: true }; });
  S.fila.forEach(function (i) { if (i.tipo === 'batida') lista.push({ ms: i.ms, tipo: i.tipoBatida, projetoId: i.projetoId, enviada: false, erro: i.erro }); });
  return lista.sort(function (a, b) { return a.ms - b.ms; });
}
function proximaBatida(lista) {
  var recentes = lista.filter(function (b) { return Date.now() - b.ms < 18 * 3600000; });
  if (!recentes.length) return 'ENTRADA';
  var ult = recentes[recentes.length - 1].tipo;
  if (ult === 'SAIDA') return 'ENTRADA';
  return ORDEM[Math.min(ORDEM.indexOf(ult) + 1, 3)];
}

function telaPonto() {
  var obras = (S.dados && S.dados.obras) || [];
  if (!S.obraId) S.obraId = (S.sessao.ultimaObra && obraPorId(S.sessao.ultimaObra)) ? S.sessao.ultimaObra : (obras[0] && obras[0].id);
  var obra = obraPorId(S.obraId), lista = minhasBatidas(), sug = proximaBatida(lista), agora = new Date();
  var hoje = lista.filter(function (b) { return Date.now() - b.ms < 18 * 3600000; });
  var cerca = situacaoCerca(obra, S.gps), gpsTxt;
  if (!obra) gpsTxt = 'Nenhuma obra ativa. Fale com o escritório.';
  else if (!cerca.tem) gpsTxt = '📍 Obra sem local cadastrado — a batida será conferida pelo escritório.';
  else if (cerca.semGps) gpsTxt = '📍 Localização ainda não obtida. Toque em "Atualizar localização".';
  else gpsTxt = (cerca.dentro ? '✅ Você está na obra' : '⚠️ Você está fora da obra') + ' (' + cerca.dist + ' m, precisão ±' + S.gps.precisao + ' m)';
  var html = '<div class="card"><div class="hoje" id="relogio">' + hhmm(agora.getTime()) + '<small>' + agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) + '</small></div>' +
    '<label>Obra</label><select id="p-obra">' + obras.map(function (o) { return '<option value="' + o.id + '"' + (o.id === S.obraId ? ' selected' : '') + '>' + esc(obraNome(o)) + '</option>'; }).join('') + '</select>' +
    '<div class="gps ' + (cerca.tem && !cerca.semGps ? (cerca.dentro ? 'ok' : 'fora') : '') + '" id="p-gps">' + gpsTxt + '</div>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec" id="p-loc">📍 Atualizar localização</button>' +
    (S.dados && S.dados.gestor && obra ? '<button class="btn sec" id="p-defloc">📌 Definir local da obra aqui</button>' : '') + '</div></div>' +
    '<div class="card"><h2>Bater ponto</h2><div class="grade">' +
    ORDEM.map(function (t) { return '<button class="bat' + (t === sug ? ' sug' : '') + '" data-tipo="' + t + '">' + TIPOS[t] + (t === sug ? '<small>próxima</small>' : '<small>&nbsp;</small>') + '</button>'; }).join('') +
    '</div><p class="muted" style="margin:10px 0 0">A batida pede uma foto sua e a localização. Sem internet ela fica guardada e é enviada depois com o horário certo.</p></div>' +
    '<div class="card"><h2>Minhas batidas (últimas 18 h)</h2><ul class="lista">' +
    (hoje.length ? hoje.slice().reverse().map(function (b) {
      var o = obraPorId(b.projetoId);
      return '<li><span><b>' + hhmm(b.ms) + '</b> ' + TIPOS[b.tipo] + '<br><span class="muted">' + esc(o ? o.titulo : '') + '</span></span>' +
        '<span class="tag ' + (b.erro ? 'err' : b.enviada ? 'ok' : 'pend') + '">' + (b.erro ? 'erro' : b.enviada ? 'enviada' : 'aguardando envio') + '</span></li>';
    }).join('') : '<li class="muted">Nenhuma batida ainda.</li>') + '</ul></div>';
  $('tela').innerHTML = html;
  $('p-obra').onchange = function () { S.obraId = this.value; S.sessao.ultimaObra = this.value; DB.set('sessao', S.sessao); render(); };
  $('p-loc').onclick = function () { $('p-gps').textContent = 'Buscando localização...'; pegarGps().then(function (g) { if (!g) aviso('Não consegui a localização. Ative o GPS e permita o acesso.', 'err'); render(); }); };
  if ($('p-defloc')) $('p-defloc').onclick = definirLocalObra;
  Array.prototype.forEach.call(document.querySelectorAll('.bat'), function (b) { b.onclick = function () { baterPonto(b.dataset.tipo); }; });
  if (!S.gps || Date.now() - S.gps.ms > 60000) pegarGps().then(function () { if (S.tela === 'ponto' && S.sessao) atualizarGpsBox(); });
}
function atualizarGpsBox() {
  var obra = obraPorId(S.obraId), box = $('p-gps'); if (!box || !obra) return;
  var c = situacaoCerca(obra, S.gps);
  if (!c.tem || c.semGps) return;
  box.className = 'gps ' + (c.dentro ? 'ok' : 'fora');
  box.textContent = (c.dentro ? '✅ Você está na obra' : '⚠️ Você está fora da obra') + ' (' + c.dist + ' m, precisão ±' + S.gps.precisao + ' m)';
}

function baterPonto(tipo) {
  var obra = obraPorId(S.obraId);
  if (!obra) return aviso('Escolha a obra.', 'err');
  var ms = Date.now(), justificativa = '';
  aviso('Pegando sua localização...');
  pegarGps().then(function (gps) {
    var c = situacaoCerca(obra, gps);
    if (c.tem && !gps) {
      justificativa = prompt('Não consegui a sua localização (GPS desligado?).\nEscreva o motivo para registrar mesmo assim, ou cancele e ative o GPS:');
      if (!justificativa) throw new Error('cancelado');
    } else if (c.tem && !c.dentro) {
      justificativa = prompt('Você está a ' + c.dist + ' m da obra (fora da cerca de ' + obra.raio + ' m).\nO ponto só vale dentro da obra. Se precisa registrar mesmo assim, escreva o motivo (o escritório vai conferir):');
      if (!justificativa) throw new Error('cancelado');
    }
    if (!confirm(TIPOS[tipo] + ' às ' + hhmm(ms) + '\n' + obraNome(obra) + '\n\nAgora tire uma foto do seu rosto.')) throw new Error('cancelado');
    return tirarFoto('cam').then(function (arqs) {
      if (!arqs.length) throw new Error('A foto é obrigatória para bater o ponto.');
      return lerFoto(arqs[0], 480, 0.6);
    }).then(function (foto) {
      return DB.get('relogio').then(function (dif) {
        return enfileirar({ tipo: 'batida', tipoBatida: tipo, projetoId: obra.id, ms: ms, lat: gps ? gps.lat : '', lng: gps ? gps.lng : '', precisao: gps ? gps.precisao : '',
          foto: foto, justificativa: justificativa || '', dispositivo: 'app ' + VERSAO + ' | dif relógio ' + Math.round((dif || 0) / 1000) + 's | ' + navigator.userAgent.slice(0, 60),
          resumo: TIPOS[tipo] + ' ' + hhmm(ms) + ' – ' + obra.titulo });
      });
    }).then(function () { aviso(TIPOS[tipo] + ' registrada às ' + hhmm(ms) + (navigator.onLine ? '' : ' (será enviada quando tiver internet)'), 'ok'); });
  }).catch(function (e) { if (e.message !== 'cancelado') aviso(e.message, 'err'); else $('aviso').style.display = 'none'; });
}

function definirLocalObra() {
  var obra = obraPorId(S.obraId);
  aviso('Pegando sua localização...');
  pegarGps().then(function (g) {
    if (!g) return aviso('Sem localização. Ative o GPS.', 'err');
    if (g.precisao > 60) aviso('Precisão baixa (±' + g.precisao + ' m). Se puder, vá para céu aberto e tente de novo.', 'err');
    var raio = prompt('Definir o local de "' + obra.titulo + '" na sua posição atual.\nRaio da cerca em metros:', String(obra.raio || 300));
    if (!raio) return;
    obra.lat = g.lat; obra.lng = g.lng; obra.raio = Number(raio) || 300;
    DB.set('dados', S.dados);
    return enfileirar({ tipo: 'localObra', projetoId: obra.id, lat: g.lat, lng: g.lng, raio: obra.raio, resumo: 'Local da obra ' + obra.titulo });
  });
}

// ---------------- ESPELHO DE PONTO ----------------
function mesAtual() { return dataIso(Date.now()).slice(0, 7); }
function hm(h) { h = Number(h) || 0; if (!h) return '—'; var m = Math.round(h * 60); return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
function baixarEspelho(mes) {
  return api('espelho', { mes: mes }).then(function (e) { return DB.set('esp_' + mes, e).then(function () { if (S.tela === 'espelho' && (S.espMes || mesAtual()) === mes) { S.esp = e; render(); } }); });
}
function telaEspelho() {
  var mes = S.espMes || mesAtual();
  var e = S.esp && S.esp.mes === mes ? S.esp : null;
  var html = '<button class="btn lar" id="es-aj" style="margin-bottom:12px">✏️ Solicitar ajuste de ponto</button>' + htmlMeusAjustes() + '<div class="card"><h2>Meu espelho de ponto</h2><div class="row"><input type="month" id="es-mes" min="' + ESP_INICIO + '" value="' + mes + '"><button class="btn sec" id="es-at" style="flex:0 0 auto;width:auto">🔄</button></div>' +
    '<p class="muted" id="es-info">' + (e ? 'Atualizado em ' + new Date(e.geradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (navigator.onLine ? '' : ' (sem internet: mostrando o último salvo)') : 'Carregando...') + '</p></div>';
  if (e) {
    var t = e.totais || {};
    html += '<div class="card"><div class="grade" style="font-size:14px">' +
      '<div><b>' + (t.diasTrabalhados || 0) + '</b><br><span class="muted">dias trabalhados</span></div>' +
      '<div><b>' + hm(t.horasTrabalhadas) + '</b><br><span class="muted">horas no mês</span></div>' +
      '<div><b>' + hm(t.horasNormais) + '</b><br><span class="muted">normais</span></div>' +
      '<div><b>' + hm((t.horasExtra50 || 0) + (t.horasExtra100 || 0)) + '</b><br><span class="muted">extras (50% ' + hm(t.horasExtra50) + ' · 100% ' + hm(t.horasExtra100) + ')</span></div>' +
      '<div><b>' + hm(t.horasNoturnas) + '</b><br><span class="muted">noturnas</span></div>' +
      '<div><b>' + ((t.faltas || 0) + (t.faltasJustificadas || 0)) + '</b><br><span class="muted">faltas/ausências</span></div></div></div>';
    html += '<div class="card"><ul class="lista">' + e.dias.filter(function (d) { return d.situacao || d.ht; }).map(function (d) {
      var per = [];
      for (var k = 0; k < 6; k += 2) if (d.p[k]) per.push(d.p[k] + '–' + d.p[k + 1]);
      var trab = d.situacao === 'Trabalhado' || d.ht;
      return '<li data-dia="' + d.data + '" style="cursor:pointer"><span><b>' + d.data.slice(8, 10) + '/' + d.data.slice(5, 7) + ' ' + d.dia + '</b><br><span class="muted">' + (trab ? per.join(' · ') : esc(d.situacao)) + (d.obras ? '<br>' + esc(d.obras) : '') + '</span></span>' +
        '<span style="text-align:right">' + (trab ? '<b>' + hm(d.ht) + '</b>' + (d.h50 || d.h100 ? '<br><span class="muted">HE ' + hm(d.h50 + d.h100) + '</span>' : '') : '<span class="tag">' + esc(d.situacao) + '</span>') +
        (d.origem ? '<br><span class="tag ' + (d.origem === 'App' ? 'ok' : '') + '">' + (d.origem === 'App' ? 'ponto' : d.origem) + '</span>' : '') + '</span></li>';
    }).join('') + '</ul>' + (e.dias.some(function (d) { return d.situacao || d.ht; }) ? '' : '<p class="muted">Nenhum dia registrado neste mês.</p>') +
      '<p class="muted">O espelho é atualizado sozinho a cada ponto ou RDO enviado. Dúvidas ou correções: fale com o escritório.</p></div>';
  }
  $('tela').innerHTML = html;
  $('es-aj').onclick = function () { abrirAjuste(dataIso(Date.now())); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-dia]'), function (li) { li.onclick = function () { abrirAjuste(li.dataset.dia); }; });
  $('es-mes').onchange = function () { var v = this.value || mesAtual(); if (v < ESP_INICIO) { aviso('O espelho só pode ser consultado a partir de 11/2026.', 'err'); v = ESP_INICIO; } S.espMes = v; S.esp = null; render(); };
  $('es-at').onclick = function () { if (!navigator.onLine) return aviso('Sem internet agora.', 'err'); $('es-info').textContent = 'Atualizando...'; baixarEspelho(mes).catch(function (er) { aviso(er.message, 'err'); render(); }); };
  if (!e) {
    DB.get('esp_' + mes).then(function (c) {
      if (c) { S.esp = c; render(); }
      if (navigator.onLine) baixarEspelho(mes).catch(function (er) { if (!c) $('es-info').textContent = 'Não consegui carregar: ' + er.message; });
      else if (!c) $('es-info').textContent = 'Sem internet e sem espelho salvo deste mês.';
    });
  }
}

// ---------------- SOLICITAÇÃO DE AJUSTE ----------------
function htmlMeusAjustes() {
  var lista = ((S.dados && S.dados.ajustes) || []).slice(0, 8);
  S.fila.forEach(function (i) { if (i.tipo === 'ajuste') lista.unshift({ data: i.ajuste.data, tipo: i.ajuste.tipo, status: i.erro ? 'Erro no envio' : 'Aguardando envio', resposta: i.erro || '' }); });
  if (!lista.length) return '';
  return '<div class="card"><h2>Minhas solicitações</h2><ul class="lista">' + lista.map(function (a) {
    var cls = a.status === 'Aprovado' ? 'ok' : (a.status === 'Recusado' || a.status === 'Erro no envio') ? 'err' : 'pend';
    return '<li><span><b>' + dataBr(a.data) + '</b> ' + esc(a.tipo) + (a.resposta ? '<br><span class="muted">' + esc(a.resposta) + '</span>' : '') + '</span><span class="tag ' + cls + '">' + esc(a.status) + '</span></li>';
  }).join('') + '</ul></div>';
}
function abrirAjuste(data) {
  var dia = S.esp && S.esp.dias ? S.esp.dias.filter(function (d) { return d.data === data; })[0] : null;
  S.aj = { data: data, tipo: dia && (dia.situacao || dia.ht) ? TIPOS_AJUSTE[0] : TIPOS_AJUSTE[1], situacao: 'Trabalhado', p: dia ? dia.p.slice() : ['', '', '', '', '', ''], motivo: '', foto: '' };
  S.tela = 'ajuste'; render(); window.scrollTo(0, 0);
}
function telaAjuste() {
  var a = S.aj || (S.aj = { data: dataIso(Date.now()), tipo: TIPOS_AJUSTE[0], situacao: 'Trabalhado', p: ['', '', '', '', '', ''], motivo: '', foto: '' });
  var falta = a.tipo === TIPOS_AJUSTE[2];
  var html = '<div class="card"><h2>Solicitar ajuste de ponto</h2>' +
    '<label>Dia</label><input type="date" id="aj-data" min="' + ESP_INICIO + '-01" value="' + a.data + '">' +
    '<label>O que aconteceu?</label><select id="aj-tipo">' + TIPOS_AJUSTE.map(function (t) { return '<option' + (t === a.tipo ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
    (falta ? '<label>Situação</label><select id="aj-sit">' + ['Falta justificada', 'Atestado', 'Folga', 'Férias', 'Afastado'].map(function (t) { return '<option' + (t === a.situacao ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>'
      : '<label>Horários corretos do dia</label><div class="mdo"><div class="horas">' +
        [['Entrada', 0], ['Saída', 1], ['Volta', 2], ['Saída', 3]].map(function (c) { return '<div><label>' + c[0] + '</label><input type="time" class="aj-h" data-k="' + c[1] + '" value="' + (a.p[c[1]] || '') + '"></div>'; }).join('') + '</div></div>') +
    '<label>Motivo (obrigatório)</label><textarea id="aj-mot" placeholder="Ex.: esqueci de bater a saída, saí às 17:00">' + esc(a.motivo) + '</textarea>' +
    '<label>Anexo (atestado, comprovante) — opcional</label><button class="btn sec" id="aj-foto">' + (a.foto ? '✅ Anexo adicionado (trocar)' : '📎 Adicionar foto') + '</button>' +
    '<div style="height:14px"></div><button class="btn lar" id="aj-env">Enviar solicitação</button><div style="height:8px"></div><button class="btn sec" id="aj-cancel">Cancelar</button>' +
    '<p class="muted">O escritório vai analisar. Você acompanha a resposta aqui na aba Espelho.</p></div>';
  $('tela').innerHTML = html;
  var ler = function () {
    a.data = $('aj-data').value; a.tipo = $('aj-tipo').value; a.motivo = $('aj-mot').value;
    if ($('aj-sit')) a.situacao = $('aj-sit').value; else a.situacao = 'Trabalhado';
    Array.prototype.forEach.call(document.querySelectorAll('.aj-h'), function (i) { a.p[Number(i.dataset.k)] = i.value; });
  };
  $('aj-tipo').onchange = function () { ler(); if (a.tipo === TIPOS_AJUSTE[2]) a.situacao = 'Falta justificada'; render(); };
  $('aj-foto').onclick = function () { ler(); tirarFoto('galeria').then(function (f) { return f.length ? lerFoto(f[0], 1280, 0.6) : ''; }).then(function (x) { if (x) a.foto = x; render(); }); };
  $('aj-cancel').onclick = function () { S.aj = null; S.tela = 'espelho'; render(); };
  $('aj-env').onclick = function () {
    ler();
    if (!a.data) return aviso('Informe o dia.', 'err');
    if (a.data < ESP_INICIO + '-01') return aviso('Ajustes só a partir de 01/11/2026.', 'err');
    if (a.motivo.trim().length < 5) return aviso('Explique o motivo.', 'err');
    var p = a.tipo === TIPOS_AJUSTE[2] ? ['', '', '', '', '', ''] : a.p;
    if (a.tipo !== TIPOS_AJUSTE[2] && (!p[0] || !p[1])) return aviso('Informe ao menos a entrada e a saída.', 'err');
    if ((p[2] && !p[3]) || (!p[2] && p[3])) return aviso('Preencha a volta e a saída do 2º período.', 'err');
    enfileirar({ tipo: 'ajuste', ajuste: { data: a.data, tipo: a.tipo, situacao: a.tipo === TIPOS_AJUSTE[2] ? a.situacao : 'Trabalhado', p: p, motivo: a.motivo.trim(), foto: a.foto || '' },
      resumo: 'Ajuste de ponto ' + dataBr(a.data) })
      .then(function () { S.aj = null; S.tela = 'espelho'; render(); aviso('Solicitação ' + (navigator.onLine ? 'enviada.' : 'salva. Será enviada quando tiver internet.'), 'ok'); });
  };
}

// ---------------- RDO ----------------
function horariosPeloPonto(funcionarioId, projetoId, iso) {
  var todas = ((S.dados && S.dados.batidasEquipe) || []).slice();
  S.fila.forEach(function (i) { if (i.tipo === 'batida') todas.push({ funcionarioId: S.sessao.funcionario.id, projetoId: i.projetoId, tipo: i.tipoBatida, ms: i.ms }); });
  var ini = new Date(iso + 'T00:00:00').getTime();
  var m = todas.filter(function (b) { return b.funcionarioId === funcionarioId && b.projetoId === projetoId && b.ms >= ini && b.ms < ini + 30 * 3600000; })
    .sort(function (a, b) { return a.ms - b.ms; });
  var e = m.findIndex(function (b) { return b.tipo === 'ENTRADA' && dataIso(b.ms) === iso; });
  if (e < 0) return null;
  var j = [m[e]];
  for (var k = e + 1; k < m.length && j.length < 4; k++) { if (m[k].tipo === 'ENTRADA') break; j.push(m[k]); if (m[k].tipo === 'SAIDA') break; }
  var h = j.map(function (b) { return hhmm(b.ms); });
  if (h.length === 2) return { entrada1: h[0], saida1: h[1], entrada2: '', saida2: '' };
  if (h.length >= 4) return { entrada1: h[0], saida1: h[1], entrada2: h[2], saida2: h[3] };
  return { entrada1: h[0], saida1: h[1] || '', entrada2: h[2] || '', saida2: '' };
}

function telaRdo() {
  var obras = (S.dados && S.dados.obras) || [], funcs = (S.dados && S.dados.funcionarios) || [], r = S.rdo;
  if (!r) r = S.rdo = { projetoId: S.obraId || (obras[0] && obras[0].id), data: dataIso(Date.now()), clima: 'Bom', ehFeriado: false, atividades: '', ocorrencias: '', equipe: [] };
  var opF = function (sel) { return '<option value="">— funcionário —</option>' + funcs.map(function (f) { return '<option value="' + f.id + '"' + (f.id === sel ? ' selected' : '') + '>' + esc(f.nome) + '</option>'; }).join(''); };
  var html = '<div class="card"><h2>Novo RDO / Diário de obra</h2>' +
    '<label>Obra</label><select id="r-obra">' + obras.map(function (o) { return '<option value="' + o.id + '"' + (o.id === r.projetoId ? ' selected' : '') + '>' + esc(obraNome(o)) + '</option>'; }).join('') + '</select>' +
    '<div class="row"><div><label>Data</label><input type="date" id="r-data" value="' + r.data + '"></div><div><label>Clima</label><select id="r-clima">' +
    ((S.dados && S.dados.climas) || ['Bom']).map(function (c) { return '<option' + (c === r.clima ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div></div>' +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--texto)"><input type="checkbox" id="r-fer" style="width:auto"' + (r.ehFeriado ? ' checked' : '') + '> É feriado (hora extra 100%)</label>' +
    '<label>Atividades do dia</label><textarea id="r-ativ" placeholder="O que foi feito hoje">' + esc(r.atividades) + '</textarea>' +
    '<label>Ocorrências</label><textarea id="r-ocor" placeholder="Paradas, problemas, observações">' + esc(r.ocorrencias) + '</textarea>' +
    '<label>Fotos (' + S.rdoFotos.length + ')</label><button class="btn sec" id="r-foto">📷 Adicionar fotos</button><div class="fotos">' +
    S.rdoFotos.map(function (f, i) { return '<img src="' + f + '" data-i="' + i + '" title="tocar para remover">'; }).join('') + '</div></div>' +
    '<div class="card"><h2>Equipe e horários</h2><button class="btn sec" id="r-ponto">⏱️ Preencher pelo ponto batido</button>' +
    '<div id="r-equipe">' + r.equipe.map(function (m, i) {
      return '<div class="mdo"><div class="row"><select data-i="' + i + '" class="r-func">' + opF(m.funcionarioId) + '</select><button class="btn sec" style="flex:0 0 auto;width:auto" data-rm="' + i + '">✕</button></div><div class="horas">' +
        [['entrada1', 'Entrada'], ['saida1', 'Saída'], ['entrada2', 'Volta'], ['saida2', 'Saída']].map(function (c) {
          return '<div><label>' + c[1] + '</label><input type="time" data-i="' + i + '" data-c="' + c[0] + '" value="' + (m[c[0]] || '') + '"></div>';
        }).join('') + '</div></div>';
    }).join('') + '</div><div style="height:10px"></div><button class="btn sec" id="r-add">+ Adicionar funcionário</button></div>' +
    '<button class="btn lar" id="r-salvar">Salvar RDO</button><p class="muted">Sem internet o RDO fica guardado e é enviado depois. O número do RDO é dado pelo sistema no envio.</p>';
  $('tela').innerHTML = html;
  var ler = function () {
    r.projetoId = $('r-obra').value; r.data = $('r-data').value; r.clima = $('r-clima').value; r.ehFeriado = $('r-fer').checked;
    r.atividades = $('r-ativ').value; r.ocorrencias = $('r-ocor').value;
    Array.prototype.forEach.call(document.querySelectorAll('.r-func'), function (s) { r.equipe[s.dataset.i].funcionarioId = s.value; });
    Array.prototype.forEach.call(document.querySelectorAll('#r-equipe input[type=time]'), function (inp) { r.equipe[inp.dataset.i][inp.dataset.c] = inp.value; });
  };
  $('r-add').onclick = function () { ler(); r.equipe.push({ funcionarioId: '', entrada1: '', saida1: '', entrada2: '', saida2: '' }); render(); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-rm]'), function (b) { b.onclick = function () { ler(); r.equipe.splice(Number(b.dataset.rm), 1); render(); }; });
  Array.prototype.forEach.call(document.querySelectorAll('.fotos img'), function (im) { im.onclick = function () { if (confirm('Remover esta foto?')) { ler(); S.rdoFotos.splice(Number(im.dataset.i), 1); render(); } }; });
  $('r-foto').onclick = function () {
    ler();
    tirarFoto('galeria').then(function (arqs) {
      return Promise.all(arqs.slice(0, 10 - S.rdoFotos.length).map(function (a) { return lerFoto(a, 1280, 0.6); }));
    }).then(function (fs) { S.rdoFotos = S.rdoFotos.concat(fs); render(); }).catch(function (e) { aviso(e.message, 'err'); });
  };
  $('r-ponto').onclick = function () {
    ler();
    var achou = 0;
    funcs.forEach(function (f) {
      var h = horariosPeloPonto(f.id, r.projetoId, r.data);
      if (!h) return;
      achou++;
      var ex = r.equipe.filter(function (m) { return m.funcionarioId === f.id; })[0];
      if (ex) Object.assign(ex, h); else r.equipe.push(Object.assign({ funcionarioId: f.id }, h));
    });
    aviso(achou ? achou + ' funcionário(s) preenchido(s) pelo ponto.' : 'Ninguém bateu ponto nessa obra nesse dia (ou ainda não sincronizou).', achou ? 'ok' : 'err');
    render();
  };
  $('r-salvar').onclick = function () {
    ler();
    var equipe = r.equipe.filter(function (m) { return m.funcionarioId && m.entrada1 && m.saida1; });
    if (!r.data) return aviso('Informe a data.', 'err');
    if (!equipe.length && !r.atividades.trim()) return aviso('Informe as atividades ou a equipe com horários.', 'err');
    var obra = obraPorId(r.projetoId);
    if (!confirm('Salvar o RDO de ' + dataBr(r.data) + '\n' + obraNome(obra) + '\n' + equipe.length + ' funcionário(s), ' + S.rdoFotos.length + ' foto(s)?')) return;
    enfileirar({ tipo: 'rdo', rdo: { projetoId: r.projetoId, data: r.data, clima: r.clima, ehFeriado: r.ehFeriado, efetivo: equipe.length + ' funcionário(s)',
      atividades: r.atividades.trim(), ocorrencias: r.ocorrencias.trim(), fotos: S.rdoFotos.slice(), maoDeObra: equipe }, resumo: 'RDO ' + dataBr(r.data) + ' – ' + obra.titulo })
      .then(function () { S.rdo = null; S.rdoFotos = []; S.tela = 'envios'; render(); aviso('RDO salvo' + (navigator.onLine ? '.' : ' no celular. Será enviado quando tiver internet.'), 'ok'); });
  };
}

function telaEnvios() {
  var html = '<div class="card"><h2>Aguardando envio (' + S.fila.length + ')</h2><ul class="lista">' +
    (S.fila.length ? S.fila.map(function (i) {
      return '<li><span>' + esc(i.resumo || i.tipo) + '<br><span class="muted">' + new Date(i.criado).toLocaleString('pt-BR') + '</span>' +
        (i.erro ? '<br><span style="color:var(--erro);font-size:13px">' + esc(i.erro) + '</span>' : '') + '</span>' +
        '<span>' + (i.erro ? '<span class="tag err">erro</span><br><button class="btn sec" style="padding:6px 8px;margin-top:4px;font-size:12px" data-desc="' + i.uid + '">descartar</button>' : '<span class="tag pend">pendente</span>') + '</span></li>';
    }).join('') : '<li class="muted">Tudo enviado. 👍</li>') + '</ul><div style="height:10px"></div><button class="btn" id="e-sync"' + (S.sincronizando ? ' disabled' : '') + '>' + (S.sincronizando ? 'Enviando...' : '🔄 Enviar agora') + '</button></div>' +
    '<div class="card"><h2>Enviados recentemente</h2><ul class="lista">' +
    (S.historico.length ? S.historico.slice(0, 20).map(function (h) { return '<li><span>' + esc(h.txt) + '</span><span class="muted">' + new Date(h.ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</span></li>'; }).join('') : '<li class="muted">Nada ainda.</li>') + '</ul></div>';
  $('tela').innerHTML = html;
  $('e-sync').onclick = function () { sincronizar(true); render(); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-desc]'), function (b) {
    b.onclick = function () { if (confirm('Descartar este item? Ele NÃO será enviado.')) DB.filaDel(b.dataset.desc).then(carregarFila).then(render); };
  });
}

function telaConta() {
  $('tela').innerHTML = '<div class="card"><h2>' + esc(S.sessao.funcionario.nome) + '</h2>' +
    '<p class="muted">Permissões: ponto' + (S.dados && S.dados.podeRdo ? ', RDO' : '') + (S.dados && S.dados.gestor ? ', gestor' : '') + '</p>' +
    '<p class="muted">Pendentes no celular: ' + S.fila.length + '</p>' +
    '<button class="btn sec" id="c-atual">⬇️ Atualizar obras e dados</button><div style="height:10px"></div>' +
    '<button class="btn sec" id="c-sair">Sair desta conta</button>' +
    '<p class="muted" style="margin-top:14px">DNP Campo v' + VERSAO + '</p></div>';
  $('c-atual').onclick = function () { sincronizar(true); };
  $('c-sair').onclick = function () {
    if (S.fila.length && !confirm('Ainda há ' + S.fila.length + ' item(ns) não enviados. Eles ficam guardados neste celular e serão enviados quando você entrar de novo. Sair?')) return;
    sair(false);
  };
}

function sair(soLocal) {
  var p = (!soLocal && navigator.onLine && S.sessao) ? api('sair').catch(function () {}) : Promise.resolve();
  return p.then(function () { S.sessao = null; S.dados = null; return Promise.all([DB.del('sessao'), DB.del('dados')]); }).then(render);
}

// ---------------- início ----------------
Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) {
  b.onclick = function () { S.tela = b.dataset.t; render(); window.scrollTo(0, 0); };
});
window.addEventListener('online', function () { atualizarRede(); sincronizar(false); });
window.addEventListener('offline', atualizarRede);
document.addEventListener('visibilitychange', function () { if (!document.hidden) sincronizar(false); });
setInterval(function () { var r = $('relogio'); if (r) r.firstChild.nodeValue = hhmm(Date.now()); }, 15000);
setInterval(function () { if (!document.hidden) sincronizar(false); }, 120000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
atualizarRede();
Promise.all([DB.get('sessao'), DB.get('dados'), DB.get('historico'), carregarFila()]).then(function (r) {
  S.sessao = r[0] || null; S.dados = r[1] || null; S.historico = r[2] || [];
  render();
  if (S.sessao) sincronizar(false);
}).catch(function (e) { $('tela').innerHTML = '<div class="card">Erro ao abrir o armazenamento do celular: ' + esc(e.message) + '</div>'; });
