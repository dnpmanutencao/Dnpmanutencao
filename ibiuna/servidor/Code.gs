/* =====================================================================
   Pedreira Ibiúna · Gestão Operacional — servidor (Google Apps Script)
   Guarda usuários e lançamentos na planilha, confere login por matrícula
   e as permissões de cada papel, e registra a auditoria.
   Implantar: Implantar → Nova implantação → App da Web →
              Executar como: Eu · Quem pode acessar: Qualquer pessoa
   ===================================================================== */

var PLANILHA_ID = '1NHNEGeY76vJNLQOX-1Dbi2nDp1X_ENwLIzt7HnvMaUo';
var VALIDADE_SESSAO_DIAS = 30;
var ITERACOES_HASH = 300;
var ABA_USUARIOS = 'Usuarios';
var ABA_AUDITORIA = 'Auditoria';
var CAB_USUARIOS = ['id', 'matricula', 'nome', 'papeis', 'admin', 'ativo', 'trocar_senha', 'salt', 'hash', 'criado_em'];
var PAPEIS = ['manutencao', 'almoxarife', 'compras', 'supervisor', 'gerente'];

// Coleções do app → colunas "legíveis" copiadas do JSON (só para consulta na planilha).
var COLECOES = {
  viagens: ['data', 'turno', 'frota', 'viagens', 'peso', 'horIni', 'horFim', 'obs'],
  britagem: ['data', 'turno', 'horIni', 'horFim', 'horasProg', 'paradas', 'obs'],
  manutencao: ['data', 'equip', 'area', 'natureza', 'status', 'horas', 'custoPecas', 'desc'],
  ativos: ['tag', 'nome', 'categoria', 'local', 'criticidade', 'status', 'horFonte', 'hor'],
  pecas: ['codigo', 'descricao', 'unidade', 'categoria', 'estoqueMin', 'estoqueMax', 'custoUnit', 'localizacao'],
  movimentos: ['data', 'pecaId', 'tipo', 'qtd', 'custoUnit', 'ref', 'obs'],
  requisicoes: ['numero', 'data', 'status', 'urgencia', 'ativoNome', 'valorEst', 'valorFinal', 'fornecedor', 'justificativa'],
  planos: ['nome', 'ativoId', 'area', 'tipo', 'intervalo', 'ultima'],
  rotinas: ['nome', 'ativoId', 'freq', 'local'],
  inspecoes: ['data', 'rotinaNome', 'nok', 'obs'],
  metas: ['metaMensal', 'diasProgramados'],
  cfg: []
};
var CAB_FIXO = ['id', 'json', 'atualizado_em', 'atualizado_por'];

/* ---------------- entrada HTTP ---------------- */
function doGet() { return saida({ ok: true, app: 'ibiuna', hora: new Date().toISOString() }); }
function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return saida({ ok: false, erro: 'Requisição inválida.', codigo: 'erro' }); }
  try { return saida({ ok: true, r: rotear(req) }); }
  catch (err) { return saida({ ok: false, erro: String(err && err.message || err), codigo: (err && err.codigo) || 'erro' }); }
}
function saida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function falha(msg, codigo) { var e = new Error(msg); e.codigo = codigo || 'erro'; throw e; }

function rotear(q) {
  var a = q.a;
  if (a === 'ping') return { hora: new Date().toISOString() };
  if (a === 'haUsuarios') return lerUsuarios().length > 0;
  if (a === 'primeiroAdmin') return primeiroAdmin(q);
  if (a === 'login') return login(q);
  var u = sessao(q.t);
  switch (a) {
    case 'eu': return perfilPublico(u);
    case 'trocarSenha': return trocarSenha(u, q);
    case 'usuarios': return lerUsuarios().map(perfilPublico);
    case 'criarUsuario': return criarUsuario(u, q);
    case 'atualizarUsuario': return atualizarUsuario(u, q);
    case 'definirSenha': return definirSenha(u, q);
    case 'multi': return multi(q.qs || []);
    case 'set': return gravar(u, q.col, q.id, 'set', q.data);
    case 'merge': return gravar(u, q.col, q.id, 'merge', q.data);
    case 'del': return gravar(u, q.col, q.id, 'del', null);
  }
  falha('Ação desconhecida: ' + a);
}

