/* ગોળાકાર ગતિ — Interactive labs */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var C={N:'#4ade80',mg:'#fb7185',f:'#fbbf24',v:'#60a5fa',T:'#c084fc',mut:'#9db0cc',ink:'#eaf1fd',
       grn:'#4ade80',red:'#fb7185',acc:'#4cc2ff',road:'#41608f',dash:'#2a3f6b',bg:'#0c1428'};
var g=9.8;
$('gSel').addEventListener('change',function(e){g=parseFloat(e.target.value);updateAll();});
function fmt(x,d){d=(d===undefined)?2:d;return (+x).toFixed(d);}
function box(id,k,val,cls){var el=$(id);if(!el)return;el.className='box'+(cls?' '+cls:'');
  el.innerHTML='<div class="k">'+k+'</div><div class="val">'+val+'</div>';}
function arrow(ctx,x1,y1,x2,y2,color,w){
  if(Math.hypot(x2-x1,y2-y1)<2)return;
  var a=Math.atan2(y2-y1,x2-x1),h=8+(w||3)*0.7;w=w||3;
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=w;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2-Math.cos(a)*h*0.5,y2-Math.sin(a)*h*0.5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x2,y2);
  ctx.lineTo(x2-h*Math.cos(a-0.45),y2-h*Math.sin(a-0.45));
  ctx.lineTo(x2-h*Math.cos(a+0.45),y2-h*Math.sin(a+0.45));ctx.closePath();ctx.fill();}
function txt(ctx,s,x,y,color,size,align){ctx.fillStyle=color||C.mut;
  ctx.font=(size||13)+'px "Noto Sans Gujarati",sans-serif';ctx.textAlign=align||'left';ctx.fillText(s,x,y);}
function dot(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle=color;ctx.fill();}
function circ(ctx,x,y,r,color,w,dash){ctx.save();if(dash)ctx.setLineDash(dash);
  ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.strokeStyle=color;ctx.lineWidth=w||2;ctx.stroke();ctx.restore();}
var RD=Math.PI/180;

/* ================= LAB 1 : FLAT CURVE ================= */
var flat={ang:0,mode:'circle',x:0,y:0,vx:0,vy:0,trail:[]};
function flatCalc(){
  var mu=+$('fMu').value,r=+$('fR').value,v=+$('fV').value;
  $('fMuV').textContent=(+mu).toFixed(2);$('fRV').textContent=r;$('fVV').textContent=v;
  var vm=Math.sqrt(mu*r*g);
  box('fVmax','મહત્તમ સુરક્ષિત ઝડપ v<sub>max</sub>',fmt(vm,1)+' m/s','ok');
  box('fKmh','= km/h માં',fmt(vm*3.6,0)+' km/h');
  var safe=v<=vm+1e-9;
  box('fSafe','આ ઝડપે વળાંક લઉં?',safe?'✔ સુરક્ષિત':'✘ સ્કિડ થશે!',safe?'ok':'bad');
  $('fSub').textContent='v\u2098\u2090\u2093 = \u221A(\u03BC r g) = \u221A('+fmt(mu,2)+' \u00D7 '+r+' \u00D7 '+fmt(g,1)+') = '+fmt(vm,2)+' m/s   |   આ ઝડપ માટે જરૂરી \u03BC = v\u00B2/(rg) = '+fmt(v*v/(r*g),3);
}
function drawFlat(dt){
  var cv=$('flatCv');if(!cv)return;var ctx=cv.getContext('2d');
  var mu=+$('fMu').value,r=+$('fR').value,v=+$('fV').value;
  var vm=Math.sqrt(mu*r*g),safe=v<=vm+1e-9;
  var cx=210,cy=175,R1=64,R2=132,lane=98;
  // motion
  if(safe){
    if(flat.mode==='fly'){flat.mode='circle';flat.ang=Math.atan2(flat.y-cy,flat.x-cx);}
    flat.ang+=(v/12)*dt;if(flat.ang>6.3)flat.ang-=6.3;
    flat.x=cx+lane*Math.cos(flat.ang);flat.y=cy+lane*Math.sin(flat.ang);
    flat.trail.length=Math.max(0,flat.trail.length-3);
  }else{
    if(flat.mode==='circle'){flat.mode='fly';
      var ux=-Math.sin(flat.ang),uy=Math.cos(flat.ang);
      flat.vx=ux*v*9;flat.vy=uy*v*9;}
    flat.x+=flat.vx*dt;flat.y+=flat.vy*dt;
    flat.trail.push([flat.x,flat.y]);if(flat.trail.length>240)flat.trail.shift();
    if(flat.x<-40||flat.x>700||flat.y<-40||flat.y>380){flat.mode='circle';flat.ang=Math.random()*6.3;flat.trail.length=0;}
  }
  // road
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R2,0,7);ctx.arc(cx,cy,R1,0,7);
  ctx.fillStyle=safe?'rgba(74,222,128,0.14)':'rgba(251,113,133,0.14)';ctx.fill('evenodd');ctx.restore();
  circ(ctx,cx,cy,R2,safe?C.grn:C.red,2.5);circ(ctx,cx,cy,R1,safe?C.grn:C.red,2.5);
  circ(ctx,cx,cy,lane,C.dash,1.4,[6,6]);
  ctx.strokeStyle=C.mut;ctx.lineWidth=1.6;
  ctx.beginPath();ctx.moveTo(cx-6,cy);ctx.lineTo(cx+6,cy);ctx.moveTo(cx,cy-6);ctx.lineTo(cx,cy+6);ctx.stroke();
  txt(ctx,'O',cx+8,cy+16,C.mut,12);
  txt(ctx,'r',cx+lane*0.55-4,cy-8,C.mut,12);
  // skid trail
  if(flat.trail.length>2){ctx.save();ctx.globalAlpha=0.75;ctx.strokeStyle=C.red;ctx.lineWidth=4;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(flat.trail[0][0],flat.trail[0][1]);
    for(var i=1;i<flat.trail.length;i++)ctx.lineTo(flat.trail[i][0],flat.trail[i][1]);ctx.stroke();ctx.restore();}
  // car
  var hd=Math.atan2((flat.mode==='circle')?Math.cos(flat.ang):flat.vy,(flat.mode==='circle')?-Math.sin(flat.ang):flat.vx);
  ctx.save();ctx.translate(flat.x,flat.y);ctx.rotate(hd);
  ctx.fillStyle=safe?C.v:C.red;ctx.fillRect(-16,-9,32,18);
  ctx.fillStyle='#0c1428';ctx.beginPath();ctx.arc(-9,11,4,0,7);ctx.arc(9,11,4,0,7);ctx.fill();ctx.restore();
  // arrows
  var hdx=Math.cos(hd),hdy=Math.sin(hd);
  arrow(ctx,flat.x,flat.y,flat.x+hdx*42,flat.y+hdy*42,C.v,3);
  txt(ctx,'v',flat.x+hdx*46-4,flat.y+hdy*46,C.v,14);
  if(safe){arrow(ctx,flat.x,flat.y,cx+(flat.x-cx)*0.42,cy+(flat.y-cy)*0.42,C.f,3.5);
    txt(ctx,'f',cx+(flat.x-cx)*0.55,cy+(flat.y-cy)*0.55-6,C.f,14);}
  // info panel
  txt(ctx,safe?'\u2714 \u0AB8\u0AC1\u0AB0\u0A95\u0ACD\u0AB7\u0ABF\u0AA4: \u0A98\u0AB0\u0ACD\u0AB7\u0AA3 \u0A85\u0AAD\u0ABF\u0A95\u0AC7\u0AA8\u0ACD\u0AA6\u0ACD\u0AB0 \u0AAC\u0AB3 \u0A86\u0AAA\u0AC7 \u0A9B\u0AC7':'\u2718 \u0A98\u0AB0\u0ACD\u0AB7\u0AA3 \u0AAA\u0AC2\u0AB0\u0AA4\u0AC1\u0A82 \u0AA8\u0AA5\u0AC0 \u2192 \u0A97\u0ABE\u0AA1\u0AC0 \u0AB8\u0ACD\u0AAA\u0AB0\u0ACD\u0AB6\u0AB0\u0AC7\u0A96\u0ABE \u0AAA\u0AB0 \u0AB8\u0AC0\u0AA7\u0AC0 \u0AA6\u0ACB\u0AA1\u0AC0 \u0A9C\u0ABE\u0AAF \u0A9B\u0AC7!',430,40,safe?C.grn:C.red,14);
  txt(ctx,'v\u2098\u2090\u2093 = '+fmt(vm,1)+' m/s = '+fmt(vm*3.6,0)+' km/h',430,66,C.ink,13);
  txt(ctx,'\u0AA4\u0AAE\u0ABE\u0AB0\u0AC0 \u0A9D\u0AA1\u0AAA v = '+fmt(v,1)+' m/s',430,90,C.v,13);
  txt(ctx,'\u03BC = '+fmt(mu,2)+',  r = '+r+' m,  g = '+fmt(g,1),430,114,C.mut,12);
}

