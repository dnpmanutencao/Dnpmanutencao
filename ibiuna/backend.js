/* Pedreira Ibiúna · camada de servidor (Supabase): login por matrícula, banco de dados e usuários.
   Expõe window.claude.use('db' | 'user' | 'downloads') com a mesma interface que o app já usa. */
(function(){
'use strict';
var CFG=window.IBIUNA_CONFIG||{};
var IB=window.IBIUNA={standalone:true};
var configurado=CFG.SUPABASE_URL&&CFG.SUPABASE_URL.indexOf('SEU-PROJETO')<0&&CFG.SUPABASE_ANON_KEY&&CFG.SUPABASE_ANON_KEY.indexOf('COLE-AQUI')<0;
var sb=null, me=null, perfis=[], perfisFns=new Set();
var readyResolve, ready=new Promise(function(r){readyResolve=r;});

/* ---------------- utilidades ---------------- */
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function normMat(m){return String(m||'').trim().toLowerCase().replace(/\s+/g,'');}
function emailDe(m){return normMat(m)+'@'+(CFG.DOMINIO_LOGIN||'usuarios.pedreiraibiuna.com.br');}
function matValida(m){return /^[a-z0-9._-]{1,40}$/.test(normMat(m));}
function mapErr(e){
  if(!e)return{code:'unavailable',message:'Erro desconhecido'};
  var msg=e.message||String(e),c=e.code||'';
  if(c==='42501'||c==='P0001'||c==='23505'||c==='23514'||/row-level security/i.test(msg))
    return{code:'permission',message:c==='23505'?'Já existe um registro com esse identificador.':/row-level security/i.test(msg)?'Sem permissão para esta ação.':msg};
  if(c==='P0002')return{code:'invalid_argument',message:msg};
  if(c==='PGRST301'||/JWT/i.test(msg))return{code:'revoked',message:'Sessão expirada. Entre novamente.'};
  return{code:'unavailable',message:msg};
}
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
var LOGO='<div class="logo"><svg width="40" height="30" viewBox="0 0 40 30"><path d="M1 28 L14 8 L20 16 L26 6 L39 28 Z" fill="#22a34f"/><path d="M14 8 L17.5 13.5 L14 12 L10.6 13.3 Z M26 6 L30 12.4 L26 11 L22.3 12.6Z" fill="#fff"/></svg><b>PEDREIRA IBIÚNA</b></div>';
function tela(html,bind){auth.style.display='flex';auth.innerHTML='<div class="ab">'+LOGO+html+'</div>';if(bind)bind(auth);}
function erro(t){var e=auth.querySelector('.err');if(e)e.textContent=t||'';}
function carregando(b,on,txt){if(!b)return;b.disabled=on;if(on){b.dataset.t=b.textContent;b.textContent=txt||'Aguarde…';}else if(b.dataset.t)b.textContent=b.dataset.t;}

function telaConfig(){tela('<h2>Falta configurar</h2><p>Preencha o endereço e a chave do Supabase no arquivo <b>config.js</b> (veja o LEIAME.md). Depois recarregue esta página.</p>');}
function telaLogin(msg){
  tela('<h2>Entrar</h2><p>Use sua matrícula e senha.</p><form id="fLogin"><div><label class="fl">Matrícula</label><input class="inp" name="m" autocomplete="username" autocapitalize="none" required></div>'+
    '<div><label class="fl">Senha</label><input class="inp" name="s" type="password" autocomplete="current-password" required></div><div class="err">'+h(msg||'')+'</div><button class="btn" type="submit">Entrar</button></form>'+
    '<p style="margin:14px 0 0;font-size:13px">Esqueceu a senha? Peça ao administrador do sistema para redefinir.</p>',function(el){
    var f=el.querySelector('#fLogin');f.m.focus();
    f.onsubmit=async function(e){e.preventDefault();erro('');if(!matValida(f.m.value))return erro('Matrícula inválida.');
      var b=f.querySelector('button');carregando(b,true,'Entrando…');
      var r=await sb.auth.signInWithPassword({email:emailDe(f.m.value),password:f.s.value});
      carregando(b,false);
      if(r.error){return erro(/invalid login/i.test(r.error.message)?'Matrícula ou senha incorretas.':/fetch|network/i.test(r.error.message)?'Sem conexão com o servidor. Confira a internet.':r.error.message);}
      aposLogin();};});}
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
      var r=await sb.auth.signUp({email:emailDe(f.m.value),password:f.s.value});
      if(r.error){carregando(b,false);return erro(r.error.message);}
      if(!r.data.session){carregando(b,false);return erro('O Supabase está pedindo confirmação de e-mail. Desligue "Confirm email" em Authentication → Sign In / Providers → Email e tente de novo.');}
      var x=await sb.rpc('criar_primeiro_admin',{p_matricula:normMat(f.m.value),p_nome:f.n.value.trim()});
      carregando(b,false);if(x.error)return erro(x.error.message);aposLogin();};});}
