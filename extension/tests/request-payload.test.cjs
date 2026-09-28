const test=require('node:test'),assert=require('node:assert/strict');
const {applicationFieldBatches}=require('../request-payload');
test('large forms are compacted and batched without losing late dropdown choices',()=>{
    const fields=Array.from({length:120},(_,i)=>({fieldKey:String(i),label:'Country',type:'select',context:'unnecessary'.repeat(100000),options:Array.from({length:300},(_,j)=>j===299?'United States':`Country ${j}`)}));
    const batches=applicationFieldBatches(fields);
    assert(batches.length>=3);assert.equal(batches.flat().length,120);
    for(const batch of batches){assert(Buffer.byteLength(JSON.stringify({fields:batch}))<2*1024*1024);assert.equal(batch[0].context,undefined);assert.equal(batch[0].options[299],'United States');}
});
test('bounds use UTF-8 bytes, not character count',()=>{
    const batches=applicationFieldBatches(Array.from({length:10},(_,i)=>({fieldKey:String(i),options:Array.from({length:2000},()=> '界'.repeat(200))})));
    assert.equal(batches.length,10);assert(batches.every(batch=>Buffer.byteLength(JSON.stringify({fields:batch}))<2*1024*1024));
});
