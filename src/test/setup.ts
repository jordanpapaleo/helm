import "@testing-library/jest-dom";
import { addCollection } from "@iconify/react";
import icons from "@iconify-json/uil/icons.json";

// Keep component tests offline and avoid icon-fetch callbacks after jsdom teardown.
addCollection(icons);

// jsdom doesn't implement ResizeObserver, which @dnd-kit (Kanban board) and some
// components rely on at import/render time. Provide a no-op stub for tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