/* ---------------- planilha ---------------- */
var _ss = null;
function planilha() { if (!_ss) _ss = SpreadsheetApp.openById(PLANILHA_ID); return _ss; }
function aba(nome, cab) {
  var s = planilha().getSheetByName(nome);
  if (!s) {
    s = planilha().insertSheet(nome);
    s.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#0f4f2b').setFontColor('#ffffff');
    s.setFrozenRows(1);
  }
  return s;
}
function abaColecao(col) {
  if (!COLECOES.hasOwnProperty(col)) falha('Coleção desconhecida: ' + col);
  return aba(col, CAB_FIXO.concat(COLECOES[col]));
}
// Cria todas as abas (pode rodar pelo editor: Executar → configurar).
function configurar() {
  aba(ABA_USUARIOS, CAB_USUARIOS);
  aba(ABA_AUDITORIA, ['em', 'matricula', 'colecao', 'id', 'acao', 'antes', 'depois']);
  Object.keys(COLECOES).forEach(abaColecao);
  segredo();
  return 'Planilha pronta.';
}

/* ---------------- usuários e senhas ---------------- */
function segredo() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('SEGREDO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SEGREDO', s); }
  return s;
}
function hashSenha(senha, salt) {
  var v = salt + '|' + senha, b;
  for (var i = 0; i < ITERACOES_HASH; i++) { b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v + '|' + i, Utilities.Charset.UTF_8); v = Utilities.base64Encode(b); }
  return v;
}
function simNao(v) { return v === true || String(v).toUpperCase() === 'SIM' || String(v).toUpperCase() === 'TRUE'; }
function lerUsuarios() {
  var c = CacheService.getScriptCache().get('usuarios');
  if (c) return JSON.parse(c);
  var s = aba(ABA_USUARIOS, CAB_USUARIOS), v = s.getDataRange().getValues(), cab = v[0], out = [];
  for (var r = 1; r < v.length; r++) {
    var o = {}; for (var k = 0; k < cab.length; k++) o[cab[k]] = v[r][k];
    if (!o.id || !o.matricula) continue;
    o.matricula = String(o.matricula).trim().toLowerCase();
    o.papeis = String(o.papeis || '').split(/[,;\s]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return PAPEIS.indexOf(x) >= 0; });
    o.admin = simNao(o.admin); o.ativo = simNao(o.ativo); o.trocar_senha = simNao(o.trocar_senha);
    o.id = String(o.id); o._linha = r + 1; out.push(o);
  }
  CacheService.getScriptCache().put('usuarios', JSON.stringify(out), 30);
  return out;
}
function limparCacheUsuarios() { CacheService.getScriptCache().remove('usuarios'); }
function perfilPublico(u) { return { id: u.id, matricula: u.matricula, nome: u.nome, papeis: u.papeis, admin: u.admin, ativo: u.ativo, trocar_senha: u.trocar_senha }; }
function linhaUsuario(u) {
  return [u.id, u.matricula, u.nome, (u.papeis || []).join(', '), u.admin ? 'SIM' : 'NÃO', u.ativo ? 'SIM' : 'NÃO', u.trocar_senha ? 'SIM' : 'NÃO', u.salt, u.hash, u.criado_em || new Date()];
}
function salvarUsuario(u) {
  var s = aba(ABA_USUARIOS, CAB_USUARIOS);
  var lin = u._linha || s.getLastRow() + 1;
  s.getRange(lin, 1, 1, 2).setNumberFormat('@'); // id e matrícula como texto (mantém zeros à esquerda)
  s.getRange(lin, 1, 1, CAB_USUARIOS.length).setValues([linhaUsuario(u)]);
  limparCacheUsuarios();
}
function normMat(m) { return String(m || '').trim().toLowerCase().replace(/\s+/g, ''); }
function validarMat(m) { if (!/^[a-z0-9._-]{1,40}$/.test(m)) falha('Matrícula: use só letras, números, ponto, hífen ou sublinhado.'); }
function validarSenha(s) { if (String(s || '').length < 6) falha('A senha precisa ter pelo menos 6 caracteres.'); }
function token(u) {
  var exp = Date.now() + VALIDADE_SESSAO_DIAS * 864e5;
  var carga = u.id + '.' + exp + '.' + String(u.hash).slice(0, 10);
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(carga, segredo()));
  return Utilities.base64EncodeWebSafe(carga) + '.' + sig;
}
function sessao(t) {
  if (!t) falha('Entre novamente.', 'sessao');
  var p = String(t).split('.'); if (p.length !== 2) falha('Sessão inválida.', 'sessao');
  var carga; try { carga = Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString(); } catch (e) { falha('Sessão inválida.', 'sessao'); }
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(carga, segredo()));
  if (sig !== p[1]) falha('Sessão inválida.', 'sessao');
  var c = carga.split('.'); if (Number(c[1]) < Date.now()) falha('Sessão expirada. Entre novamente.', 'sessao');
  var u = lerUsuarios().filter(function (x) { return x.id === c[0]; })[0];
  if (!u || !u.ativo) falha('Sua conta está desativada.', 'sessao');
  if (String(u.hash).slice(0, 10) !== c[2]) falha('Sua senha foi alterada. Entre novamente.', 'sessao');
  return u;
}
function login(q) {
  var m = normMat(q.matricula), u = lerUsuarios().filter(function (x) { return x.matricula === m; })[0];
  if (!u || hashSenha(String(q.senha || ''), u.salt) !== u.hash) { Utilities.sleep(400); falha('Matrícula ou senha incorretas.', 'login'); }
  if (!u.ativo) falha('Sua conta está desativada. Fale com o administrador.', 'login');
  return { token: token(u), perfil: perfilPublico(u) };
}
function primeiroAdmin(q) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    limparCacheUsuarios();
    if (lerUsuarios().length) falha('O sistema já tem administrador.', 'permissao');
    var m = normMat(q.matricula); validarMat(m); validarSenha(q.senha);
    if (!String(q.nome || '').trim()) falha('Informe o nome.');
    var salt = Utilities.getUuid();
    var u = { id: Utilities.getUuid(), matricula: m, nome: String(q.nome).trim(), papeis: ['gerente'], admin: true, ativo: true, trocar_senha: false, salt: salt, hash: hashSenha(q.senha, salt), criado_em: new Date() };
    salvarUsuario(u);
    return { token: token(u), perfil: perfilPublico(u) };
  } finally { lock.releaseLock(); }
}
function trocarSenha(u, q) {
  validarSenha(q.nova);
  if (hashSenha(q.nova, u.salt) === u.hash) falha('A nova senha precisa ser diferente da atual.');
  u.salt = Utilities.getUuid(); u.hash = hashSenha(q.nova, u.salt); u.trocar_senha = false; salvarUsuario(u);
  return { token: token(u), perfil: perfilPublico(u) };
}
function exigirAdmin(u) { if (!u.admin) falha('Somente o administrador gerencia usuários.', 'permissao'); }
function criarUsuario(u, q) {
  exigirAdmin(u);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    limparCacheUsuarios();
    var m = normMat(q.matricula); validarMat(m); validarSenha(q.senha);
    if (!String(q.nome || '').trim()) falha('Informe o nome.');
    if (lerUsuarios().some(function (x) { return x.matricula === m; })) falha('Essa matrícula já está cadastrada.');
    var salt = Utilities.getUuid();
    var n = { id: Utilities.getUuid(), matricula: m, nome: String(q.nome).trim(), papeis: (q.papeis || []).filter(function (p) { return PAPEIS.indexOf(p) >= 0; }),
      admin: !!q.admin, ativo: true, trocar_senha: true, salt: salt, hash: hashSenha(q.senha, salt), criado_em: new Date() };
    salvarUsuario(n); auditar(u, ABA_USUARIOS, n.id, 'criar usuário', null, perfilPublico(n));
    return perfilPublico(n);
  } finally { lock.releaseLock(); }
}
function atualizarUsuario(u, q) {
  exigirAdmin(u);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    limparCacheUsuarios();
    var alvo = lerUsuarios().filter(function (x) { return x.id === q.id; })[0]; if (!alvo) falha('Usuário não encontrado.');
    var antes = perfilPublico(alvo);
    if (q.papeis) alvo.papeis = q.papeis.filter(function (p) { return PAPEIS.indexOf(p) >= 0; });
    if (typeof q.admin === 'boolean') { if (alvo.id === u.id && !q.admin) falha('Você não pode tirar o seu próprio acesso de administrador.'); alvo.admin = q.admin; }
    if (typeof q.ativo === 'boolean') { if (alvo.id === u.id && !q.ativo) falha('Você não pode desativar a sua própria conta.'); alvo.ativo = q.ativo; }
    if (q.nome) alvo.nome = String(q.nome).trim();
    salvarUsuario(alvo); auditar(u, ABA_USUARIOS, alvo.id, 'alterar usuário', antes, perfilPublico(alvo));
    return perfilPublico(alvo);
  } finally { lock.releaseLock(); }
}
function definirSenha(u, q) {
  exigirAdmin(u); validarSenha(q.senha);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    limparCacheUsuarios();
    var alvo = lerUsuarios().filter(function (x) { return x.id === q.id; })[0]; if (!alvo) falha('Usuário não encontrado.');
    alvo.salt = Utilities.getUuid(); alvo.hash = hashSenha(q.senha, alvo.salt); alvo.trocar_senha = true;
    salvarUsuario(alvo); auditar(u, ABA_USUARIOS, alvo.id, 'redefinir senha', null, null);
    return true;
  } finally { lock.releaseLock(); }
}

