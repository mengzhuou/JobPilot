import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { retrySessionCheck } from './components/redux/reducers/authSlice';
import AuthLoadingOverlay from './components/Functions/LoadingOverlay/AuthLoadingOverlay';

const ProtectedRoute = ({ element, requiredRole }) => {
  const location = useLocation();
  const dispatch = useDispatch();
  const { isAuthenticated, isInitialized, sessionError } = useSelector(state => state.auth);
  const role = useSelector(state => state.studentData?.role);

  if (!isInitialized) {
    if (!sessionError) return <AuthLoadingOverlay mode="session"/>;
    return <main className="auth-loading"><section>
      <h1>{sessionError ? 'Unable to open JobPilot yet' : 'Opening your application workspace'}</h1>
      {sessionError ? <><p role="alert">{sessionError}</p><button type="button" onClick={()=>dispatch(retrySessionCheck())}>Try again</button><Link to="/login" state={{from:location.pathname+location.search}}>Go to sign in</Link></>
        : <p role="status">Checking your session…</p>}
    </section></main>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{from:location.pathname+location.search}} />;
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/forbidden" replace />;
  }

  return element;
};

export default ProtectedRoute;
