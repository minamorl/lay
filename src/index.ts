// @minamorl/lay - Deep Lens state management
export type Listener<S> = (s: S) => void;
export type Comparator<S> = (prev: S, next: S) => boolean;

/**
 * Lens<S, A> — get/setの束（observation）
 *
 * kind: 'rw' は双方向の意味のある観測（first_name+last_name のような分割が
 *       一意でないものは含めず、emailのように区切り規則が決定的なものに使う）
 * kind: 'ro' は意味論的にbackwardが定義できない計算プロパティ。
 *       set/update は静かにnoopになる（例外を投げず、合成則のモノイドの
 *       恒等元として振る舞う）
 */
export type Lens<S, A> =
  | { readonly kind: "rw"; get: (s: S) => A; set: (s: S, a: A) => S }
  | { readonly kind: "ro"; get: (s: S) => A };

export const rwLens = <S, A>(
  get: (s: S) => A,
  set: (s: S, a: A) => S,
): Lens<S, A> => ({ kind: "rw", get, set });

/**
 * 計算プロパティのための読み取り専用レンズ。
 * 「意味論的にbackwardが未定義 = noopとしてマークする」第一級の表現。
 */
export const roLens = <S, A>(get: (s: S) => A): Lens<S, A> => ({
  kind: "ro",
  get,
});

/**
 * Traversal<S, A> — 0個以上のフォーカスを同時に観測する射。
 *
 * Lensが「必ず1個」なのに対し、Traversalは「リスト的に複数」。
 * - kind: 'rw' は双方向。setに渡された配列の要素ごとに backward を適用する。
 * - kind: 'ro' は読み取り専用（roLensと同じく書き込みはnoop）。
 *
 * 書き込みのセマンティクス：
 *   set(s, as) は `as.length === get(s).length` のときのみ意味を持つ。
 *   長さ不一致は noop（合成則・モノイド則保存のため例外を投げない）。
 */
export type Traversal<S, A> =
  | {
      readonly kind: "rw";
      get: (s: S) => A[];
      set: (s: S, as: A[]) => S;
    }
  | { readonly kind: "ro"; get: (s: S) => A[] };

export const rwTraversal = <S, A>(
  get: (s: S) => A[],
  set: (s: S, as: A[]) => S,
): Traversal<S, A> => ({ kind: "rw", get, set });

export const roTraversal = <S, A>(
  get: (s: S) => A[],
): Traversal<S, A> => ({ kind: "ro", get });

/**
 * 配列の全要素に対する標準Traversal。
 * 書き戻しは要素単位の置換（長さ不一致時は noop）。
 */
export const arrayTraversal = <A>(): Traversal<A[], A> =>
  rwTraversal(
    (s) => [...s],
    (s, as) => (as.length === s.length ? [...as] : s),
  );

/**
 * 述語で絞った要素群に対するTraversal。
 * 書き戻しは「フィルタ後の配列と同じ長さ・順序」を期待する。
 */
export const filteredTraversal = <A>(
  predicate: (a: A) => boolean,
): Traversal<A[], A> =>
  rwTraversal(
    (s) => s.filter(predicate),
    (s, as) => {
      // フィルタ通過要素のみを順番にasで置換
      const filtered = s.filter(predicate);
      if (as.length !== filtered.length) return s; // noop: 長さ不一致
      let cursor = 0;
      return s.map((a) => (predicate(a) ? as[cursor++] : a));
    },
  );

export interface Focus<S> {
  get(): S;
  set(value: S): void;
  update(f: (s: S) => S): void;
  using<K extends keyof S>(key: K): Focus<S[K]>;
  /**
   * 任意のレンズでフォーカスを生成する。
   * ROレンズの場合、返されるFocusの set/update は noop になる。
   */
  usingLens<A>(lens: Lens<S, A>): Focus<A>;
  /**
   * Traversalで複数のフォーカスを同時に得る。
   * 各要素は親への書き戻しが伝播する独立したFocus<A>。
   * ROトラバーサル/書き込み不可Focusの場合は要素のsetはnoop。
   */
  eachOf<A>(traversal: Traversal<S, A>): Focus<A>[];
  /**
   * 配列要素への単一Lens（糖衣）。`S` が配列のときのみ意味を持つ。
   * 範囲外indexへの書き込みは noop、読み取りは undefined を返しうる。
   */
  atIndex<A>(this: Focus<A[]>, index: number): Focus<A>;
  reflect(listener: Listener<S>, comparator?: Comparator<S>): () => void;
}

type Subscription<T> = {
  getter: () => T;
  listener: Listener<T>;
  comparator: Comparator<T>;
  prevValue: T;
};

const defaultComparator = <T>(a: T, b: T): boolean => a === b;

