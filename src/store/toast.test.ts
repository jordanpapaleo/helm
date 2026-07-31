import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "./toast";

describe("useToastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("showToast adds a toast with message and kind", () => {
    const { result } = renderHook(() => useToastStore());
    act(() => result.current.showToast("Failed to save note", "error"));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe("Failed to save note");
    expect(result.current.toasts[0].kind).toBe("error");
  });

  it("assigns unique ids to concurrent toasts", () => {
    const { result } = renderHook(() => useToastStore());
    act(() => {
      result.current.showToast("one", "error");
      result.current.showToast("two", "info");
    });
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0].id).not.toBe(result.current.toasts[1].id);
  });

  it("dismissToast removes a toast by id", () => {
    const { result } = renderHook(() => useToastStore());
    act(() => result.current.showToast("bye", "info"));
    const id = result.current.toasts[0].id;
    act(() => result.current.dismissToast(id));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("error toasts auto-dismiss after 8 seconds", () => {
    const { result } = renderHook(() => useToastStore());
    act(() => result.current.showToast("oops", "error"));
    act(() => vi.advanceTimersByTime(7999));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("info toasts auto-dismiss after 4 seconds", () => {
    const { result } = renderHook(() => useToastStore());
    act(() => result.current.showToast("saved", "info"));
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("returns the toast id from showToast", () => {
    const { result } = renderHook(() => useToastStore());
    let id = -1;
    act(() => {
      id = result.current.showToast("hi", "info");
    });
    expect(id).toBe(result.current.toasts[0].id);
  });

  it("persist toasts do not auto-dismiss", () => {
    const { result } = renderHook(() => useToastStore());
    let id = -1;
    act(() => {
      id = result.current.showToast("Checking…", "info", { persist: true });
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toasts).toHaveLength(1);
    act(() => result.current.dismissToast(id));
    expect(result.current.toasts).toHaveLength(0);
  });
});
