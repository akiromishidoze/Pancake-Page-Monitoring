'use client';

import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; title?: string; onRetry?: () => void };
type State = { error: Error | null };

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-lg border border-red-800 bg-red-950/30 p-6">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span className="text-sm font-medium text-red-400">{this.props.title ?? 'Section Error'}</span>
        </div>
        <p className="text-xs text-red-300/70 mb-3 truncate">{this.state.error.message}</p>
        <button
          onClick={() => { this.setState({ error: null }); this.props.onRetry?.(); }}
          className="rounded bg-red-800/50 px-2.5 py-1 text-xs text-red-300 hover:bg-red-700/50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }
}
