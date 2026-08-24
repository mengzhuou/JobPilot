import React, { Component, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import TopNavBar from "./components/Functions/TopNavBar/TopNavBar";
import FillApplication from "./components/Pages/FillApplication/FillApplication";
import { Provider, useDispatch } from "react-redux";
import store from "./components/redux/store";
import { jwtDecode } from "jwt-decode";
import { setStudentInfo } from "./components/redux/actions/studentActions";

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
                  <TokenVerification />
                  <TopNavBar />
                  <Routes>
                      {/* Public route - Login */}
                      <Route path="/" element={<FillApplication />} />
                  </Routes>
              </Router>
          </Provider>
      );
  }
}

const TokenVerification = () => {
    const dispatch = useDispatch();

    useEffect(() => {
        const token = localStorage.getItem('authToken');
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
