import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import EmptyProfilePrompt from './EmptyProfilePrompt';
import {getSignedInUser} from '../../../connector';
jest.mock('../../../connector',()=>({getSignedInUser:jest.fn()}));
beforeEach(()=>{localStorage.clear();getSignedInUser.mockResolvedValue({id:'user-a'});});
test('only eligible profiles show the prompt and Go opens upload',async()=>{
    const upload=jest.fn();
    const {rerender}=render(<EmptyProfilePrompt eligible={false} onUpload={upload}/>);
    expect(getSignedInUser).not.toHaveBeenCalled();
    rerender(<EmptyProfilePrompt eligible onUpload={upload}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Go to résumés'}));
    expect(upload).toHaveBeenCalledTimes(1);
});
test('Not now dismisses without saving a permanent preference',async()=>{
    render(<EmptyProfilePrompt eligible onUpload={()=>{}}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Not now'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(localStorage.length).toBe(0);
});
test('Never display persists only for that account',async()=>{
    const first=render(<EmptyProfilePrompt eligible onUpload={()=>{}}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Never display this message'}));
    expect(localStorage.getItem('jobpilot.hideResumeProfilePrompt.user-a')).toBe('true');
    first.unmount();
    const second=render(<EmptyProfilePrompt eligible onUpload={()=>{}}/>);
    await waitFor(()=>expect(getSignedInUser).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    second.unmount();getSignedInUser.mockResolvedValue({id:'user-b'});
    render(<EmptyProfilePrompt eligible onUpload={()=>{}}/>);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
});
