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
function erroApp(codigo,msg){var c=codigo==='permissao'?'permission':codigo==='sessao'?'revoked':codigo==='naoencontrado'?'permission':codigo==='login'?'login':codigo==='erro'?'permission':'unavailable';return{code:c,message:msg};}
async function api(a,dados){
  var body=Object.assign({a:a,t:tokenAtual},dados||{}),r,j;
  for(var tent=0;tent<2;tent++){
    try{r=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'});
      j=await r.json();break;}
    catch(e){if(tent===1)throw erroApp('rede','Sem conexão com o servidor. Confira a internet e tente de novo.');await new Promise(function(ok){setTimeout(ok,800);});}
  }
  if(!j.ok){var er=erroApp(j.codigo,j.erro);if(er.code==='revoked'&&me){guardaToken(null);setTimeout(function(){telaLogin(j.erro);},0);}throw er;}
  return j.r;
}
IB.api=api;
var ROLE_LBL={manutencao:'Manutenção',almoxarife:'Almoxarife',compras:'Compras',supervisor:'Supervisor',gerente:'Gerente'};

/* ---------------- tela de acesso ---------------- */
var css='#auth{position:fixed;inset:0;z-index:100;background:linear-gradient(160deg,#072a17,#0f4f2b 60%,#126235);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}'+
 '#auth .ab{background:#fff;border-radius:16px;max-width:400px;width:100%;padding:22px 20px;box-shadow:0 10px 40px rgba(0,0,0,.3)}'+
 '#auth h2{margin:0 0 4px;font:700 26px "Barlow Condensed",sans-serif;color:#0f4f2b;letter-spacing:.03em}#auth p{margin:0 0 14px;color:#5b6a61;font-size:14px;line-height:1.4}'+
 '#auth form{display:grid;gap:12px}#auth .err{color:#d63b2b;font-weight:600;font-size:14px;min-height:18px}#auth .lk{background:none;border:0;color:#126235;font-weight:700;text-decoration:underline;padding:6px;font-size:14px}'+
 '#auth .logo{display:flex;align-items:center;gap:10px;margin-bottom:14px}#auth .logo b{font:700 22px "Barlow Condensed";color:#0b3d22;letter-spacing:.04em}'+
 '#userBtn{flex:none;width:38px;height:38px;border-radius:50%;border:2px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);color:#fff;font:700 15px "Barlow Condensed";letter-spacing:.02em}'+
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
function sairConta(){guardaToken(null);location.reload();}
IB.sair=sairConta;

/* ---------------- fluxo de entrada ---------------- */
async function iniciar(){
  if(!configurado)return telaConfig();
  tela('<p>Conectando…</p>');
  if(tokenAtual){try{me=await api('eu');return aposLogin();}catch(e){guardaToken(null);if(e.code==='unavailable')return tela('<h2>Sem conexão</h2><p>'+h(e.message)+'</p><button class="btn" onclick="location.reload()">Tentar de novo</button>');}}
  try{var ha=await api('haUsuarios');}catch(e){return tela('<h2>Sem conexão</h2><p>Não foi possível falar com o servidor ('+h(e.message)+'). Confira a internet e o config.js.</p><button class="btn" onclick="location.reload()">Tentar de novo</button>');}
  if(ha===false)return telaPrimeiroAcesso();
  telaLogin();
}
function aposLogin(){if(me.trocar_senha)return telaTrocarSenha(true,entrar);entrar();}
var entrou=false;
async function entrar(){
  auth.style.display='none';if(entrou)return;entrou=true;
  await carregarPerfis();setInterval(carregarPerfis,90000);
  montarCabecalho();readyResolve(true);
}
async function carregarPerfis(){
  try{perfis=await api('usuarios');}catch(e){return;}
  var eu=perfis.find(function(p){return p.id===me.id;});if(eu)me=Object.assign(me,eu);
  perfisFns.forEach(function(f){try{f();}catch(e){}});
  if(typeof render==='function')render();
}

