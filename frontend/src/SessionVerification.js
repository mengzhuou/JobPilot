import {useEffect} from 'react';
import {useDispatch,useSelector} from 'react-redux';
import {setStudentInfo} from './components/redux/actions/studentActions';
import {authCheckComplete,loginSuccess,sessionCheckFailed} from './components/redux/reducers/authSlice';

export const SESSION_CHECK_TIMEOUT = 20000;
export default function SessionVerification() {
    const dispatch=useDispatch();
    const {isInitialized,checkAttempt}=useSelector(state=>state.auth);
    useEffect(()=>{
        if(isInitialized)return undefined;
        let active=true;
        const controller=new AbortController();
        const timer=setTimeout(()=>{
            if(!active)return;
            active=false;controller.abort();
            dispatch(sessionCheckFailed('The server is taking too long to respond. Try again in a moment.'));
        },SESSION_CHECK_TIMEOUT);
        (async()=>{
            try {
                const backend=process.env.REACT_APP_BACKEND_URL||'http://localhost:3500';
                const response=await fetch(`${backend}/api/auth/me`,{credentials:'include',cache:'no-store',signal:controller.signal});
                if(!active)return;
                if(response.status===401){dispatch(authCheckComplete());return;}
                if(!response.ok)throw new Error('Session server unavailable');
                const {user}=await response.json();
                if(!active)return;
                if(!user?.id)throw new Error('Invalid session response');
                dispatch(setStudentInfo(user));dispatch(loginSuccess());
            } catch {
                if(active)dispatch(sessionCheckFailed('We could not connect to JobPilot. Check your connection and retry.'));
            } finally {clearTimeout(timer);}
        })();
        return()=>{active=false;clearTimeout(timer);controller.abort();};
    },[dispatch,isInitialized,checkAttempt]);
    return null;
}