export const lay = <S>(initial: S): Focus<S> => {
  let state = initial;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptions = new Set<Subscription<any>>();

  const notify = () => {
    for (const sub of subscriptions) {
      const currentValue = sub.getter();
      if (!sub.comparator(sub.prevValue, currentValue)) {
        sub.prevValue = currentValue;
        sub.listener(currentValue);
      }
    }
  };

  const createFocus = <T>(
    getter: () => T,
    setter: ((v: T) => void) | null,
  ): Focus<T> => {
    const writable = setter !== null;

    const safeSet = (v: T) => {
      if (!writable) return; // noop: ROレンズへの書き込みは静かに無視
      setter!(v);
      notify();
    };

    const safeUpdate = (f: (s: T) => T) => {
      if (!writable) return; // noop
      setter!(f(getter()));
      notify();
    };

    return {
      get: getter,
      set: safeSet,
      update: safeUpdate,
      using: <K extends keyof T>(key: K) =>
        createFocus(
          () => getter()[key],
          writable
            ? (v: T[K]) => {
                const current = getter();
                if (Array.isArray(current)) {
                  const newArr = [...current] as T;
                  (newArr as unknown as T[K][])[key as unknown as number] = v;
                  setter!(newArr);
                } else {
                  setter!({ ...current, [key]: v });
                }
              }
            : null,
        ),
      usingLens: <A>(lens: Lens<T, A>): Focus<A> => {
        if (lens.kind === "ro" || !writable) {
          // ROレンズ: setterはnull → 子Focusの書き込みは全てnoop
          return createFocus(() => lens.get(getter()), null);
        }
        // RWレンズ: forward=lens.get, backward=lens.set経由で親へ伝播
        return createFocus(
          () => lens.get(getter()),
          (a: A) => {
            const current = getter();
            const next = lens.set(current, a);
            setter!(next);
          },
        );
      },
      eachOf: <A>(traversal: Traversal<T, A>): Focus<A>[] => {
        const elements = traversal.get(getter());
        const length = elements.length;
        const isWritable = traversal.kind === "rw" && writable;

        return elements.map((_, index) => {
          // 各要素に対する個別のFocus
          // get: 現在の配列をtraversal.getで取り出してindex位置を返す
          // set: 該当indexだけ更新した配列をtraversal.setで親に書き戻す
          const elementGetter = () => {
            const current = traversal.get(getter());
            return current[index] as A;
          };

          if (!isWritable) {
            return createFocus<A>(elementGetter, null);
          }

          // ここでは traversal.kind === 'rw' が確定している（isWritableの定義より）
          const rwTrav = traversal as Extract<
            Traversal<T, A>,
            { kind: "rw" }
          >;
          const elementSetter = (a: A) => {
            const parent = getter();
            const arr = rwTrav.get(parent);
            // 長さが取得時と変わっていたらnoop（合成則保存）
            if (arr.length !== length) return;
            const next = [...arr];
            next[index] = a;
            const updatedParent = rwTrav.set(parent, next);
            setter!(updatedParent);
          };

          return createFocus<A>(elementGetter, elementSetter);
        });
      },
      atIndex: function <A>(this: Focus<A[]>, index: number): Focus<A> {
        // T が配列であることを前提とした糖衣。
        // 内部的には要素位置に対するrwLensを構築してusingLensに委譲する。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const self = this as unknown as Focus<any[]>;
        const indexLens: Lens<A[], A> = {
          kind: "rw",
          get: (s) => s[index] as A,
          set: (s, a) => {
            if (index < 0 || index >= s.length) return s; // noop: 範囲外
            const next = [...s];
            next[index] = a;
            return next;
          },
        };
        return self.usingLens(indexLens) as Focus<A>;
      },
      reflect: (listener: Listener<T>, comparator?: Comparator<T>) => {
        const sub: Subscription<T> = {
          getter,
          listener,
          comparator: comparator ?? defaultComparator,
          prevValue: getter(),
        };
        subscriptions.add(sub);
        return () => {
          subscriptions.delete(sub);
        };
      },
    };
  };

  return createFocus(
    () => state,
    (v) => {
      state = v;
    },
  );
};

// ============================================================
// decompose / focusOf / fromFocus
// ------------------------------------------------------------
// 「メッセージなオブジェクトを get/set 束に分解する」中心関数。
// usingLens は decompose+focusOf の糖衣構文として位置づけられる:
//   focus.usingLens(lens) ≡ focusOf(decompose(self, {k: lens}), k)
// ============================================================

/**
 * decompose の戻り値。 lensMap で渡されたキーごとに Focus を持つ束。
 * fields はオリジナル参照（recompose やデバッグ用）。
 */
// 共変な箱（bivariance hack回避）。値型は Lens<S, ?> の任意。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LensMap<S> = Record<string, Lens<S, any>>;

