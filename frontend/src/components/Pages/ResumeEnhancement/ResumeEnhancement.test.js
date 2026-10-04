import React from 'react';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import ResumeEnhancement,{composeResume} from './ResumeEnhancement';
import {generateResumeEnhancement,createResumeRevision,saveResumeEnhancement,updateEnhancementReview,getResumeEnhancement} from '../../../connector';
jest.mock('../../../connector',()=>({getResumeEnhancement:jest.fn(),generateResumeEnhancement:jest.fn(),createResumeRevision:jest.fn(),saveResumeEnhancement:jest.fn(),downloadResumeEnhancement:jest.fn(),updateEnhancementReview:jest.fn()}));
const source='Alex Candidate\nalex@example.com\n\nEXPERIENCE\nBuilt Python services.\n\nEDUCATION\nBS Computer Science\n\nSKILLS\nPython SQL';
const changes=[{section:'experience',original:'Built Python services.',replacement:'Developed services using Python.',reason:'Clearer wording.'}];
const draft={id:'draft-1',job:{title:'Backend engineer',company:'Example'},source_name:'Original',source_text:source,analysis:{score:40,missing:['Docker'],matched:['Python'],checks:[],explanation:'Keyword estimate, not an ATS guarantee.',limitation:'Limited to readable text.'},status:'assessed',changes:[],generationAvailable:true};
test('missing skill chips are grouped by requirement with source evidence',()=>{
    render(<ResumeEnhancement initialDraft={{...draft,analysis:{...draft.analysis,missing:['Docker','Rust'],keywordDetails:[{label:'Docker',category:'required',evidence:'Docker is required'},{label:'Rust',category:'preferred',evidence:'Rust is a plus'}]}}} onClose={jest.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:/Choose improvements/}));
    expect(screen.getByText('Required skills')).toBeInTheDocument();
    expect(screen.getByText('Preferred skills')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Docker'})).toHaveAttribute('title','Docker is required');
    fireEvent.click(screen.getByRole('button',{name:'Rust'}));
    expect(screen.getByRole('button',{name:'Rust'})).toHaveAttribute('aria-pressed','true');
});
beforeEach(()=>{jest.clearAllMocks();updateEnhancementReview.mockResolvedValue({});Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}});});
test('requires explicit consent before generating and opens the review',async()=>{
    generateResumeEnhancement.mockResolvedValue({...draft,status:'ready',changes,previewText:composeResume(source,changes)});
    render(<ResumeEnhancement initialDraft={draft} onClose={jest.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:/Choose improvements/}));
    expect(screen.getByRole('button',{name:'Generate suggestions'})).toBeDisabled();
    expect(screen.getByRole('checkbox',{name:/Send this resume/})).toBeRequired();
    fireEvent.click(screen.getByRole('checkbox',{name:/Send this resume/}));fireEvent.click(screen.getByRole('button',{name:'Generate suggestions'}));
    await screen.findByText('Make it sound like you');
    expect(generateResumeEnhancement).toHaveBeenCalledWith('draft-1',expect.objectContaining({consent:true,mode:'quick'}));
    expect(screen.getByRole('button',{name:'Save & use for this job'})).toBeDisabled();
});
test('manual editing and preview replace comparisons; accuracy confirmation is required for saving',async()=>{
    saveResumeEnhancement.mockResolvedValue({id:'new-resume',display_name:'Tailored'});
    const saved=jest.fn();render(<ResumeEnhancement initialDraft={{...draft,status:'ready',changes,previewText:composeResume(source,changes)}} onClose={jest.fn()} onSaved={saved}/>);
    expect(screen.queryByText('Compare wording')).not.toBeInTheDocument();
    expect(screen.queryByText('View original resume')).not.toBeInTheDocument();
    expect(screen.getByRole('article',{name:'Resume preview'})).toHaveTextContent('Developed services using Python.');
    fireEvent.click(screen.getByRole('button',{name:'Edit manually'}));
    fireEvent.change(screen.getByRole('textbox',{name:/Final resume/}),{target:{value:source}});
    expect(screen.getByRole('textbox',{name:/Final resume/})).toHaveValue(source);
    fireEvent.click(screen.getByRole('checkbox',{name:/I reviewed all qualifications/}));
    fireEvent.click(screen.getByRole('button',{name:'Save & use for this job'}));
    await waitFor(()=>expect(saved).toHaveBeenCalled());
    expect(saveResumeEnhancement).toHaveBeenCalledWith('draft-1',expect.objectContaining({reviewed:true,text:source}));
    expect(screen.getByRole('button',{name:'Selected for this job'})).toBeDisabled();
});
test('keywords toggle, custom keywords deduplicate, and generation receives the selection',async()=>{
    generateResumeEnhancement.mockRejectedValue({response:{data:{message:'Retry later'}}});
    render(<ResumeEnhancement initialDraft={draft} onClose={jest.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:/Choose improvements/}));
    const chip=screen.getByRole('button',{name:'Docker'});
    expect(chip).toHaveAttribute('aria-pressed','false');
    fireEvent.click(chip);expect(chip).toHaveAttribute('aria-pressed','true');
    fireEvent.click(chip);expect(chip).toHaveAttribute('aria-pressed','false');
    const input=screen.getByRole('textbox',{name:'Add a custom keyword'});
    fireEvent.change(input,{target:{value:' GraphQL '}});fireEvent.keyDown(input,{key:'Enter'});
    expect(screen.getByRole('button',{name:'GraphQL'})).toHaveAttribute('aria-pressed','true');
    fireEvent.change(input,{target:{value:'graphql'}});fireEvent.click(screen.getByRole('button',{name:'Add keyword'}));
    expect(screen.getAllByRole('button',{name:'GraphQL'})).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Deselect all'}));
    expect(screen.getByRole('button',{name:'GraphQL'})).toHaveAttribute('aria-pressed','false');
    fireEvent.click(screen.getByRole('button',{name:'Select all'}));
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole('checkbox',{name:/Send this resume/}));fireEvent.click(screen.getByRole('button',{name:'Generate suggestions'}));
    await screen.findByRole('alert');
    expect(generateResumeEnhancement).toHaveBeenCalledWith('draft-1',expect.objectContaining({selectedKeywords:['GraphQL']}));
});
test('insertion preserves identity and untouched sections',()=>{
    const result=composeResume(source,[{original:'',replacement:'Python developer.',section:'summary'},...changes]);
    expect(result).toContain('Alex Candidate\nalex@example.com');expect(result).toContain('SUMMARY\nPython developer.');expect(result).toContain('EDUCATION\nBS Computer Science');
});
test('one generation request does not also poll status while waiting',async()=>{
    jest.useFakeTimers();let resolve;
    generateResumeEnhancement.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    try{
        render(<ResumeEnhancement initialDraft={draft} onClose={jest.fn()}/>);
        fireEvent.click(screen.getByRole('button',{name:/Choose improvements/}));fireEvent.click(screen.getByRole('checkbox',{name:/Send this resume/}));
        fireEvent.click(screen.getByRole('button',{name:'Generate suggestions'}));
        await act(async()=>{jest.advanceTimersByTime(30000);});
        expect(generateResumeEnhancement).toHaveBeenCalledTimes(1);expect(getResumeEnhancement).not.toHaveBeenCalled();
        await act(async()=>{resolve({...draft,status:'ready',changes,previewText:composeResume(source,changes)});});
        expect(screen.getByText('Make it sound like you')).toBeInTheDocument();
    }finally{jest.useRealTimers();}
});
test('recovered generation polls sequentially with backoff and stops when ready',async()=>{
    jest.useFakeTimers();
    getResumeEnhancement.mockResolvedValueOnce({...draft,status:'generating',updated_at:new Date().toISOString()}).mockResolvedValueOnce({...draft,status:'ready',changes,previewText:source});
    try{
        render(<ResumeEnhancement initialDraft={{...draft,status:'generating'}} onClose={jest.fn()}/>);
        await act(async()=>{jest.advanceTimersByTime(5000);});expect(getResumeEnhancement).toHaveBeenCalledTimes(1);
        await act(async()=>{jest.advanceTimersByTime(9999);});expect(getResumeEnhancement).toHaveBeenCalledTimes(1);
        await act(async()=>{jest.advanceTimersByTime(1);});expect(getResumeEnhancement).toHaveBeenCalledTimes(2);
        await act(async()=>{jest.advanceTimersByTime(30000);});expect(getResumeEnhancement).toHaveBeenCalledTimes(2);
        expect(generateResumeEnhancement).not.toHaveBeenCalled();
    }finally{jest.useRealTimers();}
});
test('source offsets distinguish repeated resume lines',()=>{
    const repeated='Built Python services.\nBuilt Python services.';
    expect(composeResume(repeated,[{...changes[0],sourceStart:23}])).toBe('Built Python services.\nDeveloped services using Python.');
});
test('generation failure does not discard the original or block exiting',async()=>{
    generateResumeEnhancement.mockRejectedValue({response:{data:{message:'Please retry later'}}});
    const close=jest.fn();render(<ResumeEnhancement initialDraft={draft} onClose={close}/>);
    fireEvent.click(screen.getByRole('button',{name:/Choose improvements/}));fireEvent.click(screen.getByRole('checkbox',{name:/Send this resume/}));fireEvent.click(screen.getByRole('button',{name:'Generate suggestions'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please retry later');
    fireEvent.click(screen.getByRole('button',{name:'Keep original for now'}));expect(close).toHaveBeenCalled();
});
test('closing a review flushes the latest edits before leaving',async()=>{
    const close=jest.fn();render(<ResumeEnhancement initialDraft={{...draft,status:'ready',changes,previewText:composeResume(source,changes)}} onClose={close}/>);
    fireEvent.click(screen.getByRole('button',{name:'Edit manually'}));
    fireEvent.change(screen.getByRole('textbox',{name:/Final resume/}),{target:{value:source+'\nCandidate-reviewed edit.'}});
    fireEvent.click(screen.getByRole('button',{name:'Keep original for now'}));
    await waitFor(()=>expect(close).toHaveBeenCalled());
    expect(updateEnhancementReview).toHaveBeenCalledWith('draft-1',source+'\nCandidate-reviewed edit.');
});
test.each([false,true])('AI edits and regeneration create a new version and can restore the previous one (%s)',async regenerate=>{
    const current=composeResume(source,changes);const child={...draft,id:'revision-1',source_text:current,previewText:current};
    createResumeRevision.mockResolvedValue(child);
    generateResumeEnhancement.mockResolvedValue({...child,status:'ready',changes:[],previewText:current+'\nUpdated wording.'});
    render(<ResumeEnhancement initialDraft={{...draft,status:'ready',changes,previewText:current}} onClose={jest.fn()}/>);
    expect(screen.getByRole('button',{name:/Regenerate/})).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox',{name:/Send this resume/}));
    fireEvent.change(screen.getByRole('textbox',{name:/How should AI/}),{target:{value:'Shorten my summary'}});
    fireEvent.click(screen.getByRole('button',{name:regenerate?/Regenerate/:/Edit with AI/}));
    await screen.findByText('Updated wording.');
    expect(createResumeRevision).toHaveBeenCalledWith('draft-1',expect.objectContaining({text:current,editable:false}));
    expect(generateResumeEnhancement).toHaveBeenCalledWith('revision-1',expect.objectContaining({consent:true,instructions:regenerate?expect.stringContaining('alternative'):'Shorten my summary'}));
    fireEvent.click(screen.getByRole('button',{name:'Restore previous version'}));
    await screen.findByText('Previous version restored.');
    expect(screen.getByRole('article',{name:'Resume preview'})).not.toHaveTextContent('Updated wording.');
});
test('failed AI revision keeps the current manual text intact',async()=>{
    const current=source+'\nMy manual addition.';
    createResumeRevision.mockRejectedValue({response:{data:{message:'Try later'}}});
    render(<ResumeEnhancement initialDraft={{...draft,status:'ready',previewText:current}} onClose={jest.fn()}/>);
    fireEvent.click(screen.getByRole('checkbox',{name:/Send this resume/}));fireEvent.click(screen.getByRole('button',{name:/Regenerate/}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later');
    expect(screen.getByRole('article',{name:'Resume preview'})).toHaveTextContent('My manual addition.');
});
test('editing a saved resume makes a separate editable draft without an AI request',async()=>{
    createResumeRevision.mockResolvedValue({...draft,id:'editable-copy',status:'ready',previewText:source});
    render(<ResumeEnhancement initialDraft={{...draft,status:'saved',previewText:source}} onClose={jest.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:'Edit manually'}));
    expect(await screen.findByRole('textbox',{name:/Final resume/})).not.toHaveAttribute('readonly');
    expect(createResumeRevision).toHaveBeenCalledWith('draft-1',expect.objectContaining({editable:true}));
    expect(generateResumeEnhancement).not.toHaveBeenCalled();
});
