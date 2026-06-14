/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ──── Helpers ──────────────────────────────────────────────────────────

async function renderWithProvider(ui: React.ReactElement) {
  const { ToastProvider } = await import('../Toast');
  return render(<ToastProvider>{ui}</ToastProvider>);
}

// ──── Mocks ──────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockRefresh = vi.fn();

let sseListeners: Record<string, (e: Event) => void> = {};
let _onSSEError: ((e: Event) => void) | null = null;

class MockEventSource {
  constructor(_url: string) {
    sseListeners = {};
    _onSSEError = null;
  }
  addEventListener(event: string, handler: (e: Event) => void) {
    sseListeners[event] = handler;
  }
  close() {}
}

vi.stubGlobal('EventSource', MockEventSource);

function fireSSEEvent(event: string) {
  const handler = sseListeners[event];
  if (handler) handler(new Event(event));
}

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
    const { rerender: _rerender } = render(<Pagination page={1} totalPages={5} />);
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

// ──── PlatformFilter ──────────────────────────────────────────────────

describe('PlatformFilter', () => {
  const platforms = [
    { id: 'p1', name: 'Platform A' },
    { id: 'p2', name: 'Platform B' },
  ];

  beforeEach(() => { mockPush.mockClear(); });
  afterEach(cleanup);

  it('renders "All platforms" as default option', async () => {
    const { PlatformFilter } = await import('../PlatformFilter');
    render(<PlatformFilter endpoints={platforms} />);
    expect(screen.getByText('All platforms')).toBeInTheDocument();
  });

  it('renders all platform options', async () => {
    const { PlatformFilter } = await import('../PlatformFilter');
    render(<PlatformFilter endpoints={platforms} />);
    for (const p of platforms) {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    }
  });

  it('applies the selected default value', async () => {
    const { PlatformFilter } = await import('../PlatformFilter');
    render(<PlatformFilter endpoints={platforms} selected="p1" />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('p1');
  });

  it('navigates to filtered runs URL on selection change', async () => {
    const { PlatformFilter } = await import('../PlatformFilter');
    render(<PlatformFilter endpoints={platforms} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'p2' } });
    expect(mockPush).toHaveBeenCalledWith('/runs?endpoint_id=p2');
  });

  it('navigates to /runs when selecting "All platforms"', async () => {
    const { PlatformFilter } = await import('../PlatformFilter');
    render(<PlatformFilter endpoints={platforms} selected="p1" />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(mockPush).toHaveBeenCalledWith('/runs');
  });
});

// ──── ChunkReload ─────────────────────────────────────────────────────

