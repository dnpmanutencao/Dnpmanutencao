/* Pedreira Ibiúna · camada de servidor (Google Planilhas + Apps Script): login por matrícula,
   banco de dados e usuários. Expõe window.claude.use('db' | 'user' | 'downloads') com a mesma
   interface que o app já usa. */
(function(){
'use strict';
var CFG=window.IBIUNA_CONFIG||{};
var IB=window.IBIUNA={standalone:true};
var API=CFG.API_URL||'';
var configurado=/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(API);
var TK='ibiuna-token';
var tokenAtual=null; try{tokenAtual=localStorage.getItem(TK);}catch(e){}
var me=null, perfis=[], perfisFns=new Set();
var readyResolve, ready=new Promise(function(r){readyResolve=r;});

/* ---------------- utilidades ---------------- */
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function normMat(m){return String(m||'').trim().toLowerCase().replace(/\s+/g,'');}
function matValida(m){return /^[a-z0-9._-]{1,40}$/.test(normMat(m));}
function guardaToken(t){tokenAtual=t;try{t?localStorage.setItem(TK,t):localStorage.removeItem(TK);}catch(e){}}
function erroApp(codigo,msg){var c=codigo==='permissao'?'permission':codigo==='sessao'?'revoked':codigo==='naoencontrado'?'permission':codigo==='login'?'login':codigo==='erro'?'permission':'unavailable';return{code:c,message:msg,rede:codigo==='rede'};}
var online=navigator.onLine!==false;
function marcarOnline(v){if(online===v)return;online=v;atualizarPill();if(v)setTimeout(tentarEnviar,300);}
async function api(a,dados,espera){
  var body=Object.assign({a:a,t:tokenAtual},dados||{}),r,j;
  if(navigator.onLine===false){marcarOnline(false);throw erroApp('rede','Sem internet no momento.');}
  for(var tent=0;tent<2;tent++){
    var ctl=window.AbortController?new AbortController():null,tm=ctl?setTimeout(function(){ctl.abort();},espera||(a==='salvarFoto'?90000:40000)):0;
    try{r=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow',signal:ctl?ctl.signal:undefined});
      j=await r.json();clearTimeout(tm);break;}
    catch(e){clearTimeout(tm);if(tent===1||navigator.onLine===false){marcarOnline(false);throw erroApp('rede','Sem conexão com o servidor. Confira a internet e tente de novo.');}await new Promise(function(ok){setTimeout(ok,800);});}
  }
  marcarOnline(true);
  if(!j.ok){var er=erroApp(j.codigo,j.erro);if(er.code==='revoked'&&me){guardaToken(null);setTimeout(function(){telaLogin(j.erro);},0);}throw er;}
  return j.r;
}
IB.api=apiApp;
var ROLE_LBL={manutencao:'Manutenção',almoxarife:'Almoxarife',compras:'Compras',supervisor:'Supervisor',gerente:'Gerente'};

/* ---------------- tela de acesso ---------------- */
var css='#auth{position:fixed;inset:0;z-index:100;background:linear-gradient(160deg,#072a17,#0f4f2b 60%,#126235);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}'+
 '#auth .ab{background:#fff;border-radius:16px;max-width:400px;width:100%;padding:22px 20px;box-shadow:0 10px 40px rgba(0,0,0,.3)}'+
 '#auth h2{margin:0 0 4px;font:700 26px "Barlow Condensed",sans-serif;color:#0f4f2b;letter-spacing:.03em}#auth p{margin:0 0 14px;color:#5b6a61;font-size:14px;line-height:1.4}'+
 '#auth form{display:grid;gap:12px}#auth .err{color:#d63b2b;font-weight:600;font-size:14px;min-height:18px}#auth .lk{background:none;border:0;color:#126235;font-weight:700;text-decoration:underline;padding:6px;font-size:14px}'+
 '#auth .logo{display:flex;align-items:center;gap:10px;margin-bottom:14px}#auth .logo b{font:700 22px "Barlow Condensed";color:#0b3d22;letter-spacing:.04em}'+
 '#userBtn{flex:none;width:38px;height:38px;border-radius:50%;border:2px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);color:#fff;font:700 15px "Barlow Condensed";letter-spacing:.02em}'+
 '#syncBtn{flex:none;display:none;align-items:center;gap:5px;height:32px;border-radius:16px;border:0;padding:0 11px;font:700 13px "Barlow Condensed",sans-serif;letter-spacing:.03em;color:#fff;background:#ef7d1a;white-space:nowrap}#syncBtn.off{background:#6b7a72}#syncBtn.on{display:inline-flex}'+
 '.urow{padding:12px 0;border-bottom:1px solid #edf1ee;display:grid;gap:6px}.urow .uh{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.urow .ua{display:flex;flex-wrap:wrap;gap:6px}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
var auth=document.createElement('div');auth.id='auth';document.body.appendChild(auth);
var LOGO='<div class="logo"><img src="logo.png" alt="Pedreira Ibiúna" style="height:56px"></div>';
function tela(html,bind){auth.style.display='flex';auth.innerHTML='<div class="ab">'+LOGO+html+'</div>';if(bind)bind(auth);}
function erro(t){var e=auth.querySelector('.err');if(e)e.textContent=t||'';}
function carregando(b,on,txt){if(!b)return;b.disabled=on;if(on){b.dataset.t=b.textContent;b.textContent=txt||'Aguarde…';}else if(b.dataset.t)b.textContent=b.dataset.t;}

function telaConfig(){tela('<h2>Falta configurar</h2><p>Cole o endereço do servidor (Apps Script) no arquivo <b>config.js</b> — veja o LEIAME.md. Depois recarregue esta página.</p>');}
function telaLogin(msg){
  tela('<h2>Entrar</h2><p>Use sua matrícula e senha.</p><form id="fLogin"><div><label class="fl">Matrícula</label><input class="inp" name="m" autocomplete="username" autocapitalize="none" required></div>'+
    '<div><label class="fl">Senha</label><input class="inp" name="s" type="password" autocomplete="current-password" required></div><div class="err">'+h(msg||'')+'</div><button class="btn" type="submit">Entrar</button></form>'+
    '<p style="margin:14px 0 0;font-size:13px">Esqueceu a senha? Peça ao administrador do sistema para redefinir.</p>',function(el){
    var f=el.querySelector('#fLogin');f.m.focus();
    f.onsubmit=async function(e){e.preventDefault();erro('');if(!matValida(f.m.value))return erro('Matrícula inválida.');
      var b=f.querySelector('button');carregando(b,true,'Entrando…');
      try{var r=await api('login',{matricula:normMat(f.m.value),senha:f.s.value});guardaToken(r.token);me=r.perfil;carregando(b,false);aposLogin();}
      catch(x){carregando(b,false);erro(x.message);}};});}
function telaPrimeiroAcesso(){
  tela('<h2>Primeiro acesso</h2><p>Ainda não há usuários. Crie o <b>administrador</b> do sistema — ele cadastra os demais.</p><form id="fBoot">'+
    '<div><label class="fl">Nome</label><input class="inp" name="n" required></div><div><label class="fl">Matrícula</label><input class="inp" name="m" autocapitalize="none" required></div>'+
    '<div><label class="fl">Senha (mín. 6)</label><input class="inp" name="s" type="password" autocomplete="new-password" required></div><div><label class="fl">Repita a senha</label><input class="inp" name="s2" type="password" autocomplete="new-password" required></div>'+
    '<div class="err"></div><button class="btn" type="submit">Criar administrador</button></form>',function(el){
    var f=el.querySelector('#fBoot');
    f.onsubmit=async function(e){e.preventDefault();erro('');
      if(!matValida(f.m.value))return erro('Matrícula: use só letras, números, ponto, hífen ou sublinhado.');
      if(f.s.value.length<6)return erro('A senha precisa ter pelo menos 6 caracteres.');if(f.s.value!==f.s2.value)return erro('As senhas não conferem.');
      var b=f.querySelector('button');carregando(b,true,'Criando…');
      try{var r=await api('primeiroAdmin',{matricula:normMat(f.m.value),nome:f.n.value.trim(),senha:f.s.value});guardaToken(r.token);me=r.perfil;carregando(b,false);aposLogin();}
      catch(x){carregando(b,false);erro(x.message);}};});}
function telaTrocarSenha(obrigatorio,onDone){
  tela('<h2>'+(obrigatorio?'Crie sua senha':'Trocar senha')+'</h2><p>'+(obrigatorio?'Sua senha atual é provisória. Escolha uma senha pessoal para continuar.':'Escolha a nova senha.')+'</p><form id="fPw">'+
    '<div><label class="fl">Nova senha (mín. 6)</label><input class="inp" name="s" type="password" autocomplete="new-password" required></div><div><label class="fl">Repita a nova senha</label><input class="inp" name="s2" type="password" autocomplete="new-password" required></div>'+
    '<div class="err"></div><button class="btn" type="submit">Salvar senha</button><button type="button" class="lk" id="pwX">'+(obrigatorio?'Sair':'Cancelar')+'</button></form>',function(el){
    var f=el.querySelector('#fPw');el.querySelector('#pwX').onclick=obrigatorio?sairConta:function(){auth.style.display='none';};
    f.onsubmit=async function(e){e.preventDefault();erro('');if(f.s.value.length<6)return erro('A senha precisa ter pelo menos 6 caracteres.');if(f.s.value!==f.s2.value)return erro('As senhas não conferem.');
      var b=f.querySelector('button');carregando(b,true,'Salvando…');
      try{var r=await api('trocarSenha',{nova:f.s.value});guardaToken(r.token);me=Object.assign(me||{},r.perfil);carregando(b,false);onDone&&onDone();}
      catch(x){carregando(b,false);erro(x.message);}};});}
function sairConta(){if(fila.length&&!confirm('Há '+fila.length+' lançamento(s) ainda não enviados deste aparelho. Se sair agora eles se perdem. Sair mesmo assim?'))return;
  guardaToken(null);try{localStorage.removeItem(LS_ME);localStorage.removeItem(LS_PERFIS);Object.keys(localStorage).forEach(function(k){if(k.indexOf(LS_Q)===0)localStorage.removeItem(k);});}catch(e){}
  if(fila.length){fila=[];limparFilaToda();}location.reload();}
IB.sair=sairConta;

/* ---------------- fluxo de entrada ---------------- */
async function iniciar(){
  if(!configurado)return telaConfig();
  tela('<p>Conectando…</p>');
  await carregarFila();
  if(tokenAtual){try{me=await api('eu',null,15000);return aposLogin();}
    catch(e){var guardado=lsGet(LS_ME);
      if(e.rede&&guardado){me=guardado;return entrar();}               // sem internet: entra com o último acesso salvo neste aparelho
      if(!e.rede)guardaToken(null);
      else return tela('<h2>Sem conexão</h2><p>Para entrar pela primeira vez neste aparelho é preciso internet.</p><button class="btn" onclick="location.reload()">Tentar de novo</button>');}}
  try{var ha=await api('haUsuarios');}catch(e){return tela('<h2>Sem conexão</h2><p>'+(e.rede?'Para entrar pela primeira vez neste aparelho é preciso internet.':'Não foi possível falar com o servidor ('+h(e.message)+').')+'</p><button class="btn" onclick="location.reload()">Tentar de novo</button>');}
  if(ha===false)return telaPrimeiroAcesso();
  telaLogin();
}
function aposLogin(){lsSet(LS_ME,me);if(me.trocar_senha)return telaTrocarSenha(true,entrar);entrar();}
var entrou=false;
async function entrar(){
  auth.style.display='none';if(entrou)return;entrou=true;
  var pc=lsGet(LS_PERFIS);if(pc)perfis=pc;
  await carregarPerfis();setInterval(carregarPerfis,90000);
  montarCabecalho();readyResolve(true);setTimeout(tentarEnviar,1500);
}
async function carregarPerfis(){
  try{perfis=await api('usuarios');lsSet(LS_PERFIS,perfis);}catch(e){return;}
  var eu=perfis.find(function(p){return p.id===me.id;});if(eu)me=Object.assign(me,eu);
  perfisFns.forEach(function(f){try{f();}catch(e){}});
  if(typeof render==='function')render();
}

/* ---------------- cabeçalho / minha conta ---------------- */
function iniciais(n){return String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(function(p){return p[0];}).join('').toUpperCase();}
function montarCabecalho(){var hd=document.querySelector('header');if(!hd||document.getElementById('userBtn'))return;
  var p=document.createElement('button');p.id='syncBtn';p.type='button';p.onclick=verFila;hd.appendChild(p);
  var b=document.createElement('button');b.id='userBtn';b.title='Minha conta';b.textContent=iniciais(me.nome);hd.appendChild(b);b.onclick=minhaConta;atualizarPill();}
function minhaConta(){
  var pap=me.admin?'Administrador':'';pap+=(me.papeis||[]).map(function(p){return(pap?', ':'')+ROLE_LBL[p];}).join('');
  sheet('Minha conta','<div class="kv"><span>Nome</span><b>'+h(me.nome)+'</b><span>Matrícula</span><b>'+h(me.matricula)+'</b><span>Papéis</span><b>'+h(pap||'Operação (lançamentos)')+'</b></div>'+
    '<div class="acts2"><button class="btn ghost" id="mcPw">Trocar senha</button><button class="btn danger" id="mcSair">Sair</button></div>',function(body,sh){
    body.querySelector('#mcPw').onclick=function(){sh.close();telaTrocarSenha(false,function(){auth.style.display='none';toast('✔ Senha alterada');});};
    body.querySelector('#mcSair').onclick=sairConta;});}

/* ---------------- administração de usuários (Ajustes) ---------------- */
IB.renderUsers=function(){
  var box=document.getElementById('teamList');if(!box)return;
  var ts=document.getElementById('teamSearch');if(ts)ts.classList.add('hidden');
  var t=box.closest('.card');if(t){var h3=t.querySelector('h3');if(h3)h3.textContent='Usuários e papéis';}
  var adm=!!me.admin;
  var html=adm?'<button class="btn sm" id="uNovo" style="margin-bottom:6px">+ Novo usuário</button>':'<p class="note">Somente o administrador cadastra usuários e muda papéis.</p>';
  html+=perfis.map(function(p){var self=p.id===me.id;
    return'<div class="urow"><div class="uh"><div><b>'+h(p.nome)+'</b>'+(self?' <span class="note">(você)</span>':'')+'<div class="note">Matrícula '+h(p.matricula)+(p.trocar_senha?' · aguardando trocar a senha':'')+'</div></div>'+
      '<div>'+(p.admin?'<span class="st" style="background:#0f4f2b">admin</span> ':'')+(p.ativo?'':'<span class="st" style="background:#8a948f">inativo</span>')+'</div></div>'+
      '<div class="chips">'+Object.keys(ROLE_LBL).map(function(k){return'<button type="button" class="chip sm '+((p.papeis||[]).indexOf(k)>=0?'on':'')+'" '+(adm?'data-urole="'+k+'" data-uid="'+h(p.id)+'"':'disabled')+'>'+ROLE_LBL[k]+'</button>';}).join('')+'</div>'+
      (adm?'<div class="ua"><button class="btn ghost sm" data-upw="'+h(p.id)+'">Redefinir senha</button>'+(self?'':'<button class="btn ghost sm" data-uativo="'+h(p.id)+'">'+(p.ativo?'Desativar':'Reativar')+'</button><button class="btn ghost sm" data-uadm="'+h(p.id)+'">'+(p.admin?'Tirar admin':'Tornar admin')+'</button>')+'</div>':'')+'</div>';}).join('');
  html+='<p class="note">Administrador e Gerente têm acesso a tudo. Todos podem lançar produção, abrir OS, fazer inspeções e criar requisições. As permissões são conferidas no servidor. Os usuários ficam na aba <b>Usuarios</b> da planilha (as senhas ficam embaralhadas).</p>';
  box.innerHTML=html;
  if(!adm)return;
  box.querySelector('#uNovo').onclick=novoUsuario;
  box.onclick=async function(e){
    var achar=function(id){return perfis.find(function(x){return x.id===id;});};
    try{
      var r=e.target.closest('[data-urole]');if(r){var p=achar(r.dataset.uid),set=new Set(p.papeis||[]);set.has(r.dataset.urole)?set.delete(r.dataset.urole):set.add(r.dataset.urole);
        r.disabled=true;await api('atualizarUsuario',{id:p.id,papeis:Array.from(set)});toast('✔ Papéis atualizados');return await carregarPerfis();}
      var pw=e.target.closest('[data-upw]');if(pw){var p2=achar(pw.dataset.upw),sug=String(Math.floor(100000+Math.random()*900000));
        var v=await askText('Nova senha provisória para '+p2.nome+' (mín. 6). A pessoa cria a própria senha no próximo acesso. Deixe em branco para usar '+sug+'.','',"Redefinir",false);if(v===null)return;v=v||sug;
        if(v.length<6)return toast('A senha precisa ter pelo menos 6 caracteres.',true);
        await api('definirSenha',{id:p2.id,senha:v});await carregarPerfis();
        return sheet('Senha redefinida','<p>Passe para <b>'+h(p2.nome)+'</b>:</p><div class="kv"><span>Matrícula</span><b>'+h(p2.matricula)+'</b><span>Senha provisória</span><b style="font-size:22px;letter-spacing:.08em">'+h(v)+'</b></div>');}
      var at=e.target.closest('[data-uativo]');if(at){var p3=achar(at.dataset.uativo);
        if(p3.ativo&&!await ask('Desativar '+p3.nome+'? A pessoa perde o acesso imediatamente (os lançamentos dela continuam).','Desativar',true))return;
        await api('atualizarUsuario',{id:p3.id,ativo:!p3.ativo});toast(p3.ativo?'Usuário desativado':'Usuário reativado');return await carregarPerfis();}
      var ad=e.target.closest('[data-uadm]');if(ad){var p4=achar(ad.dataset.uadm);
        if(!await ask((p4.admin?'Tirar o acesso de administrador de ':'Tornar administrador: ')+p4.nome+'?',p4.admin?'Tirar':'Tornar admin'))return;
        await api('atualizarUsuario',{id:p4.id,admin:!p4.admin});return await carregarPerfis();}
    }catch(err){toast(err.message,true);carregarPerfis();}
  };
};
function novoUsuario(){
  var sug=String(Math.floor(100000+Math.random()*900000));
  sheet('Novo usuário','<form class="f" id="fNu"><div><label class="fl">Nome completo *</label><input class="inp" name="n" required style="font-size:17px"></div>'+
    '<div class="row2"><div><label class="fl">Matrícula *</label><input class="inp" name="m" required autocapitalize="none"></div><div><label class="fl">Senha provisória *</label><input class="inp" name="s" value="'+sug+'" required></div></div>'+
    '<div><label class="fl">Papéis</label><div class="chips" id="nuPap">'+Object.keys(ROLE_LBL).map(function(k){return'<button type="button" class="chip sm" data-v="'+k+'">'+ROLE_LBL[k]+'</button>';}).join('')+'</div><p class="note">Sem papel = operação (lançamentos, OS, inspeções e requisições).</p></div>'+
    '<label class="ck"><input type="checkbox" name="adm"> Administrador (cadastra usuários e tem acesso total)</label>'+
    '<button class="btn" type="submit">Cadastrar</button></form>',function(body,sh){
    body.querySelector('#nuPap').onclick=function(e){var c=e.target.closest('.chip');if(c)c.classList.toggle('on');};
    var f=body.querySelector('#fNu');
    f.onsubmit=async function(e){e.preventDefault();var m=normMat(f.m.value),n=f.n.value.trim(),s=f.s.value;
      if(!n)return toast('Informe o nome.',true);if(!matValida(m))return toast('Matrícula: use só letras, números, ponto, hífen ou sublinhado.',true);
      if(s.length<6)return toast('A senha precisa ter pelo menos 6 caracteres.',true);
      if(perfis.some(function(p){return p.matricula===m;}))return toast('Essa matrícula já está cadastrada.',true);
      busy(f,true);
      try{await api('criarUsuario',{matricula:m,nome:n,senha:s,admin:f.adm.checked,papeis:Array.from(body.querySelectorAll('#nuPap .chip.on')).map(function(c){return c.dataset.v;})});
        await carregarPerfis();sh.close();
        sheet('Usuário cadastrado','<p>Passe para <b>'+h(n)+'</b>. No primeiro acesso, o sistema pede para criar uma senha pessoal.</p><div class="kv"><span>Endereço</span><b>'+h(location.href.split('#')[0])+'</b><span>Matrícula</span><b>'+h(m)+'</b><span>Senha provisória</span><b style="font-size:22px;letter-spacing:.08em">'+h(s)+'</b></div>');
      }catch(err){toast(err.message,true);}finally{busy(f,false);}};});}

/* ---------------- modo sem internet ----------------
   Gravações feitas sem sinal ficam numa fila no aparelho (IndexedDB) e são enviadas, na mesma ordem,
   assim que a internet volta. As telas mostram os dados já salvos no aparelho mais o que está na fila. */
var LS_ME='ibiuna-me',LS_PERFIS='ibiuna-perfis',LS_Q='ibiuna-q:',LS_FOTOS='ibiuna-fotomap',LS_FALHAS='ibiuna-falhas',LS_FILA='ibiuna-fila';
function lsGet(k){try{var v=localStorage.getItem(k);return v==null?null:JSON.parse(v);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){try{Object.keys(localStorage).forEach(function(x){if(x.indexOf(LS_Q)===0)localStorage.removeItem(x);});localStorage.setItem(k,JSON.stringify(v));}catch(e2){}}}
function chave(spec){return JSON.stringify([spec.col,spec.id||null,spec.f||[],spec.o||null,spec.l||null]);}
var fila=[],enviando=false,mapaFoto=lsGet(LS_FOTOS)||{};
var idbP=null;
function idb(){if(idbP)return idbP;idbP=new Promise(function(ok,no){if(!window.indexedDB)return no(new Error('sem IndexedDB'));var r=indexedDB.open('ibiuna-offline',1);
  r.onupgradeneeded=function(){r.result.createObjectStore('fila',{keyPath:'n',autoIncrement:true});};r.onsuccess=function(){ok(r.result);};r.onerror=function(){no(r.error);};});return idbP;}
function idbTx(modo,fn){return idb().then(function(db){return new Promise(function(ok,no){var tx=db.transaction('fila',modo),st=tx.objectStore('fila'),res=fn(st);tx.oncomplete=function(){ok(res&&res.result!==undefined?res.result:res);};tx.onerror=function(){no(tx.error);};tx.onabort=function(){no(tx.error);};});});}
async function carregarFila(){try{fila=(await idbTx('readonly',function(st){return st.getAll();}))||[];}catch(e){fila=lsGet(LS_FILA)||[];}fila.sort(function(a,b){return a.n-b.n;});}
async function filaAdd(op){try{op.n=await idbTx('readwrite',function(st){return st.add(op);});}catch(e){op.n=Date.now()+Math.random();fila.push(op);lsSet(LS_FILA,fila.filter(function(x){return x.a!=='salvarFoto';}));return;}fila.push(op);}
async function filaDel(op){try{await idbTx('readwrite',function(st){return st.delete(op.n);});}catch(e){lsSet(LS_FILA,fila.filter(function(x){return x!==op&&x.a!=='salvarFoto';}));}}
function limparFilaToda(){idbTx('readwrite',function(st){return st.clear();}).catch(function(){});try{localStorage.removeItem(LS_FILA);}catch(e){}}
function aviso(msg,erro){if(typeof window.toast==='function')window.toast(msg,erro);}
async function enfileirar(op){op.em=new Date().toISOString();await filaAdd(op);reentregar();atualizarPill();}
async function gravar(a,col,id,data){
  if(!fila.length){try{await api(a,{col:col,id:id,data:data});aposGravar();return;}catch(e){if(!e.rede)throw e;}}
  await enfileirar({a:a,col:col,id:id,data:data});
  if(online&&navigator.onLine!==false)setTimeout(tentarEnviar,400);
  else setTimeout(function(){aviso('Sem internet: guardado no aparelho. Será enviado sozinho quando o sinal voltar.');},2700);}
// fotos: sem sinal, ficam guardadas e recebem um código provisório até serem enviadas
async function apiApp(a,dados,espera){
  if(a==='salvarFoto'){try{if(fila.length)throw erroApp('rede','fila');return await api(a,dados,espera);}catch(e){if(!e.rede)throw e;}
    var tmp=Date.now().toString(36)+Math.random().toString(36).slice(2,7);await enfileirar({a:'salvarFoto',tmp:tmp,dados:dados});return{id:'pend-'+tmp,th:'pend-'+tmp+'-th'};}
  if(a==='verFoto'&&/^pend-/.test(dados&&dados.id||'')){var id=dados.id;if(mapaFoto[id])return api('verFoto',{id:mapaFoto[id]},espera);
    var tmp2=id.replace(/^pend-/,'').replace(/-th$/,''),op=fila.find(function(x){return x.a==='salvarFoto'&&x.tmp===tmp2;});
    if(op)return{mime:'image/jpeg',b64:/-th$/.test(id)?op.dados.th:op.dados.full};throw erroApp('naoencontrado','Foto ainda não enviada.');}
  return api(a,dados,espera);}
function trocarPend(v){if(v==null)return v;var s=JSON.stringify(v).replace(/pend-[a-z0-9]+(?:-th)?/g,function(m){return mapaFoto[m]||m;});return JSON.parse(s);}
async function tentarEnviar(){
  if(enviando||!fila.length||!tokenAtual||navigator.onLine===false)return;enviando=true;atualizarPill();
  var ok=0,falhas=[];
  try{while(fila.length){var op=fila[0];
      try{if(op.a==='salvarFoto'){var r=await api('salvarFoto',op.dados);mapaFoto['pend-'+op.tmp]=r.id;mapaFoto['pend-'+op.tmp+'-th']=r.th;lsSet(LS_FOTOS,mapaFoto);}
        else await api(op.a,{col:op.col,id:op.id,data:trocarPend(op.data)});ok++;}
      catch(e){if(e.rede||e.code==='revoked')break;falhas.push({quando:op.em,oque:descrever(op),erro:e.message});}
      fila.shift();await filaDel(op);}}
  finally{enviando=false;}
  if(falhas.length){var fl=(lsGet(LS_FALHAS)||[]).concat(falhas).slice(-30);lsSet(LS_FALHAS,fl);aviso(falhas.length+' lançamento(s) guardados no aparelho foram recusados pelo servidor. Toque no aviso laranja para ver.',true);}
  if(ok){aviso('✔ '+ok+' lançamento(s) guardados no aparelho foram enviados.');agendar(150);}
  reentregar();atualizarPill();}
setInterval(function(){if(fila.length)tentarEnviar();},20000);
window.addEventListener('online',function(){marcarOnline(true);tentarEnviar();agendar(500);});
window.addEventListener('offline',function(){marcarOnline(false);});
var NOMES={viagens:'Viagens',britagem:'Britagem',manutencao:'OS de manutenção',inspecoes:'Inspeção',ativos:'Ativo',pecas:'Peça',movimentos:'Movimento de estoque',requisicoes:'Requisição de compra',planos:'Plano',rotinas:'Rotina',metas:'Metas',cfg:'Parâmetros'};
function descrever(op){if(op.a==='salvarFoto')return'Foto da OS';var d=op.data||{},n=NOMES[op.col]||op.col;
  return(op.a==='del'?'Excluir ':'')+n+(d.data?' · '+String(d.data).split('-').reverse().join('/'):'')+(d.frota?' · '+d.frota:'')+(d.equip?' · '+d.equip:'')+(d.turno?' · turno '+d.turno:'');}
function atualizarPill(){var p=document.getElementById('syncBtn');if(!p)return;var n=fila.length;
  p.className=(n||!online)?'on'+(n?'':' off'):'';p.textContent=enviando?'⇅ Enviando…':n?('⇅ '+n+' a enviar'):'Sem internet';
  p.title=n?'Lançamentos guardados no aparelho aguardando internet':'Sem conexão: o que você lançar fica guardado no aparelho';}
function verFila(){
  var fl=lsGet(LS_FALHAS)||[],html='<p class="note" style="margin:0 0 10px">'+(online?'Com internet.':'Sem internet agora.')+' O que é lançado sem sinal fica guardado neste aparelho e é enviado sozinho, na ordem, quando a internet volta. Não feche a sessão (Sair) com lançamentos pendentes.</p>';
  html+=fila.length?'<div style="display:grid;gap:6px">'+fila.map(function(op){return'<div style="border:1px solid #e4eae6;border-radius:8px;padding:8px 10px;background:#fff"><b>'+h(descrever(op))+'</b><div class="note">guardado em '+h(new Date(op.em).toLocaleString('pt-BR').slice(0,16))+'</div></div>';}).join('')+'</div>':'<p>Nenhum lançamento aguardando envio.</p>';
  if(fl.length)html+='<h4 style="margin:14px 0 6px;color:#d63b2b">Recusados pelo servidor</h4>'+fl.map(function(f){return'<div class="note" style="margin-bottom:6px"><b>'+h(f.oque)+'</b> — '+h(f.erro)+'</div>';}).join('')+'<button class="btn ghost sm" id="flLimpa">Limpar esta lista</button>';
  html+='<div style="margin-top:12px"><button class="btn" id="flEnviar"'+(fila.length?'':' disabled')+'>Enviar agora</button></div>';
  if(typeof window.sheet!=='function')return tentarEnviar();
  window.sheet('Envio dos lançamentos',html,function(body,sh){var e=body.querySelector('#flEnviar');if(e)e.onclick=async function(){e.disabled=true;e.textContent='Enviando…';await tentarEnviar();sh.close&&sh.close();};
    var l=body.querySelector('#flLimpa');if(l)l.onclick=function(){lsSet(LS_FALHAS,[]);sh.close&&sh.close();atualizarPill();};});}
// leitura local: filtros e ordenação iguais aos do servidor
function cmpL(a,b){if(a==null&&b==null)return 0;if(a==null)return 1;if(b==null)return -1;if(typeof a==='number'&&typeof b==='number')return a-b;return String(a)<String(b)?-1:String(a)>String(b)?1:0;}
function passaL(d,f){var x=d[f[0]],op=f[1],v=f[2];switch(op){case'==':case'eq':return v==null?x==null:x!=null&&String(x)===String(v);case'!=':case'ne':return x==null||String(x)!==String(v);
  case'<':case'lt':return x!=null&&cmpL(x,v)<0;case'<=':case'lte':return x!=null&&cmpL(x,v)<=0;case'>':case'gt':return x!=null&&cmpL(x,v)>0;case'>=':case'gte':return x!=null&&cmpL(x,v)>=0;
  case'in':return x!=null&&(v||[]).map(String).indexOf(String(x))>=0;case'not-in':return x==null||(v||[]).map(String).indexOf(String(x))<0;}return true;}
function linhasLocais(col){var m={};try{Object.keys(localStorage).forEach(function(k){if(k.indexOf(LS_Q)!==0)return;var sp=JSON.parse(k.slice(LS_Q.length));if(sp[0]!==col||sp[1])return;(lsGet(k)||[]).forEach(function(r){m[r.id]=r;});});}catch(e){}
  ouvintes.forEach(function(o){if(o.spec&&o.spec.col===col&&!o.spec.id&&Array.isArray(o.raw))o.raw.forEach(function(r){m[r.id]=r;});});return Object.keys(m).map(function(k){return m[k];});}
function docLocal(col,id){var achou=null;ouvintes.forEach(function(o){if(!o.spec||o.spec.col!==col)return;if(o.spec.id===id&&o.temRaw)achou=o.raw;else if(!o.spec.id&&Array.isArray(o.raw)){var r=o.raw.find(function(x){return x.id===id;});if(r)achou=r.data;}});
  if(achou)return achou;var r2=linhasLocais(col).find(function(x){return x.id===id;});if(r2)return r2.data;var c=lsGet(LS_Q+chave({col:col,id:id}));return c||null;}
function aplicarFila(spec,rows){
  if(!spec)return rows;
  var ops=fila.filter(function(op){return op.a!=='salvarFoto'&&op.col===spec.col&&(!spec.id||op.id===spec.id);});
  if(spec.id){var d=rows===undefined?null:rows;ops.forEach(function(op){d=op.a==='set'?op.data:op.a==='merge'?(d?Object.assign({},d,op.data):d):null;});return d;}
  rows=Array.isArray(rows)?rows.slice():[];if(!ops.length)return rows;
  ops.forEach(function(op){var i=-1;for(var j=0;j<rows.length;j++)if(rows[j].id===op.id){i=j;break;}
    var base=i>=0?rows[i].data:docLocal(op.col,op.id);if(i>=0)rows.splice(i,1);if(op.a==='del')return;
    var d=op.a==='set'?op.data:(base?Object.assign({},base,op.data):null);if(!d)return;
    if((spec.f||[]).every(function(f){return passaL(d,f);}))rows.push({id:op.id,data:d});});
  if(spec.o){var k=spec.o[0],ds=spec.o[1]==='desc'?-1:1;rows.sort(function(a,b){return cmpL(a.data[k],b.data[k])*ds||(a.id<b.id?-1:1);});}
  if(spec.l)rows=rows.slice(0,spec.l);return rows;}

/* ---------------- banco de dados (mesma interface do app) ---------------- */
// Todas as telas abertas são atualizadas juntas, num único pedido ao servidor a cada 30 s.
var ouvintes=new Map(), seq=0, pollT=null, pollRodando=false, pollDeNovo=false, POLL_MS=30000;
function agendar(ms){clearTimeout(pollT);pollT=setTimeout(poll,ms==null?POLL_MS:ms);}
async function poll(){
  if(pollRodando){pollDeNovo=true;return;}
  var lst=Array.from(ouvintes.values()).filter(function(o){return !o.virtual;});
  if(!lst.length){agendar();return;}
  pollRodando=true;
  try{var r=await api('multi',{qs:lst.map(function(o){return Object.assign({k:o.k},o.spec);})});
    lst.forEach(function(o){if(ouvintes.has(o.k)&&r.hasOwnProperty(o.k)){var v=r[o.k];o.raw=v;o.temRaw=true;var rs=JSON.stringify(v);if(rs!==o.rawS){o.rawS=rs;lsSet(LS_Q+chave(o.spec),v);}entregar(o);}});
    if(fila.length)setTimeout(tentarEnviar,200);}
  catch(e){if(e.code==='revoked')lst.forEach(function(o){o.err&&o.err(e);});}
  pollRodando=false;if(pollDeNovo){pollDeNovo=false;agendar(200);}else agendar();
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')agendar(100);});
function snapDoc(id,data){return{id:id,exists:data!=null,data:function(){return data==null?undefined:data;},metadata:{fromCache:false,hasPendingWrites:false}};}
function snapQ(rows){var docs=rows.map(function(r){return snapDoc(r.id,r.data);});return{docs:docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false,hasPendingWrites:false},docChanges:function(){return[];}};}
function virtualRows(col){if(col==='pessoas')return perfis.filter(function(p){return p.ativo;}).map(function(p){return{id:p.id,data:{uid:p.id,visto:''}};});return null;}
function virtualDoc(col,id){if(col==='cfg'&&id==='papeis'){var u={};perfis.forEach(function(p){if(p.ativo)u[p.id]={roles:p.papeis||[]};});return{users:u};}return undefined;}
function registrar(spec,entrega,err,virtual){var k='q'+(++seq),o={k:k,spec:spec,entrega:entrega,err:err,virtual:virtual,ult:null,raw:null,temRaw:false};ouvintes.set(k,o);
  if(virtual){var f=function(){entrega(virtual());};perfisFns.add(f);f();return function(){ouvintes.delete(k);perfisFns.delete(f);};}
  var c=lsGet(LS_Q+chave(spec));if(c!==null){o.raw=c;o.temRaw=true;o.rawS=JSON.stringify(c);setTimeout(function(){if(ouvintes.has(k))entregar(o);},0);}   // mostra o que já tinha no aparelho
  else if(!online)setTimeout(function(){if(ouvintes.has(k)&&!o.temRaw)entregar(o);},0);
  agendar(60);return function(){ouvintes.delete(k);};}
function entregar(o){var v=aplicarFila(o.spec,o.raw),s=JSON.stringify(v);if(s!==o.ult){o.ult=s;o.entrega(v);}}
function reentregar(){ouvintes.forEach(function(o){if(!o.virtual)entregar(o);});}
function aposGravar(){agendar(250);}

function Q(col,f,o,l){this.col=col;this.f=f||[];this.o=o||null;this.l=l||null;}
Q.prototype.where=function(field,op,v){return new Q(this.col,this.f.concat([[field,op,v]]),this.o,this.l);};
Q.prototype.orderBy=function(field,dir){return new Q(this.col,this.f,[field,dir||'asc'],this.l);};
Q.prototype.limit=function(n){return new Q(this.col,this.f,this.o,n);};
Q.prototype.doc=function(id){return new D(this.col,id||(Date.now().toString(36)+Math.random().toString(36).slice(2,8)));};
Q.prototype.add=async function(data){var d=this.doc();await d.set(data);return d;};
Q.prototype._spec=function(){return{col:this.col,f:this.f,o:this.o,l:this.l};};
Q.prototype.get=async function(){var v=virtualRows(this.col);if(v)return snapQ(v);var sp=this._spec();
  try{var r=await api('multi',{qs:[Object.assign({k:'x'},sp)]},20000);return snapQ(aplicarFila(sp,r.x||[]));}
  catch(e){if(!e.rede)throw e;return snapQ(aplicarFila(sp,lsGet(LS_Q+chave(sp))||linhasLocais(sp.col)));}};
Q.prototype.onSnapshot=function(next,err){var self=this;
  return registrar(this._spec(),function(rows){next(snapQ(rows||[]));},err,virtualRows(this.col)?function(){return virtualRows(self.col);}:null);};

function D(col,id){this.col=col;this.id=String(id);this.path=col+'/'+id;}
D.prototype.collection=function(){throw new TypeError('Subcoleções não são suportadas.');};
D.prototype.get=async function(){var v=virtualDoc(this.col,this.id);if(v!==undefined)return snapDoc(this.id,v);if(this.col==='pessoas')return snapDoc(this.id,null);
  var sp={col:this.col,id:this.id};
  try{var r=await api('multi',{qs:[{k:'x',col:this.col,id:this.id}]},15000);return snapDoc(this.id,aplicarFila(sp,r.x));}
  catch(e){if(!e.rede)throw e;return snapDoc(this.id,aplicarFila(sp,docLocal(this.col,this.id)));}};
D.prototype.set=async function(data){if(virtualDoc(this.col,this.id)!==undefined||this.col==='pessoas')return;await gravar('set',this.col,this.id,JSON.parse(JSON.stringify(data)));};
D.prototype.update=async function(patch){if(virtualDoc(this.col,this.id)!==undefined||this.col==='pessoas')return;await gravar('merge',this.col,this.id,JSON.parse(JSON.stringify(patch)));};
D.prototype.delete=async function(){if(virtualDoc(this.col,this.id)!==undefined||this.col==='pessoas')return;await gravar('del',this.col,this.id,null);};
D.prototype.acquire=async function(){return{acquired:true};};
D.prototype.onSnapshot=function(next,err){var self=this,v=virtualDoc(this.col,this.id);
  if(v!==undefined)return registrar(null,function(d){next(snapDoc(self.id,d));},err,function(){return virtualDoc(self.col,self.id);});
  return registrar({col:this.col,id:this.id},function(d){next(snapDoc(self.id,d));},err,null);};

var dbApi={doc:function(p){var s=String(p).split('/');if(s.length!==2)throw new TypeError('Caminho inválido: '+p);return new D(s[0],s[1]);},
  collection:function(p){if(String(p).indexOf('/')>=0)throw new TypeError('Coleção inválida: '+p);return new Q(p);}};
var userApi={
  id:async function(){return me&&me.id;},
  isOwner:function(){return!!(me&&me.admin);},
  canEdit:function(){return!!(me&&(me.admin||(me.papeis||[]).indexOf('gerente')>=0));},
  can:function(){return!!(me&&me.ativo);},
  me:async function(){return{id:me.id,name:me.nome};},
  profiles:async function(ids){var o={};(ids||[]).forEach(function(i){var p=perfis.find(function(x){return x.id===i;});o[i]={name:p?p.nome:''};});return o;},
  search:null};
var dlApi={save:async function(req){var blob=req.data instanceof Blob?req.data:new Blob([req.data],{type:/\.csv$/i.test(req.filename)?'text/csv;charset=utf-8':'application/octet-stream'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=req.filename;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(url);a.remove();},2000);return{status:'saved'};}};

window.claude={use:function(name){return ready.then(function(){return{db:dbApi,user:userApi,downloads:dlApi}[name]||null;});}};
iniciar().catch(function(e){tela('<h2>Erro</h2><p>'+h(e.message||e)+'</p>');});
})();
