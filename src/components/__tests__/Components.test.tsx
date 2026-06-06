import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ──── Mocks ──────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, refresh: mockRefresh })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// ──── Pagination ─────────────────────────────────────────────────────

describe('Pagination', () => {
  beforeEach(() => { mockPush.mockClear(); });
  afterEach(cleanup);

  it('renders page info', async () => {
    const { Pagination } = await import('../Pagination');
    render(<Pagination page={1} totalPages={5} />);
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
  });

  it('shows Previous button only when not on first page', async () => {
    const { Pagination } = await import('../Pagination');
    const { rerender } = render(<Pagination page={1} totalPages={5} />);
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();

    cleanup();
    render(<Pagination page={2} totalPages={5} />);
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('hides Next button on last page', async () => {
    const { Pagination } = await import('../Pagination');
    render(<Pagination page={5} totalPages={5} />);
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });

  it('calls router.push with previous page on Previous click', async () => {
    const { Pagination } = await import('../Pagination');
    render(<Pagination page={3} totalPages={5} />);
    fireEvent.click(screen.getByText('Previous'));
    expect(mockPush).toHaveBeenCalledWith('/runs?page=2');
  });

  it('calls router.push with next page on Next click', async () => {
    const { Pagination } = await import('../Pagination');
    render(<Pagination page={3} totalPages={5} />);
    fireEvent.click(screen.getByText('Next'));
    expect(mockPush).toHaveBeenCalledWith('/runs?page=4');
  });

  it('includes endpoint_id in URL when provided', async () => {
    const { Pagination } = await import('../Pagination');
    render(<Pagination page={1} totalPages={5} endpointId="ep1" />);
    fireEvent.click(screen.getByText('Next'));
    expect(mockPush).toHaveBeenCalledWith('/runs?endpoint_id=ep1&page=2');
  });

  it('omits page param for page 1', async () => {
    const { Pagination } = await import('../Pagination');
    render(<Pagination page={1} totalPages={5} endpointId="ep1" />);
    fireEvent.click(screen.getByText('Next'));
    expect(mockPush).toHaveBeenCalledWith('/runs?endpoint_id=ep1&page=2');
  });
});

// ──── LiveTimeAgo ─────────────────────────────────────────────────────

describe('LiveTimeAgo', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it('shows "No runs received" when timestamp is null', async () => {
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    const { LiveTimeAgo } = await import('../LiveTimeAgo');
    render(<LiveTimeAgo timestampMs={null} />);
    expect(screen.getByText('No runs received')).toBeInTheDocument();
  });

  it('shows "No runs received" when timestamp is undefined', async () => {
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    const { LiveTimeAgo } = await import('../LiveTimeAgo');
    render(<LiveTimeAgo timestampMs={undefined} />);
    expect(screen.getByText('No runs received')).toBeInTheDocument();
  });

  it('shows seconds ago for recent timestamp', async () => {
    vi.setSystemTime(new Date('2025-01-01T12:00:30Z'));
    const { LiveTimeAgo } = await import('../LiveTimeAgo');
    render(<LiveTimeAgo timestampMs={new Date('2025-01-01T12:00:00Z').getTime()} />);
    expect(screen.getByText('Last run 30s ago')).toBeInTheDocument();
  });

  it('shows minutes and seconds for recent timestamp', async () => {
    vi.setSystemTime(new Date('2025-01-01T12:05:30Z'));
    const { LiveTimeAgo } = await import('../LiveTimeAgo');
    render(<LiveTimeAgo timestampMs={new Date('2025-01-01T12:00:00Z').getTime()} />);
    expect(screen.getByText('Last run 5m 30s ago')).toBeInTheDocument();
  });

  it('shows hours and minutes for older timestamp', async () => {
    vi.setSystemTime(new Date('2025-01-01T14:30:00Z'));
    const { LiveTimeAgo } = await import('../LiveTimeAgo');
    render(<LiveTimeAgo timestampMs={new Date('2025-01-01T12:00:00Z').getTime()} />);
    expect(screen.getByText('Last run 2h 30m ago')).toBeInTheDocument();
  });

  it('shows days and hours for old timestamp', async () => {
    vi.setSystemTime(new Date('2025-01-03T14:00:00Z'));
    const { LiveTimeAgo } = await import('../LiveTimeAgo');
    render(<LiveTimeAgo timestampMs={new Date('2025-01-01T12:00:00Z').getTime()} />);
    expect(screen.getByText('Last run 2d 2h ago')).toBeInTheDocument();
  });

  it('shows "Just now" for future timestamp', async () => {
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    const { LiveTimeAgo } = await import('../LiveTimeAgo');
    render(<LiveTimeAgo timestampMs={new Date('2025-01-01T12:00:30Z').getTime()} />);
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });
});

// ──── LogoutButton ────────────────────────────────────────────────────

describe('LogoutButton', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });
  afterEach(() => { cleanup(); delete (global as any).fetch; });

  it('renders a logout button', async () => {
    const { LogoutButton } = await import('../LogoutButton');
    render(<LogoutButton />);
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('calls /api/logout and navigates on click', async () => {
    const { LogoutButton } = await import('../LogoutButton');
    render(<LogoutButton />);
    await act(async () => { fireEvent.click(screen.getByText('Logout')); });
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', { method: 'POST' });
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(mockRefresh).toHaveBeenCalled();
  });
});

