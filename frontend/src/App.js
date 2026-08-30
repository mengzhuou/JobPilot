import React, { Component, useEffect } from "react";
import { BrowserRouter as Router, Navigate, Routes, Route, useLocation } from "react-router-dom";
import TopNavBar from "./components/Functions/TopNavBar/TopNavBar";
import FillApplication from "./components/Pages/FillApplication/FillApplication";
import ActiveJobPostings from "./components/Pages/ActiveJobPostings/ActiveJobPostings";
import Login, { MOCK_SESSION_KEY, MOCK_TOKEN } from "./components/Pages/Login/Login";
import ProtectedRoute from "./ProtectedRoute";
import { Provider, useDispatch } from "react-redux";
import store from "./components/redux/store";
import { jwtDecode } from "jwt-decode";
import { setStudentInfo } from "./components/redux/actions/studentActions";
import { loginSuccess } from "./components/redux/reducers/authSlice";

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
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </>
    );
};

const TokenVerification = () => {
    const dispatch = useDispatch();

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        const mockSession = localStorage.getItem(MOCK_SESSION_KEY);

        if (token === MOCK_TOKEN && mockSession) {
            try {
                dispatch(setStudentInfo(JSON.parse(mockSession)));
                dispatch(loginSuccess());
                return;
            } catch (error) {
                localStorage.removeItem(MOCK_SESSION_KEY);
                localStorage.removeItem('authToken');
            }
        }

        if (token) {
            try {
                const decoded = jwtDecode(token);

                if (decoded.exp * 1000 > Date.now()) {
                    const { email, role, name } = decoded;

                    dispatch(setStudentInfo({ email, role, name }));
                } else {
                    localStorage.removeItem('authToken');
                }
            } catch (error) {
                console.error('Token verification failed:', error);
                localStorage.removeItem('authToken');
            }
        }
    }, [dispatch]);

    return null;
};



export default App;