/* ---------------- leitura de dados ---------------- */
function lerColecao(col, memo) {
  if (memo && memo[col]) return memo[col];
  var s = abaColecao(col), n = s.getLastRow(), out = [];
  if (n >= 2) {
    var v = s.getRange(2, 1, n - 1, 2).getValues();
    for (var i = 0; i < v.length; i++) {
      if (v[i][0] === '' || v[i][1] === '') continue;
      try { out.push({ id: String(v[i][0]), data: JSON.parse(v[i][1]), _linha: i + 2 }); } catch (e) {}
    }
  }
  if (memo) memo[col] = out;
  return out;
}
function cmp(a, b) {
  if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function passa(d, f) {
  var x = d[f[0]], op = f[1], v = f[2];
  switch (op) {
    case '==': case 'eq': return v == null ? x == null : x != null && String(x) === String(v);
    case '!=': case 'ne': return x == null || String(x) !== String(v);
    case '<': case 'lt': return x != null && cmp(x, v) < 0;
    case '<=': case 'lte': return x != null && cmp(x, v) <= 0;
    case '>': case 'gt': return x != null && cmp(x, v) > 0;
    case '>=': case 'gte': return x != null && cmp(x, v) >= 0;
    case 'in': return x != null && (v || []).map(String).indexOf(String(x)) >= 0;
    case 'not-in': return x == null || (v || []).map(String).indexOf(String(x)) < 0;
  }
  return true;
}
function consulta(q, memo) {
  var rows = lerColecao(q.col, memo).filter(function (r) { return (q.f || []).every(function (f) { return passa(r.data, f); }); });
  if (q.o) { var k = q.o[0], ds = q.o[1] === 'desc' ? -1 : 1; rows.sort(function (a, b) { return cmp(a.data[k], b.data[k]) * ds || (a.id < b.id ? -1 : 1); }); }
  if (q.l) rows = rows.slice(0, q.l);
  return rows.map(function (r) { return { id: r.id, data: r.data }; });
}
function multi(qs) {
  var memo = {}, out = {};
  qs.forEach(function (q) {
    if (q.id != null) { var r = lerColecao(q.col, memo).filter(function (x) { return x.id === String(q.id); })[0]; out[q.k] = r ? r.data : null; }
    else out[q.k] = consulta(q, memo);
  });
  return out;
}

/* ---------------- gravação com regras de permissão ---------------- */
function temPapel(u, p) { return u.admin || u.papeis.indexOf('gerente') >= 0 || u.papeis.indexOf(p) >= 0; }
function semCampos(o, campos) { var c = JSON.parse(JSON.stringify(o || {})); campos.forEach(function (k) { delete c[k]; }); return JSON.stringify(ordenar(c)); }
function ordenar(o) { if (Array.isArray(o)) return o.map(ordenar); if (o && typeof o === 'object') { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = ordenar(o[k]); }); return r; } return o; }
function alcada(memo) { var c = lerColecao('cfg', memo).filter(function (r) { return r.id === 'geral'; })[0]; var v = c && Number(c.data.alcada); return isFinite(v) && v >= 0 ? v : 5000; }
function totalRC(d) { return (d && d.itens || []).reduce(function (a, i) { return a + (Number(i.qtd) || 0) * (Number(i.valorUnit) || 0); }, 0); }
function negar(m) { falha(m, 'permissao'); }

