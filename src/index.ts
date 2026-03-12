// @minamorl/lay - Deep Lens state management
export type Listener<S> = (s: S) => void;
export type Comparator<S> = (prev: S, next: S) => boolean;

export interface Focus<S> {
  get(): S;
  set(value: S): void;
  update(f: (s: S) => S): void;
  using<K extends keyof S>(key: K): Focus<S[K]>;
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
    setter: (v: T) => void,
  ): Focus<T> => ({
    get: getter,
    set: (v) => {
      setter(v);
      notify();
    },
    update: (f) => {
      setter(f(getter()));
      notify();
    },
    using: <K extends keyof T>(key: K) =>
      createFocus(
        () => getter()[key],
        (v) => {
          const current = getter();
          if (Array.isArray(current)) {
            const newArr = [...current] as T;
            (newArr as unknown as T[K][])[key as unknown as number] = v;
            setter(newArr);
          } else {
            setter({ ...current, [key]: v });
          }
        },
      ),
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
  });

  return createFocus(
    () => state,
    (v) => {
      state = v;
    },
  );
};