function telaTrocarSenha(obrigatorio,onDone){
  var box=obrigatorio?null:document.createElement('div');
  var html='<h2>'+(obrigatorio?'Crie sua senha':'Trocar senha')+'</h2><p>'+(obrigatorio?'Sua senha atual é provisória. Escolha uma senha pessoal para continuar.':'Escolha a nova senha.')+'</p><form id="fPw">'+
    '<div><label class="fl">Nova senha (mín. 6)</label><input class="inp" name="s" type="password" autocomplete="new-password" required></div><div><label class="fl">Repita a nova senha</label><input class="inp" name="s2" type="password" autocomplete="new-password" required></div>'+
    '<div class="err"></div><button class="btn" type="submit">Salvar senha</button>'+(obrigatorio?'<button type="button" class="lk" id="pwSair">Sair</button>':'')+'</form>';
  tela(html,function(el){var f=el.querySelector('#fPw');var sair=el.querySelector('#pwSair');if(sair)sair.onclick=sairConta;
    f.onsubmit=async function(e){e.preventDefault();erro('');if(f.s.value.length<6)return erro('A senha precisa ter pelo menos 6 caracteres.');if(f.s.value!==f.s2.value)return erro('As senhas não conferem.');
      var b=f.querySelector('button');carregando(b,true,'Salvando…');var r=await sb.auth.updateUser({password:f.s.value});
      if(r.error){carregando(b,false);return erro(/different from the old/i.test(r.error.message)?'A nova senha precisa ser diferente da atual.':r.error.message);}
      await sb.rpc('senha_trocada');carregando(b,false);if(me)me.trocar_senha=false;onDone&&onDone();};});
  if(!obrigatorio){var x=document.createElement('button');x.className='lk';x.textContent='Cancelar';x.onclick=function(){auth.style.display='none';};auth.querySelector('form').appendChild(x);}
}
function telaSemAcesso(t){tela('<h2>Sem acesso</h2><p>'+h(t)+'</p><button class="btn" id="saiB">Sair</button>',function(el){el.querySelector('#saiB').onclick=sairConta;});}
async function sairConta(){try{await sb.auth.signOut();}catch(e){}location.reload();}
IB.sair=sairConta;

/* ---------------- fluxo de entrada ---------------- */
async function iniciar(){
  if(!configurado||!window.supabase){return telaConfig();}
  sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'ibiuna-auth'}});
  IB.sb=sb;
  tela('<p>Conectando…</p>');
  var s=await sb.auth.getSession();
  if(s.data&&s.data.session)return aposLogin();
  var r=await sb.rpc('ha_usuarios');
  if(r.error)return tela('<h2>Sem conexão</h2><p>Não foi possível falar com o servidor ('+h(r.error.message)+'). Confira a internet e o config.js, e recarregue.</p>');
  if(r.data===false)return telaPrimeiroAcesso();
  telaLogin();
}
async function aposLogin(){
  var u=(await sb.auth.getUser()).data.user;if(!u)return telaLogin();
  var r=await sb.from('perfis').select('*').eq('id',u.id).maybeSingle();
  if(r.error)return telaSemAcesso('Erro ao carregar seu cadastro: '+r.error.message);
  if(!r.data)return telaSemAcesso('Sua conta não está cadastrada no sistema. Fale com o administrador.');
  if(!r.data.ativo)return telaSemAcesso('Sua conta está desativada. Fale com o administrador.');
  me=r.data;
  if(me.trocar_senha)return telaTrocarSenha(true,entrar);
  entrar();
}
async function entrar(){
  auth.style.display='none';
  await carregarPerfis();
  sb.channel('perfis').on('postgres_changes',{event:'*',schema:'public',table:'perfis'},function(){carregarPerfis();}).subscribe();
  setInterval(carregarPerfis,60000);
  sb.auth.onAuthStateChange(function(ev){if(ev==='SIGNED_OUT')location.reload();});
  montarCabecalho();
  readyResolve(true);
}
async function carregarPerfis(){
  var r=await sb.from('perfis').select('id,matricula,nome,papeis,admin,ativo,trocar_senha').order('nome');
  if(r.error)return;perfis=r.data||[];
  var eu=perfis.find(function(p){return p.id===me.id;});
  if(!eu||!eu.ativo){alert0('Sua conta foi desativada.');return sairConta();}
  me=Object.assign(me,eu);
  perfisFns.forEach(function(f){try{f();}catch(e){}});
  if(typeof render==='function')render();
}
function alert0(t){try{if(typeof toast==='function')toast(t,true);}catch(e){}}

