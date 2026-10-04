import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import GuidedSetup from './GuidedSetup';
import {getSignedInUser,getUserProfile,getResumes,saveOnboarding} from '../../../connector';
const mockNavigate=jest.fn();
let mockRole='user';
jest.mock('react-redux',()=>({useSelector:fn=>fn({auth:{isAuthenticated:true},studentData:{email:'user@example.com',role:mockRole}})}));
jest.mock('react-router-dom',()=>({useNavigate:()=>mockNavigate}));
jest.mock('../../../connector',()=>({getSignedInUser:jest.fn(),getUserProfile:jest.fn(),getResumes:jest.fn(),saveOnboarding:jest.fn()}));
beforeEach(()=>{
    mockRole='user';
    jest.clearAllMocks();getSignedInUser.mockResolvedValue({id:'user'});getUserProfile.mockResolvedValue({});getResumes.mockResolvedValue([]);saveOnboarding.mockImplementation(async state=>state);
});
test('AI Loop is omitted from the regular guide but remains available to admins',async()=>{
    getSignedInUser.mockResolvedValue({id:'user',onboarding:{status:'active',step:10}});
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
    getSignedInUser.mockResolvedValue({id:'user',onboarding:{status,step:3}});
    render(<GuidedSetup/>);
    await waitFor(()=>expect(getSignedInUser).toHaveBeenCalled());
    expect(getUserProfile).not.toHaveBeenCalled();expect(saveOnboarding).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();
});
test('new accounts qualify without profile checks and active guides resume at their saved step',async()=>{
    getSignedInUser.mockResolvedValue({id:'user',onboarding:{status:'pending',step:0}});
    const {unmount}=render(<GuidedSetup/>);await screen.findByRole('dialog');expect(getUserProfile).not.toHaveBeenCalled();unmount();
    getSignedInUser.mockResolvedValue({id:'user',onboarding:{status:'active',step:3}});
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
    getSignedInUser.mockResolvedValue({id:'user',onboarding:{status:'active',step:10}});
    saveOnboarding.mockRejectedValue(new Error('Offline'));render(<GuidedSetup/>);
    fireEvent.click(await screen.findByRole('button',{name:'Finish'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your progress');
});
