import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function TestHarness() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast('Error occurred', 'error')}>Trigger Error</button>
      <button onClick={() => toast('Saved!', 'success')}>Trigger Success</button>
      <button onClick={() => toast('FYI', 'info')}>Trigger Info</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <TestHarness />
    </ToastProvider>
  );
}

describe('ToastProvider', () => {
  it('renders children', () => {
    renderWithProvider();
    expect(screen.getByText('Trigger Error')).toBeInTheDocument();
  });

  it('shows a toast when triggered', () => {
    renderWithProvider();
    act(() => { screen.getByText('Trigger Error').click(); });
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('applies error styling to error toasts', () => {
    renderWithProvider();
    act(() => { screen.getByText('Trigger Error').click(); });
    const toastEl = screen.getByText('Error occurred').closest('[role="alert"] > div');
    expect(toastEl?.className).toContain('border-red-800');
    expect(toastEl?.className).toContain('bg-red-900/80');
  });

  it('applies success styling to success toasts', () => {
    renderWithProvider();
    act(() => { screen.getByText('Trigger Success').click(); });
    const toastEl = screen.getByText('Saved!').closest('[role="alert"] > div');
    expect(toastEl?.className).toContain('border-green-800');
    expect(toastEl?.className).toContain('bg-green-900/80');
  });

  it('shows multiple toasts simultaneously', () => {
    renderWithProvider();
    act(() => { screen.getByText('Trigger Error').click(); });
    act(() => { screen.getByText('Trigger Success').click(); });
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('dismisses toast after 4 seconds', async () => {
    vi.useFakeTimers();
    renderWithProvider();
    act(() => { screen.getByText('Trigger Error').click(); });
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText('Error occurred')).not.toBeInTheDocument();
  });

  it('useToast throws without provider', () => {
    expect(() => render(<TestHarness />)).toThrow('useToast must be used within ToastProvider');
  });
});
