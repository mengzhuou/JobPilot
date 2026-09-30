import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

const ProtectedRoute = ({ element, requiredRole }) => {
  const location = useLocation();
  const { isAuthenticated, isInitialized } = useSelector(state => state.auth);
  const role = useSelector(state => state.studentData?.role);

  if (!isInitialized) {
    return <div className="auth-loading">Checking your session…</div>;
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
