import {parseResumeProfile} from '../../../connector';

// App-lifetime task state: route changes and browser focus cannot dismiss a job.
let snapshot={status:'idle',message:''};
const listeners=new Set();
export const subscribeParsing=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const getParsingSnapshot=()=>snapshot;
const publish=next=>{snapshot=next;listeners.forEach(listener=>listener());};
export const dismissParsing=()=>{if(snapshot.status!=='pending')publish({status:'idle',message:''});};
export const runResumeParsing=async id=>{
    if(snapshot.status==='pending')throw new Error('A resume is already being parsed. Please wait for it to finish.');
    publish({status:'pending',message:'Parsing resume and filling missing profile information…'});
    try {
        const profile=await parseResumeProfile(id);
        publish({status:'success',message:'Resume parsed successfully.'});
        return profile;
    } catch(error) {
        publish({status:'error',message:error.response?.data?.message || 'Resume parsing failed. Your saved resume is unchanged; please try again.'});
        throw error;
    }
};