/* ================= LAB 2 : BANK0 design ================= */
function b0Calc(){
  var r=+$('b0r').value,th=+$('b0th').value;
  $('b0rV').textContent=r;$('b0thV').textContent=th;
  var v0=Math.sqrt(r*g*Math.tan(th*RD));
  box('b0v0','\u0A86\u0AA6\u0AB0\u0ACD\u0AB6 \u0A9D\u0AA1\u0AAA v\u2080 = \u221A(rg tan\u03B8)',fmt(v0,2)+' m/s','ok');
  box('b0kmh','= km/h \u0AAE\u0ABE\u0A82',fmt(v0*3.6,0)+' km/h');
  var dv=+$('b0dv').value,dr=+$('b0dr').value;
  var thd=Math.atan(dv*dv/(dr*g))/RD;
  $('b0dthOut').textContent=fmt(thd,1)+'\u00B0  (tan\u03B8 = '+fmt(dv*dv/(dr*g),3)+')';
  var tv=+$('b0tv').value,tth=+$('b0tth').value;
  var rr=tv*tv/(g*Math.tan(tth*RD));
  $('b0drOut').textContent=fmt(rr,1);
}

/* ================= LAB 3 : BANK + FRICTION chart ================= */
function bmCalc(){
  var r=+$('bmR').value,th=+$('bmTh').value,mu=+$('bmMu').value;
  $('bmRV').textContent=r;$('bmThV').textContent=th;$('bmMuV').textContent=(+mu).toFixed(2);
  var t=Math.tan(th*RD),phi=Math.atan(mu)/RD;
  var v0=Math.sqrt(r*g*t);
  var den=1-mu*t;
  var vmax=den>0?Math.sqrt(r*g*(t+mu)/den):Infinity;
  var num=t-mu,vmin=num>0?Math.sqrt(r*g*num/(1+mu*t)):0;
  box('bmV0','\u0A86\u0AA6\u0AB0\u0ACD\u0AB6 \u0A9D\u0AA1\u0AAA v\u2080 = \u221A(rg tan\u03B8)',fmt(v0,1)+' m/s','mid');
  box('bmVmax','\u0AAE\u0AB9\u0AA4\u0ACD\u0AA4\u0AAE vmax = \u221A(rg tan(\u03B8+\u03C6))',(den>0?fmt(vmax,1):'\u221E')+' m/s','ok');
  var vmn=num>0?fmt(vmin,1)+' m/s':'0 (v>0 \u0A95\u0AB0\u0AA4\u0ABE\u0A82 \u0A93\u0A9B\u0AC0 \u0A9A\u0ABE\u0AB2\u0AC7)';
  box('bmVmin','\u0AA8\u0ACD\u0AAF\u0AC2\u0AA8\u0AA4\u0AAE vmin = \u221A(rg tan(\u03B8\u2212\u03C6))',vmn,num>0?'':'mid');
  var note='\u03C6 = tan\u207B\u00B9\u03BC = '+fmt(phi,1)+'\u00B0';
  if(th<phi)note+=' \u2192 \u03B8 < \u03C6 \u0A8F\u0A9F\u0AB2\u0AC7 vmin = 0: \u0AB5\u0ABE\u0AB9\u0AA8 \u0A8A\u0AAD\u0AC1\u0A82 \u0AB0\u0ABE\u0A96\u0AC0\u0AB6\u0AC1\u0A82 \u0AA8\u0AC0\u0A9A\u0AC7 \u0A96\u0AB8\u0AA4\u0AC1\u0A82 \u0AA8\u0AA5\u0AC0!';
  if(den<=0)note+=' \u2192 \u03BCtan\u03B8 \u2265 1: \u0A95\u0ACB\u0A88\u0AAA\u0AC0 \u0A9D\u0AA1\u0AAA\u0AC7 \u0A89\u0AAA\u0AB0 \u0AB8\u0AB0\u0A95\u0AB6\u0AC7 \u0AA8\u0AB9\u0AC0\u0A82 (vmax \u2192 \u221E)!';
  if(Math.abs(v0)>0)note+='   |   \u0AB8\u0AC1\u0AB0\u0A95\u0ACD\u0AB7\u0ABF\u0AA4 \u0AAC\u0AC7\u0AA8\u0ACD\u0AA1: '+vmn+' \u0AA5\u0AC0 '+(den>0?fmt(vmax,1):'\u221E')+' m/s';
  $('bmNote').textContent=note;
  drawChart();
}
function drawChart(){
  var cv=$('bankChart');if(!cv)return;var ctx=cv.getContext('2d');
  var r=+$('bmR').value,mu=+$('bmMu').value,th0=+$('bmTh').value;
  var W=cv.width,H=cv.height,x0=52,x1=W-20,y0=26,y1=H-42;
  var thMax=60,steps=120;
  var vmax=[],v0=[],vmin=[];
  var maxY=10;
  for(var i=0;i<=steps;i++){
    var th=i/steps*thMax,t=Math.tan(th*RD);
    var d=1-mu*t;
    var a=(d>0)?r*g*(t+mu)/d:Infinity;
    var b=r*g*t;
    var c=t-mu>0?r*g*(t-mu)/(1+mu*t):0;
    vmax.push(a);v0.push(b);vmin.push(c);
    if(isFinite(a))maxY=Math.max(maxY,a,b);
  }
  maxY=Math.min(maxY*1.12,110);
  function X(th){return x0+(th/thMax)*(x1-x0);}
  function Y(v){return y1-(v/maxY)*(y1-y0);}
  ctx.clearRect(0,0,W,H);
  // grid
  ctx.strokeStyle='#1a2a4a';ctx.lineWidth=1;
  for(var vv=0;vv<=maxY;vv+=10){ctx.beginPath();ctx.moveTo(x0,Y(vv));ctx.lineTo(x1,Y(vv));ctx.stroke();
    txt(ctx,''+Math.round(vv),x0-8,Y(vv)+4,C.mut,11,'right');}
  for(var tt=0;tt<=thMax;tt+=10){ctx.beginPath();ctx.moveTo(X(tt),y0);ctx.lineTo(X(tt),y1);ctx.stroke();
    txt(ctx,'\u00B0'+tt,X(tt),y1+16,C.mut,11,'center');}
  txt(ctx,'\u03B8 (\u0AA2\u0ABE\u0AB3)',(x0+x1)/2,H-6,C.mut,12,'center');
  ctx.save();ctx.translate(14,(y0+y1)/2);ctx.rotate(-Math.PI/2);
  txt(ctx,'v (m/s)',0,0,C.mut,12,'center');ctx.restore();
  // safe band (fill between vmin..vmax)
  ctx.save();ctx.globalAlpha=0.9;
  for(var s=0;s<steps;s++){
    if(!isFinite(vmax[s]))continue;
    var s2=s;while(s2<steps&&isFinite(vmax[s2+1]))s2++;
    ctx.beginPath();
    for(var k=s;k<=s2;k++)ctx.lineTo(X(k/steps*thMax),Y(Math.min(vmax[k],maxY)));
    for(var k2=s2;k2>=s;k2--)ctx.lineTo(X(k2/steps*thMax),Y(Math.min(vmin[k2],maxY)));
    ctx.closePath();ctx.fillStyle='rgba(74,222,128,0.15)';ctx.fill();
    s=s2;
  }
  ctx.restore();
  function curve(arr,color,label){
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=2.6;ctx.setLineDash([]);
    var started=false;
    for(var i2=0;i2<=steps;i2++){
      var val=arr[i2];if(!isFinite(val)||val>maxY){started=false;continue;}
      var px=X(i2/steps*thMax),py=Y(val);
      if(!started){ctx.beginPath();ctx.moveTo(px,py);started=true;}else ctx.lineTo(px,py);
    }
    ctx.stroke();ctx.restore();
  }
  curve(vmax,C.red);curve(v0,C.acc);curve(vmin,C.f);
  // current theta line
  ctx.save();ctx.setLineDash([5,5]);ctx.strokeStyle='#9db0cc';ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(X(th0),y0);ctx.lineTo(X(th0),y1);ctx.stroke();ctx.restore();
  txt(ctx,'\u03B8 = '+th0+'\u00B0',X(th0),y0-8,C.ink,12,'center');
  // legend
  var lx=x0+14,ly=y0+16;
  txt(ctx,'\u2576\u2576 v\u2098\u2090\u2093 = \u221A(rg tan(\u03B8+\u03C6))',lx,ly,C.red,12.5);
  txt(ctx,'\u2576\u2576 v\u2080 = \u221A(rg tan\u03B8)',lx,ly+20,C.acc,12.5);
  txt(ctx,'\u2576\u2576 v\u2098\u2098\u2099 = \u221A(rg tan(\u03B8\u2212\u03C6))',lx,ly+40,C.f,12.5);
  txt(ctx,'\u0AB2\u0AC0\u0AB2\u0ACB \u0AAA\u0A9F\u0ACD\u0A9F\u0ACB = \u0AB8\u0AC1\u0AB0\u0A95\u0ACD\u0AB7\u0ABF\u0AA4 \u0A9D\u0AA1\u0AAA-\u0AAC\u0AC7\u0AA8\u0ACD\u0AA1',lx+240,ly+60,C.grn,12.5);
}

