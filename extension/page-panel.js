(() => {
    if (window !== window.top || window.__JOBPILOT_PAGE_PANEL__) return;
    window.__JOBPILOT_PAGE_PANEL__ = true;
    let host, shadow, frame, launcher, currentUrl=location.href, mode='new', position=null;
    const clamp=(value,min,max)=>Math.min(Math.max(min,max),Math.max(min,value));
    const place=()=>{
        if(!launcher)return;
        const y=position?.y ?? Math.round(innerHeight*.55);
        launcher.style.right='0px';
        launcher.style.top=`${clamp(y,12,innerHeight-64)}px`;
    };
    const render=()=>{
        if(mode==='closed'){host?.remove();host=null;frame=null;launcher=null;return;}
        if(!host?.isConnected)build();
        host.style.setProperty('display','block','important');
        frame.hidden=mode!=='open';launcher.hidden=mode!=='collapsed';place();
    };
    const setMode=next=>{mode=next;render();};
    const build=()=>{
        host=document.createElement('div');host.id='jobpilot-page-panel';
        host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;';
        shadow=host.attachShadow({mode:'closed'});
        const style=document.createElement('style');
        style.textContent=`
            *{box-sizing:border-box}[hidden]{display:none!important}
            iframe{position:absolute;right:0;top:0;width:min(400px,100vw);height:100%;border:0;border-left:1px solid #dbe4ef;background:#f4f7fb;box-shadow:-8px 0 32px #17203322;pointer-events:auto}
            .launcher{position:absolute;right:0;pointer-events:auto;width:56px;height:56px}
            .open{width:56px;height:56px;border:1px solid #c9d9ef;border-right:0;border-radius:16px 0 0 16px;background:#fff;box-shadow:0 8px 24px #17203330;cursor:ns-resize;touch-action:none;padding:7px}
            .open img{width:40px;height:40px;pointer-events:none}
            .open:focus-visible{outline:3px solid #3468b7;outline-offset:-3px}
        `;
        frame=document.createElement('iframe');frame.title='JobPilot application assistant';frame.src=chrome.runtime.getURL('sidepanel.html?embedded=1');
        launcher=document.createElement('div');launcher.className='launcher';
        const open=document.createElement('button');open.type='button';open.className='open';open.title='Open JobPilot · drag up or down';open.setAttribute('aria-label','Open JobPilot');
        const icon=document.createElement('img');icon.src=chrome.runtime.getURL('icons/icon48.png');icon.alt='';open.append(icon);
        let drag=null,moved=false;
        open.addEventListener('pointerdown',event=>{if(event.button!==0)return;const bounds=launcher.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,top:bounds.top};moved=false;open.setPointerCapture(event.pointerId);});
        open.addEventListener('pointermove',event=>{if(!drag || drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;if(moved){position={y:drag.top+dy};place();}});
        open.addEventListener('pointerup',()=>{drag=null;});
        open.addEventListener('pointercancel',()=>{drag=null;moved=true;});
        open.addEventListener('click',()=>{if(moved){moved=false;return;}setMode('open');});
        launcher.append(open);shadow.append(style,frame,launcher);document.documentElement.append(host);
    };
    chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
        if(message.type!=='JOBPILOT_PAGE_PANEL')return;
        if(currentUrl!==location.href){currentUrl=location.href;mode='new';}
        if(message.mode==='auto'){if(mode==='new')mode='open';}
        else if(['open','collapsed','closed'].includes(message.mode))mode=message.mode;
        render();respond({visible:mode==='open',mode});
    });
    window.addEventListener('resize',place);
})();
