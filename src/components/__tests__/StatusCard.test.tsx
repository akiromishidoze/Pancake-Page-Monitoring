import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { StatusCard } from '../StatusCard';

describe('StatusCard', () => {
  it('renders title and value', () => {
    render(<StatusCard title="Active Pages" value="42" tone="green" />);
    expect(screen.getByText('Active Pages')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('applies the correct tone class', () => {
    const { container } = render(<StatusCard title="Errors" value="3" tone="red" />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('border-red-700');
    expect(card.className).toContain('bg-red-900/20');
  });

  it('renders subtitle when provided', () => {
    render(<StatusCard title="Uptime" value="99.9%" tone="green" subtitle="Last 30 days" />);
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', () => {
    const { container } = render(<StatusCard title="Test" value="0" tone="gray" />);
    const subtitles = container.querySelectorAll('.text-sm.mt-2');
    expect(subtitles.length).toBe(0);
  });

  it('renders all four tones without error', () => {
    for (const tone of ['green', 'yellow', 'red', 'gray'] as const) {
      const { container } = render(<StatusCard title={tone} value="x" tone={tone} />);
      expect(container.firstChild).toBeInTheDocument();
    }
  });
});
