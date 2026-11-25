import { Component, type ReactNode } from 'react';
import { ActionButton } from '../components/ui/action-button.tsx';
import { m } from '../paraglide/messages.js';

/** A module can fail without removing the shell or the other controls. */
export class ContentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full min-w-0 flex-col items-center justify-center gap-xs rounded-lg border border-border bg-surface p-md text-center"
      >
        <p className="text-caption text-muted-foreground">{m.content_unavailable()}</p>
        <ActionButton size="sm" variant="secondary" onClick={() => this.setState({ failed: false })}>
          {m.content_retry()}
        </ActionButton>
      </div>
    );
  }
}
