import { describe, it, expect, vi } from "vitest";
import { lay } from "./index";

describe("lay", () => {
  describe("basic operations (get/set/update)", () => {
    it("should get initial value", () => {
      const state = lay(42);
      expect(state.get()).toBe(42);
    });

    it("should set value", () => {
      const state = lay(0);
      state.set(100);
      expect(state.get()).toBe(100);
    });

    it("should update value with function", () => {
      const state = lay(10);
      state.update((x) => x * 2);
      expect(state.get()).toBe(20);
    });

    it("should handle object state", () => {
      const state = lay({ name: "Alice", age: 30 });
      expect(state.get()).toEqual({ name: "Alice", age: 30 });

      state.set({ name: "Bob", age: 25 });
      expect(state.get()).toEqual({ name: "Bob", age: 25 });
    });

    it("should handle array state", () => {
      const state = lay([1, 2, 3]);
      expect(state.get()).toEqual([1, 2, 3]);

      state.update((arr) => [...arr, 4]);
      expect(state.get()).toEqual([1, 2, 3, 4]);
    });
  });

  describe("Deep Lens (using)", () => {
    it("should focus on nested property", () => {
      const state = lay({ user: { name: "Alice", age: 30 } });
      const nameFocus = state.using("user").using("name");

      expect(nameFocus.get()).toBe("Alice");
    });

    it("should set nested property", () => {
      const state = lay({ user: { name: "Alice", age: 30 } });
      const nameFocus = state.using("user").using("name");

      nameFocus.set("Bob");

      expect(nameFocus.get()).toBe("Bob");
      expect(state.get()).toEqual({ user: { name: "Bob", age: 30 } });
    });

    it("should update nested property", () => {
      const state = lay({ user: { name: "Alice", age: 30 } });
      const ageFocus = state.using("user").using("age");

      ageFocus.update((age) => age + 1);

      expect(ageFocus.get()).toBe(31);
      expect(state.get()).toEqual({ user: { name: "Alice", age: 31 } });
    });

    it("should handle deeply nested state", () => {
      const state = lay({
        a: { b: { c: { d: "deep" } } },
      });
      const dFocus = state.using("a").using("b").using("c").using("d");

      expect(dFocus.get()).toBe("deep");
      dFocus.set("modified");
      expect(state.get()).toEqual({ a: { b: { c: { d: "modified" } } } });
    });

    it("should preserve sibling properties when updating nested", () => {
      const state = lay({
        user: { name: "Alice", age: 30 },
        count: 0,
      });

      state.using("user").using("name").set("Bob");

      expect(state.get()).toEqual({
        user: { name: "Bob", age: 30 },
        count: 0,
      });
    });
  });

  describe("strict selector (reflect)", () => {
    it("should call listener on value change", () => {
      const state = lay(0);
      const listener = vi.fn();

      state.reflect(listener);
      state.set(1);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(1);
    });

    it("should unsubscribe when calling returned function", () => {
      const state = lay(0);
      const listener = vi.fn();

      const unsubscribe = state.reflect(listener);
      state.set(1);
      unsubscribe();
      state.set(2);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should NOT fire listener when unrelated property changes", () => {
      const state = lay({ user: { name: "Alice" }, count: 0 });
      const nameListener = vi.fn();

      state.using("user").using("name").reflect(nameListener);
      state.using("count").set(1);

      expect(nameListener).not.toHaveBeenCalled();
    });

    it("should fire listener only when focused property changes", () => {
      const state = lay({ user: { name: "Alice", age: 30 }, count: 0 });
      const nameListener = vi.fn();

      state.using("user").using("name").reflect(nameListener);

      state.using("user").using("age").set(31); // should NOT fire
      expect(nameListener).not.toHaveBeenCalled();

      state.using("user").using("name").set("Bob"); // should fire
      expect(nameListener).toHaveBeenCalledTimes(1);
      expect(nameListener).toHaveBeenCalledWith("Bob");
    });

    it("should use custom comparator when provided", () => {
      const state = lay({ user: { name: "Alice" } });
      const listener = vi.fn();

      // Custom comparator: only consider equal if same length
      const sameLengthComparator = (a: string, b: string) =>
        a.length === b.length;

      state.using("user").using("name").reflect(listener, sameLengthComparator);

      state.using("user").using("name").set("Clara"); // same length (5) as Alice - should NOT fire
      expect(listener).not.toHaveBeenCalled();

      state.using("user").using("name").set("Bob"); // different length (3) - should fire
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith("Bob");
    });

    it("should NOT fire listener when same value is set (default ===)", () => {
      const state = lay(42);
      const listener = vi.fn();

      state.reflect(listener);
      state.set(42); // same value

      expect(listener).not.toHaveBeenCalled();
    });

    it("should support multiple listeners on same focus", () => {
      const state = lay(0);
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      state.reflect(listener1);
      state.reflect(listener2);
      state.set(1);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("should handle null state", () => {
      const state = lay<string | null>(null);
      expect(state.get()).toBe(null);

      state.set("value");
      expect(state.get()).toBe("value");

      state.set(null);
      expect(state.get()).toBe(null);
    });

    it("should handle undefined state", () => {
      const state = lay<string | undefined>(undefined);
      expect(state.get()).toBe(undefined);

      state.set("value");
      expect(state.get()).toBe("value");

      state.set(undefined);
      expect(state.get()).toBe(undefined);
    });

    it("should handle nested null/undefined", () => {
      const state = lay<{ user: { name: string | null } }>({
        user: { name: null },
      });
      const nameFocus = state.using("user").using("name");

      expect(nameFocus.get()).toBe(null);

      nameFocus.set("Alice");
      expect(nameFocus.get()).toBe("Alice");

      nameFocus.set(null);
      expect(nameFocus.get()).toBe(null);
    });

    it("should handle empty object", () => {
      const state = lay({});
      expect(state.get()).toEqual({});
    });

    it("should handle empty array", () => {
      const state = lay<number[]>([]);
      expect(state.get()).toEqual([]);

      state.update((arr) => [...arr, 1]);
      expect(state.get()).toEqual([1]);
    });

    it("should handle array with using (numeric index)", () => {
      const state = lay({ items: ["a", "b", "c"] });
      const firstItem = state.using("items").using(0);

      expect(firstItem.get()).toBe("a");
      firstItem.set("x");
      expect(state.get()).toEqual({ items: ["x", "b", "c"] });
    });

    it("should handle boolean state", () => {
      const state = lay(false);
      expect(state.get()).toBe(false);

      state.set(true);
      expect(state.get()).toBe(true);

      state.update((v) => !v);
      expect(state.get()).toBe(false);
    });

    it("should fire listener with null value", () => {
      const state = lay<string | null>("initial");
      const listener = vi.fn();

      state.reflect(listener);
      state.set(null);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(null);
    });

    it("should NOT fire when setting null to null", () => {
      const state = lay<string | null>(null);
      const listener = vi.fn();

      state.reflect(listener);
      state.set(null);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle rapid sequential updates", () => {
      const state = lay(0);
      const listener = vi.fn();

      state.reflect(listener);

      for (let i = 1; i <= 100; i++) {
        state.set(i);
      }

      expect(listener).toHaveBeenCalledTimes(100);
      expect(state.get()).toBe(100);
    });

    it("should handle listener that modifies state (re-entrancy)", () => {
      const state = lay(0);
      const results: number[] = [];

      state.reflect((value) => {
        results.push(value);
        if (value < 3) {
          state.set(value + 1);
        }
      });

      state.set(1);

      expect(results).toEqual([1, 2, 3]);
      expect(state.get()).toBe(3);
    });

    it("should handle unsubscribe during notification", () => {
      const state = lay(0);
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      let unsubscribe2: (() => void) | undefined = undefined;

      state.reflect((value) => {
        listener1(value);
        if (unsubscribe2) {
          unsubscribe2();
        }
      });

      unsubscribe2 = state.reflect(listener2);

      state.set(1);

      expect(listener1).toHaveBeenCalledTimes(1);
      // listener2 might or might not be called depending on iteration order
      // but it should not throw
    });

    it("should handle object with optional properties", () => {
      interface Config {
        name: string;
        debug?: boolean;
      }
      const state = lay<Config>({ name: "app" });

      expect(state.get()).toEqual({ name: "app" });

      state.set({ name: "app", debug: true });
      expect(state.get()).toEqual({ name: "app", debug: true });
    });

    it("should handle deeply nested arrays", () => {
      const state = lay({
        matrix: [
          [1, 2],
          [3, 4],
        ],
      });

      const firstRow = state.using("matrix").using(0);
      expect(firstRow.get()).toEqual([1, 2]);

      firstRow.set([10, 20]);
      expect(state.get()).toEqual({
        matrix: [
          [10, 20],
          [3, 4],
        ],
      });
    });

    it("should track changes in nested focus across different paths", () => {
      const state = lay({
        users: {
          alice: { score: 100 },
          bob: { score: 200 },
        },
      });

      const aliceListener = vi.fn();
      const bobListener = vi.fn();

      state.using("users").using("alice").using("score").reflect(aliceListener);
      state.using("users").using("bob").using("score").reflect(bobListener);

      state.using("users").using("alice").using("score").set(150);

      expect(aliceListener).toHaveBeenCalledTimes(1);
      expect(aliceListener).toHaveBeenCalledWith(150);
      expect(bobListener).not.toHaveBeenCalled();
    });
  });
});
