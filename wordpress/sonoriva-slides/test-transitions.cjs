const fs=require('fs'),vm=require('vm'),assert=require('assert');
class E {
 constructor(cls=''){this.cls=cls;this.children=[];this.dataset={};this.style={};this.attrs={};this.events={};this.hidden=false;this.classList={contains:x=>this.cls.split(' ').includes(x)};}
 set className(v){this.cls=v} setAttribute(k,v){this.attrs[k]=v} removeAttribute(k){delete this.attrs[k]} append(...n){this.children.push(...n)} addEventListener(k,f){this.events[k]=f} querySelector(){return this.track}
 animate(frames,options){const a={frames,options,cancelled:false,cancel(){this.cancelled=true}};a.finished=new Promise(r=>a.done=r);(this.animations??=[]).push(a);return a;}
}
async function test(effect,reduced=false){
const root=new E('sr-slides');root.dataset={srTransition:effect,srDuration:'450'};root.track=new E();const slides=root.track.children=[new E('sr-slide'),new E('sr-slide'),new E('sr-slide')];const motion={matches:reduced,addEventListener(k,f){this.change=f}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'view.js'),'utf8'),{window:{matchMedia:()=>motion},document:{readyState:'complete',querySelectorAll:()=>[root],createElement:()=>new E()}});
const [,dots,next]=root.children[0].children;next.events.click();
if(effect==='none'||reduced){assert.deepEqual(slides.map(x=>x.hidden),[true,false,true]);assert(!slides[1].animations);return;}
const anim=slides[1].animations[0];assert.equal(anim.options.duration,450);
if(effect==='slide')assert.equal(anim.frames[0].transform,'translateX(100%)');
if(effect==='vertical')assert.equal(anim.frames[0].transform,'translateY(100%)');
if(effect==='zoom')assert.equal(anim.frames[0].transform,'scale(.94)');
if(effect==='fade')assert.equal(anim.frames[0].opacity,0);
assert.equal(slides[0].attrs['aria-hidden'],'true');
next.events.click();assert(anim.cancelled);const latest=slides[2].animations.at(-1);anim.done();await Promise.resolve();assert.equal(slides[2].hidden,false);
latest.done();await Promise.resolve();assert.deepEqual(slides.map(x=>x.hidden),[true,true,false]);assert.equal(root.track.style.display,'');
next.events.click();assert.equal(dots.children[0].attrs['aria-current'],'true');motion.matches=true;motion.change();assert.deepEqual(slides.map(x=>x.hidden),[false,true,true]);assert(slides.every(x=>!x.inert));
}
(async()=>{for(const effect of ['fade','slide','vertical','zoom','none']){await test(effect);await test(effect,true)}console.log('10 scénarios validés : effets, clics rapides, boucle, nettoyage et réduction des mouvements.');})().catch(e=>{console.error(e);process.exit(1)});
