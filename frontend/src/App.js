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
import ManualApplication from "./components/Pages/Management/ManualApplication";
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
                <Route path="/admin/companies" element={<ProtectedRoute element={<AdminCompanies />} />} />
                <Route path="/admin/feedback" element={<ProtectedRoute element={<AdminFeedback />} />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </>
    );
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
