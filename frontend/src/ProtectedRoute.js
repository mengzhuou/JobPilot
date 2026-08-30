import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ element }) => {
  const token = localStorage.getItem('authToken');
  const mockSession = localStorage.getItem('jobpilotMockSession');

  if (!token && !mockSession) {
    return <Navigate to="/login" replace />;
  }

  return element;
};

export default ProtectedRoute;