describe('ChunkReload', () => {
  const originalLocation = window.location;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders null', async () => {
    const { ChunkReload } = await import('../ChunkReload');
    const { container } = render(<ChunkReload />);
    expect(container.innerHTML).toBe('');
  });

  it('reloads page on chunk loading error', async () => {
    const { ChunkReload } = await import('../ChunkReload');
    render(<ChunkReload />);
    const event = new ErrorEvent('error', { message: 'Failed to load chunk chunk-abc.js' });
    window.dispatchEvent(event);
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it('reloads page on uppercase chunk loading error', async () => {
    const { ChunkReload } = await import('../ChunkReload');
    render(<ChunkReload />);
    const event = new ErrorEvent('error', { message: 'Loading chunk main.js failed' });
    window.dispatchEvent(event);
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it('does not reload on non-chunk error', async () => {
    const { ChunkReload } = await import('../ChunkReload');
    render(<ChunkReload />);
    const event = new ErrorEvent('error', { message: 'NetworkError: Failed to fetch' });
    window.dispatchEvent(event);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('reloads on unhandled rejection with chunk error', async () => {
    const { ChunkReload } = await import('../ChunkReload');
    render(<ChunkReload />);
    const rejection = Promise.reject(new Error('failed to load chunk x'));
    rejection.catch(() => {});
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: rejection,
      reason: new Error('failed to load chunk x'),
    }));
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it('does not reload on non-chunk rejection', async () => {
    const { ChunkReload } = await import('../ChunkReload');
    render(<ChunkReload />);
    const rejection = Promise.reject(new Error('generic error'));
    rejection.catch(() => {});
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: rejection,
      reason: new Error('generic error'),
    }));
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('removes event listeners on unmount', async () => {
    const addErrorSpy = vi.spyOn(window, 'addEventListener');
    const removeErrorSpy = vi.spyOn(window, 'removeEventListener');
    const { ChunkReload } = await import('../ChunkReload');
    const { unmount } = render(<ChunkReload />);
    expect(addErrorSpy).toHaveBeenCalledTimes(2);
    unmount();
    expect(removeErrorSpy).toHaveBeenCalledTimes(2);
    addErrorSpy.mockRestore();
    removeErrorSpy.mockRestore();
  });
});

// ──── SearchablePageTable ─────────────────────────────────────────────

describe('SearchablePageTable', () => {
  const rows = [
    { page_id: 'abc123', shop: 'Shop One', name: 'My Page', kind: 'funnel_converting', is_activated: true, is_canary: false, reason: null },
    { page_id: 'def456', shop: 'Shop Two', name: 'Another Page', kind: 'chat_only', is_activated: false, is_canary: true, reason: 'flagged' },
    { page_id: 'ghi789', shop: null, name: null, kind: null, is_activated: true, is_canary: false, reason: 'manual override' },
  ];

  afterEach(cleanup);

  it('renders all rows', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    expect(screen.getByText('My Page')).toBeInTheDocument();
    expect(screen.getByText('Another Page')).toBeInTheDocument();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders correct column headers', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    expect(screen.getByText('Page')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.queryByText('Shop ID')).not.toBeInTheDocument();
  });

  it('shows Shop ID column when hasShops is false', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={false} showKinds={true} />);
    expect(screen.getByText('Shop ID')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('hides Activity column when showKinds is false', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={false} />);
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
  });

  it('filters rows based on search query', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    const input = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(input, { target: { value: 'Another' } });
    expect(screen.getByText('Another Page')).toBeInTheDocument();
    expect(screen.queryByText('My Page')).not.toBeInTheDocument();
  });

  it('filters by page_id', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    const input = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(input, { target: { value: 'def456' } });
    expect(screen.getByText('Another Page')).toBeInTheDocument();
    expect(screen.queryByText('My Page')).not.toBeInTheDocument();
  });

  it('filters by shop', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    const input = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(input, { target: { value: 'Shop Two' } });
    expect(screen.getByText('Another Page')).toBeInTheDocument();
    expect(screen.queryByText('My Page')).not.toBeInTheDocument();
  });

  it('filters by reason', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    const input = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(input, { target: { value: 'manual' } });
    expect(screen.getByText('—')).toBeInTheDocument();
    const match = screen.getAllByText('—');
    expect(match.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no rows match', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    const input = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(input, { target: { value: 'zzznonexistent' } });
    expect(screen.getByText(/No pages match/)).toBeInTheDocument();
  });

  it('displays active/inactive status badges', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    const activeBadges = screen.getAllByText('active');
    expect(activeBadges.length).toBe(2);
    expect(screen.getByText('inactive')).toBeInTheDocument();
  });

  it('displays canary badge for canary pages', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    expect(screen.getByText('canary')).toBeInTheDocument();
  });

  it('renders kind badges with correct labels', async () => {
    const { SearchablePageTable } = await import('../SearchablePageTable');
    render(<SearchablePageTable rows={rows} hasShops={true} showKinds={true} />);
    expect(screen.getByText('funnel_converting')).toBeInTheDocument();
    expect(screen.getByText('chat_only')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });
});

// ──── RunStatusIndicator (removed — merged into GlobalLoadingSequence) ─

// ──── GlobalLoadingSequence ───────────────────────────────────────────

