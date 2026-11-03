import "@testing-library/jest-dom";
import { registerBundledIcons } from "../lib/bundled-icons";

// Same subset the app registers. Keeps component tests offline and avoids
// icon-fetch callbacks after jsdom teardown.
registerBundledIcons();

// jsdom doesn't implement ResizeObserver, which @dnd-kit (Kanban board) and some
// components rely on at import/render time. Provide a no-op stub for tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
