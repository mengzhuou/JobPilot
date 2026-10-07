import React from 'react';
import {Box, CircularProgress, Modal} from '@mui/material';
import './ResumeProgressOverlay.scss';

export default function ResumeProgressOverlay({title, message, phase='upload', includeParsing=false}) {
    const parsing=phase==='parsing';
    return <Modal open disableEscapeKeyDown sx={{zIndex:11000,display:'grid',placeItems:'center',p:2,overflowY:'auto'}} slotProps={{backdrop:{sx:{backgroundColor:'rgba(39, 46, 59, .72)',backdropFilter:'blur(6px)'}}}}>
        <Box className="resume-progress" role="dialog" aria-modal="true" aria-label={title} aria-busy="true" tabIndex={-1}>
            <div className="resume-progress-brand"><span aria-hidden="true">✦</span> JOBPILOT <span className="resume-progress-divider"/> YOUR NEXT CHAPTER</div>
            <div className="resume-progress-illustration">
                <div className="resume-progress-orbit" aria-hidden="true"/>
                <CircularProgress size={128} thickness={1.4} aria-label={title} className="resume-progress-spinner"/>
                <div className="resume-progress-document" aria-hidden="true">
                    <span className="resume-progress-avatar"/><i/><i/><i/><i/>
                    <span className="resume-progress-scan"/>
                </div>
                <span className="resume-progress-spark" aria-hidden="true">✦</span>
            </div>
            <span className="resume-progress-eyebrow">{parsing?'MAKING THE CONNECTIONS':'A GREAT FIRST STEP'}</span>
            <h2>{title}</h2>
            <p className="resume-progress-message" role="status" aria-live="polite">{message}</p>
            <ol className="resume-progress-steps" aria-label="Resume processing steps">
                <li className={parsing?'is-done':'is-current'} aria-current={!parsing?'step':undefined}><span aria-hidden="true">{parsing?'✓':'1'}</span>Upload</li>
                {(parsing||includeParsing)&&<li className={parsing?'is-current':''} aria-current={parsing?'step':undefined}><span aria-hidden="true">2</span>Parse resume</li>}
            </ol>
            <div className="resume-progress-footer"><span aria-hidden="true">◇</span> {parsing?'Filling the gaps. Keeping your existing answers.':'Your next opportunity starts with your story.'}</div>
        </Box>
    </Modal>;
}
