import React,{useSyncExternalStore} from 'react';
import {useNavigate} from 'react-router-dom';
import {Snackbar,Alert,Button,IconButton} from '@mui/material';
import {subscribeParsing,getParsingSnapshot,dismissParsing} from './resumeParsingTask';
import ResumeProgressOverlay from './ResumeProgressOverlay';

export default function ResumeParsingSnackbar(){
    const task=useSyncExternalStore(subscribeParsing,getParsingSnapshot);
    const navigate=useNavigate(),pending=task.status==='pending';
    if(pending)return <ResumeProgressOverlay title="Parsing your resume…" message={task.message} phase="parsing"/>;
    return <Snackbar open={task.status!=='idle'} autoHideDuration={null} anchorOrigin={{vertical:'bottom',horizontal:'center'}} sx={{zIndex:10020}}>
        <Alert severity={pending?'info':task.status==='error'?'error':'success'} variant="filled" role="status"
            action={pending?undefined:<div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>{task.status==='success'&&<Button color="inherit" size="small" sx={{whiteSpace:'nowrap',wordBreak:'normal',minWidth:112,flexShrink:0,textTransform:'none',fontWeight:700,border:'1px solid rgba(255,255,255,.5)',borderRadius:2,px:1.5}} onClick={()=>{dismissParsing();navigate('/profile');}}>View Profile</Button>}<IconButton color="inherit" size="small" aria-label="Dismiss notification" onClick={dismissParsing}>×</IconButton></div>}
            sx={{bgcolor:pending?'#3361ae':task.status==='error'?'#b42318':'#176b51',color:'#fff',borderRadius:'12px',boxShadow:'0 8px 32px rgba(16,50,38,.2)',alignItems:'center',width:'min(640px, calc(100vw - 32px))',boxSizing:'border-box','& .MuiAlert-message':{minWidth:0,overflowWrap:'break-word'},'& .MuiAlert-action':{flexShrink:0,pl:2,pt:0},'@media(max-width:480px)':{flexWrap:'wrap','& .MuiAlert-message':{flex:'1 1 200px'},'& .MuiAlert-action':{width:'100%',justifyContent:'flex-end',mt:1}}}}>
            {task.message}
        </Alert>
    </Snackbar>;
}
