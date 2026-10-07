import React from 'react';
import {render,screen} from '@testing-library/react';
import ResumeProgressOverlay from './ResumeProgressOverlay';

test('upload-only progress does not promise parsing',()=>{
    render(<ResumeProgressOverlay title="Uploading" message="Saving file"/>);
    expect(screen.getByText('Upload').closest('li')).toHaveAttribute('aria-current','step');
    expect(screen.queryByText('Parse resume')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar',{name:'Uploading'})).toBeInTheDocument();
});

test('progress switches from upload to parsing without claiming a percentage',()=>{
    const {rerender}=render(<ResumeProgressOverlay title="Uploading" message="Saving file" includeParsing/>);
    expect(screen.getByText('Parse resume').closest('li')).not.toHaveAttribute('aria-current');
    rerender(<ResumeProgressOverlay title="Parsing" message="Reading your resume" phase="parsing"/>);
    expect(screen.getByText('Upload').closest('li')).toHaveClass('is-done');
    expect(screen.getByText('Parse resume').closest('li')).toHaveAttribute('aria-current','step');
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
});
