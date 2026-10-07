import React from 'react';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import GuidedSetup from './GuidedSetup';
import {getSignedInUser,getUserProfile,getResumes,saveOnboarding} from '../../../connector';
const mockNavigate=jest.fn();
let mockRole='user',mockUser,mockPath='/active-job-postings';
jest.mock('react-redux',()=>({useSelector:fn=>{mockUser.role=mockRole;return fn({auth:{isAuthenticated:true},studentData:mockUser});}}));
jest.mock('react-router-dom',()=>({useNavigate:()=>mockNavigate,useLocation:()=>({pathname:mockPath})}));
jest.mock('../../../connector',()=>({getSignedInUser:jest.fn(),getUserProfile:jest.fn(),getResumes:jest.fn(),saveOnboarding:jest.fn()}));
beforeEach(()=>{
    mockRole='user';mockPath='/active-job-postings';
    jest.clearAllMocks();mockUser={id:'user'};getUserProfile.mockResolvedValue({});getResumes.mockResolvedValue([]);saveOnboarding.mockImplementation(async state=>state);
});
test('AI Loop is omitted from the regular guide but remains available to admins',async()=>{
    mockUser={id:'user',onboarding:{status:'active',step:10}};
    const {unmount}=render(<GuidedSetup/>);
    await screen.findByRole('button',{name:'Finish'});
    expect(screen.queryByText('Meet AI Loop')).not.toBeInTheDocument();
    unmount();mockRole='admin';
    render(<GuidedSetup/>);
    expect(await screen.findByText('Meet AI Loop')).toBeInTheDocument();
});
test('zero profile starts once, advances, opens upload and permanently skips',async()=>{
    render(<GuidedSetup/>);
    expect(await screen.findByRole('heading',{name:'Let’s set up your application profile'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Next Step'}));
    fireEvent.click(await screen.findByRole('button',{name:/Open resume upload/}));
    expect(mockNavigate).toHaveBeenCalledWith('/resumes',{state:{uploadAndParse:true}});
    fireEvent.click(await screen.findByRole('button',{name:/Continue guide/}));
    fireEvent.click(screen.getByRole('button',{name:'Skip'}));
    await waitFor(()=>expect(saveOnboarding).toHaveBeenLastCalledWith({status:'skipped',step:1}));
});
test.each(['completed','skipped'])('does not reopen a %s guide even with an empty profile',async status=>{
    mockUser={id:'user',onboarding:{status,step:3}};
    render(<GuidedSetup/>);
    expect(getSignedInUser).not.toHaveBeenCalled();
    expect(getUserProfile).not.toHaveBeenCalled();expect(saveOnboarding).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();
});
test('new accounts qualify without profile checks and active guides resume at their saved step',async()=>{
    mockUser={id:'user',onboarding:{status:'pending',step:0}};
    const {unmount}=render(<GuidedSetup/>);await screen.findByRole('dialog');expect(getUserProfile).not.toHaveBeenCalled();unmount();
    mockUser={id:'user',onboarding:{status:'active',step:3}};
    render(<GuidedSetup/>);fireEvent.click(await screen.findByRole('button',{name:/Edit education/}));
    expect(mockNavigate).toHaveBeenLastCalledWith('/profile',{state:{guidedSection:'education'}});
});
test('existing nonempty profiles and failed profile loads do not trigger the guide',async()=>{
    getUserProfile.mockResolvedValue({skills:['JavaScript']});
    const {unmount}=render(<GuidedSetup/>);
    await waitFor(()=>expect(getResumes).toHaveBeenCalled());expect(saveOnboarding).not.toHaveBeenCalled();unmount();
    getUserProfile.mockRejectedValue(new Error('Offline'));render(<GuidedSetup/>);
    await waitFor(()=>expect(getUserProfile).toHaveBeenCalledTimes(2));expect(saveOnboarding).not.toHaveBeenCalled();
});
test('save failures keep the guide open with retry feedback',async()=>{
    mockUser={id:'user',onboarding:{status:'active',step:10}};
    saveOnboarding.mockRejectedValue(new Error('Offline'));render(<GuidedSetup/>);
    fireEvent.click(await screen.findByRole('button',{name:'Finish'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your progress');
});
test('Autofill does not repeat session, profile, or resume onboarding requests',()=>{
    mockPath='/autofill';
    render(<GuidedSetup/>);
    expect(getSignedInUser).not.toHaveBeenCalled();
    expect(getUserProfile).not.toHaveBeenCalled();
    expect(getResumes).not.toHaveBeenCalled();
    expect(saveOnboarding).not.toHaveBeenCalled();
});
test('Next Step advances immediately, coalesces pending saves, and never checks task completion',async()=>{
    mockUser={id:'user',onboarding:{status:'active',step:0}};
    let finish;
    saveOnboarding.mockImplementationOnce(state=>new Promise(resolve=>{finish=()=>resolve(state);}));
    render(<GuidedSetup/>);
    fireEvent.click(screen.getByRole('button',{name:'Next Step'}));
    expect(screen.getByRole('heading',{name:'Start with your resume'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Next Step'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Next Step'}));
    fireEvent.click(screen.getByRole('button',{name:'Next Step'}));
    expect(screen.getByRole('heading',{name:'Add your education'})).toBeInTheDocument();
    expect(saveOnboarding).toHaveBeenCalledTimes(1);
    expect(getUserProfile).not.toHaveBeenCalled();expect(getResumes).not.toHaveBeenCalled();
    await act(async()=>finish());
    expect(saveOnboarding).toHaveBeenCalledTimes(2);
    expect(saveOnboarding).toHaveBeenLastCalledWith({status:'active',step:3});
    expect(screen.getByRole('heading',{name:'Add your education'})).toBeInTheDocument();
});
test('failed background save keeps the new step and can retry without advancing',async()=>{
    mockUser={id:'user',onboarding:{status:'active',step:0}};
    saveOnboarding.mockRejectedValueOnce(new Error('Offline'));
    render(<GuidedSetup/>);
    fireEvent.click(screen.getByRole('button',{name:'Next Step'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('heading',{name:'Start with your resume'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Retry save'}));
    await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(saveOnboarding).toHaveBeenLastCalledWith({status:'active',step:1});
});
test('Skip closes immediately even while an earlier progress save is pending',async()=>{
    mockUser={id:'user',onboarding:{status:'active',step:0}};
    let finish;saveOnboarding.mockImplementationOnce(state=>new Promise(resolve=>{finish=()=>resolve(state);}));
    render(<GuidedSetup/>);
    fireEvent.click(screen.getByRole('button',{name:'Next Step'}));
    fireEvent.click(screen.getByRole('button',{name:'Skip'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Guide progress save')).not.toBeInTheDocument();
    await act(async()=>finish());
    expect(saveOnboarding).toHaveBeenLastCalledWith({status:'skipped',step:1});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