export interface Decomposition<S, M extends LensMap<S>> {
  readonly source: Focus<S>;
  readonly lenses: M;
  readonly focuses: {
    [K in keyof M]: M[K] extends Lens<S, infer A> ? Focus<A> : never;
  };
}

/**
 * オブジェクトをレンズ辞書で分解する。
 *
 * - 第2引数を省略すると、`source` の現在値の **プレーンなプロパティ** から
 *   自動的に rwLens を生成する（自動因数分解）。
 * - 明示的な lensMap を渡すと、計算プロパティ（roLens）や複合backward
 *   （rwLens）を含む任意の観測を一度に束ねられる。
 */
export function decompose<S extends object>(
  source: Focus<S>,
): Decomposition<S, AutoLensMap<S>>;
export function decompose<S, M extends LensMap<S>>(
  source: Focus<S>,
  lensMap: M,
): Decomposition<S, M>;
export function decompose<S, M extends LensMap<S>>(
  source: Focus<S>,
  lensMap?: M,
): Decomposition<S, M> {
  const lenses = (lensMap ?? autoLenses(source.get())) as M;
  const focuses = {} as {
    [K in keyof M]: M[K] extends Lens<S, infer A> ? Focus<A> : never;
  };
  for (const key of Object.keys(lenses) as (keyof M)[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lens = lenses[key] as Lens<S, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (focuses as any)[key] = source.usingLens(lens);
  }
  return { source, lenses, focuses };
}

type AutoLensMap<S> = {
  [K in keyof S & string]: Lens<S, S[K]>;
};

/**
 * プレーンオブジェクトから自動的に rwLens 辞書を作る。
 * 配列・関数・undefined のキーはスキップ（意味論が曖昧なため）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function autoLenses<S>(sample: S): Record<string, Lens<S, any>> {
  if (sample === null || typeof sample !== "object") return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, Lens<S, any>> = {};
  for (const key of Object.keys(sample as object)) {
    const k = key as keyof S & string;
    result[key] = rwLens(
      (s: S) => s[k],
      (s: S, a: S[typeof k]) =>
        Array.isArray(s)
          ? (() => {
              const arr = [...(s as unknown[])];
              (arr as unknown[])[Number(k)] = a;
              return arr as unknown as S;
            })()
          : ({ ...(s as object), [k]: a } as S),
    );
  }
  return result;
}

/**
 * Decomposition から単一の Focus を取り出す。
 */
export const focusOf = <S, M extends LensMap<S>, K extends keyof M>(
  d: Decomposition<S, M>,
  key: K,
): M[K] extends Lens<S, infer A> ? Focus<A> : never => d.focuses[key];

// ============================================================
// fromFocus — Cray互換の最小インターフェース
// ------------------------------------------------------------
// Lay は Cray に依存しないので、ここでは構造的互換のある CrayLike<A>
// だけを公開する。@minamorl/cray 側で `lift(focus.get)` などを通せば
// pipe / 関数合成に直接乗る。
// ============================================================

export interface CrayLike<A> {
  readonly tag: "cray-like";
  get(): A;
  set(a: A): void;
  map<B>(f: (a: A) => B): CrayLike<B>;
  contramap(f: (a: A) => A): CrayLike<A>;
}

/**
 * Focus を Cray互換の値に変換する。
 *
 * - get/set は元のFocusに委譲（書き込みは notify を伴う）
 * - map は **読み取り専用** な派生値（書き戻し未定義 → noop）
 * - contramap は書き込み時に変換を挟む（forward合成）
 *
 * これが Lay 側の最終端で、ここから先は Cray の世界に渡る。
 */
export const fromFocus = <A>(focus: Focus<A>): CrayLike<A> => ({
  tag: "cray-like",
  get: () => focus.get(),
  set: (a: A) => focus.set(a),
  map: <B>(f: (a: A) => B): CrayLike<B> => {
    const derived: CrayLike<B> = {
      tag: "cray-like",
      get: () => f(focus.get()),
      set: () => {
        // map由来は backward 未定義 → noop（noopマーク戦略）
      },
      map: <C>(g: (b: B) => C) => derived.map(g),
      contramap: () => derived,
    };
    // map のチェーンは合成して get を作り直す
    return {
      ...derived,
      map: <C>(g: (b: B) => C) =>
        fromFocus(focus).map((a) => g(f(a))),
    };
  },
  contramap: (g: (a: A) => A): CrayLike<A> => ({
    tag: "cray-like",
    get: () => focus.get(),
    set: (a: A) => focus.set(g(a)),
    map: <B>(h: (a: A) => B) => fromFocus(focus).map(h),
    contramap: (h: (a: A) => A) => fromFocus(focus).contramap((a) => h(g(a))),
  }),
});

