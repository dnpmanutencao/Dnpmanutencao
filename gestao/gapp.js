/* DNP Gestão — o sistema da DNP no celular (sócios e gestores). Login com e-mail e senha do sistema.
   Cadastros feitos sem internet ficam no aparelho e são enviados depois. */
'use strict';
var APP_GESTAO = true;

var API_URL = 'https://script.google.com/macros/s/AKfycbwlOXiIzS4mSxtW_xriuBU3rhlDIqp4fPvYOD7_o82ctZgL4AIuUVuXfIokqmQ67DiJ/exec';
var VERSAO = '1.6.2';
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
      var r = indexedDB.open('dnp-gestao', 1);
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
var S = { sessao: null, dados: null, fila: [], tela: 'gestao', obraId: null, gps: null, sincronizando: false, rdoFotos: [], historico: [] };

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

// ---------------- sistema completo (tela principal do app) ----------------
var SIS = { carregado: false, pedindo: false };
function sisMostrar(ver) {
  var d = $('sis');
  if (!d) {
    d = document.createElement('div'); d.id = 'sis';
    d.style.cssText = 'position:fixed;left:0;right:0;z-index:4;background:#0E1A2E;display:none';
    d.innerHTML = '<div id="sis-msg" style="color:#fff;padding:20px;text-align:center">Abrindo o sistema...</div><iframe id="sis-if" style="width:100%;height:100%;border:0;background:#fff;display:none"></iframe>';
    document.body.appendChild(d);
  }
  var h = document.querySelector('header'), n = $('nav');
  d.style.top = (h ? h.offsetHeight : 0) + 'px'; d.style.bottom = (n ? n.offsetHeight : 0) + 'px';
  d.style.display = ver ? 'block' : 'none';
  if (!ver || SIS.carregado || SIS.pedindo || !S.sessao) return;
  if (!navigator.onLine) { $('sis-msg').textContent = 'Sem internet. Use Inspeções (funciona sem sinal) e volte aqui quando tiver conexão.'; return; }
  SIS.pedindo = true; $('sis-msg').textContent = 'Abrindo o sistema...';
  api('sistemaLink').then(function (r) {
    var f = $('sis-if'); f.src = r.url; f.style.display = 'block'; $('sis-msg').style.display = 'none'; SIS.carregado = true;
  }).catch(function (e) { $('sis-msg').textContent = 'Não consegui abrir o sistema: ' + e.message; if (String(e.message).indexOf('SESSAO') === 0) sair(true); })
    .then(function () { SIS.pedindo = false; });
}
window.addEventListener('resize', function () { if (S.tela === 'sistema') sisMostrar(true); });

// ---------------- telas ----------------
function render() {
  if (!S.sessao) { if ($('sis')) $('sis').style.display = 'none'; return telaLogin(); }
  $('nav').classList.remove('hidden');
  $('quem').textContent = S.sessao.funcionario.nome;
  var ativo = S.tela === 'gestao' ? (/^insp/.test(G.view || '') ? 'insps' : 'auto') : S.tela;
  Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) { b.classList.toggle('ativo', b.dataset.t === ativo); });
  sisMostrar(S.tela === 'sistema');
  if (S.tela === 'sistema') { $('tela').innerHTML = ''; return; }
  if (S.tela === 'envios') return telaEnvios();
  if (S.tela === 'conta') return telaConta();
  S.tela = 'gestao';
  if (!S.dados) { $('tela').innerHTML = '<div class="card">Carregando seus dados...</div>'; return; }
  return telaGestao();
}

function telaLogin() {
  $('nav').classList.add('hidden'); $('quem').textContent = '';
  $('tela').innerHTML = '<div class="card"><h2>Entrar</h2><p class="muted">Use o mesmo e-mail e senha do Sistema de Gestão da DNP.</p>' +
    '<label>E-mail</label><input id="l-email" type="email" inputmode="email" autocomplete="username" placeholder="seu@email.com">' +
    '<label>Senha</label><input id="l-senha" type="password" autocomplete="current-password">' +
    '<div style="height:14px"></div><button class="btn lar" id="l-ok">Entrar</button>' +
    '<p class="muted" style="margin-top:12px">Precisa de internet para entrar. Depois, cadastros como orçamentos e inspeções funcionam sem sinal.</p></div>';
  var entrar = function () {
    var b = $('l-ok'); b.disabled = true; b.textContent = 'Entrando...';
    if (!navigator.onLine) { aviso('Para entrar é preciso internet.', 'err'); b.disabled = false; b.textContent = 'Entrar'; return; }
    api('gLogin', { email: $('l-email').value.trim(), senha: $('l-senha').value }).then(function (r) {
      S.sessao = { token: r.token, funcionario: { id: '', nome: r.usuario.nome }, email: r.usuario.email };
      return DB.set('sessao', S.sessao);
    }).then(function () { return baixarDados(); }).then(function () {
      S.tela = 'gestao'; G.view = 'auto'; render(); aviso('Bem-vindo, ' + S.sessao.funcionario.nome.split(' ')[0] + '!', 'ok');
    }).catch(function (e) { aviso(e.message, 'err'); b.disabled = false; b.textContent = 'Entrar'; });
  };
  $('l-ok').onclick = entrar;
  $('l-senha').onkeydown = function (e) { if (e.key === 'Enter') entrar(); };
}

