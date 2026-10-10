import React from 'react';
import {act,fireEvent,render,screen} from '@testing-library/react';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import auth from './components/redux/reducers/authSlice';
import studentData from './components/redux/reducers/studentReducer';
import SessionVerification,{SESSION_CHECK_TIMEOUT} from './SessionVerification';
import ProtectedRoute from './ProtectedRoute';

const originalFetch=global.fetch;
beforeEach(()=>{jest.useFakeTimers();global.fetch=jest.fn();});
afterEach(()=>{jest.useRealTimers();global.fetch=originalFetch;});
const setup=()=>{
    const store=configureStore({reducer:{auth,studentData}});
    render(<Provider store={store}><MemoryRouter initialEntries={['/autofill?jobId=1']}><SessionVerification/><Routes>
      <Route path="/autofill" element={<ProtectedRoute element={<h1>Application details</h1>}/>}/>
      <Route path="/login" element={<h1>Sign in</h1>}/>
    </Routes></MemoryRouter></Provider>);
    return store;
};
test('one successful session request shares identity and onboarding data',async()=>{
    global.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({user:{id:'user-1',onboarding:{status:'completed'}}})});
    const store=setup();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(screen.getByRole('dialog',{name:'Opening your workspace…'})).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async()=>{});
    expect(screen.getByText('Application details')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(store.getState().studentData.id).toBe('user-1');
    expect(store.getState().studentData.onboarding.status).toBe('completed');
});
test('stalled request becomes retryable without redirecting or accepting a late response',async()=>{
    let finish;
    global.fetch.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    const store=setup();
    await act(async()=>{jest.advanceTimersByTime(SESSION_CHECK_TIMEOUT);});
    expect(screen.getByRole('alert')).toHaveTextContent('taking too long');
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(store.getState().auth.isAuthenticated).toBe(false);
    await act(async()=>finish({ok:true,status:200,json:async()=>({user:{id:'late-user'}})}));
    expect(store.getState().auth.isAuthenticated).toBe(false);
    global.fetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>({user:{id:'current-user'}})});
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Try again'})));
    expect(screen.getByText('Application details')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(store.getState().studentData.id).toBe('current-user');
});
test.each([500,503])('server %s shows retry instead of treating it as logout',async status=>{
    global.fetch.mockResolvedValue({ok:false,status});setup();await act(async()=>{});
    expect(screen.getByRole('alert')).toHaveTextContent('could not connect');
    expect(screen.queryByRole('heading',{name:'Sign in'})).not.toBeInTheDocument();
});
test('unauthenticated session still redirects to login',async()=>{
    global.fetch.mockResolvedValue({ok:false,status:401});setup();await act(async()=>{});
    expect(screen.getByRole('heading',{name:'Sign in'})).toBeInTheDocument();
});
