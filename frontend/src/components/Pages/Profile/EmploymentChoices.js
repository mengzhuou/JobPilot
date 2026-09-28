import React from 'react';
import {ACTIVE_IMMIGRATION_CASE} from './profileQuestions';

const options = {
    'Authorized to work in the United States':['Yes','No'],
    'Requires employment sponsorship':['Yes','No'],
    [ACTIVE_IMMIGRATION_CASE]:['Yes','No'],
    Gender:['Male','Female','Non-binary','Choose not to disclose'],
    'Hispanic or Latino':['Yes','No','Choose not to disclose'],
    'Veteran status':['Not a protected veteran','Protected veteran','Choose not to disclose'],
    Disability:['Yes','No','Choose not to disclose'],
    'Transgender experience':['Yes','No','Choose not to disclose'],
};
const selects = {
    'Citizenship status':['U.S. citizen','U.S. lawful permanent resident','Protected individual','Other'],
    Race:['Asian','Black or African American','White','Hispanic or Latino','American Indian or Alaska Native','Native Hawaiian or Other Pacific Islander','Two or more races'],
    'Sexual orientation':['Heterosexual','Bisexual','Gay','Lesbian','Asexual','Other'],
};
const declined = value => /declin|not to (?:disclose|say)|prefer not|do not wish/i.test(value || '');
export default function EmploymentChoices({rows,onChange}) {
    return <div className="employment-choices">
        {rows.map(([question,value],index)=>{
            const choices=options[question];
            const available = [...new Set([...(choices || selects[question] || []),...(value ? [value] : [])])].filter(option=>!declined(option));
            return <fieldset className={`employment-choice-row ${choices ? '' : 'employment-select-row'}`} key={question}><legend>{question}</legend>
                <div className="employment-choice-controls">
                    {choices ? <div role="group" aria-label={question} className="employment-segments">{available.map(option=><button type="button" aria-pressed={value===option} key={option} onClick={()=>onChange(index,value===option ? '' : option)}>{option}</button>)}</div>
                    : <select aria-label={question} value={declined(value) ? '' : value || ''} onChange={event=>onChange(index,event.target.value)}><option value="">Not answered</option>{available.map(option=><option key={option} value={option}>{option}</option>)}</select>}
                    {declined(value) && <small>Your previously saved non-disclosure answer is unchanged. Choose a new answer or clear it.</small>}
                    {value && <button type="button" className="employment-clear" aria-label={`Clear ${question}`} onClick={()=>onChange(index,'')}>Clear answer</button>}
                </div>
            </fieldset>;
        })}<p className="field-tip">An active immigration case is separate from needing sponsorship. Leave it unanswered if unsure.</p>
    </div>;
}
