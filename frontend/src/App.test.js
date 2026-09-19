import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('axios', () => ({
  create: () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() }),
}));

test('renders the JobPilot sign-in page', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
});
