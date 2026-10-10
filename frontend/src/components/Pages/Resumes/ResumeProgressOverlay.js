import React from 'react';
import LoadingOverlay from '../../Functions/LoadingOverlay/LoadingOverlay';

export default function ResumeProgressOverlay({title, message, phase='upload', includeParsing=false}) {
    const parsing=phase==='parsing';
    return <LoadingOverlay title={title} message={message}
        eyebrow={parsing?'MAKING THE CONNECTIONS':'A GREAT FIRST STEP'}
        footer={parsing?'Filling the gaps. Keeping your existing answers.':'Your next opportunity starts with your story.'}>
            <ol className="resume-progress-steps" aria-label="Resume processing steps">
                <li className={parsing?'is-done':'is-current'} aria-current={!parsing?'step':undefined}><span aria-hidden="true">{parsing?'✓':'1'}</span>Upload</li>
                {(parsing||includeParsing)&&<li className={parsing?'is-current':''} aria-current={parsing?'step':undefined}><span aria-hidden="true">2</span>Parse resume</li>}
            </ol>
    </LoadingOverlay>;
}
