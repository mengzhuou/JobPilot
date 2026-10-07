import React from 'react';
import {render,screen,fireEvent,act} from '@testing-library/react';
import ResumeEnhancementEntry from './ResumeEnhancementEntry';
import {assessResumeForJob,dismissResumeEnhancement,setEnhancementReminders} from '../../../connector';

jest.mock('../../../connector',()=>({assessResumeForJob:jest.fn(),dismissResumeEnhancement:jest.fn(),setEnhancementReminders:jest.fn(),clearJobResumeSelection:jest.fn(),getResumeEnhancements:jest.fn()}));
jest.mock('./ResumeEnhancement',()=>({__esModule:true,default:()=> <div>Enhancement editor</div>,AlignmentScore:({analysis})=><span>{analysis.score}% match</span>}));
const job={jobUrl:'https://example.com/jobs/1',jobTitle:'Engineer',company:'Example'};
const low={available:true,shouldPrompt:true,draft:{id:'draft-1',job:{title:'Engineer',company:'Example'},analysis:{score:40,missing:['Docker','SQL']}}};
const assess=async()=>{await act(async()=>{jest.advanceTimersByTime(400);});};
beforeEach(()=>{jest.useFakeTimers();jest.clearAllMocks();dismissResumeEnhancement.mockResolvedValue({});setEnhancementReminders.mockResolvedValue({});});
afterEach(()=>{jest.useRealTimers();});

test('only renders a low-score suggestion as a modal, without an inline promotional card',async()=>{
    assessResumeForJob.mockResolvedValue(low);
    const {container}=render(<ResumeEnhancementEntry job={job}/>);
    expect(screen.getByRole('dialog')).toHaveTextContent('Checking your resume');
    await assess();
    expect(screen.getByRole('dialog')).toHaveTextContent('Improve your resume for this role');
    expect(screen.getByText('40% match')).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeInTheDocument();
    expect(screen.queryByText(/Check your resume’s alignment/)).not.toBeInTheDocument();
    expect(container.querySelector('.resume-enhancement-entry')).toBeNull();
});
test('opens immediately and continuing is not blocked by assessment or dismissal',async()=>{
    let resolve;
    assessResumeForJob.mockReturnValue(new Promise(done=>{resolve=done;}));
    const onContinue=jest.fn();
    render(<ResumeEnhancementEntry job={job} onContinue={onContinue}/>);
    expect(screen.getByRole('dialog')).toHaveTextContent('Checking your resume');
    expect(screen.queryByText(/keyword match is low/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Continue applying'}));
    expect(onContinue).toHaveBeenCalledTimes(1);
    await act(async()=>{resolve(low);jest.advanceTimersByTime(400);});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test.each([
    {available:true,shouldPrompt:false,draft:{...low.draft,analysis:{score:90,missing:[]}}},
    {available:false,shouldPrompt:false,reason:'No resume'},
])('does not show a popup or card when no suggestion is needed',async result=>{
    assessResumeForJob.mockResolvedValue(result);
    const {container}=render(<ResumeEnhancementEntry job={job}/>);await assess();
    expect(container).toBeEmptyDOMElement();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('assessment failure does not display a notice or interrupt Autofill',async()=>{
    assessResumeForJob.mockRejectedValue(new Error('Offline'));
    const {container}=render(<ResumeEnhancementEntry job={job}/>);await assess();expect(container).toBeEmptyDOMElement();
});
test('continue persists the reminder preference and continues Autofill',async()=>{
    assessResumeForJob.mockResolvedValue(low);const onContinue=jest.fn();
    render(<ResumeEnhancementEntry job={job} onContinue={onContinue}/>);await assess();
    fireEvent.click(screen.getByRole('checkbox',{name:'Don’t remind me again'}));
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Continue without enhancing'}));});
    expect(setEnhancementReminders).toHaveBeenCalledWith(true);expect(dismissResumeEnhancement).toHaveBeenCalledWith('draft-1');expect(onContinue).toHaveBeenCalledTimes(1);
});
test('tailor opens the editor',async()=>{
    assessResumeForJob.mockResolvedValue(low);render(<ResumeEnhancementEntry job={job}/>);await assess();
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Tailor my resume'}));});
    expect(screen.getByText('Enhancement editor')).toBeInTheDocument();
});
test('closing does not reopen the suggestion when job details finish loading',async()=>{
    assessResumeForJob.mockResolvedValue(low);const {rerender}=render(<ResumeEnhancementEntry job={job}/>);await assess();
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Close improvement suggestion'}));});
    rerender(<ResumeEnhancementEntry job={{...job,summary:'Loaded job details'}}/>);await assess();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
