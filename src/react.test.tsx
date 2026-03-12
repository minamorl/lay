import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { lay } from "./index";
import { useFocus } from "./react";
import React from "react";

describe("useFocus", () => {
  afterEach(() => {
    cleanup();
  });
  it("should return current value from focus", () => {
    const state = lay({ count: 0 });

    const Component = () => {
      const count = useFocus(state.using("count"));
      return <div data-testid="count">{count}</div>;
    };

    render(<Component />);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("should re-render when focused value changes", () => {
    const state = lay({ count: 0 });
    const renderCount = vi.fn();

    const Component = () => {
      const count = useFocus(state.using("count"));
      renderCount();
      return <div data-testid="count">{count}</div>;
    };

    render(<Component />);
    expect(renderCount).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("count").textContent).toBe("0");

    act(() => {
      state.using("count").set(1);
    });

    expect(renderCount).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("should NOT re-render when unrelated value changes", () => {
    const state = lay({ count: 0, name: "Alice" });
    const renderCount = vi.fn();

    const Component = () => {
      const count = useFocus(state.using("count"));
      renderCount();
      return <div data-testid="count">{count}</div>;
    };

    render(<Component />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    act(() => {
      state.using("name").set("Bob");
    });

    // Should NOT re-render because count didn't change
    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  it("should use custom comparator", () => {
    const state = lay({ name: "Alice" });
    const renderCount = vi.fn();

    // Custom comparator: same length means equal
    const sameLengthComparator = (a: string, b: string) =>
      a.length === b.length;

    const Component = () => {
      const name = useFocus(state.using("name"), sameLengthComparator);
      renderCount();
      return <div data-testid="name">{name}</div>;
    };

    render(<Component />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    act(() => {
      state.using("name").set("Clara"); // same length (5) - should NOT re-render
    });
    expect(renderCount).toHaveBeenCalledTimes(1);

    act(() => {
      state.using("name").set("Bob"); // different length (3) - should re-render
    });
    expect(renderCount).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("name").textContent).toBe("Bob");
  });

  it("should cleanup subscription on unmount", () => {
    const state = lay({ count: 0 });

    const Component = () => {
      const count = useFocus(state.using("count"));
      return <div data-testid="count">{count}</div>;
    };

    const { unmount } = render(<Component />);
    unmount();

    // Should not throw after unmount
    act(() => {
      state.using("count").set(1);
    });
  });
});
