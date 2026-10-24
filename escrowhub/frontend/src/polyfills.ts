// Polyfill for @solana/web3.js Node.js buffer module
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

// This module is imported before react-dom, so stubbing the devtools hook here
// stops react-dom from logging the "Download the React DevTools" suggestion in
// the console (no functional impact: the hook only serves React DevTools).
// Only stub when the hook is absent, so an installed DevTools extension keeps
// working untouched.
if (!(window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    inject: () => undefined,
    on: () => undefined,
    off: () => undefined,
    supportsFiber: true,
    renderers: new Map(),
  };
}
