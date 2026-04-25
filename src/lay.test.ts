import { describe, it, expect, vi } from "vitest";
import {
  lay,
  rwLens,
  roLens,
  decompose,
  focusOf,
  fromFocus,
} from "./index";

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

  // ---------------------------------------------------------------------------
  // usingLens — get/setの束を合成する一般化されたフォーカス
  //
  // 思想:
  //   (1) DBの結果をドメインオブジェクトに変換するマッピング層は無駄である
  //   (2) 実体は一つのまま、観測の束を被せて視点を切り替える
  //   (3) 意味論的にbackwardが未定義な計算プロパティはnoopとしてマークする
  // ---------------------------------------------------------------------------
  describe("usingLens (Lens-based focus)", () => {
    type Row = {
      first_name: string;
      last_name: string;
      birth_year: number;
      email_local: string;
      email_domain: string;
      role_bits: number;
    };

    const initialRow: Row = {
      first_name: "Yui",
      last_name: "Minamorl",
      birth_year: 2008,
      email_local: "yui",
      email_domain: "example.com",
      role_bits: 0b0001, // admin
    };

    describe("RW lens (well-defined backward)", () => {
      it("should read through email lens (forward)", () => {
        const state = lay(initialRow);
        const emailLens = rwLens<Row, string>(
          (r) => `${r.email_local}@${r.email_domain}`,
          (r, e) => {
            const [local, domain] = e.split("@");
            return { ...r, email_local: local, email_domain: domain };
          },
        );
        const email = state.usingLens(emailLens);
        expect(email.get()).toBe("yui@example.com");
      });

      it("should write through email lens (backward propagates to base)", () => {
        const state = lay(initialRow);
        const emailLens = rwLens<Row, string>(
          (r) => `${r.email_local}@${r.email_domain}`,
          (r, e) => {
            const [local, domain] = e.split("@");
            return { ...r, email_local: local, email_domain: domain };
          },
        );
        state.usingLens(emailLens).set("new@host.com");

        // 実体は1つ — 元のフィールドが正しく更新されている
        expect(state.get().email_local).toBe("new");
        expect(state.get().email_domain).toBe("host.com");
        // 他のフィールドは触られていない
        expect(state.get().first_name).toBe("Yui");
      });

      it("should compose RW lens with bit operation (isAdmin)", () => {
        const state = lay(initialRow);
        const isAdminLens = rwLens<Row, boolean>(
          (r) => (r.role_bits & 0b0001) !== 0,
          (r, b) => ({
            ...r,
            role_bits: b ? r.role_bits | 0b0001 : r.role_bits & ~0b0001,
          }),
        );
        const isAdmin = state.usingLens(isAdminLens);

        expect(isAdmin.get()).toBe(true);
        isAdmin.set(false);
        expect(state.get().role_bits & 0b0001).toBe(0);
        expect(isAdmin.get()).toBe(false);
      });

      it("should support update through RW lens", () => {
        const state = lay(initialRow);
        const isAdminLens = rwLens<Row, boolean>(
          (r) => (r.role_bits & 0b0001) !== 0,
          (r, b) => ({
            ...r,
            role_bits: b ? r.role_bits | 0b0001 : r.role_bits & ~0b0001,
          }),
        );
        state.usingLens(isAdminLens).update((b) => !b);
        expect(state.get().role_bits & 0b0001).toBe(0);
      });

      it("should notify subscribers when written through RW lens", () => {
        const state = lay(initialRow);
        const emailLens = rwLens<Row, string>(
          (r) => `${r.email_local}@${r.email_domain}`,
          (r, e) => {
            const [local, domain] = e.split("@");
            return { ...r, email_local: local, email_domain: domain };
          },
        );
        const listener = vi.fn();
        const email = state.usingLens(emailLens);
        email.reflect(listener);

        email.set("foo@bar.com");
        expect(listener).toHaveBeenCalledWith("foo@bar.com");
      });
    });

    describe("RO lens (semantically undefined backward → noop)", () => {
      it("should read through displayName lens", () => {
        const state = lay(initialRow);
        const displayNameLens = roLens<Row, string>(
          (r) => `${r.first_name} ${r.last_name}`,
        );
        expect(state.usingLens(displayNameLens).get()).toBe("Yui Minamorl");
      });

      it("should silently noop on set to RO lens", () => {
        const state = lay(initialRow);
        const displayNameLens = roLens<Row, string>(
          (r) => `${r.first_name} ${r.last_name}`,
        );
        const view = state.usingLens(displayNameLens);

        // noop: 例外を投げない、警告も出さない、ただ無視する
        expect(() => view.set("Foo Bar")).not.toThrow();

        // 実体は変化していない
        expect(state.get().first_name).toBe("Yui");
        expect(state.get().last_name).toBe("Minamorl");
      });

      it("should silently noop on update to RO lens", () => {
        const state = lay(initialRow);
        const ageLens = roLens<Row, number>((r) => 2026 - r.birth_year);
        const age = state.usingLens(ageLens);

        expect(age.get()).toBe(18);
        expect(() => age.update((n) => n + 1)).not.toThrow();
        // birth_yearは変化していない
        expect(state.get().birth_year).toBe(2008);
      });

      it("should NOT notify subscribers when noop occurs", () => {
        const state = lay(initialRow);
        const displayNameLens = roLens<Row, string>(
          (r) => `${r.first_name} ${r.last_name}`,
        );
        const listener = vi.fn();
        state.usingLens(displayNameLens).reflect(listener);

        state.usingLens(displayNameLens).set("Foo Bar");

        // noopなので状態が変化せず、通知もされない
        expect(listener).not.toHaveBeenCalled();
      });

      it("should still propagate notifications when underlying state changes", () => {
        // ROレンズで読んでいても、元の状態が変わればreflectは発火する
        const state = lay(initialRow);
        const displayNameLens = roLens<Row, string>(
          (r) => `${r.first_name} ${r.last_name}`,
        );
        const listener = vi.fn();
        state.usingLens(displayNameLens).reflect(listener);

        // 元の名前を変える
        state.using("first_name").set("Sui");

        expect(listener).toHaveBeenCalledWith("Sui Minamorl");
      });
    });

    describe("monoid law: noop is identity (composition)", () => {
      it("should preserve subsequent writes through other lenses (noop is left identity)", () => {
        const state = lay(initialRow);
        const displayNameLens = roLens<Row, string>(
          (r) => `${r.first_name} ${r.last_name}`,
        );
        const emailLens = rwLens<Row, string>(
          (r) => `${r.email_local}@${r.email_domain}`,
          (r, e) => {
            const [local, domain] = e.split("@");
            return { ...r, email_local: local, email_domain: domain };
          },
        );

        // noopした後でも次の書き込みは通る — モノイド則
        state.usingLens(displayNameLens).set("ignored"); // noop
        state.usingLens(emailLens).set("foo@bar.com"); // ここは通る

        expect(state.get().email_local).toBe("foo");
        expect(state.get().email_domain).toBe("bar.com");
      });
    });

    describe("layer elimination: single source of truth", () => {
      it("should provide multiple views over the same row without copying", () => {
        const state = lay(initialRow);
        const displayName = state.usingLens(
          roLens<Row, string>((r) => `${r.first_name} ${r.last_name}`),
        );
        const age = state.usingLens(
          roLens<Row, number>((r) => 2026 - r.birth_year),
        );
        const email = state.usingLens(
          rwLens<Row, string>(
            (r) => `${r.email_local}@${r.email_domain}`,
            (r, e) => {
              const [local, domain] = e.split("@");
              return { ...r, email_local: local, email_domain: domain };
            },
          ),
        );

        // 3つの視点が同一の実体を共有している
        expect(displayName.get()).toBe("Yui Minamorl");
        expect(age.get()).toBe(18);
        expect(email.get()).toBe("yui@example.com");

        // 1ヶ所書き込めば、関係する全ての視点が更新される（実体は1つ）
        state.using("first_name").set("Aoi");
        expect(displayName.get()).toBe("Aoi Minamorl");
        expect(age.get()).toBe(18); // 不変
        expect(email.get()).toBe("yui@example.com"); // 不変
      });
    });

    describe("lens composition with using()", () => {
      it("should compose key-using and lens-using together", () => {
        const state = lay({ user: initialRow, version: 1 });
        // .using('user') でフォーカスし、その上にレンズを被せる
        const displayName = state
          .using("user")
          .usingLens(roLens<Row, string>((r) => `${r.first_name} ${r.last_name}`));

        expect(displayName.get()).toBe("Yui Minamorl");
      });

      it("should propagate writes through composed lens", () => {
        const state = lay({ user: initialRow, version: 1 });
        const email = state.using("user").usingLens(
          rwLens<Row, string>(
            (r) => `${r.email_local}@${r.email_domain}`,
            (r, e) => {
              const [local, domain] = e.split("@");
              return { ...r, email_local: local, email_domain: domain };
            },
          ),
        );

        email.set("composed@test.com");
        expect(state.get().user.email_local).toBe("composed");
        expect(state.get().user.email_domain).toBe("test.com");
        expect(state.get().version).toBe(1); // 他の部分は不変
      });
    });
  });

  // ============================================================
  // decompose / focusOf / fromFocus
  // ============================================================
  describe("decompose / focusOf / fromFocus", () => {
    type Row = {
      id: number;
      first_name: string;
      last_name: string;
      birth_year: number;
      email_local: string;
      email_domain: string;
    };
    const initialRow: Row = {
      id: 42,
      first_name: "Yui",
      last_name: "Minamorl",
      birth_year: 2008,
      email_local: "yui",
      email_domain: "example.com",
    };

    describe("auto factorization (no lensMap)", () => {
      it("should auto-generate rwLenses for all plain fields", () => {
        const state = lay(initialRow);
        const d = decompose(state);

        expect(Object.keys(d.focuses).sort()).toEqual([
          "birth_year",
          "email_domain",
          "email_local",
          "first_name",
          "id",
          "last_name",
        ]);

        expect(focusOf(d, "first_name").get()).toBe("Yui");
        expect(focusOf(d, "id").get()).toBe(42);
      });

      it("should propagate writes through auto-generated lenses", () => {
        const state = lay(initialRow);
        const d = decompose(state);

        focusOf(d, "first_name").set("Aoi");
        expect(state.get().first_name).toBe("Aoi");
        expect(state.get().last_name).toBe("Minamorl"); // 他は不変
      });

      it("should not copy data — all focuses share the same entity", () => {
        const state = lay(initialRow);
        const d1 = decompose(state);
        const d2 = decompose(state);

        // 別の decompose を経由しても同じ実体を見ている
        focusOf(d1, "first_name").set("Aoi");
        expect(focusOf(d2, "first_name").get()).toBe("Aoi");
      });
    });

    describe("explicit lensMap (mapping-layer elimination)", () => {
      it("should bundle rw and ro lenses together", () => {
        const state = lay(initialRow);
        const d = decompose(state, {
          // ROレンズ: 計算プロパティ
          displayName: roLens<Row, string>(
            (r) => `${r.first_name} ${r.last_name}`,
          ),
          age: roLens<Row, number>((r) => 2026 - r.birth_year),
          // RWレンズ: 双方向の意味のある観測
          email: rwLens<Row, string>(
            (r) => `${r.email_local}@${r.email_domain}`,
            (r, e) => {
              const [local, domain] = e.split("@");
              return { ...r, email_local: local, email_domain: domain };
            },
          ),
        });

        expect(focusOf(d, "displayName").get()).toBe("Yui Minamorl");
        expect(focusOf(d, "age").get()).toBe(18);
        expect(focusOf(d, "email").get()).toBe("yui@example.com");
      });

      it("should silently noop when writing to RO focus", () => {
        const state = lay(initialRow);
        const d = decompose(state, {
          displayName: roLens<Row, string>(
            (r) => `${r.first_name} ${r.last_name}`,
          ),
        });

        focusOf(d, "displayName").set("Whatever");
        // 何も変わらない（noopマーク戦略）
        expect(state.get().first_name).toBe("Yui");
        expect(state.get().last_name).toBe("Minamorl");
      });

      it("should propagate RW lens writes back to root entity", () => {
        const state = lay(initialRow);
        const d = decompose(state, {
          email: rwLens<Row, string>(
            (r) => `${r.email_local}@${r.email_domain}`,
            (r, e) => {
              const [local, domain] = e.split("@");
              return { ...r, email_local: local, email_domain: domain };
            },
          ),
        });

        focusOf(d, "email").set("aoi@minamorl.com");
        expect(state.get().email_local).toBe("aoi");
        expect(state.get().email_domain).toBe("minamorl.com");
      });
    });

    describe("real use case: DB row → multi-view domain", () => {
      // 「DB row をドメインオブジェクトに変換する」マッピング層を
      // 一切書かずに、複数の視点（user / view / api response）を
      // 同じ実体に被せるシナリオ。
      it("should expose 3 views on the same entity without copying", () => {
        const state = lay(initialRow);

        const userView = decompose(state, {
          id: rwLens<Row, number>(
            (r) => r.id,
            (r, v) => ({ ...r, id: v }),
          ),
          fullName: roLens<Row, string>(
            (r) => `${r.first_name} ${r.last_name}`,
          ),
        });

        const adminView = decompose(state, {
          email: rwLens<Row, string>(
            (r) => `${r.email_local}@${r.email_domain}`,
            (r, e) => {
              const [l, d] = e.split("@");
              return { ...r, email_local: l, email_domain: d };
            },
          ),
          age: roLens<Row, number>((r) => 2026 - r.birth_year),
        });

        const apiView = decompose(state, {
          // APIレスポンスのキャメルケース変換
          firstName: rwLens<Row, string>(
            (r) => r.first_name,
            (r, v) => ({ ...r, first_name: v }),
          ),
          lastName: rwLens<Row, string>(
            (r) => r.last_name,
            (r, v) => ({ ...r, last_name: v }),
          ),
        });

        // 3視点とも同じ実体を観測している
        expect(focusOf(userView, "fullName").get()).toBe("Yui Minamorl");
        expect(focusOf(adminView, "age").get()).toBe(18);
        expect(focusOf(apiView, "firstName").get()).toBe("Yui");

        // adminView 経由で email を書き換えると、userView の fullName は
        // 不変だが、内部実体は更新されている
        focusOf(adminView, "email").set("aoi@rainpulse.com");
        expect(state.get().email_local).toBe("aoi");
        expect(focusOf(adminView, "email").get()).toBe("aoi@rainpulse.com");

        // apiView 経由で名前を書き換えると、userView の fullName が反映
        focusOf(apiView, "firstName").set("Aoi");
        expect(focusOf(userView, "fullName").get()).toBe("Aoi Minamorl");
      });

      it("should let RO views observe changes from other RW views", () => {
        const state = lay(initialRow);
        const d = decompose(state, {
          fullName: roLens<Row, string>(
            (r) => `${r.first_name} ${r.last_name}`,
          ),
        });

        const seen: string[] = [];
        focusOf(d, "fullName").reflect((v) => seen.push(v));

        state.using("first_name").set("Aoi");
        state.using("last_name").set("Rainpulse");

        expect(seen).toEqual(["Aoi Minamorl", "Aoi Rainpulse"]);
      });

      it("should preserve monoid law: ro-set followed by rw-set ≡ rw-set alone", () => {
        const stateA = lay(initialRow);
        const stateB = lay(initialRow);

        const dA = decompose(stateA, {
          fullName: roLens<Row, string>(
            (r) => `${r.first_name} ${r.last_name}`,
          ),
          firstName: rwLens<Row, string>(
            (r) => r.first_name,
            (r, v) => ({ ...r, first_name: v }),
          ),
        });
        const dB = decompose(stateB, {
          firstName: rwLens<Row, string>(
            (r) => r.first_name,
            (r, v) => ({ ...r, first_name: v }),
          ),
        });

        // A: noop → real-set
        focusOf(dA, "fullName").set("XXX");
        focusOf(dA, "firstName").set("Aoi");

        // B: real-set のみ
        focusOf(dB, "firstName").set("Aoi");

        expect(stateA.get()).toEqual(stateB.get());
      });
    });

    describe("fromFocus (CrayLike interface)", () => {
      it("should expose tag and basic get/set", () => {
        const state = lay({ count: 0 });
        const cray = fromFocus(state.using("count"));

        expect(cray.tag).toBe("cray-like");
        expect(cray.get()).toBe(0);

        cray.set(5);
        expect(state.get().count).toBe(5);
        expect(cray.get()).toBe(5);
      });

      it("should support map for read-only derivation", () => {
        const state = lay({ count: 10 });
        const cray = fromFocus(state.using("count"));
        const isPositive = cray.map((n) => n > 0);

        expect(isPositive.get()).toBe(true);
        state.using("count").set(-3);
        expect(isPositive.get()).toBe(false);

        // map 由来は backward 未定義 → set は noop
        isPositive.set(true as unknown as boolean); // 何も起きない
        expect(state.get().count).toBe(-3);
      });

      it("should support contramap for write-side transformation", () => {
        const state = lay({ name: "yui" });
        const cray = fromFocus(state.using("name")).contramap((s) =>
          s.toUpperCase(),
        );

        cray.set("aoi");
        expect(state.get().name).toBe("AOI");
        // get は変換しない（contramap は書き込み側のみ）
        expect(cray.get()).toBe("AOI");
      });

      it("should chain map: cray.map(f).map(g) ≡ cray.map(g∘f)", () => {
        const state = lay({ n: 3 });
        const cray = fromFocus(state.using("n"));

        const a = cray.map((x) => x * 2).map((x) => x + 1);
        const b = cray.map((x) => x * 2 + 1);

        expect(a.get()).toBe(b.get());
        expect(a.get()).toBe(7);
      });

      it("real use case: validation pipeline (Cray互換のlift相当)", () => {
        // Cray の `lift((age: number) => age >= 18)` 相当を
        // CrayLike.map で組み立てる
        const state = lay(initialRow);
        const d = decompose(state, {
          age: roLens<Row, number>((r) => 2026 - r.birth_year),
        });
        const ageCray = fromFocus(focusOf(d, "age"));
        const isAdult = ageCray.map((age) => age >= 18);

        expect(isAdult.get()).toBe(true);

        // 実体側の birth_year が変わると validation 結果も変わる
        state.using("birth_year").set(2015);
        expect(isAdult.get()).toBe(false);
      });
    });

    describe("usingLens ≡ decompose+focusOf (sugar identity)", () => {
      it("should produce equivalent focuses", () => {
        const state = lay(initialRow);
        const lens = roLens<Row, string>(
          (r) => `${r.first_name} ${r.last_name}`,
        );

        const viaSugar = state.usingLens(lens);
        const viaCore = focusOf(decompose(state, { name: lens }), "name");

        expect(viaSugar.get()).toBe(viaCore.get());

        state.using("first_name").set("Aoi");
        expect(viaSugar.get()).toBe(viaCore.get());
      });
    });
  });
});
