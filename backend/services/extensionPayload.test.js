const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const errorHandler=require('../middleware/errorHandler');
test('bounded extension JSON accepts large forms and returns helpful 413 for oversized bodies',async()=>{
    const app=express();app.use('/api/extension',express.json({limit:'2mb'}));app.use(express.json());
    app.post('/api/extension/fill-plan',(req,res)=>res.json({fields:req.body.fields.length}));app.use(errorHandler);
    const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    try{
        const url=`http://127.0.0.1:${server.address().port}/api/extension/fill-plan`;
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:[{options:Array.from({length:2000},()=> 'Option'.repeat(20))}]})});
        assert.equal(response.status,200);assert.equal((await response.json()).fields,1);
        const oversized=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:['x'.repeat(2100000)]})});
        assert.equal(oversized.status,413);assert.match((await oversized.json()).message,/Rescan/);
    }finally{await new Promise(resolve=>server.close(resolve));}
});
