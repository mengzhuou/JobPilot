const test=require('node:test'),assert=require('node:assert/strict');
const {looksLikeApplication}=require('../application-detector');
test('application detection supports ATS and custom application pages, not login/contact/listing pages',()=>{
    assert(looksLikeApplication({host:'jobs.ashbyhq.com',text:'Application',hasEmail:true,controls:5}));
    assert(looksLikeApplication({host:'careers.example.com',text:'Apply for this position',hasResume:true,controls:3}));
    assert(looksLikeApplication({text:'Submit application',controls:5}));
    assert(!looksLikeApplication({host:'jobs.ashbyhq.com',text:'Application',hasEmail:true,hasPassword:true,controls:5}));
    assert(!looksLikeApplication({host:'example.com',text:'Contact us',hasEmail:true,controls:5}));
    assert(!looksLikeApplication({host:'jobs.ashbyhq.com',text:'Apply for role',controls:0}));
});
