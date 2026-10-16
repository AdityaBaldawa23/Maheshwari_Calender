import { Component } from 'react';

/** Last line of defence: an unexpected render error shows a friendly Hindi screen instead of a blank app. */
export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[app] render error', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-paper p-6 text-center">
        <div className="card max-w-sm p-6">
          <h1 className="font-display text-2xl text-maroon">क्षमा करें</h1>
          <p className="mt-2 text-ink">कुछ गड़बड़ हो गई। कृपया ऐप दोबारा खोलें।</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 min-h-12 rounded-full bg-maroon px-6 font-semibold text-white"
          >
            दोबारा खोलें
          </button>
        </div>
      </div>
    );
  }
}
