import React from 'react';
import './BackButton.scss';
import { withFuncProps } from '../../withFuncProps'; 


const BackButton = ({ navigate, to }) => {
  const handleNavigate = () => {
    if (navigate && to) {
      navigate(to);
    }
  };

  return (
    <button className="back-btn" onClick={handleNavigate}>
      Back
    </button>
  );
};

export default withFuncProps(BackButton);;
