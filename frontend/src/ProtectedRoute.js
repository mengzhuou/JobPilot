import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

const ProtectedRoute = ({ element }) => {
  const { isAuthenticated, isInitialized } = useSelector(state => state.auth);

  if (!isInitialized) {
    return <div className="auth-loading">Checking your session…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return element;
};

export default ProtectedRoute;
