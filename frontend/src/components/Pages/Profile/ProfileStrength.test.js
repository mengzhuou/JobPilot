import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import ProfileStrength from './ProfileStrengthCard';
import {profileStrength} from './profileCompleteness';
const complete={personal:{firstName:'Avery',lastName:'Ng',email:'a@example.com',phone:'555',city:'Austin',country:'US',links:[{href:'https://example.com'}]},education:[{school:'School',degree:'BS'}],experience:[{company:'Example',title:'Engineer'}],skills:['Python'],preferences:[['Seeking',['Full-time']],['Office preference','Remote only']]};
test('optional answers do not change strength; unknown resume does not imply missing',()=>{
    expect(profileStrength(complete,true).score).toBe(100);
    expect(profileStrength({...complete,equalEmployment:[['Gender','Female']]},true).score).toBe(100);
    expect(profileStrength(complete,false).score).toBe(85);
    expect(profileStrength(complete,null).score).toBeNull();
});
test('strength actions open the matching editor and resumes route',()=>{
    const edit=jest.fn(),resumes=jest.fn();render(<ProfileStrength profile={complete} hasResume={true} loaded={true} onEdit={edit} onResumes={resumes}/>);
    fireEvent.click(screen.getByRole('button',{name:/View completed sections/}));
    fireEvent.click(screen.getByRole('button',{name:/Add your education/}));expect(edit).toHaveBeenLastCalledWith('education');
    fireEvent.click(screen.getByRole('button',{name:/Choose your primary/}));expect(resumes).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:/optional employment/}));expect(edit).toHaveBeenLastCalledWith('equalEmployment');
});
test('automatically collapses at 100 percent and reopens when incomplete',()=>{
    const props={profile:complete,loaded:true,onEdit:jest.fn(),onResumes:jest.fn()};
    const {rerender}=render(<ProfileStrength {...props} hasResume={false}/>);
    expect(screen.getByRole('button',{name:/Hide checklist/})).toHaveAttribute('aria-expanded','true');
    rerender(<ProfileStrength {...props} hasResume={true}/>);
    expect(screen.queryByRole('button',{name:/Add your education/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/View completed sections/}));
    expect(screen.getByRole('button',{name:/Add your education/})).toBeEnabled();
    rerender(<ProfileStrength {...props} hasResume={false}/>);
    expect(screen.getByRole('button',{name:/Hide checklist/})).toHaveAttribute('aria-expanded','true');
});
test('empty loaded profiles can open every section editor',()=>{
    const edit=jest.fn(),resumes=jest.fn();
    render(<ProfileStrength profile={{}} hasResume={false} loaded={true} onEdit={edit} onResumes={resumes}/>);
    for(const [label,section] of [['contact information','personal'],['education','education'],['work experience','experience'],['professional links','personal'],['skills','skills'],['job preferences','preferences'],['optional employment','equalEmployment']]){
        fireEvent.click(screen.getByRole('button',{name:new RegExp(label)}));
        expect(edit).toHaveBeenLastCalledWith(section);
    }
    fireEvent.click(screen.getByRole('button',{name:/primary resume/}));
    expect(resumes).toHaveBeenCalledTimes(1);
});
