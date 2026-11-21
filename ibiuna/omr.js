/* Pedreira Ibiúna · leitura das folhas de marcação (bolinhas) pela foto, no próprio aparelho, sem internet.
   1) acha os 4 quadrados pretos dos cantos e o quadradinho de orientação; 2) calcula a perspectiva;
   3) mede o quanto cada bolinha está preenchida e monta os números. A pessoa sempre confere antes de salvar. */
(function(root){
'use strict';
function otsu(g){var h=new Float64Array(256),n=g.length,i;for(i=0;i<n;i++)h[g[i]]++;var sum=0;for(i=0;i<256;i++)sum+=i*h[i];
  var sB=0,wB=0,best=0,t=128;for(i=0;i<256;i++){wB+=h[i];if(!wB)continue;var wF=n-wB;if(!wF)break;sB+=i*h[i];var mB=sB/wB,mF=(sum-sB)/wF,v=wB*wF*(mB-mF)*(mB-mF);if(v>best){best=v;t=i;}}return t;}
// componentes escuros (8 vizinhos) com caixa, área e centro
function componentes(g,w,h,t){var lab=new Int32Array(w*h),st=new Int32Array(w*h),out=[],id=0;
  for(var p=0;p<w*h;p++){if(lab[p]||g[p]>=t)continue;id++;var sp=0;st[sp++]=p;lab[p]=id;var n=0,sx=0,sy=0,x0=w,x1=0,y0=h,y1=0;
    while(sp){var q=st[--sp],x=q%w,y=(q/w)|0;n++;sx+=x;sy+=y;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(var dy=-1;dy<=1;dy++){var yy=y+dy;if(yy<0||yy>=h)continue;for(var dx=-1;dx<=1;dx++){var xx=x+dx;if(xx<0||xx>=w)continue;var r=yy*w+xx;if(!lab[r]&&g[r]<t){lab[r]=id;st[sp++]=r;}}}}
    out.push({n:n,cx:sx/n,cy:sy/n,x0:x0,x1:x1,y0:y0,y1:y1});}
  return out;}
// homografia doc(mm) -> imagem(px), 4 pares
function homografia(src,dst){var A=[],b=[];for(var i=0;i<4;i++){var x=src[i][0],y=src[i][1],u=dst[i][0],v=dst[i][1];
    A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);}
  for(var c=0;c<8;c++){var m=c;for(var r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[m][c]))m=r;var tA=A[c];A[c]=A[m];A[m]=tA;var tb=b[c];b[c]=b[m];b[m]=tb;
    if(Math.abs(A[c][c])<1e-12)return null;for(var r2=c+1;r2<8;r2++){var f=A[r2][c]/A[c][c];for(var k=c;k<8;k++)A[r2][k]-=f*A[c][k];b[r2]-=f*b[c];}}
  var hh=new Array(8);for(var r3=7;r3>=0;r3--){var s=b[r3];for(var k2=r3+1;k2<8;k2++)s-=A[r3][k2]*hh[k2];hh[r3]=s/A[r3][r3];}return hh;}
function ap(H,x,y){var d=H[6]*x+H[7]*y+1;return[(H[0]*x+H[1]*y+H[2])/d,(H[3]*x+H[4]*y+H[5])/d];}
function px(g,w,h,x,y){if(x<0)x=0;if(y<0)y=0;if(x>w-1.001)x=w-1.001;if(y>h-1.001)y=h-1.001;var x0=x|0,y0=y|0,fx=x-x0,fy=y-y0,i=y0*w+x0;
  return g[i]*(1-fx)*(1-fy)+g[i+1]*fx*(1-fy)+g[i+w]*(1-fx)*fy+g[i+w+1]*fx*fy;}