/* ---------------- cabeçalho / minha conta ---------------- */
function iniciais(n){return String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(function(p){return p[0];}).join('').toUpperCase();}
function montarCabecalho(){var hd=document.querySelector('header');if(!hd||document.getElementById('userBtn'))return;
  var b=document.createElement('button');b.id='userBtn';b.title='Minha conta';b.textContent=iniciais(me.nome);hd.appendChild(b);
  b.onclick=minhaConta;}
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
  html+='<p class="note">Administrador e Gerente têm acesso a tudo. Todos podem lançar produção, abrir OS, fazer inspeções e criar requisições. As permissões são conferidas no servidor.</p>';
  box.innerHTML=html;
  if(!adm)return;
  box.querySelector('#uNovo').onclick=novoUsuario;
  box.onclick=async function(e){
    var r=e.target.closest('[data-urole]');if(r){var p=perfis.find(function(x){return x.id===r.dataset.uid;});var set=new Set(p.papeis||[]);set.has(r.dataset.urole)?set.delete(r.dataset.urole):set.add(r.dataset.urole);
      r.disabled=true;var x=await sb.from('perfis').update({papeis:Array.from(set)}).eq('id',p.id);if(x.error)toast(x.error.message,true);else toast('✔ Papéis atualizados');await carregarPerfis();return;}
    var pw=e.target.closest('[data-upw]');if(pw){var p2=perfis.find(function(x){return x.id===pw.dataset.upw;});
      var sug=String(Math.floor(100000+Math.random()*900000));
      var v=await askText('Nova senha provisória para '+p2.nome+' (mín. 6). A pessoa vai criar a própria senha no próximo acesso. Sugestão: '+sug,'',"Redefinir",false);if(v===null)return;v=v||sug;
      if(v.length<6)return toast('A senha precisa ter pelo menos 6 caracteres.',true);
      var y=await sb.rpc('admin_definir_senha',{p_user:p2.id,p_senha:v});if(y.error)return toast(y.error.message,true);
      await carregarPerfis();return sheet('Senha redefinida','<p>Passe para <b>'+h(p2.nome)+'</b>:</p><div class="kv"><span>Matrícula</span><b>'+h(p2.matricula)+'</b><span>Senha provisória</span><b style="font-size:22px;letter-spacing:.08em">'+h(v)+'</b></div>');}
    var at=e.target.closest('[data-uativo]');if(at){var p3=perfis.find(function(x){return x.id===at.dataset.uativo;});
      if(p3.ativo&&!await ask('Desativar '+p3.nome+'? A pessoa perde o acesso imediatamente (os lançamentos dela continuam).','Desativar',true))return;
      var z=await sb.from('perfis').update({ativo:!p3.ativo}).eq('id',p3.id);if(z.error)toast(z.error.message,true);else toast(p3.ativo?'Usuário desativado':'Usuário reativado');await carregarPerfis();return;}
    var ad=e.target.closest('[data-uadm]');if(ad){var p4=perfis.find(function(x){return x.id===ad.dataset.uadm;});
      if(!await ask((p4.admin?'Tirar o acesso de administrador de ':'Tornar administrador: ')+p4.nome+'?',p4.admin?'Tirar':'Tornar admin'))return;
      var q=await sb.from('perfis').update({admin:!p4.admin}).eq('id',p4.id);if(q.error)toast(q.error.message,true);await carregarPerfis();}
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
      var b=f.querySelector('button[type=submit]');busy(f,true);
      try{
        var tmp=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'ibiuna-tmp'}});
        var r=await tmp.auth.signUp({email:emailDe(m),password:s});
        if(r.error)throw new Error(/registered|exists/i.test(r.error.message)?'Já existe uma conta com essa matrícula no Supabase (Authentication → Users). Apague-a lá ou use outra matrícula.':r.error.message);
        var uid=r.data.user&&r.data.user.id;if(!uid||(r.data.user.identities&&r.data.user.identities.length===0))throw new Error('Já existe uma conta com essa matrícula no Supabase.');
        var v=await sb.rpc('admin_vincular_usuario',{p_user:uid,p_matricula:m,p_nome:n,p_papeis:Array.from(body.querySelectorAll('#nuPap .chip.on')).map(function(c){return c.dataset.v;}),p_admin:f.adm.checked});
        if(v.error)throw new Error(v.error.message);
        await carregarPerfis();sh.close();
        sheet('Usuário cadastrado','<p>Passe para <b>'+h(n)+'</b>. No primeiro acesso, o sistema pede para criar uma senha pessoal.</p><div class="kv"><span>Endereço</span><b>'+h(location.href.split('#')[0])+'</b><span>Matrícula</span><b>'+h(m)+'</b><span>Senha provisória</span><b style="font-size:22px;letter-spacing:.08em">'+h(s)+'</b></div>');
      }catch(err){toast(err.message,true);}finally{busy(f,false);}};});}