/* ================= LAB 4 : DYNAMIC FBD ================= */
function updateDyn(){
  var th=+$('dyTh').value,mu=+$('dyMu').value,r=+$('dyR').value,v=+$('dyV').value;
  $('dyThV').textContent=th;$('dyMuV').textContent=(+mu).toFixed(2);
  $('dyRV').textContent=r;$('dyVV').textContent=v;
  var t=th*RD;
  var Nm=g*Math.cos(t)+v*v*Math.sin(t)/r;          // N per kg
  var Fm=v*v*Math.cos(t)/r-g*Math.sin(t);          // f per kg (+ = down-slope / inward)
  var lim=mu*Nm;
  box('dyN','N (દરેક kg માટે g એકમે)',fmt(Nm/g,2)+' mg');
  box('dyF','ઘર્ષણ f (per kg)',fmt(Fm,2)+' m/s\u00B2');
  var dirI=Fm>0.05?'\u0AA2\u0ABE\u0AB3 \u0AA8\u0AC0\u0A9A\u0AC7 (\u0A85\u0A82\u0AA6\u0AB0 \u0AA4\u0AB0\u0AAB) \u2193':(Fm<-0.05?'\u0AA2\u0ABE\u0AB3 \u0A89\u0AAA\u0AB0 (\u0AAC\u0AB9\u0ABE\u0AB0 \u0AA4\u0AB0\u0AAB) \u2191':'\u0AB6\u0AC2\u0AA8\u0ACD\u0AAF \u2014 \u0A86\u0AA6\u0AB0\u0ACD\u0AB6 \u0A9D\u0AA1\u0AAA!');
  $('dyDir').className='box '+(Math.abs(Fm)<0.05?'mid':'');
  $('dyDir').innerHTML='<div class="k">\u0A98\u0AB0\u0ACD\u0AB7\u0AA3\u0AA8\u0AC0 \u0AA6\u0ABF\u0AB6\u0ABE</div><div class="val" style="font-size:1rem">'+dirI+'</div>';
  var ok=Math.abs(Fm)<=lim+1e-9;
  box('dySafe','\u0A9F\u0A95\u0AB6\u0AC7?',ok?'\u2714 \u0AB8\u0AC1\u0AB0\u0A95\u0ACD\u0AB7\u0ABF\u0AA4':'\u2718 \u0AB8\u0ACD\u0A95\u0ABF\u0AA1!',ok?'ok':'bad');
  $('dySub').textContent='f/m = v\u00B2cos\u03B8/r \u2212 g sin\u03B8 = '+fmt(Fm,2)+'   |   \u03BCN/m = '+fmt(lim,2)+'   |   \u0AAE\u0ABE\u0AB0\u0ACD\u0A9C\u0ABF\u0AA8: |f|/\u03BCN = '+(lim>0?fmt(Math.abs(Fm)/lim,2):'\u2014');
  // draw
  var cv=$('dyCv'),ctx=cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  var Ax=80,Ay=310,Ln=430;
  var ux=Math.cos(t),uy=-Math.sin(t);            // up-slope (screen)
  var nx=-Math.sin(t),ny=-Math.cos(t);           // normal up-left
  var Bx=Ax+ux*Ln,By=Ay+uy*Ln;
  // baseline
  ctx.save();ctx.setLineDash([7,6]);ctx.strokeStyle=C.dash;ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(40,Ay);ctx.lineTo(600,Ay);ctx.stroke();ctx.restore();
  // road
  ctx.strokeStyle=C.road;ctx.lineWidth=9;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(Ax,Ay);ctx.lineTo(Bx,By);ctx.stroke();
  // theta arc
  ctx.strokeStyle=C.f;ctx.lineWidth=1.8;ctx.beginPath();
  ctx.arc(Ax,Ay,72,-t,0,false);ctx.stroke();
  txt(ctx,'\u03B8',Ax+76*Math.cos(t/2)-4,Ay-76*Math.sin(t/2)+4,C.f,15);
  txt(ctx,'\u25C4 \u0AB5\u0AB0\u0ACD\u0AA4\u0AC1\u0AB3\u0AA8\u0AC1\u0A82 \u0A95\u0AC7\u0AA8\u0ACD\u0AA6\u0ACD\u0AB0 (\u0A85\u0A82\u0AA6\u0AB0 \u0AA4\u0AB0\u0AAB)',40,Ay+34,C.mut,12.5);
  // car
  var cx0=Ax+ux*Ln*0.45,cy0=Ay+uy*Ln*0.45;
  ctx.save();ctx.translate(cx0,cy0);ctx.rotate(-t);
  ctx.fillStyle=C.v;ctx.fillRect(-26,-17,52,19);
  ctx.fillStyle='#0c1428';ctx.beginPath();ctx.arc(-15,4,5,0,7);ctx.arc(15,4,5,0,7);ctx.fill();
  ctx.restore();
  // N arrow
  var LN2=Math.min(115,55*(Nm/g));
  var Tx=cx0+nx*LN2,Ty=cy0+ny*LN2;
  arrow(ctx,cx0,cy0,Tx,Ty,C.N,3.5);
  txt(ctx,'N',Tx-18,Ty+2,C.N,15);
  // N components dashed
  ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle=C.N;ctx.lineWidth=1.3;
  ctx.beginPath();ctx.moveTo(Tx,Ty);ctx.lineTo(Tx,cy0);ctx.lineTo(cx0,cy0);ctx.stroke();ctx.restore();
  txt(ctx,'N cos\u03B8',Tx+6,(Ty+cy0)/2,C.mut,11);
  txt(ctx,'N sin\u03B8',cx0+18,cy0+16,C.mut,11);
  // mg
  arrow(ctx,cx0,cy0+6,cx0,cy0+6+58,C.mg,3.5);
  txt(ctx,'mg',cx0+8,cy0+66,C.mg,14);
  // friction arrow
  var LF=Math.min(115,55*Math.abs(Fm)/g);
  if(LF>4){
    var sgn=Fm>0?-1:1; // + means down-slope => along -u
    arrow(ctx,cx0,cy0,cx0+sgn*ux*LF,cy0+sgn*uy*LF,C.f,4);
    txt(ctx,'f',cx0+sgn*ux*(LF+14)-5,cy0+sgn*uy*(LF+14)-8,C.f,15);
  }
  // meter
  var mx=360,my=52,mw=250,ratio=lim>0?Math.abs(Fm)/lim:1;
  txt(ctx,'|f| / \u03BCN  \u2014  \u0A98\u0AB0\u0ACD\u0AB7\u0AA3 \u0AAE\u0ABE\u0AB0\u0ACD\u0A9C\u0ABF\u0AA8',mx,my-10,C.mut,12);
  ctx.strokeStyle='#22355e';ctx.lineWidth=0;ctx.fillStyle='#16264a';
  ctx.beginPath();ctx.rect(mx,my,mw,16);ctx.fill();
  var rw=Math.min(1,ratio)*mw;
  ctx.fillStyle=ratio<=1?C.grn:C.red;ctx.beginPath();ctx.rect(mx,my,rw,16);ctx.fill();
  ctx.strokeStyle='#22355e';ctx.lineWidth=1.5;ctx.strokeRect(mx,my,mw,16);
  ctx.beginPath();ctx.moveTo(mx+mw*0.75,my-4);ctx.lineTo(mx+mw*0.75,my+20);ctx.strokeStyle=C.red;ctx.stroke();
  txt(ctx,ratio<=1?fmt(ratio,2)+' \u2714':'\u0A9F\u0A95\u0AB5\u0ABE\u0AA8\u0AC0 \u0AAE\u0AB0\u0ACD\u0AAF\u0ABE\u0AA6\u0ABE \u0A96\u0ABE\u0AB8\u0ACD \u0A97\u0AAF\u0AC0! '+fmt(ratio,2),mx,my+34,ratio<=1?C.grn:C.red,12.5);
  txt(ctx,'v\u2080 = '+fmt(Math.sqrt(r*g*Math.tan(t)),1)+' m/s \u0A86\u0AA6\u0AB0\u0ACD\u0AB6',mx,my+58,C.acc,12.5);
}

