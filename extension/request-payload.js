const compactApplicationField = field => {
    const text = (value,max) => String(value ?? '').slice(0,max);
    return {fieldKey:text(field.fieldKey,240),label:text(field.label,500),name:text(field.name,200),placeholder:text(field.placeholder,240),autocomplete:text(field.autocomplete,100),type:text(field.type,50),required:Boolean(field.required),filled:Boolean(field.filled),hasError:Boolean(field.hasError),errorMessage:text(field.errorMessage,500),currentValue:text(field.currentValue,500),options:(Array.isArray(field.options)?field.options:[]).slice(0,2000).map(value=>text(value,200))};
};
const applicationFieldBatches = fields => {
    const batches=[];let batch=[],bytes=20;
    for (const raw of fields || []) {
        const field=compactApplicationField(raw),size=new TextEncoder().encode(JSON.stringify(field)).length+1;
        if (size>1800000) throw new Error('One application question is too large to analyze. Complete that question manually.');
        if (batch.length && (bytes+size>600000 || batch.length>=40)) {batches.push(batch);batch=[];bytes=20;}
        batch.push(field);bytes+=size;
    }
    if(batch.length)batches.push(batch);
    return batches;
};
if(typeof module !== 'undefined') module.exports={compactApplicationField,applicationFieldBatches};
