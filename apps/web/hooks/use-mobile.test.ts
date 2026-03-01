import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

describe("useIsMobile", () => {
  let matchMediaListeners: Array<(e: MediaQueryListEvent) => void>;

  beforeEach(() => {
    matchMediaListeners = [];
    vi.clearAllMocks();

    const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_event: string, listener: (e: MediaQueryListEvent) => void) => {
        matchMediaListeners.push(listener);
      },
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mockMatchMedia,
    });
  });

  it("should return false on desktop (width >= 768)", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      value: 1024,
    });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it("should return true on mobile (width < 768)", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      value: 375,
    });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("should return false at exactly 768px (breakpoint)", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      value: 768,
    });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it("should return true at 767px", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      value: 767,
    });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("should respond to resize events", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      value: 1024,
    });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        value: 375,
      });

      matchMediaListeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    });
  });

  it("should clean up event listener on unmount", () => {
    const removeEventListener = vi.fn();

    const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener,
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mockMatchMedia,
    });

    const { unmount } = renderHook(() => useIsMobile());

    unmount();

    expect(removeEventListener).toHaveBeenCalled();
  });

  it("should handle edge case widths", () => {
    const testCases = [
      { width: 0, expected: true },
      { width: 1, expected: true },
      { width: 320, expected: true },
      { width: 480, expected: true },
      { width: 767, expected: true },
      { width: 768, expected: false },
      { width: 769, expected: false },
      { width: 1024, expected: false },
      { width: 1920, expected: false },
    ];

    testCases.forEach(({ width, expected }) => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        value: width,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(expected);
    });
  });
});