/* ---------------- banco de dados (mesma interface do app) ---------------- */
var chans={};
function ouvir(col,fn){var c=chans[col];
  if(!c){c=chans[col]={fns:new Set()};
    c.ch=sb.channel('docs-'+col).on('postgres_changes',{event:'*',schema:'public',table:'docs',filter:'col=eq.'+col},function(){c.fns.forEach(function(f){f();});}).subscribe();}
  c.fns.add(fn);return function(){c.fns.delete(fn);};}
function avisar(col){var c=chans[col];if(c)c.fns.forEach(function(f){f();});}
function snapDoc(id,data){return{id:id,exists:data!=null,data:function(){return data==null?undefined:data;},metadata:{fromCache:false,hasPendingWrites:false}};}
function snapQ(rows){var docs=rows.map(function(r){return snapDoc(r.id,r.data);});return{docs:docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false,hasPendingWrites:false},docChanges:function(){return[];}};}
function cmp(a,b){if(a==null&&b==null)return 0;if(a==null)return 1;if(b==null)return -1;if(typeof a==='number'&&typeof b==='number')return a-b;return String(a).localeCompare(String(b));}

// coleções "virtuais" vindas da tabela de usuários
function virtualRows(col){if(col==='pessoas')return perfis.filter(function(p){return p.ativo;}).map(function(p){return{id:p.id,data:{uid:p.id,visto:''}};});return null;}
function virtualDoc(col,id){if(col==='cfg'&&id==='papeis'){var u={};perfis.forEach(function(p){if(p.ativo)u[p.id]={roles:p.papeis||[]};});return{users:u};}return undefined;}

function Q(col,f,o,l){this.col=col;this.f=f||[];this.o=o||null;this.l=l||null;}
Q.prototype.where=function(field,op,v){return new Q(this.col,this.f.concat([[field,op,v]]),this.o,this.l);};
Q.prototype.orderBy=function(field,dir){return new Q(this.col,this.f,[field,dir||'asc'],this.l);};
Q.prototype.limit=function(n){return new Q(this.col,this.f,this.o,n);};
Q.prototype.doc=function(id){return new D(this.col,id||(Date.now().toString(36)+Math.random().toString(36).slice(2,8)));};
Q.prototype.add=async function(data){var d=this.doc();await d.set(data);return d;};
Q.prototype._run=async function(){
  var v=virtualRows(this.col);if(v)return v;
  var self=this,out=[],from=0,PAGE=1000,lim=this.l||Infinity;
  for(;;){var b=sb.from('docs').select('id,data').eq('col',self.col);
    self.f.forEach(function(x){var k='data->>'+x[0],v=x[2];var sv=v==null?null:String(v);
      switch(x[1]){case'==':case'eq':b=v==null?b.is(k,null):b.eq(k,sv);break;case'!=':case'ne':b=b.neq(k,sv);break;case'<':case'lt':b=b.lt(k,sv);break;case'<=':case'lte':b=b.lte(k,sv);break;
        case'>':case'gt':b=b.gt(k,sv);break;case'>=':case'gte':b=b.gte(k,sv);break;case'in':b=b.in(k,(v||[]).map(String));break;case'not-in':b=b.not(k,'in','('+(v||[]).map(String).join(',')+')');break;}});
    if(self.o)b=b.order('data->>'+self.o[0],{ascending:self.o[1]!=='desc',nullsFirst:false});
    b=b.order('id');
    var n=Math.min(PAGE,lim-out.length),r=await b.range(from,from+n-1);
    if(r.error)throw mapErr(r.error);
    out=out.concat(r.data||[]);if((r.data||[]).length<n||out.length>=lim)break;from+=n;}
  if(self.o){var k=self.o[0],ds=self.o[1]==='desc'?-1:1;out.sort(function(a,b){return cmp(a.data[k],b.data[k])*ds;});}
  return out;};