function baixarDados() {
  return api('baixar').then(function (d) { d.sistema = d.sistema || {}; d.sistema.socio = false; S.dados = d; return DB.set('dados', d); });
}

function telaConta() {
  var p = (S.dados && S.dados.sistema && S.dados.sistema.permissoes) || {};
  var mods = Object.keys(p).filter(function (k) { return p[k] && p[k].ver; });
  $('tela').innerHTML = '<div class="card"><h2>' + esc(S.sessao.funcionario.nome) + '</h2>' +
    '<p class="muted">' + esc(S.sessao.email || '') + '</p>' +
    '<p class="muted">Módulos liberados: ' + (mods.length ? esc(mods.join(', ')) : '—') + '</p>' +
    '<p class="muted">Pendentes no celular: ' + S.fila.length + '</p>' +
    '<button class="btn sec" id="c-atual">⬇️ Atualizar dados</button><div style="height:10px"></div>' +
    '<button class="btn sec" id="c-sair">Sair desta conta</button>' +
    '<p class="muted" style="margin-top:14px">DNP Gestão v' + VERSAO + '</p></div>';
  $('c-atual').onclick = function () { if (!navigator.onLine) return aviso('Sem internet agora.', 'err'); aviso('Atualizando...'); baixarDados().then(function () { G.cat = null; aviso('Dados atualizados.', 'ok'); render(); }).catch(function (e) { aviso(e.message, 'err'); }); };
  $('c-sair').onclick = function () {
    if (S.fila.length && !confirm('Ainda há ' + S.fila.length + ' item(ns) não enviados. Eles ficam guardados neste celular. Sair?')) return;
    sair(false);
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

function sair(soLocal) {
  var p = (!soLocal && navigator.onLine && S.sessao) ? sys('logout').catch(function () {}) : Promise.resolve();
  SIS.carregado = false; var f = $('sis-if'); if (f) { f.src = 'about:blank'; f.style.display = 'none'; }
  return p.then(function () { S.sessao = null; S.dados = null; S.tela = 'gestao'; G.view = 'auto'; return Promise.all([DB.del('sessao'), DB.del('dados')]); }).then(render);
}

// ---------------- início ----------------
Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) {
  b.onclick = function () {
    var t = b.dataset.t;
    if (t === 'envios' || t === 'conta' || t === 'sistema') { S.tela = t; render(); }
    else gIr(t);
    window.scrollTo(0, 0);
  };
});
window.addEventListener('online', function () { atualizarRede(); sincronizar(false); });
window.addEventListener('offline', atualizarRede);
document.addEventListener('visibilitychange', function () { if (!document.hidden) sincronizar(false); });
setInterval(function () { if (!document.hidden) sincronizar(false); }, 120000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
atualizarRede();
// entrada direta vinda do sistema web (código de uso único, sem pedir senha)
var _linkSis = (location.hash.match(/[#&]c=([\w-]+)/) || [])[1], _irPara = (location.hash.match(/[#&]ir=(\w+)/) || [])[1];
if (_linkSis) history.replaceState(null, '', location.pathname);
Promise.all([DB.get('sessao'), DB.get('dados'), DB.get('historico'), carregarFila()]).then(function (r) {
  S.sessao = r[0] || null; S.dados = r[1] || null; S.historico = r[2] || [];
  if (_linkSis) {
    $('tela').innerHTML = '<div class="card muted">Entrando pelo sistema...</div>';
    return api('gCodigo', { codigo: _linkSis }).then(function (u) {
      S.sessao = { token: u.token, funcionario: { id: '', nome: u.nome }, email: u.email };
      return DB.set('sessao', S.sessao);
    }).then(baixarDados).then(function () {
      if (_irPara === 'fluxo') { S.tela = 'gestao'; G.view = 'tFluxo'; }
      render();
    }).catch(function (e) { aviso(e.message, 'err'); render(); });
  }
  if (_irPara === 'fluxo' && S.sessao) { S.tela = 'gestao'; G.view = 'tFluxo'; }
  render();
  if (S.sessao) { if (navigator.onLine) baixarDados().then(render).catch(function (e) { if (String(e.message).indexOf('SESSAO') === 0) sair(true); }); sincronizar(false); }
}).catch(function (e) { $('tela').innerHTML = '<div class="card">Erro ao abrir o armazenamento do celular: ' + esc(e.message) + '</div>'; });
