import React from 'react';
import {render,fireEvent} from '@testing-library/react';
import OrganizationBadge,{organizationLogo} from './OrganizationBadge';
test('matches school and employer aliases without guessing unknown domains',()=>{
    expect(organizationLogo('Georgia Institute of Technology')).toContain('gatech.edu');
    expect(organizationLogo('Georgia Southern University')).toContain('georgiasouthern.edu');
    expect(organizationLogo(' Walmart Global Tech ')).toContain('walmart.com');
    expect(organizationLogo('Unknown Organization')).toBe('');
    expect(organizationLogo('Unknown','javascript:alert(1)')).toBe('');
});
test('shows initials on failed images and retries when the organization changes',()=>{
    const {container,rerender}=render(<OrganizationBadge name="Georgia Tech" kind="school"/>);
    fireEvent.error(container.querySelector('img'));
    expect(container.textContent).toBe('GT');
    rerender(<OrganizationBadge name="Walmart" kind="company"/>);
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy','no-referrer');
    rerender(<OrganizationBadge name="Unknown Organization" kind="company"/>);
    expect(container.textContent).toBe('UO');
});
