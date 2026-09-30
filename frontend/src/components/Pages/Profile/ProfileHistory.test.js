import React from 'react';
import {render,screen} from '@testing-library/react';
import ProfileHistory from './ProfileHistory';
test('education groups dates, degree, GPA and location without repeating the major',()=>{
    render(<ProfileHistory kind="education" items={[{school:'Georgia Tech',degree:'BS, Computer Science',fieldOfStudy:'Computer Science',from:'2022-08',to:'2024-12',gpa:'3.95',location:'Atlanta, GA',details:['GPA 3.95','Honors']}]} />);
    expect(screen.getByRole('heading',{name:'Georgia Tech'})).toBeInTheDocument();
    expect(screen.getByText('Aug 2022 – Dec 2024')).toBeInTheDocument();
    expect(screen.getByText('BS, Computer Science')).toBeInTheDocument();
    expect(screen.getAllByText(/GPA/)).toHaveLength(1);
    expect(screen.getByText('Honors')).toBeInTheDocument();
});
test('experience leads with role and preserves job type, summary and accomplishments',()=>{
    render(<ProfileHistory kind="experience" items={[{company:'Travelers',title:'Software Engineer',from:'2023-06',current:true,jobType:'Full-time',summary:'Platform team',bullets:['Built reliable APIs.']}]} />);
    expect(screen.getByRole('heading',{name:'Software Engineer'})).toBeInTheDocument();
    expect(screen.getByText('Travelers')).toBeInTheDocument();
    expect(screen.getByText('Jun 2023 – Present')).toBeInTheDocument();
    expect(screen.getByText('Full-time')).toBeInTheDocument();
    expect(screen.getByText('Built reliable APIs.')).toBeInTheDocument();
    expect(screen.getByText('Platform team')).toBeInTheDocument();
});
