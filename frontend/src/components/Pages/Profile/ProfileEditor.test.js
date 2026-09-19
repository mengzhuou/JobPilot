import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileEditor from './ProfileEditor';
import { PersonalLocations } from './ProfileFields';
import { getProfileLocations } from '../../../connector';

jest.mock('../../../connector', () => ({ getProfileLocations: jest.fn() }));
const user = {
    type: (...args) => act(() => userEvent.type(...args)),
    click: (...args) => act(() => userEvent.click(...args)),
};
beforeEach(() => { getProfileLocations.mockReset(); getProfileLocations.mockResolvedValue([]); });

test('company typing preserves focus and saves the whole name without editor IDs', () => {
    const save = jest.fn();
    render(<ProfileEditor section="experience" value={[{company:'',title:'Engineer',bullets:[]}]} onSave={save} onCancel={()=>{}} />);
    const company = screen.getByRole('combobox', {name:/Company/});
    user.type(company,'Example Company');
    expect(document.activeElement).toBe(company);
    expect(company.value).toBe('Example Company');
    user.click(screen.getAllByRole('button',{name:'Update'})[1]);
    expect(save).toHaveBeenCalledWith([expect.objectContaining({company:'Example Company'})]);
    expect(save.mock.calls[0][0][0]._editorId).toBeUndefined();
});

test('both Update buttons respect required education fields', () => {
    const save = jest.fn();
    render(<ProfileEditor section="education" value={[{school:'Georgia Tech',degree:'',details:[]}]} onSave={save} onCancel={()=>{}} />);
    screen.getAllByRole('button',{name:'Update'}).forEach(button=>user.click(button));
    expect(save).not.toHaveBeenCalled();
    user.type(screen.getByLabelText(/Major \/ Degree/),'Computer Science');
    user.click(screen.getAllByRole('button',{name:'Update'})[0]);
    expect(save).toHaveBeenCalledTimes(1);
});

test('skills offer technical suggestions and selected skills save as tags', () => {
    const save = jest.fn();
    render(<ProfileEditor section="skills" value={['Java']} onSave={save} onCancel={()=>{}} />);
    user.type(screen.getByRole('combobox'),'Python');
    user.click(screen.getByRole('option',{name:'Python'}));
    user.click(screen.getAllByRole('button',{name:'Update'})[0]);
    expect(save).toHaveBeenCalledWith(['Java','Python']);
});

test('preferences save multiple employment types and locations', () => {
    const save = jest.fn();
    render(<ProfileEditor section="preferences" value={[["Seeking","Full-time roles"],["Office preference","Remote only"],["Preferred application location","Dallas, TX"]]} onSave={save} onCancel={()=>{}} />);
    user.click(screen.getByRole('combobox',{name:'Seeking'}));
    user.click(screen.getByRole('option',{name:'Internship'}));
    const locations = screen.getByRole('combobox',{name:'Preferred application location'});
    user.type(locations,'Atlanta, GA{enter}');
    user.click(screen.getAllByRole('button',{name:'Update'})[1]);
    expect(save).toHaveBeenCalledWith([["Seeking",['Full-time','Internship']],["Office preference","Remote only"],["Preferred application location",['Dallas, TX','Atlanta, GA']]]);
});

test('postal suggestions never overwrite a manually entered code', async () => {
    getProfileLocations.mockImplementation(({kind})=>Promise.resolve(kind === 'postal' ? ['75001'] : []));
    const setDraft = jest.fn();
    render(<PersonalLocations draft={{country:'United States',state:'Texas',city:'Addison',postalCode:'75002'}} setDraft={setDraft} />);
    await waitFor(()=>expect(setDraft).toHaveBeenCalled());
    const original = {postalCode:'75002'};
    expect(setDraft.mock.calls[0][0](original)).toBe(original);
});

test('cancel never saves edits', () => {
    const save = jest.fn(), cancel = jest.fn();
    render(<ProfileEditor section="skills" value={[]} onSave={save} onCancel={cancel} />);
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
});

test('education offers school and degree suggestions and accepts decimal GPA only', () => {
    const save = jest.fn();
    render(<ProfileEditor section="education" value={[{school:'',degree:'',gpa:'',details:[]}]} onSave={save} onCancel={()=>{}} />);
    user.type(screen.getByRole('combobox',{name:/School Name/}),'Georgia Institute');
    user.click(screen.getByRole('option',{name:'Georgia Institute of Technology'}));
    user.type(screen.getByRole('combobox',{name:/Major \/ Degree/}),'Bachelor of Science in Computer');
    user.click(screen.getByRole('option',{name:'Bachelor of Science in Computer Science'}));
    const gpa = screen.getByLabelText('GPA');
    user.type(gpa,'3.95abc');
    expect(gpa.value).toBe('3.95');
    fireEvent.change(gpa,{target:{value:'3.9.5'}});
    expect(gpa.value).toBe('3.95');
    user.click(screen.getAllByRole('button',{name:'Update'})[0]);
    expect(save).toHaveBeenCalledWith([expect.objectContaining({school:'Georgia Institute of Technology',degree:'Bachelor of Science in Computer Science',gpa:'3.95'})]);
});

test('GPA can be cleared without restoring the old imported value', () => {
    const save = jest.fn();
    render(<ProfileEditor section="education" value={[{school:'Custom School',degree:'Custom degree',details:['GPA 3.95']}]} onSave={save} onCancel={()=>{}} />);
    fireEvent.change(screen.getByLabelText('GPA'),{target:{value:''}});
    expect(screen.getByLabelText('GPA').value).toBe('');
    user.click(screen.getAllByRole('button',{name:'Update'})[0]);
    expect(save).toHaveBeenCalledWith([expect.objectContaining({gpa:''})]);
});
