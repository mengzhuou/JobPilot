const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../../frontend/node_modules/jsdom');
const source=fs.readFileSync(path.join(__dirname,'../page-panel.js'),'utf8');
const setup=()=>{
    const dom=new JSDOM('<!doctype html><title>Application</title>',{url:'https://jobs.example.com/apply',runScripts:'outside-only'}),w=dom.window;
    let listener,root;
    const attach=w.Element.prototype.attachShadow;
    w.Element.prototype.attachShadow=function(options){root=attach.call(this,options);return root;};
    w.chrome={runtime:{getURL:file=>`chrome-extension://test/${file}`,onMessage:{addListener:fn=>{listener=fn;}}}};
    w.eval(source);
    const send=mode=>{let result;listener({type:'JOBPILOT_PAGE_PANEL',mode},{},value=>{result=value;});return result;};
    return {dom,w,send,root:()=>root};
};
test('auto-opens once; collapse keeps iframe state; rescans do not reopen; launcher has no close button',()=>{
    const t=setup();try {
        assert.equal(t.send('auto').mode,'open');const frame=t.root().querySelector('iframe');
        assert.equal(frame.hidden,false);assert.equal(t.w.document.querySelectorAll('#jobpilot-page-panel').length,1);
        assert.equal(t.send('collapsed').mode,'collapsed');assert.equal(frame.hidden,true);
        assert.equal(t.send('auto').mode,'collapsed');
        t.root().querySelector('.open').click();assert.equal(frame.hidden,false);
        t.send('collapsed');assert.equal(t.root().querySelector('.close'),null);
        assert.equal(t.root().querySelectorAll('button').length,1);
        t.w.history.pushState({},'', '/another-application');assert.equal(t.send('auto').mode,'open');
        assert.equal(t.root().querySelector('iframe'),frame);
    } finally {t.dom.window.close();}
});
test('dragging stays in the viewport and does not accidentally open the panel',()=>{
    const t=setup();try {
        t.send('collapsed');const open=t.root().querySelector('.open');open.setPointerCapture=()=>{};
        open.dispatchEvent(new t.w.MouseEvent('pointerdown',{clientX:20,clientY:20,button:0}));
        open.dispatchEvent(new t.w.MouseEvent('pointermove',{clientX:9999,clientY:9999}));
        open.dispatchEvent(new t.w.MouseEvent('pointerup'));open.click();
        assert.equal(t.root().querySelector('iframe').hidden,true);
        const launcher=t.root().querySelector('.launcher');
        assert.equal(launcher.style.right,'0px');assert.equal(launcher.style.left,'');
        assert.equal(parseInt(launcher.style.top),t.w.innerHeight-64);
        t.w.innerHeight=300;t.w.innerWidth=400;t.w.dispatchEvent(new t.w.Event('resize'));
        assert.equal(launcher.style.right,'0px');assert.equal(parseInt(launcher.style.top),236);
        open.click();assert.equal(t.root().querySelector('iframe').hidden,false);
    } finally {t.dom.window.close();}
});
test('the app displays directly on open and rebuild without loading or fallback overlays',()=>{
    const t=setup();try {
        let timers=0;t.w.setTimeout=()=>{timers++;};
        const assertDirect=()=>{
            assert.equal(t.root().querySelector('iframe').hidden,false);
            assert.deepEqual(Array.from(t.root().children,node=>node.tagName),['STYLE','IFRAME','DIV']);
            assert.equal(t.root().lastElementChild.className,'launcher');
            assert.equal(t.root().lastElementChild.hidden,true);
            assert.equal(timers,0);
        };
        t.send('auto');assertDirect();
        t.send('closed');t.send('open');assertDirect();
        t.w.document.getElementById('jobpilot-page-panel').remove();
        t.send('auto');assertDirect();
    } finally {t.dom.window.close();}
});
