import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';

test('renders site title', () => {
  render(<App />);
  const heading = screen.getByText(/Origen Translations/i);
  expect(heading).toBeDefined();
});
