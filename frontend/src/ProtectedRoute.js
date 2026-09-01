import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

const ProtectedRoute = ({ element, requiredRole }) => {
  const { isAuthenticated, isInitialized } = useSelector(state => state.auth);
  const role = useSelector(state => state.studentData?.role);

  if (!isInitialized) {
    return <div className="auth-loading">Checking your session…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/forbidden" replace />;
  }

  return element;
};

export default ProtectedRoute;
