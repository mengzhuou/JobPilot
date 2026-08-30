import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import './TopNavBar.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import ProfileModal from "../../Modal/ProfileModal/ProfileModal";
import { faBars, faTimes } from '@fortawesome/free-solid-svg-icons';
import { logout } from "../../redux/reducers/authSlice";

const TopNavBar = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const studentData = useSelector((state) => state.studentData);
    const sidebarRef = useRef(null);
    const closeButtonRef = useRef(null);


    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    const closeProfileModal = () => {
        setShowProfileModal(false);
    };

    const logoutNav = async () => {
        try {
            const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3500";
            await fetch(`${backendUrl}/api/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } catch (error) {
            console.error("Logout request failed:", error);
        } finally {
            dispatch(logout());
            navigate("/login");
            setIsSidebarOpen(false);
        }
    };

    const goToAdminSite = () => {
        navigate("/SelectTask");
        setIsSidebarOpen(false);
    };

    const goToActiveJobPostings = () => {
        navigate("/active-job-postings");
        setIsSidebarOpen(false);
    };
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                sidebarRef.current && // Ensure the sidebar exists
                !sidebarRef.current.contains(event.target) && // Check if click is outside the sidebar
                (!closeButtonRef.current || !closeButtonRef.current.contains(event.target)) // Exclude "X" button clicks
            ) {
                setIsSidebarOpen(false);
            }
        };

        if (isSidebarOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isSidebarOpen]);

    return (
        <div className="navBar">
            <div className="navBar-left">
                <div className="navTitle">JobPilot</div>
            </div>
            <div className="navBar-right">
                <div
                    className={`hamburgerIcon ${isSidebarOpen ? 'hamburgerIcon-shifted' : ''}`}
                    onClick={toggleSidebar}
                    ref={closeButtonRef}
                >
                    <FontAwesomeIcon icon={isSidebarOpen ? faTimes : faBars} />
                </div>
                <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`} ref={sidebarRef}>
                    <div className="profile-section">
                        <div className="profile-info">
                            <h3 className="student-name-bar">{studentData.name}</h3>
                        </div>
                    </div>

                    <div className="nav-links">
                        <div
                            className="nav-link"
                            onClick={goToActiveJobPostings}
                        >
                            Active Job Postings
                        </div>
                        {(studentData.role === 'Admin' || studentData.role === 'SA' || studentData.role === 'Professor') && (
                            <div className="nav-link" onClick={goToAdminSite}>Admin Site</div>
                        )}
                        <div className="nav-link" onClick={logoutNav}>Logout</div>
                    </div>
                </div>
            </div>
            <ProfileModal
                show={showProfileModal}
                onClose={closeProfileModal}
                studentData={studentData}
            />
        </div>
    );
};

export default TopNavBar;
