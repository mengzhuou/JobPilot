import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setStudentInfo } from "../../redux/actions/studentActions";
import { loginSuccess } from "../../redux/reducers/authSlice";
import AuthLoadingOverlay from '../../Functions/LoadingOverlay/AuthLoadingOverlay';
import "./Login.scss";

const GOOGLE_SCRIPT_ID = "google-identity-services";
export const SIGN_IN_TIMEOUT = 30000;

const Login = () => {
    const googleButtonRef = useRef(null);
    const authRequest = useRef(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [waitingForGoogle, setWaitingForGoogle] = useState(false);
    const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
    const navigate = useNavigate();
    const location = useLocation();
    const registering = location.pathname === '/register';
    const [showPassword, setShowPassword] = useState(false);
    const requestedDestination = location.state?.from || '';
    const destination = requestedDestination === '/profile?connectExtension=1' || /^\/resume-enhancement\?id=[a-f0-9-]{36}$/i.test(requestedDestination)
        ? requestedDestination : '/active-job-postings';
    const dispatch = useDispatch();

    useEffect(()=>()=>{
        const request=authRequest.current;
        authRequest.current=null;
        if(request){clearTimeout(request.timer);request.controller.abort();}
    },[]);

    const authenticate=useCallback(async (method,values)=>{
        if(authRequest.current)return;
        const request={controller:new AbortController(),timer:null,timedOut:false};
        authRequest.current=request;
        setErrorMessage('');setWaitingForGoogle(false);setIsSigningIn(true);
        request.timer=setTimeout(()=>{
            request.timedOut=true;
            request.controller.abort();
        },SIGN_IN_TIMEOUT);
        try {
            const response=await fetch(`${process.env.REACT_APP_BACKEND_URL||'http://localhost:3500'}/api/auth/${method}`,{
                method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',
                body:JSON.stringify(values),signal:request.controller.signal,
            });
            const body=await response.json().catch(()=>({}));
            if(authRequest.current!==request)return;
            if(request.timedOut)throw new Error('Sign-in timed out');
            if(!response.ok)throw new Error(body.message||'Unable to sign in. Please try again.');
            dispatch(setStudentInfo(body.user));dispatch(loginSuccess());
            navigate(destination,{replace:true});
        } catch(error) {
            if(authRequest.current===request)setErrorMessage(request.timedOut
                ? 'The server is taking too long to respond. Please try signing in again in a moment.'
                : error.message||'Unable to sign in. Please try again.');
        } finally {
            clearTimeout(request.timer);
            if(authRequest.current===request){authRequest.current=null;setIsSigningIn(false);}
        }
    },[dispatch,navigate,destination]);

    useEffect(() => {
        if (isAuthenticated) {
            navigate(destination, { replace: true });
        }
    }, [isAuthenticated, navigate, destination]);

    useEffect(() => {
        const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

        if (!clientId) {
            return undefined;
        }

        let active=true;
        const handleGoogleCredential = googleResponse => {
            if(active)void authenticate('google',{credential:googleResponse.credential});
        };

        const renderGoogleButton = () => {
            if (!window.google?.accounts?.id || !googleButtonRef.current) {
                return;
            }

            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: handleGoogleCredential,
            });
            googleButtonRef.current.replaceChildren();
            window.google.accounts.id.renderButton(googleButtonRef.current, {
                type: "standard",
                theme: "outline",
                size: "large",
                text: "continue_with",
                shape: "rectangular",
                logo_alignment: "left",
                width: 330,
                click_listener: () => {
                    if(active && !authRequest.current){
                        setErrorMessage('');
                        setWaitingForGoogle(true);
                    }
                },
            });
        };

        if (window.google?.accounts?.id) {
            renderGoogleButton();
            return ()=>{active=false;};
        }

        let script = document.getElementById(GOOGLE_SCRIPT_ID);
        if (!script) {
            script = document.createElement("script");
            script.id = GOOGLE_SCRIPT_ID;
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }

        script.addEventListener("load", renderGoogleButton);
        const handleScriptError=() => {
            setErrorMessage("Google sign-in could not be loaded.");
        };
        script.addEventListener("error", handleScriptError);

        return () => {
            active=false;
            script.removeEventListener("load", renderGoogleButton);
            script.removeEventListener("error", handleScriptError);
        };
    }, [authenticate]);

    const handleEmailSubmit = async event => {
        event.preventDefault();
        if (isSigningIn) return;
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        await authenticate(registering?'register':'login',values);
    };

    return (
        <main className="login-page">
            <section className="login-brand-panel" aria-label="JobPilot introduction">
                <div className="login-brand-content">
                    <a className="login-logo" href="/login" aria-label="JobPilot home">
                        <span className="login-logo-mark">J</span>
                        <span>JobPilot</span>
                    </a>

                    <div className="login-brand-copy">
                        <p className="login-eyebrow">YOUR JOB SEARCH, ORGANIZED</p>
                        <h1>Spend less time applying. Find your next role faster.</h1>
                        <p>
                            Discover active software engineering roles and let JobPilot
                            handle the repetitive parts of every application.
                        </p>
                    </div>

                    <div className="login-feature-list" aria-label="JobPilot features">
                        <span>US career sites</span>
                        <span>Smart autofill</span>
                        <span>Application tracking</span>
                    </div>
                </div>
            </section>

            <section className="login-form-panel">
                <div className="login-card">
                    <div className="login-card-heading">
                        <p className="login-mobile-logo">JobPilot</p>
                        <h2>{registering ? 'Create your account' : 'Welcome back'}</h2>
                        <p>{registering ? 'Start your next chapter with JobPilot.' : 'Sign in to continue to your active job postings.'}</p>
                    </div>

                    {errorMessage && (
                        <div className="login-error" role="alert">{errorMessage}</div>
                    )}

                    <div
                        className={`google-button-container ${isSigningIn ? "is-loading" : ""}`}
                        ref={googleButtonRef}
                        aria-label="Sign in with Google"
                    />

                    <p className="login-divider">{process.env.REACT_APP_GOOGLE_CLIENT_ID ? 'Or continue with your email' : 'Continue with your email'}</p>
                    <form className="email-auth-form" onSubmit={handleEmailSubmit} key={registering ? 'register' : 'login'}>
                        <fieldset disabled={isSigningIn}>
                            {registering && <div className="auth-name-row">
                                <label>First name<input name="firstName" autoComplete="given-name" required maxLength={80} /></label>
                                <label>Last name<input name="lastName" autoComplete="family-name" required maxLength={80} /></label>
                            </div>}
                            <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
                            <label htmlFor="account-password">Password</label>
                            <div className="auth-password-row">
                                <input id="account-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 15 : undefined} maxLength={128} aria-describedby={registering ? 'password-guidance' : undefined} />
                                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={()=>setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
                            </div>
                            {registering && <p id="password-guidance">Use 15–128 characters. A unique passphrase works well.</p>}
                            <button className="email-auth-submit" type="submit">{isSigningIn ? 'Please wait…' : registering ? 'Create account' : 'Log in'}</button>
                        </fieldset>
                    </form>
                    <p className="auth-switch">{registering ? 'Already have an account? ' : 'New to JobPilot? '}<Link to={registering ? '/login' : '/register'} state={location.state} onClick={()=>{setErrorMessage('');setShowPassword(false);}}>{registering ? 'Log in' : 'Create an account'}</Link></p>

                    <p className="login-legal">
                        By continuing, you agree to JobPilot&apos;s <Link to="/terms">Terms</Link> and acknowledge
                        its <Link to="/privacy">Privacy Policy</Link>.
                    </p>
                </div>
            </section>
            {(isSigningIn || waitingForGoogle) && <AuthLoadingOverlay
                mode={isSigningIn?(registering?'register':'login'):'google'}
                onDismissGoogle={()=>setWaitingForGoogle(false)}
            />}
        </main>
    );
};

export default Login;