// brilho médio dentro de um círculo (em mm) no papel
function media(g,w,h,H,cx,cy,rmm){var s=0,n=0;for(var a=-3;a<=3;a++)for(var b=-3;b<=3;b++){var dx=a/3*rmm,dy=b/3*rmm;if(dx*dx+dy*dy>rmm*rmm)continue;var p=ap(H,cx+dx,cy+dy);s+=px(g,w,h,p[0],p[1]);n++;}return s/n;}
function mediaQ(g,w,h,H,cx,cy,l){var s=0,n=0;for(var a=-2;a<=2;a++)for(var b=-2;b<=2;b++){var p=ap(H,cx+a/2*l*0.35,cy+b/2*l*0.35);s+=px(g,w,h,p[0],p[1]);n++;}return s/n;}
function horario(pts){var cx=0,cy=0;pts.forEach(function(p){cx+=p[0];cy+=p[1];});cx/=4;cy/=4;
  return pts.slice().sort(function(a,b){return Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx);});}
function areaQ(q){var s=0;for(var i=0;i<4;i++){var a=q[i],b=q[(i+1)%4];s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s)/2;}
function convexo(q){var sg=0;for(var i=0;i<4;i++){var a=q[i],b=q[(i+1)%4],c=q[(i+2)%4],z=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(!z)return false;var s=z>0?1:-1;if(sg&&s!==sg)return false;sg=s;}return true;}

function localizar(g,w,h,L){
  var t=otsu(g),cs=componentes(g,w,h,Math.min(t,150)),mn=Math.min(w,h),mx=Math.max(w,h);
  var cand=cs.filter(function(c){var bw=c.x1-c.x0+1,bh=c.y1-c.y0+1,s=Math.max(bw,bh);return s>=mn*0.012&&s<=mx*0.09&&c.n/(bw*bh)>0.72&&bw/bh>0.55&&bw/bh<1.8;})
    .sort(function(a,b){return b.n-a.n;}).slice(0,12);
  if(cand.length<4)return null;
  var D=L.fid,PW=L.pagina[0],PH=L.pagina[1],O=L.ori,sim=[[PW-O[0],O[1]],[PW-O[0],PH-O[1]],[O[0],PH-O[1]]],best=null;
  for(var a=0;a<cand.length;a++)for(var b=a+1;b<cand.length;b++)for(var c=b+1;c<cand.length;c++)for(var d=c+1;d<cand.length;d++){
    var ks=[cand[a],cand[b],cand[c],cand[d]],tam=ks.map(function(k){return k.n;}),mi=Math.min.apply(null,tam),ma=Math.max.apply(null,tam);if(ma>mi*4)continue;
    var q=horario(ks.map(function(k){return[k.cx,k.cy];}));if(!convexo(q))continue;var ar=areaQ(q);if(ar<w*h*0.08)continue;
    for(var r=0;r<4;r++){var qq=[q[r],q[(r+1)%4],q[(r+2)%4],q[(r+3)%4]],H=homografia(D,qq);if(!H)continue;
      var o=mediaQ(g,w,h,H,O[0],O[1],L.oriL),os=sim.map(function(s){return mediaQ(g,w,h,H,s[0],s[1],L.oriL);}),ref=Math.max.apply(null,os);
      var sc=(ref-o)/Math.max(ref,1);if(sc<0.3)continue;var score=ar*sc;if(!best||score>best.score)best={score:score,H:H,q:qq};}}
  return best;}

function decidir(ds){var o=ds.map(function(d,i){return[d,i];}).sort(function(x,y){return y[0]-x[0];});var d1=o[0][0],d2=o.length>1?o[1][0]:0;
  if(d1>=0.36&&d1-d2>=0.16)return{st:'ok',i:o[0][1],d:d1};if(d1<0.22)return{st:'vazio',d:d1};return{st:'duvida',i:o[0][1],d:d1};}