Q.prototype.get=async function(){return snapQ(await this._run());};
Q.prototype.onSnapshot=function(next,err){var self=this,vivo=true,t=null,rodando=false,denovo=false;
  async function run(){if(!vivo)return;if(rodando){denovo=true;return;}rodando=true;
    try{var rows=await self._run();if(vivo)next(snapQ(rows));}catch(e){if(vivo&&e.code==='revoked'){vivo=false;err&&err(e);}}
    rodando=false;if(denovo){denovo=false;run();}}
  function deb(){clearTimeout(t);t=setTimeout(run,300);}
  run();var un=self.col==='pessoas'?(perfisFns.add(deb),function(){perfisFns.delete(deb);}):ouvir(self.col,deb);
  var iv=setInterval(run,45000);function vis(){if(document.visibilityState==='visible')deb();}document.addEventListener('visibilitychange',vis);
  return function(){vivo=false;un();clearInterval(iv);document.removeEventListener('visibilitychange',vis);};};

function D(col,id){this.col=col;this.id=id;this.path=col+'/'+id;}
D.prototype.collection=function(){throw new TypeError('Subcoleções não são suportadas.');};
D.prototype._get=async function(){var v=virtualDoc(this.col,this.id);if(v!==undefined)return v;
  var r=await sb.from('docs').select('data').eq('col',this.col).eq('id',this.id).maybeSingle();if(r.error)throw mapErr(r.error);return r.data?r.data.data:null;};
D.prototype.get=async function(){return snapDoc(this.id,await this._get());};
D.prototype.set=async function(data){if(virtualDoc(this.col,this.id)!==undefined||this.col==='pessoas')return;
  var body=JSON.parse(JSON.stringify(data));
  var u=await sb.from('docs').update({data:body}).eq('col',this.col).eq('id',this.id).select('id');
  if(u.error)throw mapErr(u.error);
  if(!u.data||!u.data.length){var i=await sb.from('docs').insert({col:this.col,id:this.id,data:body});if(i.error)throw mapErr(i.error);}
  avisar(this.col);};
D.prototype.update=async function(patch){if(virtualDoc(this.col,this.id)!==undefined)return;
  var r=await sb.rpc('doc_merge',{p_col:this.col,p_id:this.id,p_patch:JSON.parse(JSON.stringify(patch))});if(r.error)throw mapErr(r.error);avisar(this.col);};
D.prototype.delete=async function(){if(virtualDoc(this.col,this.id)!==undefined||this.col==='pessoas')return;
  var r=await sb.from('docs').delete().eq('col',this.col).eq('id',this.id);if(r.error)throw mapErr(r.error);avisar(this.col);};
D.prototype.acquire=async function(){return{acquired:true};};
D.prototype.onSnapshot=function(next,err){var self=this,vivo=true,t=null;
  async function run(){try{var d=await self._get();if(vivo)next(snapDoc(self.id,d));}catch(e){if(vivo&&e.code==='revoked'){vivo=false;err&&err(e);}}}
  function deb(){clearTimeout(t);t=setTimeout(run,300);}
  run();var un=(self.col==='cfg'&&self.id==='papeis')?(perfisFns.add(deb),function(){perfisFns.delete(deb);}):ouvir(self.col,deb);
  var iv=setInterval(run,60000);
  return function(){vivo=false;un();clearInterval(iv);};};

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