/* ---------------- cabeçalho / minha conta ---------------- */
function iniciais(n){return String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(function(p){return p[0];}).join('').toUpperCase();}
function montarCabecalho(){var hd=document.querySelector('header');if(!hd||document.getElementById('userBtn'))return;
  var b=document.createElement('button');b.id='userBtn';b.title='Minha conta';b.textContent=iniciais(me.nome);hd.appendChild(b);b.onclick=minhaConta;}
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
    lst.forEach(function(o){if(ouvintes.has(o.k)&&r.hasOwnProperty(o.k)){var v=r[o.k],s=JSON.stringify(v);if(s!==o.ult){o.ult=s;o.entrega(v);}}});}
  catch(e){if(e.code==='revoked')lst.forEach(function(o){o.err&&o.err(e);});}
  pollRodando=false;if(pollDeNovo){pollDeNovo=false;agendar(200);}else agendar();
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')agendar(100);});
function snapDoc(id,data){return{id:id,exists:data!=null,data:function(){return data==null?undefined:data;},metadata:{fromCache:false,hasPendingWrites:false}};}
function snapQ(rows){var docs=rows.map(function(r){return snapDoc(r.id,r.data);});return{docs:docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false,hasPendingWrites:false},docChanges:function(){return[];}};}
function virtualRows(col){if(col==='pessoas')return perfis.filter(function(p){return p.ativo;}).map(function(p){return{id:p.id,data:{uid:p.id,visto:''}};});return null;}
function virtualDoc(col,id){if(col==='cfg'&&id==='papeis'){var u={};perfis.forEach(function(p){if(p.ativo)u[p.id]={roles:p.papeis||[]};});return{users:u};}return undefined;}
function registrar(spec,entrega,err,virtual){var k='q'+(++seq);ouvintes.set(k,{k:k,spec:spec,entrega:entrega,err:err,virtual:virtual,ult:null});
  if(virtual){var f=function(){entrega(virtual());};perfisFns.add(f);f();return function(){ouvintes.delete(k);perfisFns.delete(f);};}
  agendar(60);return function(){ouvintes.delete(k);};}
function aposGravar(){agendar(250);}

function Q(col,f,o,l){this.col=col;this.f=f||[];this.o=o||null;this.l=l||null;}
Q.prototype.where=function(field,op,v){return new Q(this.col,this.f.concat([[field,op,v]]),this.o,this.l);};
Q.prototype.orderBy=function(field,dir){return new Q(this.col,this.f,[field,dir||'asc'],this.l);};
Q.prototype.limit=function(n){return new Q(this.col,this.f,this.o,n);};
Q.prototype.doc=function(id){return new D(this.col,id||(Date.now().toString(36)+Math.random().toString(36).slice(2,8)));};
Q.prototype.add=async function(data){var d=this.doc();await d.set(data);return d;};
Q.prototype._spec=function(){return{col:this.col,f:this.f,o:this.o,l:this.l};};
Q.prototype.get=async function(){var v=virtualRows(this.col);if(v)return snapQ(v);var r=await api('multi',{qs:[Object.assign({k:'x'},this._spec())]});return snapQ(r.x||[]);};
Q.prototype.onSnapshot=function(next,err){var self=this;
  return registrar(this._spec(),function(rows){next(snapQ(rows||[]));},err,virtualRows(this.col)?function(){return virtualRows(self.col);}:null);};

function D(col,id){this.col=col;this.id=String(id);this.path=col+'/'+id;}
D.prototype.collection=function(){throw new TypeError('Subcoleções não são suportadas.');};
D.prototype.get=async function(){var v=virtualDoc(this.col,this.id);if(v!==undefined)return snapDoc(this.id,v);if(this.col==='pessoas')return snapDoc(this.id,null);
  var r=await api('multi',{qs:[{k:'x',col:this.col,id:this.id}]});return snapDoc(this.id,r.x);};
D.prototype.set=async function(data){if(virtualDoc(this.col,this.id)!==undefined||this.col==='pessoas')return;await api('set',{col:this.col,id:this.id,data:JSON.parse(JSON.stringify(data))});aposGravar();};
D.prototype.update=async function(patch){if(virtualDoc(this.col,this.id)!==undefined||this.col==='pessoas')return;await api('merge',{col:this.col,id:this.id,data:JSON.parse(JSON.stringify(patch))});aposGravar();};
D.prototype.delete=async function(){if(virtualDoc(this.col,this.id)!==undefined||this.col==='pessoas')return;await api('del',{col:this.col,id:this.id});aposGravar();};
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
