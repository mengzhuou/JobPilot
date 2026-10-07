import React from 'react';
import {Box, CircularProgress, Modal} from '@mui/material';

export default function ResumeProgressOverlay({title, message}) {
    return <Modal open disableEscapeKeyDown sx={{zIndex:11000}} slotProps={{backdrop:{sx:{backgroundColor:'rgba(48, 53, 62, .72)',backdropFilter:'blur(3px)'}}}}>
        <Box role="dialog" aria-modal="true" aria-label={title} aria-busy="true" tabIndex={-1}
            sx={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%, -50%)',width:'min(420px, calc(100vw - 48px))',textAlign:'center',color:'#fff',outline:0}}>
            <CircularProgress size={52} thickness={3} color="inherit" aria-label={title}
                sx={{'@media (prefers-reduced-motion: reduce)':{animation:'none','& *':{animation:'none'}}}}/>
            <h2 style={{fontSize:24,margin:'24px 0 12px'}}>{title}</h2>
            <p role="status" aria-live="polite" style={{fontSize:15,lineHeight:1.7,margin:0}}>{message}</p>
        </Box>
    </Modal>;
}