/* ================= LAB 5 : WELL OF DEATH ================= */
var well={y:150,vy:0,rot:0};
function wellCalc(){
  var mu=+$('wMu').value,r=+$('wR').value,v=+$('wV').value;
  $('wMuV').textContent=(+mu).toFixed(2);$('wRV').textContent=r;$('wVV').textContent=v;
  var vmin=Math.sqrt(r*g/mu);
  box('wVmin','\u0AA8\u0ACD\u0AAF\u0AC2\u0AA8\u0AA4\u0AAE \u0A9D\u0AA1\u0AAA \u221A(rg/\u03BC)',fmt(vmin,1)+' m/s','mid');
  var ok=v>=vmin-1e-9;
  box('wSafe','\u0AAC\u0ABE\u0A88\u0A95 \u0A9F\u0A95\u0AC7?',ok?'\u2714 \u0A9F\u0A95\u0AC7\u0AB2\u0AC0 \u0A9B\u0AC7':'\u2718 \u0AAA\u0AA1\u0AB6\u0AC7!',ok?'ok':'bad');
  box('wN','\u0AA6\u0ABF\u0AB5\u0ABE\u0AB2\u0AA8\u0AC1\u0A82 \u0AA6\u0AAC\u0ABE\u0AA3 N/m = v\u00B2/r',fmt(v*v/r,0)+' N/kg');
  well.vy=0;well.y=150;
}
function drawWell(dt){
  var cv=$('wellCv');if(!cv)return;var ctx=cv.getContext('2d');
  var mu=+$('wMu').value,r=+$('wR').value,v=+$('wV').value;
  var vmin=Math.sqrt(r*g/mu),ok=v>=vmin-1e-9;
  var t=performance.now()/1000;
  if(ok){well.y=150+Math.sin(t*7)*5;well.vy=0;}
  else{well.vy+=g*(1-v*v/(vmin*vmin))*12*dt;well.y+=well.vy*dt;
    if(well.y>250){well.y=140;well.vy=0;}}
  well.rot+=(v/8)*dt;if(well.rot>6.3)well.rot-=6.3;
  ctx.clearRect(0,0,cv.width,cv.height);
  // front view
  var wl=90,wr=330,fy=270;
  ctx.strokeStyle=C.road;ctx.lineWidth=7;
  ctx.beginPath();ctx.moveTo(wl,60);ctx.lineTo(wl,fy);ctx.moveTo(wr,60);ctx.lineTo(wr,fy);ctx.stroke();
  ctx.strokeStyle=C.dash;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(wl,fy);ctx.lineTo(wr,fy);ctx.stroke();
  ctx.save();ctx.setLineDash([6,6]);ctx.strokeStyle=C.dash;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo((wl+wr)/2,55);ctx.lineTo((wl+wr)/2,fy+14);ctx.stroke();ctx.restore();
  ctx.strokeStyle=C.mut;ctx.lineWidth=1.8;
  ctx.beginPath();ctx.moveTo((wl+wr)/2-7,150);ctx.lineTo((wl+wr)/2+7,150);
  ctx.moveTo((wl+wr)/2-7,158);ctx.lineTo((wl+wr)/2+7,158);ctx.stroke();
  txt(ctx,'\u0A95\u0AC2\u0AB5\u0ABE\u0AA8\u0AC0 \u0A85\u0A95\u0ACD\u0AB7',30,80,C.mut,12);
  // bike
  var bx=wr-8,by=well.y;
  ctx.save();ctx.translate(bx,by);ctx.rotate(Math.PI/2);
  ctx.strokeStyle=ok?C.v:C.red;ctx.lineWidth=3;
  circ(ctx,-15,0,9,ok?C.v:C.red,3);circ(ctx,15,0,9,ok?C.v:C.red,3);
  ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(15,0);ctx.stroke();
  ctx.restore();
  dot(ctx,bx-26,by+18,5,ok?C.grn:C.red);
  // arrows
  arrow(ctx,bx-14,by,(wl+wr)/2+16,by,C.N,3.5);
  txt(ctx,'N = mv\u00B2/r',168,by-10,C.N,13);
  arrow(ctx,bx+16,by+8,bx+16,by+8+Math.min(70,55*v*v/(vmin*vmin)),C.f,3.5);
  txt(ctx,'f=\u03BCN',bx+24,by+40,C.f,13);
  arrow(ctx,bx-8,by+10,bx-8,by+62,C.mg,3.5);
  txt(ctx,'mg',bx-30,by+62,C.mg,13);
  txt(ctx,ok?'\u2714 \u0A9F\u0A95\u0AC7\u0AB2\u0AC0!  \u0AA8\u0ACD\u0AAF\u0AC2\u0AA8\u0AA4\u0AAE \u221A(rg/\u03BC) = '+fmt(vmin,1)+' m/s':'\u2718 v < \u221A(rg/\u03BC)='+fmt(vmin,1)+' \u2192 \u0AA8\u0AC0\u0A9A\u0AC7 \u0AA6\u0AB2\u0AA7\u0AC1\u0A82!',30,36,ok?C.grn:C.red,13.5);
  // top view
  var tcx=500,tcy=160,tr=82;
  circ(ctx,tcx,tcy,tr,C.road,6);
  dot(ctx,tcx,tcy,2.6,C.mut);
  var px=tcx+tr*Math.cos(well.rot),py=tcy+tr*Math.sin(well.rot);
  ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle=C.v;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.arc(tcx,tcy,tr,well.rot-2.2,well.rot-0.3);ctx.stroke();ctx.restore();
  dot(ctx,px,py,8,ok?C.v:C.red);
  arrow(ctx,px,py,tcx+(px-tcx)*0.4,tcy+(py-tcy)*0.4,C.N,2.6);
  txt(ctx,'\u0A89\u0AAA\u0AA5\u0AC0 \u0AA6\u0AC7\u0A96\u0ABE\u0AB5',tcx,tcy+tr+22,C.mut,12,'center');
}

