import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setStudentInfo } from "../../redux/actions/studentActions";
import { loginSuccess } from "../../redux/reducers/authSlice";
import "./Login.css";

const MOCK_SESSION_KEY = "jobpilotMockSession";
const MOCK_TOKEN = "jobpilot-mock-token";

const Login = () => {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const navigate = useNavigate();
    const dispatch = useDispatch();

    useEffect(() => {
        if (localStorage.getItem(MOCK_SESSION_KEY)) {
            navigate("/active-job-postings", { replace: true });
        }
    }, [navigate]);

    const handleMockGoogleLogin = () => {
        setIsSigningIn(true);

        const mockUser = {
            email: "demo@jobpilot.local",
            name: "JobPilot Demo User",
            role: "User",
            picture: null,
        };

        localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(mockUser));
        localStorage.setItem("authToken", MOCK_TOKEN);
        dispatch(setStudentInfo(mockUser));
        dispatch(loginSuccess());
        navigate("/active-job-postings", { replace: true });
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
                        <h2>Welcome back</h2>
                        <p>Sign in to continue to your active job postings.</p>
                    </div>

                    <button
                        className="google-login-button"
                        type="button"
                        onClick={handleMockGoogleLogin}
                        disabled={isSigningIn}
                    >
                        <span className="google-icon" aria-hidden="true">G</span>
                        <span>{isSigningIn ? "Signing in…" : "Continue with Google"}</span>
                    </button>

                    <p className="mock-login-note">
                        Demo mode: this button creates a local mock session. Google
                        authentication will replace it next.
                    </p>

                    <p className="login-legal">
                        By continuing, you agree to JobPilot&apos;s Terms and acknowledge
                        its Privacy Policy.
                    </p>
                </div>
            </section>
        </main>
    );
};

export { MOCK_SESSION_KEY, MOCK_TOKEN };
export default Login;