function conferir(u, c, op, o, n, memo) {
  var autor = (o && o.por) || (n && n.por) || null, proprio = autor === u.id;
  var upd = op === 'update', del = op === 'delete', ins = op === 'insert';
  if ((c === 'cfg' || c === 'metas') && !temPapel(u, 'gerente')) negar('Somente gerente ou administrador altera metas e parâmetros.');
  if (c === 'ativos' && !(temPapel(u, 'manutencao') || temPapel(u, 'supervisor')))
    if (!(upd && semCampos(n, ['hor', 'horData']) === semCampos(o, ['hor', 'horData']))) negar('Cadastro de ativos: somente Manutenção ou Supervisor.');
  if (c === 'planos' && !(temPapel(u, 'manutencao') || temPapel(u, 'supervisor')))
    if (!(upd && semCampos(n, ['ultima']) === semCampos(o, ['ultima']))) negar('Planos de manutenção: somente Manutenção ou Supervisor.');
  if (c === 'rotinas' && !(temPapel(u, 'manutencao') || temPapel(u, 'supervisor'))) negar('Rotinas de inspeção: somente Manutenção ou Supervisor.');
  if (c === 'pecas' && !temPapel(u, 'almoxarife'))
    if (!(upd && temPapel(u, 'compras') && semCampos(n, ['custoUnit']) === semCampos(o, ['custoUnit']))) negar('Cadastro de peças: somente Almoxarife.');
  if (c === 'movimentos') {
    var ref = (n && n.ref) || (o && o.ref);
    if (ref === 'MANUAL' && !temPapel(u, 'almoxarife')) negar('Entradas, saídas e inventário avulsos: somente Almoxarife.');
    if (ref === 'RC' && !(temPapel(u, 'almoxarife') || temPapel(u, 'compras'))) negar('Recebimento de compras: somente Almoxarife ou Compras.');
  }
  if ((c === 'viagens' || c === 'britagem') && !ins && !proprio && !temPapel(u, 'supervisor')) negar('Você só pode alterar os seus próprios lançamentos.');
  if (c === 'manutencao' && del && !proprio && !temPapel(u, 'supervisor')) negar('Somente quem abriu a OS ou um supervisor pode excluí-la.');
  if (c === 'inspecoes' && !ins && !temPapel(u, 'supervisor')) negar('Inspeções registradas só podem ser alteradas por supervisor.');
  if (c === 'requisicoes') {
    var so = o && o.status, sn = n && n.status;
    if (del) { if (!u.admin) negar('Somente o administrador exclui requisições.'); return; }
    if (ins) { if (sn !== 'Em aprovação' || n.por !== u.id) negar('Requisição nova deve ser enviada para aprovação pelo próprio solicitante.'); return; }
    if (so !== sn) {
      var tot = totalRC(n), aprov = ['Aprovada', 'Aprovação gerência', 'Reprovada', 'Em revisão'];
      if (so === 'Em aprovação' && aprov.indexOf(sn) >= 0) {
        if (!temPapel(u, 'supervisor')) negar('Somente Supervisor ou Gerente aprova requisições.');
        if (proprio && !u.admin) negar('Você não pode aprovar a própria requisição.');
        if (sn === 'Aprovada' && tot > alcada(memo) && !temPapel(u, 'gerente')) negar('Valor acima da alçada do supervisor: precisa da aprovação da gerência.');
      } else if (so === 'Aprovação gerência' && ['Aprovada', 'Reprovada', 'Em revisão'].indexOf(sn) >= 0) {
        if (!temPapel(u, 'gerente')) negar('Somente o Gerente aprova este valor.');
        if (proprio && !u.admin) negar('Você não pode aprovar a própria requisição.');
      } else if (so === 'Aprovada' && sn === 'Pedido emitido') {
        if (!temPapel(u, 'compras')) negar('Somente Compras emite o pedido.');
      } else if ((so === 'Pedido emitido' || so === 'Recebida parcial') && (sn === 'Recebida parcial' || sn === 'Recebida')) {
        if (!(temPapel(u, 'almoxarife') || temPapel(u, 'compras'))) negar('Somente Almoxarife ou Compras registra o recebimento.');
      } else if (so === 'Em revisão' && sn === 'Em aprovação') {
        if (!(proprio || temPapel(u, 'gerente'))) negar('Somente o solicitante reenvia a requisição.');
      } else if (sn === 'Cancelada' && ['Em aprovação', 'Aprovação gerência', 'Em revisão', 'Aprovada'].indexOf(so) >= 0) {
        if (!(proprio || temPapel(u, 'gerente'))) negar('Somente o solicitante ou o gerente cancela.');
      } else negar('Mudança de situação não permitida: ' + so + ' → ' + sn + '.');
    } else if (so === 'Recebida parcial') {
      if (!(temPapel(u, 'almoxarife') || temPapel(u, 'compras'))) negar('Somente Almoxarife ou Compras registra o recebimento.');
    } else if (!u.admin) negar('A requisição só muda pelo fluxo de aprovação.');
  }
}