/* ================= LAB 6 : VERTICAL CIRCLE ================= */
var vc={R:0.8,phi:0,s:1,mode:'circle',px:0,py:0,vx:0,vy:0,trail:[],lastV:0,lastT:0,fr:0};
function vcInfo(){
  var vb=+$('vcVb').value;$('vcVbV').textContent=fmt(vb,1);
  box('vcNeed','\u0AA8\u0ACD\u0AAF\u0AC2\u0AA8\u0AA4\u0AAE v_b: \u0AA6\u0ACB\u0AB0\u0AC0 \u221A(5gR) / \u0AA6\u0A82\u0AA1 \u221A(4gR)',fmt(Math.sqrt(5*g*vc.R),2)+' / '+fmt(Math.sqrt(4*g*vc.R),2)+' m/s','mid');
}
function drawVC(dt){
  var cv=$('vcCv');if(!cv)return;var ctx=cv.getContext('2d');
  var vb=+$('vcVb').value,mode=$('vcMode').value,R=vc.R;
  var cx=290,cy=250,Rp=165,sc=Rp/R;
  var n=5,h=Math.min(dt,0.033)/n;
  for(var i=0;i<n;i++){
    if(vc.mode==='circle'){
      var v2=vb*vb-2*g*R*(1-Math.cos(vc.phi));if(v2<0)v2=0;
      var v=Math.sqrt(v2);
      var Tm=v2/R+g*Math.cos(vc.phi);
      if(mode==='string'&&Tm<-0.02){
        vc.mode='free';
        vc.px=cx+Rp*Math.sin(vc.phi);vc.py=cy+Rp*Math.cos(vc.phi);
        vc.vx=Math.cos(vc.phi)*v*sc;vc.vy=-Math.sin(vc.phi)*v*sc;
        continue;
      }
      if(v2===0&&Math.abs(vc.phi)>0.01)vc.s=-vc.s;
      vc.phi+=vc.s*(v/R)*h;
      if(vc.phi>Math.PI)vc.phi-=2*Math.PI;
      if(vc.phi<-Math.PI)vc.phi+=2*Math.PI;
      vc.lastV=v;vc.lastT=Tm;
    }else{
      vc.vy+=g*sc*h;vc.px+=vc.vx*h;vc.py+=vc.vy*h;
      var dx=(vc.px-cx)/sc,dy=(vc.py-cy)/sc,rr=Math.hypot(dx,dy);
      vc.lastV=Math.hypot(vc.vx,vc.vy)/sc;vc.lastT=0;
      if(rr>=R||vc.py>cy+Rp+140){
        vc.phi=Math.atan2(dx,dy);
        var ux=Math.cos(vc.phi),uy=-Math.sin(vc.phi);
        var vt=vc.vx*ux+vc.vy*uy;
        vc.s=vt>=0?1:-1;vc.mode='circle';
      }
    }
  }
  // trail when free
  var bx,by,free=vc.mode==='free';
  if(free){bx=vc.px;by=vc.py;vc.trail.push([bx,by]);if(vc.trail.length>260)vc.trail.shift();}
  else{bx=cx+Rp*Math.sin(vc.phi);by=cy+Rp*Math.cos(vc.phi);
    if(vc.trail.length)vc.trail.shift();}
  // draw
  ctx.clearRect(0,0,cv.width,cv.height);
  circ(ctx,cx,cy,Rp,'#334e88',2,[7,6]);
  dot(ctx,cx,cy,3.2,C.mut);
  txt(ctx,'O',cx+8,cy-8,C.mut,12);
  txt(ctx,'\u0A9F\u0ACB\u0A9A  (\u0A9F\u0ACB\u0AAA\u0A9E v\u209C = \u221A(gR) = '+fmt(Math.sqrt(g*R),2)+' m/s)',cx-60,cy-Rp-14,C.mut,12.5);
  txt(ctx,'\u0AA4\u0AB3\u0ABF\u0AAF\u0ACB (v_b \u0A85\u0AB9\u0AC0\u0A82 \u0A86\u0AAA\u0AB5\u0ABE\u0AA8\u0AC1\u0A82 \u0AA6\u0ABE\u0A96\u0AB2\u0ACB \u0A95\u0AB0\u0ACB)',cx-140,cy+Rp+26,C.mut,12.5);
  // trail
  if(vc.trail.length>2){ctx.save();ctx.strokeStyle=C.grn;ctx.lineWidth=2.6;ctx.globalAlpha=0.85;
    ctx.beginPath();ctx.moveTo(vc.trail[0][0],vc.trail[0][1]);
    for(var k=1;k<vc.trail.length;k++)ctx.lineTo(vc.trail[k][0],vc.trail[k][1]);
    ctx.stroke();ctx.restore();
    txt(ctx,'\u0AAA\u0ACD\u0AB0\u0A95\u0ACD\u0AB7\u0AC7\u0AAA\u0A95 \u0AAA\u0AA5 (\u0AA6\u0ACB\u0AB0\u0AC0 \u0AA2\u0AC0\u0AB2\u0AC0!)\u2198',vc.trail[vc.trail.length-1][0]+12,vc.trail[vc.trail.length-1][1],C.grn,12);}
  // string / rod
  ctx.strokeStyle=free?'#556b9e':C.T;ctx.lineWidth=free?1.4:2.6;
  if(free)ctx.setLineDash([4,4]);
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);
  // ball
  dot(ctx,bx,by,10.5,free?C.grn:C.T);
  // arrows
  if(!free){
    var LN3=Math.min(2.2,Math.max(0.2,vc.lastT/g))*46;
    if(vc.lastT>=0){arrow(ctx,bx,by,cx+(bx-cx)*(1-LN3/Rp),cy+(by-cy)*(1-LN3/Rp),C.T,3.2);
      txt(ctx,'T',bx+(cx-bx)*0.3+10,by+(cy-by)*0.3,C.T,14);}
    else{arrow(ctx,bx,by,bx+(bx-cx)*(LN3/Rp),by+(by-cy)*(LN3/Rp),C.f,3.2);
      txt(ctx,'\u0AA6\u0A82\u0AA1-\u0AA7\u0A95\u0ACD\u0A95\u0ACB',bx+(bx-cx)*0.3-40,by+(by-cy)*0.3,C.f,12);}
  }
  arrow(ctx,bx+8,by+8,bx+8,by+56,C.mg,3.2);
  txt(ctx,'mg',bx+16,by+58,C.mg,13);
  var hdx,tx2,ty2; // velocity arrow (tangent)
  if(free){var vv=Math.hypot(vc.vx,vc.vy)||1;tx2=bx+vc.vx/vv*40;ty2=by+vc.vy/vv*40;}
  else{tx2=bx+vc.s*Math.cos(vc.phi)*40;ty2=by-vc.s*Math.sin(vc.phi)*40;}
  arrow(ctx,bx,by,tx2,ty2,C.v,2.8);
  txt(ctx,'v',tx2+6,ty2,C.v,13);
  // readouts (throttled)
  vc.fr++;
  if(vc.fr%6===0){
    box('vcSpd','\u0AB9\u0ABE\u0AB2\u0AA8\u0AC0 \u0A9D\u0AA1\u0AAA v',fmt(vc.lastV,2)+' m/s');
    box('vcT','\u0AA4\u0AA3\u0ABE\u0AB5 T',fmt(vc.lastT/g,2)+' mg');
    var st;
    if(free)st=['\u0AA6\u0ACB\u0AB0\u0AC0 \u0AA2\u0AC0\u0AB2\u0AC0 \u2192 \u0AAA\u0ACD\u0AB0\u0A95\u0ACD\u0AB7\u0AC7\u0AAA\u0A95!','bad'];
    else if(vc.lastT<-0.02)st=['\u0AA6\u0A82\u0AA1 \u0AA7\u0A95\u0ACD\u0A95\u0ACB \u0A86\u0AAA\u0AC7 \u0A9B\u0AC7 (T<0)','mid'];
    else st=['\u0AA6\u0ACB\u0AB0\u0AC0 \u0AA4\u0AA3\u0ABE\u0AAF\u0AC7\u0AB2\u0AC0 \u2714','ok'];
    box('vcStat','\u0AB8\u0ACD\u0AA5\u0ABF\u0AA4\u0ABF',st[0],st[1]);
  }
}

