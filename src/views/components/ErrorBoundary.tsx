/* ErrorBoundary — if any part of the app crashes while drawing, show a way back instead of a blank page.
   The crash still reaches the admin "Errors on riders' devices" list: it is passed to the browser's error
   handler, which the usage tracker listens to (UsageTracker). */
import React from 'react';

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error) {
        if (typeof window.reportError === 'function') window.reportError(error);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#F7F8FA' }}>
                <img src="/og-logo-gif.gif" alt="Transit Regina" className="w-16 h-16 rounded-xl object-cover mb-6" />
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Something went wrong</h1>
                <p className="mt-3 max-w-md text-slate-600">The page hit a problem it couldn't recover from. Reloading usually fixes it.</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-8 px-8 py-3 rounded-2xl bg-[#003DA5] text-white font-bold text-lg shadow-[0_10px_32px_rgba(0,61,165,0.35)] transition-all duration-300 hover:-translate-y-1"
                >
                    Reload
                </button>
            </div>
        );
    }
}
