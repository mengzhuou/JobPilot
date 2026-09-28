// Local visual QA with synthetic data; no login and no real profile writes.
const http=require('node:http'),path=require('node:path');
const {build}=require('esbuild');
const frontend=path.resolve(__dirname,'../../frontend'),sass=require(path.join(frontend,'node_modules/sass'));
const profile={personal:{firstName:'Avery',lastName:'Ng',name:'Avery Ng',email:'avery@example.com',phone:'555-0100',city:'Austin',country:'United States',links:[]},education:[{school:'Example University',degree:'Bachelor of Science',fieldOfStudy:'Computer Science',from:'2020-08',to:'2024-05'}],experience:[],skills:['Python','TypeScript'],preferences:[['Seeking',['Full-time']],['Office preference','Flexible']],equalEmployment:[['Authorized to work in the United States','Yes'],['Requires employment sponsorship','No'],['Gender','Female'],['Race','Asian']]};
http.createServer(async(req,res)=>{
    try {
        if(req.url==='/bundle.js'){
            const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Profile from './src/components/Pages/Profile/Profile';createRoot(document.getElementById('app')).render(<BrowserRouter><Profile/></BrowserRouter>);`,resolveDir:frontend,loader:'jsx'},bundle:true,write:false,loader:{'.js':'jsx'},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'preview',setup(build){
                build.onResolve({filter:/connector$/},()=>({path:'mock',namespace:'mock'}));
                build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`let profile=${JSON.stringify(profile)};export const getUserProfile=async()=>profile;export const updateUserProfileSection=async(section,value)=>(profile={...profile,[section]:value});export const getResumes=async()=>[];export const getExtensionConnections=async()=>[];export const getProfileLocations=async()=>[];export const createExtensionPairingCode=async()=>({});export const revokeExtensionConnection=async()=>{};`,loader:'js'}));
                build.onLoad({filter:/\.scss$/},args=>({contents:`const style=document.createElement('style');style.textContent=${JSON.stringify(sass.compile(args.path,{silenceDeprecations:['legacy-js-api','import']}).css)};document.head.appendChild(style);`,loader:'js'}));
            }}]});res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);
        }else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Profile QA — synthetic data</title><style>body{margin:0;font:14px system-ui;--app-page-top:40px;--app-page-gutter:24px;--app-page-bottom:40px}#notice{padding:12px;text-align:center;background:#fff5ce}</style><div id="notice">LOCAL TEST — synthetic profile, edits are not saved to an account</div><div id="app"></div><script src="/bundle.js"></script>');}
    }catch(error){res.statusCode=500;res.end(error.message);}
}).listen(4190,'127.0.0.1',()=>console.log('Profile visual QA http://127.0.0.1:4190'));
