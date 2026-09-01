import React, { Component, useEffect } from "react";
import { BrowserRouter as Router, Navigate, Routes, Route, useLocation } from "react-router-dom";
import TopNavBar from "./components/Functions/TopNavBar/TopNavBar";
import FillApplication from "./components/Pages/FillApplication/FillApplication";
import ActiveJobPostings from "./components/Pages/ActiveJobPostings/ActiveJobPostings";
import JobAppliedHistory from "./components/Pages/JobAppliedHistory/JobAppliedHistory";
import Login from "./components/Pages/Login/Login";
import JobPreferences from "./components/Pages/Management/JobPreferences";
import AdminCompanies from "./components/Pages/Management/AdminCompanies";
import Feedback from "./components/Pages/Management/Feedback";
import AdminFeedback from "./components/Pages/Management/AdminFeedback";
import AdminJobModeration from "./components/Pages/Management/AdminJobModeration";
import ManualApplication from "./components/Pages/Management/ManualApplication";
import ErrorPage from "./components/Pages/Management/ErrorPage";
import ProtectedRoute from "./ProtectedRoute";
import { Provider, useDispatch } from "react-redux";
import store from "./components/redux/store";
import { setStudentInfo } from "./components/redux/actions/studentActions";
import { authCheckComplete, loginSuccess } from "./components/redux/reducers/authSlice";

class App extends Component {
    state = {
        selectedDates: {
            pickupDate: new Date(),
            pickupTime: new Date(),
            returnDate: new Date(),
            returnTime: new Date(),
        }
    };

    setSelectedDates = (pickupDate, pickupTime, returnDate, returnTime) => {
        this.setState({
            selectedDates: { pickupDate, pickupTime, returnDate, returnTime }
        });
    };

  
    render() {
      return (
          <Provider store={store}>
              <Router>
                  <AppRoutes />
              </Router>
          </Provider>
      );
  }
}

const AppRoutes = () => {
    const location = useLocation();
    const isLoginPage = location.pathname === "/login";

    return (
        <>
            <TokenVerification />
            <GlobalInputLimit />
            {!isLoginPage && <TopNavBar />}
            <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route
                    path="/autofill"
                    element={<ProtectedRoute element={<FillApplication />} />}
                />
                <Route
                    path="/active-job-postings"
                    element={<ProtectedRoute element={<ActiveJobPostings />} />}
                />
                <Route
                    path="/job-applied-history"
                    element={<ProtectedRoute element={<JobAppliedHistory />} />}
                />
                <Route path="/saved-jobs" element={<ProtectedRoute element={<JobPreferences state="saved" />} />} />
                <Route path="/blocked-jobs" element={<ProtectedRoute element={<JobPreferences state="blocked" />} />} />
                <Route path="/feedback" element={<ProtectedRoute element={<Feedback />} />} />
                <Route path="/add-application" element={<ProtectedRoute element={<ManualApplication />} />} />
                <Route path="/admin/companies" element={<ProtectedRoute requiredRole="admin" element={<AdminCompanies />} />} />
                <Route path="/admin/feedback" element={<ProtectedRoute requiredRole="admin" element={<AdminFeedback />} />} />
                <Route path="/admin/job-moderation" element={<ProtectedRoute requiredRole="admin" element={<AdminJobModeration />} />} />
                <Route path="/forbidden" element={<ProtectedRoute element={<ErrorPage status={403} />} />} />
                <Route path="/server-error" element={<ErrorPage status={500} />} />
                <Route path="*" element={<ErrorPage status={404} />} />
            </Routes>
        </>
    );
};

const GlobalInputLimit = () => {
    useEffect(() => {
        const limitedTypes = new Set(["text", "search", "email", "tel", "url", "password"]);
        const limitInputs = root => {
            const inputs = root.matches?.("input") ? [root] : root.querySelectorAll?.("input") || [];
            inputs.forEach(input => {
                if (limitedTypes.has((input.type || "text").toLowerCase())) input.maxLength = 199;
            });
        };
        limitInputs(document);
        const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) limitInputs(node);
        })));
        observer.observe(document.body, { childList:true, subtree:true });
        return () => observer.disconnect();
    }, []);
    return null;
};

const TokenVerification = () => {
    const dispatch = useDispatch();

    useEffect(() => {
        const restoreSession = async () => {
            try {
                const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3500";
                const response = await fetch(`${backendUrl}/api/auth/me`, {
                    credentials: "include",
                });

                if (!response.ok) {
                    dispatch(authCheckComplete());
                    return;
                }

                const { user } = await response.json();
                dispatch(setStudentInfo(user));
                dispatch(loginSuccess());
            } catch (error) {
                console.error("Session restoration failed:", error);
                dispatch(authCheckComplete());
            }
        };

        restoreSession();
    }, [dispatch]);

    return null;
};



export default App;