function celula(v) { if (v == null) return ''; if (typeof v === 'object') { var s = JSON.stringify(v); return s.length > 4000 ? s.slice(0, 4000) + '…' : s; } return v; }
function gravar(u, col, id, modo, data) {
  if (!col || id == null || id === '') falha('Documento inválido.');
  id = String(id);
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var memo = {}, s = abaColecao(col), rows = lerColecao(col, memo), atual = rows.filter(function (r) { return r.id === id; })[0];
    var antes = atual ? atual.data : null, depois;
    if (modo === 'del') { if (!atual) return true; conferir(u, col, 'delete', antes, null, memo); s.deleteRow(atual._linha); auditar(u, col, id, 'excluir', antes, null); return true; }
    if (modo === 'merge') { if (!atual) falha('Documento não encontrado.', 'naoencontrado'); depois = Object.assign({}, antes, data || {}); }
    else depois = data || {};
    var json = JSON.stringify(depois); if (json.length > 45000) falha('Registro grande demais para a planilha.');
    conferir(u, col, atual ? 'update' : 'insert', antes, depois, memo);
    var linha = [id, json, new Date(), u.matricula].concat(COLECOES[col].map(function (k) { return celula(depois[k]); }));
    var lin = atual ? atual._linha : s.getLastRow() + 1;
    s.getRange(lin, 1).setNumberFormat('@'); // id sempre como texto (ex.: "2026-11" não vira data)
    s.getRange(lin, 1, 1, linha.length).setValues([linha]);
    auditar(u, col, id, atual ? 'alterar' : 'criar', antes, depois);
    return true;
  } finally { lock.releaseLock(); }
}
function auditar(u, col, id, acao, antes, depois) {
  var corta = function (o) { if (o == null) return ''; var s = JSON.stringify(o); return s.length > 20000 ? s.slice(0, 20000) + '…' : s; };
  aba(ABA_AUDITORIA, ['em', 'matricula', 'colecao', 'id', 'acao', 'antes', 'depois']).appendRow([new Date(), u ? u.matricula : '', col, id, acao, corta(antes), corta(depois)]);
}
