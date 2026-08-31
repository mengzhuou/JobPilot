import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setStudentInfo } from "../../redux/actions/studentActions";
import { loginSuccess } from "../../redux/reducers/authSlice";
import "./Login.scss";

const GOOGLE_SCRIPT_ID = "google-identity-services";

const Login = () => {
    const googleButtonRef = useRef(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [isSigningIn, setIsSigningIn] = useState(false);
    const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
    const navigate = useNavigate();
    const dispatch = useDispatch();

    useEffect(() => {
        if (isAuthenticated) {
            navigate("/active-job-postings", { replace: true });
        }
    }, [isAuthenticated, navigate]);

    useEffect(() => {
        const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

        if (!clientId) {
            setErrorMessage("Google sign-in is not configured.");
            return undefined;
        }

        const handleGoogleCredential = async googleResponse => {
            setErrorMessage("");
            setIsSigningIn(true);

            try {
                const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3500";
                const response = await fetch(`${backendUrl}/api/auth/google`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ credential: googleResponse.credential }),
                });
                const body = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(body.message || "Google sign-in failed");
                }

                dispatch(setStudentInfo(body.user));
                dispatch(loginSuccess());
                navigate("/active-job-postings", { replace: true });
            } catch (error) {
                setErrorMessage(error.message || "Unable to sign in with Google.");
                setIsSigningIn(false);
            }
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
            });
        };

        if (window.google?.accounts?.id) {
            renderGoogleButton();
            return undefined;
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
        script.addEventListener("error", () => {
            setErrorMessage("Google sign-in could not be loaded.");
        });

        return () => {
            script.removeEventListener("load", renderGoogleButton);
        };
    }, [dispatch, navigate]);

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
                        <h2>Welcome back</h2>
                        <p>Sign in to continue to your active job postings.</p>
                    </div>

                    {errorMessage && (
                        <div className="login-error" role="alert">{errorMessage}</div>
                    )}

                    <div
                        className={`google-button-container ${isSigningIn ? "is-loading" : ""}`}
                        ref={googleButtonRef}
                        aria-label="Sign in with Google"
                    />

                    {isSigningIn && <p className="login-progress">Signing you in…</p>}

                    <p className="login-legal">
                        By continuing, you agree to JobPilot&apos;s Terms and acknowledge
                        its Privacy Policy.
                    </p>
                </div>
            </section>
        </main>
    );
};

export default Login;