/* ================= LAB 7 : BOWL ================= */
var bowl={rot:0};
function bowlCalc(){
  var w=+$('bwW').value;$('bwWV').textContent=fmt(w,1);
  var R=1;
  var wmin=Math.sqrt(g/R);
  var al=(w*w*R>g)?Math.acos(g/(w*w*R)):0;
  box('bwAl','\u0AB8\u0A82\u0AA4\u0AC1\u0AB2\u0AA8 \u0A96\u0AC2\u0AA3\u0ACB \u03B1 = cos\u207B\u00B9(g/\u03C9\u00B2R)',fmt(al/RD,1)+'\u00B0','mid');
  box('bwR2','\u0AB5\u0AB0\u0ACD\u0AA4\u0AC1\u0AB3\u0AA8\u0AC0 \u0AA4\u0ACD\u0AB0\u0ABF\u0A9C\u0ACD\u0AAF\u0ABE r = R sin\u03B1',fmt(R*Math.sin(al),2)+' m');
  box('bwN','\u0AA6\u0AAC\u0ABE\u0AA3 N/mg = 1/cos\u03B1',(al>0?fmt(1/Math.cos(al),2):'1 (\u0AA4\u0AB3\u0ABF\u0AAF\u0AC7)'));
  box('bwWmin','\u0AA6\u0AA1\u0ACB \u0A8A\u0A82\u0A9A\u0AC7 \u0A9C\u0ABE\u0AAF \u03C9min = \u221A(g/R)',fmt(wmin,2)+' rad/s','ok');
}
function drawBowl(dt){
  var cv=$('bowlCv');if(!cv)return;var ctx=cv.getContext('2d');
  var w=+$('bwW').value,R=1;
  var wmin=Math.sqrt(g*R);
  var al=(w*w*R>g)?Math.acos(g/(w*w*R)):0;
  bowl.rot+=Math.max(0.4,w)*dt*0.9;if(bowl.rot>6.3)bowl.rot-=6.3;
  ctx.clearRect(0,0,cv.width,cv.height);
  var OX=210,OY=110,Rp=125;
  // bowl
  ctx.strokeStyle=C.road;ctx.lineWidth=7;ctx.lineCap='round';
  ctx.beginPath();ctx.arc(OX,OY,Rp,0,Math.PI,false);ctx.stroke();
  ctx.save();ctx.setLineDash([6,6]);ctx.strokeStyle=C.dash;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(OX-Rp,OY);ctx.lineTo(OX+Rp,OY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(OX,OY);ctx.lineTo(OX,OY+Rp+34);ctx.stroke();ctx.restore();
  dot(ctx,OX,OY,3,C.mut);txt(ctx,'O',OX+8,OY-6,C.mut,12);
  txt(ctx,'\u0A8A\u0A82\u0A9A\u0AC0 \u0A95\u0ABF\u0AA8\u0ABE\u0AB0\u0AC0',OX-Rp-4,OY-10,C.mut,12);
  var bx=OX+Rp*Math.sin(al),by=OY+Rp*Math.cos(al);
  // radius r dashed
  ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle=C.mut;ctx.lineWidth=1.3;
  ctx.beginPath();ctx.moveTo(OX,by);ctx.lineTo(bx,by);ctx.stroke();ctx.restore();
  if(al>0.03)txt(ctx,'r = R sin\u03B1',OX+10,by-8,C.mut,11.5);
  // alpha arc
  if(al>0.03){ctx.strokeStyle=C.f;ctx.lineWidth=1.8;ctx.beginPath();
    ctx.arc(OX,OY,Rp+22,Math.PI/2-al,Math.PI/2,false);ctx.stroke();
    txt(ctx,'\u03B1',OX+4,OY+Rp+30,C.f,15);}
  // ball + arrows
  dot(ctx,bx,by,10.5,C.f);
  var LN4=42/Math.max(0.35,Math.cos(al));
  arrow(ctx,bx,by,bx-(bx-OX)*(LN4/Rp),by-(by-OY)*(LN4/Rp),C.N,3.2);
  txt(ctx,'N',bx-(bx-OX)*0.5-24,by-(by-OY)*0.5,C.N,14);
  arrow(ctx,bx+6,by+6,bx+6,by+58,C.mg,3.2);
  txt(ctx,'mg',bx+14,by+58,C.mg,13);
  var vx2=-Math.sin(0)*0; // tangent into screen: draw small arrow
  arrow(ctx,bx+14,by-8,bx+52,by-22,C.v,2.6);
  txt(ctx,'v',bx+56,by-20,C.v,13);
  // rotating inset (top view)
  var tcx=500,tcy=180,tr=Math.max(14,Rp*Math.sin(al)*0.62);
  circ(ctx,tcx,tcy,tr,C.road,4);
  dot(ctx,tcx,tcy,2.2,C.mut);
  var px2=tcx+tr*Math.cos(bowl.rot),py2=tcy+tr*Math.sin(bowl.rot);
  dot(ctx,px2,py2,7,C.f);
  arrow(ctx,px2,py2,tcx+(px2-tcx)*0.45,tcy+(py2-tcy)*0.45,C.N,2.4);
  txt(ctx,'\u0A89\u0AAA\u0AAA\u0AA5\u0AC0 \u0AA6\u0AC7\u0A96\u0ABE\u0AB5 (r = '+fmt(R*Math.sin(al),2)+' m)',tcx-70,tcy+120,C.mut,12);
  txt(ctx,al>0.03?'\u03B1 = '+fmt(al/RD,1)+'\u00B0  (\u03C9 = '+fmt(w,1)+' rad/s)':'\u03C9 \u2264 \u221A(g/R) \u2192 \u0AA6\u0AA1\u0ACB \u0AA4\u0AB3\u0ABF\u0AAF\u0AC7 \u0A9C \u0AAB\u0AB0\u0AC7 \u0A9B\u0AC7!',30,34,C.acc,13.5);
}

/* ================= LAB 8 : CONICAL PENDULUM ================= */
var coni={psi:0};
function coniCalc(){
  var L=+$('cL').value,th=+$('cTh').value;
  $('cLV').textContent=fmt(L,2);$('cThV').textContent=th;
  var t=th*RD,h=L*Math.cos(t);
  var T=2*Math.PI*Math.sqrt(h/g),w=Math.sqrt(g/h),v=w*L*Math.sin(t);
  box('cT','\u0A86\u0AB5\u0AB0\u0ACD\u0AA4\u0AA8-\u0AB8\u0AAE\u0AAF t = 2\u03C0\u221A(Lcos\u03B8/g)',fmt(T,2)+' s','mid');
  box('cW','\u0A95\u0AC1\u0AA6\u0AB0\u0AA4\u0AC0 \u0A95\u0ACB\u0AA3\u0AC0\u0AAF \u0A9D\u0AA1\u0AAA \u03C9',fmt(w,2)+' rad/s');
  box('cV2','\u0AB0\u0AC7\u0A96\u0AC0\u0AAF \u0A9D\u0AA1\u0AAA v = \u03C9Lsin\u03B8',fmt(v,2)+' m/s');
  box('cTn','\u0AA4\u0AA3\u0ABE\u0AB5 T = mg/cos\u03B8',fmt(1/Math.cos(t),2)+' mg','ok');
}
function drawConi(dt){
  var cv=$('coniCv');if(!cv)return;var ctx=cv.getContext('2d');
  var L=+$('cL').value,th=+$('cTh').value,t=th*RD;
  var h=L*Math.cos(t),w=Math.sqrt(g/h);
  coni.psi+=w*dt*0.8;if(coni.psi>6.3)coni.psi-=6.3;
  ctx.clearRect(0,0,cv.width,cv.height);
  var Px=270,Py=52,sc=150; // px per m
  var rs=L*Math.sin(t)*sc,hs=L*Math.cos(t)*sc;
  var cy0=Py+hs;
  // ceiling
  ctx.strokeStyle=C.road;ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(Px-120,Py);ctx.lineTo(Px+120,Py);ctx.stroke();
  // vertical dashed
  ctx.save();ctx.setLineDash([6,5]);ctx.strokeStyle=C.dash;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(Px,Py);ctx.lineTo(Px,cy0+70);ctx.stroke();ctx.restore();
  txt(ctx,'h = L cos\u03B8 = '+fmt(L*Math.cos(t),2)+' m',Px+8,cy0+56,C.mut,12);
  // path ellipse
  ctx.save();ctx.setLineDash([6,5]);ctx.strokeStyle='#334e88';ctx.lineWidth=1.6;
  ctx.beginPath();ctx.ellipse(Px,cy0,rs,rs*0.24,0,0,7);ctx.stroke();ctx.restore();
  var bx=Px+rs*Math.cos(coni.psi),by=cy0+rs*0.24*Math.sin(coni.psi);
  // r dashed
  ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle=C.mut;ctx.lineWidth=1.2;
  ctx.beginPath();ctx.moveTo(Px,cy0);ctx.lineTo(bx,cy0);ctx.stroke();ctx.restore();
  txt(ctx,'r = L sin\u03B8 = '+fmt(L*Math.sin(t),2)+' m',Px+6,cy0+16,C.mut,11.5);
  // string
  ctx.strokeStyle=C.T;ctx.lineWidth=2.4;
  ctx.beginPath();ctx.moveTo(Px,Py);ctx.lineTo(bx,by);ctx.stroke();
  // theta arc
  ctx.strokeStyle=C.f;ctx.lineWidth=1.7;ctx.beginPath();
  ctx.arc(Px,Py,46,Math.PI/2-t,Math.PI/2,false);ctx.stroke();
  txt(ctx,'\u03B8',Px-30,Py+58,C.f,15);
  // ball
  dot(ctx,bx,by,10.5,C.f);
  // T arrow toward pivot
  var dpx=Px-bx,dpy=Py-by,dp=Math.hypot(dpx,dpy);
  var LT=50/Math.max(0.4,Math.cos(t));
  arrow(ctx,bx,by,bx+dpx/dp*LT,by+dpy/dp*LT,C.T,3.2);
  txt(ctx,'T',bx+dpx/dp*(LT+12)-6,by+dpy/dp*(LT+12)-8,C.T,14);
  arrow(ctx,bx+6,by+8,bx+6,by+64,C.mg,3.2);
  txt(ctx,'mg',bx+14,by+64,C.mg,13);
  // tangent velocity
  var tvx=-Math.sin(coni.psi),tvy=0.24*Math.cos(coni.psi);
  var tvl=Math.hypot(tvx,tvy)||1;
  arrow(ctx,bx,by,bx+tvx/tvl*42,by+tvy/tvl*42,C.v,2.8);
  txt(ctx,'v',bx+tvx/tvl*46-4,by+tvy/tvl*46+4,C.v,13);
  txt(ctx,'\u03C9 = \u221A(g/h) = '+fmt(w,2)+' rad/s  \u2192  t = '+fmt(2*Math.PI/w,2)+' s \u0AA6\u0ACD\u0AB5\u0ABE\u0AB0\u0ABE \u0AAB\u0AB0\u0AC7 \u0A9A\u0A9B\u0AC7 \u0A9B\u0AC7!',40,32,C.acc,13.5);
}

/* ================= wiring ================= */
var ids=['fMu','fR','fV','b0r','b0th','b0dv','b0dr','b0tv','b0tth',
         'bmR','bmTh','bmMu','dyTh','dyMu','dyR','dyV',
         'wMu','wR','wV','vcVb','vcMode','bwW','cL','cTh'];
ids.forEach(function(id){var el=$(id);if(el)el.addEventListener('input',function(){updateAll();});});
function updateAll(){flatCalc();b0Calc();bmCalc();updateDyn();wellCalc();vcInfo();bowlCalc();coniCalc();}
updateAll();
var last=performance.now();
function loop(t){
  var dt=Math.min(0.033,(t-last)/1000);last=t;
  drawFlat(dt);drawWell(dt);drawVC(dt);drawBowl(dt);drawConi(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
