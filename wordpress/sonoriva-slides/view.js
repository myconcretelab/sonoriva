(function () {
    'use strict';
    function init(root) {
        if (root.dataset.srReady) return;
        const track = root.querySelector('.sr-slides-track');
        if (!track) return;
        const slides = Array.from(track.children).filter(item=>item.classList.contains('sr-slide'));
        if (!slides.length) return;
        root.dataset.srReady = 'true';
        if (slides.length === 1) return;
        let current = 0;
        let animations = [];
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        root.setAttribute('aria-roledescription','diaporama');
        const controls = document.createElement('div');
        controls.className = 'sr-slides-controls';
        const makeButton = (label, text, className, click) => {
            const b = document.createElement('button');
            b.type='button'; b.className=className; b.setAttribute('aria-label',label); b.textContent=text; b.addEventListener('click',click); return b;
        };
        const dotsBox = document.createElement('div'); dotsBox.className='sr-slides-dots'; dotsBox.setAttribute('role','group'); dotsBox.setAttribute('aria-label','Choisir une diapositive');
        const dots=slides.map((slide,i)=>{
            slide.setAttribute('role','group'); slide.setAttribute('aria-roledescription','diapositive'); slide.setAttribute('aria-label',(i+1)+' sur '+slides.length);
            const b=makeButton('Afficher la diapositive '+(i+1),'','sr-slide-dot',()=>show(i)); dotsBox.append(b); return b;
        });
        const previous=makeButton('Diapositive précédente','‹','sr-slide-arrow sr-slide-prev',()=>show(current-1));
        const next=makeButton('Diapositive suivante','›','sr-slide-arrow sr-slide-next',()=>show(current+1));
        const status=document.createElement('span'); status.className='sr-slide-status'; status.setAttribute('aria-live','polite'); status.setAttribute('aria-atomic','true');
        controls.append(previous,dotsBox,next,status); root.append(controls);
        function finishTransition() {
            animations.forEach(animation => animation.cancel());
            animations = [];
            slides.forEach((slide,i) => {
                slide.hidden = i !== current;
                slide.style.gridArea = '';
                slide.style.zIndex = '';
                slide.removeAttribute('aria-hidden');
                slide.inert = false;
            });
            track.style.display = '';
        }
        function show(index, announce=true) {
            const target = (index + slides.length) % slides.length;
            const outgoing = current;
            const direction = index >= current ? 1 : -1;
            finishTransition();
            current = target;
            slides.forEach((slide,i)=>{slide.hidden=i!==current; dots[i].setAttribute('aria-current',i===current?'true':'false');});
            if(announce) status.textContent='Diapositive '+(current+1)+' sur '+slides.length;
            const effect = root.dataset.srTransition || 'fade';
            if (!announce || outgoing === current || effect === 'none' || reducedMotion.matches || !slides[current].animate) return;
            const duration = Math.max(100,Math.min(1500,Number(root.dataset.srDuration)||450));
            const incoming = slides[current];
            const previous = slides[outgoing];
            track.style.display = 'grid';
            [previous,incoming].forEach(slide=>{slide.hidden=false;slide.style.gridArea='1 / 1';});
            previous.setAttribute('aria-hidden','true'); previous.inert=true;
            incoming.style.zIndex='1';
            let enter = [{opacity:0},{opacity:1}];
            let leave = [{opacity:1},{opacity:0}];
            if (effect==='slide' || effect==='vertical') {
                const axis=effect==='slide'?'X':'Y';
                enter=[{transform:'translate'+axis+'('+direction*100+'%)'},{transform:'translate'+axis+'(0%)'}];
                leave=[{transform:'translate'+axis+'(0%)'},{transform:'translate'+axis+'('+-direction*100+'%)'}];
            } else if (effect==='zoom') {
                enter=[{opacity:0,transform:'scale(.94)'},{opacity:1,transform:'scale(1)'}];
                leave=[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(1.04)'}];
            }
            const options={duration,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'};
            const inAnimation=incoming.animate(enter,options);
            const outAnimation=previous.animate(leave,options);
            animations=[inAnimation,outAnimation];
            inAnimation.finished.then(()=>{if(animations[0]===inAnimation)finishTransition();}).catch(()=>{});
        }
        reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)finishTransition();});
        root.addEventListener('keydown',e=>{
            if (e.target.matches('input,textarea,select,[contenteditable]')) return;
            if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();show(current+(e.key==='ArrowRight'?1:-1));}
        });
        let start=null;
        track.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')start={x:e.clientX,y:e.clientY};});
        track.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)show(current+(dx<0?1:-1));});
        track.addEventListener('pointercancel',()=>{start=null;});
        show(0,false);
    }
    function boot(){document.querySelectorAll('.sr-slides').forEach(init);}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