// ──── SectionErrorBoundary ────────────────────────────────────────────

describe('SectionErrorBoundary', () => {
  afterEach(cleanup);

  it('renders children when no error', async () => {
    const { SectionErrorBoundary } = await import('../SectionErrorBoundary');
    render(<SectionErrorBoundary><span>Child content</span></SectionErrorBoundary>);
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders error state when a child throws', async () => {
    const { SectionErrorBoundary } = await import('../SectionErrorBoundary');
    const Bomb = () => { throw new Error('Boom!'); };
    render(<SectionErrorBoundary title="Test Error"><Bomb /></SectionErrorBoundary>);
    expect(screen.getByText('Test Error')).toBeInTheDocument();
    expect(screen.getByText('Boom!')).toBeInTheDocument();
  });

  it('renders default title when none provided', async () => {
    const { SectionErrorBoundary } = await import('../SectionErrorBoundary');
    const Bomb = () => { throw new Error('Oops'); };
    render(<SectionErrorBoundary><Bomb /></SectionErrorBoundary>);
    expect(screen.getByText('Section Error')).toBeInTheDocument();
  });

  it('renders Retry and Dismiss buttons in error state', async () => {
    const { SectionErrorBoundary } = await import('../SectionErrorBoundary');
    const Bomb = () => { throw new Error('Fail'); };
    render(<SectionErrorBoundary><Bomb /></SectionErrorBoundary>);
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('calls onRetry when Retry button is clicked', async () => {
    const { SectionErrorBoundary } = await import('../SectionErrorBoundary');
    const onRetry = vi.fn();
    const Bomb = () => { throw new Error('Retry me'); };
    render(<SectionErrorBoundary onRetry={onRetry}><Bomb /></SectionErrorBoundary>);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

// ──── EndpointFilter ──────────────────────────────────────────────────

describe('EndpointFilter', () => {
  const endpoints = [
    { id: 'ep1', name: 'Shop One' },
    { id: 'ep2', name: 'Shop Two' },
    { id: 'ep3', name: 'Shop Three' },
  ];

  beforeEach(() => { mockPush.mockClear(); });
  afterEach(cleanup);

  it('renders "All Endpoints" as default option', async () => {
    const { EndpointFilter } = await import('../EndpointFilter');
    render(<EndpointFilter endpoints={endpoints} />);
    expect(screen.getByText('All Endpoints')).toBeInTheDocument();
  });

  it('renders all endpoint options', async () => {
    const { EndpointFilter } = await import('../EndpointFilter');
    render(<EndpointFilter endpoints={endpoints} />);
    for (const ep of endpoints) {
      expect(screen.getByText(ep.name)).toBeInTheDocument();
    }
  });

  it('navigates to filtered URL on selection change', async () => {
    const { EndpointFilter } = await import('../EndpointFilter');
    render(<EndpointFilter endpoints={endpoints} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'ep2' } });
    expect(mockPush).toHaveBeenCalledWith('/?endpoint_id=ep2');
  });

  it('navigates to unfiltered URL when selecting "All Endpoints"', async () => {
    const { EndpointFilter } = await import('../EndpointFilter');
    render(<EndpointFilter endpoints={endpoints} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
