import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import './TopNavBar.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import ProfileModal from "../../Modal/ProfileModal/ProfileModal";
import { faBars, faTimes, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { logout } from "../../redux/reducers/authSlice";
import jobPilotMascot from "../../../Image/jobPilot.png";
import AuthLoadingOverlay from '../LoadingOverlay/AuthLoadingOverlay';

export const LOGOUT_TIMEOUT=15000;

const TopNavBar = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [isLoggingOut,setIsLoggingOut]=useState(false);
    const [logoutError,setLogoutError]=useState('');
    const logoutRequest=useRef(null);
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const studentData = useSelector((state) => state.studentData);
    const sidebarRef = useRef(null);
    const closeButtonRef = useRef(null);

    useEffect(()=>()=>{
        const request=logoutRequest.current;logoutRequest.current=null;
        if(request){clearTimeout(request.timer);request.controller.abort();}
    },[]);


    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    const closeProfileModal = () => {
        setShowProfileModal(false);
    };

    const logoutNav = async () => {
        if(logoutRequest.current)return;
        const request={controller:new AbortController(),timer:null};
        logoutRequest.current=request;
        setIsLoggingOut(true);setLogoutError('');
        request.timer=setTimeout(()=>request.controller.abort(),LOGOUT_TIMEOUT);
        try {
            const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3500";
            const response=await fetch(`${backendUrl}/api/auth/logout`, {
                method: "POST",
                credentials: "include",
                signal:request.controller.signal,
            });
            if(logoutRequest.current!==request)return;
            if(!response.ok)throw new Error('Logout failed');
            // Avoid immediately selecting the previous Google account again.
            try {window.google?.accounts?.id?.disableAutoSelect?.();} catch { /* Cookie logout is authoritative. */ }
            setIsSidebarOpen(false);setShowProfileModal(false);
            dispatch(logout());
            navigate("/login",{replace:true});
        } catch (error) {
            if(logoutRequest.current===request){
                setIsSidebarOpen(true);
                setLogoutError('We couldn’t sign you out. Check your connection and try again.');
            }
        } finally {
            clearTimeout(request.timer);
            if(logoutRequest.current===request){logoutRequest.current=null;setIsLoggingOut(false);}
        }
    };

    const goToAdminSite = () => {
        navigate("/SelectTask");
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
                <NavLink className="navTitle" to="/active-job-postings">
                    <img src={jobPilotMascot} alt="" />
                    JobPilot
                </NavLink>
            </div>
            <div className="navBar-right">
                <button type="button" aria-label={isSidebarOpen?'Close navigation':'Open navigation'} aria-expanded={isSidebarOpen} aria-controls="account-navigation"
                    className={`hamburgerIcon ${isSidebarOpen ? 'hamburgerIcon-shifted' : ''}`}
                    onClick={toggleSidebar}
                    ref={closeButtonRef}
                >
                    <FontAwesomeIcon icon={isSidebarOpen ? faTimes : faBars} />
                </button>
                <div id="account-navigation" className={`sidebar ${isSidebarOpen ? 'open' : ''}`} ref={sidebarRef} style={{visibility:isSidebarOpen?'visible':'hidden'}}>
                    <div className="profile-section">
                        <div className="profile-info">
                            <h3 className="student-name-bar">{studentData.name} {studentData.role === "admin" && <span className="admin-badge">(Admin)</span>}</h3>
                        </div>
                    </div>

                    <div className="nav-links">
                        <NavLink
                            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                            to="/active-job-postings"
                            onClick={() => setIsSidebarOpen(false)}
                        >
                            Active Job Postings
                        </NavLink>
                        <NavLink
                            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                            to="/job-applied-history"
                            onClick={() => setIsSidebarOpen(false)}
                        >
                            Job Applied History
                        </NavLink>
                        <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/saved-jobs" onClick={()=>setIsSidebarOpen(false)}>Saved Jobs</NavLink>
                        <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/blocked-jobs" onClick={()=>setIsSidebarOpen(false)}>Blocked Jobs</NavLink>
                        <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/profile" onClick={()=>setIsSidebarOpen(false)}>Profile</NavLink>
                        <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/resumes" onClick={()=>setIsSidebarOpen(false)}>Resumes</NavLink>
                        {studentData?.role === 'admin' && <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/loops" onClick={()=>setIsSidebarOpen(false)}>AI Loop</NavLink>}
                        <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/add-application" onClick={()=>setIsSidebarOpen(false)}>Add Custom Application</NavLink>
                        <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/feedback" onClick={()=>setIsSidebarOpen(false)}>Send Feedback</NavLink>
                        {studentData.role === "admin" && <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/admin/companies" onClick={()=>setIsSidebarOpen(false)}>Add Company</NavLink>}
                        {studentData.role === "admin" && <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/admin/feedback" onClick={()=>setIsSidebarOpen(false)}>Feedback Inbox</NavLink>}
                        {studentData.role === "admin" && <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/admin/job-moderation" onClick={()=>setIsSidebarOpen(false)}>Job Moderation</NavLink>}
                        {studentData.role === "admin" && <NavLink className={({isActive})=>`nav-link${isActive?" active":""}`} to="/admin/analytics" onClick={()=>setIsSidebarOpen(false)}>Analytics</NavLink>}
                        {(studentData.role === 'Admin' || studentData.role === 'SA' || studentData.role === 'Professor') && (
                            <div className="nav-link" onClick={goToAdminSite}>Admin Site</div>
                        )}
                    </div>
                    <div className="nav-account-actions">
                        {logoutError&&<p role="alert">{logoutError}</p>}
                        <button type="button" className="nav-logout" disabled={isLoggingOut} onClick={logoutNav}><FontAwesomeIcon icon={faRightFromBracket}/>{isLoggingOut?'Signing out…':'Log out'}</button>
                    </div>
                </div>
            </div>
            <ProfileModal
                show={showProfileModal}
                onClose={closeProfileModal}
                studentData={studentData}
            />
            {isLoggingOut&&<AuthLoadingOverlay mode="logout"/>}
        </div>
    );
};

export default TopNavBar;
