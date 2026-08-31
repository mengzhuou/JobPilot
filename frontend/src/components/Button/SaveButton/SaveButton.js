import React from 'react';
import './SaveButton.scss';

const SaveButton = ({ onClick }) => {
  return (
    <div onClick={onClick}>
      <button className="save-btn">
        Save
      </button>
    </div>
  );
};

export default SaveButton;