describe('GlobalLoadingSequence', () => {
  beforeEach(() => {
    document.body.className = '';
  });

  afterEach(() => {
    cleanup();
    if ((global as any).fetch) delete (global as any).fetch;
    vi.useRealTimers();
    document.body.className = '';
  });

  it('renders nothing when not running', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, isRunning: false }), { status: 200 }));
    const { GlobalLoadingSequence } = await import('../GlobalLoadingSequence');
    await renderWithProvider(<GlobalLoadingSequence />);
    expect(document.body.classList.contains('is-fetching-data')).toBe(false);
    expect(screen.queryByText('Fetching latest data...')).not.toBeInTheDocument();
  });

  it('shows spinner and adds class when status returns isRunning', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, isRunning: true }), { status: 200 }));
    const { GlobalLoadingSequence } = await import('../GlobalLoadingSequence');
    await renderWithProvider(<GlobalLoadingSequence />);
    await vi.waitFor(() => {
      expect(document.body.classList.contains('is-fetching-data')).toBe(true);
      expect(screen.getByText('Fetching latest data...')).toBeInTheDocument();
    });
  });

  it('displays status role and aria-live on spinner', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, isRunning: true }), { status: 200 }));
    const { GlobalLoadingSequence } = await import('../GlobalLoadingSequence');
    await renderWithProvider(<GlobalLoadingSequence />);
    await vi.waitFor(() => {
      const statusEl = screen.getByRole('status');
      expect(statusEl).toBeInTheDocument();
      expect(statusEl).toHaveAttribute('aria-live', 'polite');
    });
  });

  it('removes class and spinner when status returns not running', async () => {
    document.body.classList.add('is-fetching-data');
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, isRunning: false }), { status: 200 }));
    const { GlobalLoadingSequence } = await import('../GlobalLoadingSequence');
    await renderWithProvider(<GlobalLoadingSequence />);
    await vi.waitFor(() => {
      expect(document.body.classList.contains('is-fetching-data')).toBe(false);
    });
    expect(screen.queryByText('Fetching latest data...')).not.toBeInTheDocument();
  });

  it('handles fetch error and calls toast', async () => {
    global.fetch = vi.fn(async () => { throw new Error('Poll error'); });
    const { GlobalLoadingSequence } = await import('../GlobalLoadingSequence');
    await renderWithProvider(<GlobalLoadingSequence />);
    await vi.waitFor(() => {
      expect(screen.getByText('Failed to poll status')).toBeInTheDocument();
    });
  });

  it('sets running state on run-started custom event', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, isRunning: false }), { status: 200 }));
    const { GlobalLoadingSequence } = await import('../GlobalLoadingSequence');
    await renderWithProvider(<GlobalLoadingSequence />);
    await vi.waitFor(() => {
      expect(document.body.classList.contains('is-fetching-data')).toBe(false);
    });
    fireEvent(window, new CustomEvent('run-started'));
    expect(document.body.classList.contains('is-fetching-data')).toBe(true);
    expect(screen.getByText('Fetching latest data...')).toBeInTheDocument();
  });

  it('cleans up event listener on unmount', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, isRunning: false }), { status: 200 }));
    const { GlobalLoadingSequence } = await import('../GlobalLoadingSequence');
    const { unmount } = await renderWithProvider(<GlobalLoadingSequence />);
    await vi.waitFor(() => {
      expect(document.body.classList.contains('is-fetching-data')).toBe(false);
    });
    unmount();
    fireEvent(window, new CustomEvent('run-started'));
    expect(document.body.classList.contains('is-fetching-data')).toBe(false);
  });

  it('stops spinner on SSE refresh event', async () => {
    document.body.classList.add('is-fetching-data');
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, isRunning: true }), { status: 200 }));
    const { GlobalLoadingSequence } = await import('../GlobalLoadingSequence');
    await renderWithProvider(<GlobalLoadingSequence />);
    await vi.waitFor(() => {
      expect(screen.getByText('Fetching latest data...')).toBeInTheDocument();
    });
    await act(async () => { fireSSEEvent('refresh'); });
    expect(document.body.classList.contains('is-fetching-data')).toBe(false);
    expect(screen.queryByText('Fetching latest data...')).not.toBeInTheDocument();
  });
});
