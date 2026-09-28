import React from 'react';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Resumes from './Resumes';
import {getResumes,createResume,parseResumeProfile} from '../../../connector';
jest.mock('../../../connector',()=>({getResumes:jest.fn(),createResume:jest.fn(),parseResumeProfile:jest.fn()}));
beforeEach(()=>{jest.clearAllMocks();getResumes.mockResolvedValue([]);createResume.mockResolvedValue({id:'resume-a'});parseResumeProfile.mockResolvedValue({});});
const mount=(state)=>render(<MemoryRouter initialEntries={[{pathname:'/resumes',state}]}><Resumes/></MemoryRouter>);
async function uploadSetup(parse=false) {
    const view=mount();
    fireEvent.click(await screen.findByRole('button',{name:'Upload résumé'}));
    fireEvent.change(view.container.querySelector('input[type="file"]'),{target:{files:[new File(['sample'],'Resume.pdf',{type:'application/pdf'})]}});
    if(parse)fireEvent.click(screen.getByRole('checkbox',{name:/Parse this résumé/}));
    return view;
}
test('normal upload never invokes AI parsing',async()=>{
    await uploadSetup();
    fireEvent.click(screen.getAllByRole('button',{name:'Upload résumé'}).at(-1));
    await waitFor(()=>expect(createResume).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Résumé uploaded successfully.')).toBeInTheDocument();
    expect(parseResumeProfile).not.toHaveBeenCalled();
});
test('opted-in upload parses the newly saved résumé',async()=>{
    await uploadSetup(true);
    fireEvent.click(screen.getByRole('button',{name:'Upload & parse'}));
    await waitFor(()=>expect(parseResumeProfile).toHaveBeenCalledWith('resume-a'));
    expect(await screen.findByText(/Missing profile information filled/)).toBeInTheDocument();
});
test('parse failure retains uploaded résumé and does not invite duplicate upload',async()=>{
    parseResumeProfile.mockRejectedValue({response:{data:{message:'Parser unavailable'}}});
    await uploadSetup(true);fireEvent.click(screen.getByRole('button',{name:'Upload & parse'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Résumé uploaded, but parsing failed');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(createResume).toHaveBeenCalledTimes(1);
});
test('empty profile handoff opens upload with parsing selected, but does not upload automatically',async()=>{
    mount({uploadAndParse:true});
    expect(await screen.findByRole('checkbox',{name:/Parse this résumé/})).toBeChecked();
    expect(createResume).not.toHaveBeenCalled();expect(parseResumeProfile).not.toHaveBeenCalled();
});
test('upload dialog omits Optional labels and keeps the required marker inline',async()=>{
    await uploadSetup();
    expect(screen.queryByText(/Optional/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Target job title')).toBeInTheDocument();
    expect(screen.getByText('Résumé name').querySelector('b')).toHaveTextContent('*');
});
test('parsing uses a persistent progress snackbar then a success snackbar',async()=>{
    let finish;
    parseResumeProfile.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    await uploadSetup(true);
    fireEvent.click(screen.getByRole('button',{name:'Upload & parse'}));
    const progress=await screen.findByText('Parsing résumé and filling missing profile information…');
    expect(progress.closest('.MuiSnackbar-root')).not.toBeNull();
    expect(screen.queryByText(/parsed successfully/)).not.toBeInTheDocument();
    await act(async()=>{finish({});});
    const success=await screen.findByText(/Résumé parsed successfully/);
    expect(success.closest('.MuiSnackbar-root')).not.toBeNull();
    expect(screen.queryByText('Parsing résumé and filling missing profile information…')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'View Profile'})).toBeInTheDocument();
});
test('saved résumé parsing also shows progress and success instead of immediately leaving the page',async()=>{
    getResumes.mockResolvedValue([{id:'saved',display_name:'Saved résumé',file_name:'resume.pdf',is_primary:true}]);
    let finish;parseResumeProfile.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    mount();fireEvent.click(await screen.findByRole('button',{name:'Actions for Saved résumé'}));
    fireEvent.click(screen.getByRole('button',{name:'Parse into Profile'}));
    fireEvent.click(screen.getByRole('button',{name:'Parse & fill Profile'}));
    expect(await screen.findByText('Parsing résumé and filling missing profile information…')).toBeInTheDocument();
    expect(parseResumeProfile).toHaveBeenCalledWith('saved');
    await act(async()=>{finish({});});
    expect(await screen.findByText(/Résumé parsed successfully/)).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Résumés'})).toBeInTheDocument();
});