function ler(g,w,h,L,tipo){
  var F=L.folhas[tipo];if(!F)return{ok:false,erro:'Tipo de folha desconhecido.'};
  var loc=localizar(g,w,h,L);
  if(!loc)return{ok:false,erro:'Não encontrei os 4 quadrados pretos dos cantos da folha. Fotografe a folha inteira, de cima, com boa luz e sem cortar os cantos.'};
  var H=loc.H,rS=L.r*0.62,todas=[],medidas=[];
  F.campos.forEach(function(c){(c.tipo==='num'?[].concat.apply([],c.cols):c.ops).forEach(function(b){b._m=media(g,w,h,H,b.x,b.y,rS);todas.push(b._m);});});
  var ord=todas.slice().sort(function(a,b){return a-b;}),ref=ord[Math.floor(ord.length*0.9)]||255;
  var dk=function(b){return Math.max(0,(ref-b._m)/ref);};
  var out={},marcas=[];
  F.campos.forEach(function(c){
    if(c.tipo==='escolha'){var dd=c.ops.map(dk),r=decidir(dd);c.ops.forEach(function(b,i){marcas.push({x:b.x,y:b.y,on:r.i===i&&r.st!=='vazio',st:r.i===i?r.st:'',d:dd[i]});});
      out[c.nome]={st:r.st,valor:r.st==='vazio'?null:c.ops[r.i].v};return;}
    var ds=c.cols.map(function(col){var dd=col.map(dk),r=decidir(dd);col.forEach(function(b,i){marcas.push({x:b.x,y:b.y,on:r.i===i&&r.st!=='vazio',st:r.i===i?r.st:'',d:dd[i]});});
      return{st:r.st,v:r.st==='vazio'?null:col[r.i].v};});
    if(ds.every(function(x){return x.st==='vazio';})){out[c.nome]={st:'vazio',valor:null};return;}
    var st='ok',txt='',ini=true;
    ds.forEach(function(x,i){if(i===c.int)txt+='.';if(x.st==='vazio'){if(i<c.int&&ini){txt+='0';}else if(i>=c.int){txt+='0';}else{st='duvida';txt+='0';}}else{ini=false;txt+=x.v;if(x.st==='duvida')st='duvida';}});
    out[c.nome]={st:st,valor:parseFloat(txt)};});
  return{ok:true,campos:out,marcas:marcas,H:H,quad:loc.q};}

var OMR={ler:ler,_homografia:homografia,_ap:ap};
// navegador: lê o arquivo de imagem e devolve o resultado + uma prévia com as marcas
OMR.lerArquivo=function(file,tipo){return new Promise(function(ok,no){
  var url=URL.createObjectURL(file),img=new Image();
  img.onload=function(){try{
      var MX=1700,sc=Math.min(1,MX/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.round(img.naturalWidth*sc),h=Math.round(img.naturalHeight*sc);
      var cv=document.createElement('canvas');cv.width=w;cv.height=h;var cx=cv.getContext('2d');cx.drawImage(img,0,0,w,h);
      var d=cx.getImageData(0,0,w,h).data,g=new Uint8Array(w*h);for(var i=0,j=0;i<g.length;i++,j+=4)g[i]=(d[j]*299+d[j+1]*587+d[j+2]*114)/1000;
      var r=ler(g,w,h,root.OMR_LAYOUT,tipo);
      // prévia reduzida com as bolinhas lidas
      var ps=Math.min(1,700/Math.max(w,h)),pv=document.createElement('canvas');pv.width=Math.round(w*ps);pv.height=Math.round(h*ps);var pc=pv.getContext('2d');pc.drawImage(cv,0,0,pv.width,pv.height);
      if(r.ok){pc.lineWidth=2;pc.strokeStyle='#1f6fd6';pc.beginPath();r.quad.forEach(function(p,k){pc[k?'lineTo':'moveTo'](p[0]*ps,p[1]*ps);});pc.closePath();pc.stroke();
        r.marcas.forEach(function(m){if(!m.on&&m.st!=='duvida')return;var p=ap(r.H,m.x,m.y);pc.beginPath();pc.arc(p[0]*ps,p[1]*ps,Math.max(3,6*ps*sc*2),0,7);
          if(m.st==='duvida'){pc.strokeStyle='#ef7d1a';pc.lineWidth=3;pc.stroke();}else{pc.fillStyle='rgba(34,163,79,.75)';pc.fill();}});}
      r.previa=pv.toDataURL('image/jpeg',0.8);URL.revokeObjectURL(url);ok(r);}catch(e){URL.revokeObjectURL(url);no(e);}};
  img.onerror=function(){URL.revokeObjectURL(url);no(new Error('Não consegui abrir a imagem.'));};img.src=url;});};
root.OMR=OMR;
if(typeof module!=='undefined')module.exports=OMR;
})(typeof window!=='undefined'?window:globalThis);
