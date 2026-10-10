import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';
import TopNavBar,{LOGOUT_TIMEOUT} from './TopNavBar';
import {rootReducer} from '../../redux/store';
import {loginSuccess} from '../../redux/reducers/authSlice';
import ProtectedRoute from '../../../ProtectedRoute';

jest.mock('../../Modal/ProfileModal/ProfileModal',()=>()=>null);
const originalFetch=global.fetch;
beforeEach(()=>{global.fetch=jest.fn();});
afterEach(()=>{global.fetch=originalFetch;delete window.google;jest.useRealTimers();});
function LoginPage(){const navigate=useNavigate();return <><h1>Sign in</h1><button onClick={()=>navigate('/profile')}>Open protected page</button><button onClick={()=>navigate(-1)}>Go back</button></>;}
function setup(){
    const store=configureStore({reducer:rootReducer});
    store.dispatch({type:'SET_STUDENT_INFO',payload:{id:'user-1',name:'Test User',email:'test@example.com',role:'admin'}});
    store.dispatch(loginSuccess());
    render(<Provider store={store}><MemoryRouter initialEntries={['/previous','/profile']} initialIndex={1}><Routes>
        <Route path="/profile" element={<ProtectedRoute element={<TopNavBar/>}/>}/>
        <Route path="/login" element={<LoginPage/>}/>
        <Route path="/previous" element={<h1>Previous page</h1>}/>
    </Routes></MemoryRouter></Provider>);
    fireEvent.click(screen.getByRole('button',{name:'Open navigation'}));
    return store;
}
test('logout clears session, resets account data, and replaces history with login',async()=>{
    let finish;global.fetch.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    window.google={accounts:{id:{disableAutoSelect:jest.fn()}}};
    const store=setup();const button=screen.getByRole('button',{name:'Log out'});
    fireEvent.click(button);fireEvent.click(button);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/api\/auth\/logout$/);
    expect(global.fetch.mock.calls[0][1]).toEqual(expect.objectContaining({method:'POST',credentials:'include'}));
    expect(screen.getByRole('dialog',{name:'Signing you out…'})).toBeInTheDocument();
    expect(screen.getByRole('progressbar',{name:'Signing you out…'})).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ending your session and returning you to sign in.');
    await act(async()=>finish({ok:true,status:204}));
    expect(screen.getByRole('heading',{name:'Sign in'})).toBeInTheDocument();
    expect(store.getState().auth).toEqual(expect.objectContaining({isAuthenticated:false,isInitialized:true}));
    expect(store.getState().studentData.email).toBe('');
    expect(store.getState().studentData.id).toBeUndefined();
    expect(store.getState().studentData.role).toBe('');
    expect(window.google.accounts.id.disableAutoSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'Go back'}));
    expect(screen.getByRole('heading',{name:'Previous page'})).toBeInTheDocument();
});
test('protected pages redirect to login after logout',async()=>{
    global.fetch.mockResolvedValue({ok:true,status:204});setup();
    fireEvent.click(screen.getByRole('button',{name:'Log out'}));
    await screen.findByRole('heading',{name:'Sign in'});
    fireEvent.click(screen.getByRole('button',{name:'Open protected page'}));
    expect(screen.getByRole('heading',{name:'Sign in'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Open navigation'})).not.toBeInTheDocument();
});
test.each([403,500])('HTTP %s does not pretend to end the server session and can retry',async status=>{
    global.fetch.mockResolvedValueOnce({ok:false,status});const store=setup();
    fireEvent.click(screen.getByRole('button',{name:'Log out'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t sign you out');
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    global.fetch.mockResolvedValueOnce({ok:true,status:204});
    fireEvent.click(screen.getByRole('button',{name:'Log out'}));
    await waitFor(()=>expect(store.getState().auth.isAuthenticated).toBe(false));
    expect(await screen.findByRole('heading',{name:'Sign in'})).toBeInTheDocument();
});
test('stalled logout releases the overlay and provides a retry',async()=>{
    jest.useFakeTimers();
    global.fetch.mockImplementation((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
    const store=setup();fireEvent.click(screen.getByRole('button',{name:'Log out'}));
    await act(async()=>jest.advanceTimersByTime(LOGOUT_TIMEOUT));
    expect(screen.getByRole('alert')).toHaveTextContent('try again');
    expect(screen.getByRole('button',{name:'Log out'})).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store.getState().auth.isAuthenticated).toBe(true);
});
