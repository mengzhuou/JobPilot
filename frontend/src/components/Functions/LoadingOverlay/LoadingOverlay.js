import React from 'react';
import {Box, CircularProgress, Modal} from '@mui/material';
import './LoadingOverlay.scss';

// Shared presentation for resume processing and authentication.
export default function LoadingOverlay({title, message, eyebrow, footer, illustration='document', children}) {
    return <Modal open disableEscapeKeyDown sx={{zIndex:11000,display:'grid',placeItems:'center',p:2,overflowY:'auto'}} slotProps={{backdrop:{sx:{backgroundColor:'rgba(39, 46, 59, .72)',backdropFilter:'blur(6px)'}}}}>
        <Box className="resume-progress" role="dialog" aria-modal="true" aria-label={title} aria-busy="true" tabIndex={-1}>
            <div className="resume-progress-brand"><span aria-hidden="true">✦</span> JOBPILOT <span className="resume-progress-divider"/> YOUR NEXT CHAPTER</div>
            <div className="resume-progress-illustration">
                <div className="resume-progress-orbit" aria-hidden="true"/>
                <CircularProgress size={128} thickness={1.4} aria-label={title} className="resume-progress-spinner"/>
                {illustration==='account' ? <div className="resume-progress-account" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="16" cy="11" r="5"/><path d="M6 27v-2a10 10 0 0 1 20 0v2"/></svg>
                </div> : <div className="resume-progress-document" aria-hidden="true">
                    <span className="resume-progress-avatar"/><i/><i/><i/><i/>
                    <span className="resume-progress-scan"/>
                </div>}
                <span className="resume-progress-spark" aria-hidden="true">✦</span>
            </div>
            <span className="resume-progress-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            <p className="resume-progress-message" role="status" aria-live="polite">{message}</p>
            {children}
            <div className="resume-progress-footer"><span aria-hidden="true">◇</span> {footer}</div>
        </Box>
    </Modal>;
}
