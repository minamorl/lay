# @minamorl/lay

A minimal deep-lens state management library for TypeScript. Zero dependencies. Optional React bindings.

`lay` creates a reactive state container with **composable focus** — zoom into nested properties, subscribe to granular changes, and update deeply nested state without touching siblings.

## Install

```bash
npm install @minamorl/lay
```

## Core Concept

```typescript
import { lay } from "@minamorl/lay";

// Create a reactive state container
const state = lay({ user: { name: "Alice", age: 30 }, count: 0 });

// Focus into nested properties (deep lens)
const nameFocus = state.using("user").using("name");
nameFocus.get();  // "Alice"
nameFocus.set("Bob");
state.get();      // { user: { name: "Bob", age: 30 }, count: 0 }

// Subscribe to only the focused path
const unsub = nameFocus.reflect((name) => {
  console.log("name changed:", name);
});

state.using("count").set(1);                    // listener NOT called
state.using("user").using("name").set("Carol"); // listener called with "Carol"

unsub(); // cleanup
```

## API

### `lay<S>(initial: S): Focus<S>`

Creates a reactive state container.

### `Focus<S>`

```typescript
interface Focus<S> {
  get(): S;
  set(value: S): void;
  update(f: (s: S) => S): void;
  using<K extends keyof S>(key: K): Focus<S[K]>;
  reflect(listener: Listener<S>, comparator?: Comparator<S>): () => void;
}
```

| Method | Description |
|--------|-------------|
| `get()` | Read current value |
| `set(value)` | Replace value, notify relevant listeners |
| `update(fn)` | Transform value via function |
| `using(key)` | Create a derived Focus on a nested property. Works recursively and supports numeric indices for arrays. |
| `reflect(listener, comparator?)` | Subscribe to changes. Listener fires **only when this specific path changes**, not on sibling mutations. Returns an unsubscribe function. |

### Custom Comparator

By default, `reflect` uses `===` to detect changes. Pass a custom comparator to control when listeners fire:

```typescript
const sameLength = (a: string, b: string) => a.length === b.length;
nameFocus.reflect(listener, sameLength);
nameFocus.set("Clara"); // same length as "Alice" → NOT fired
nameFocus.set("Bo");    // different length → fired
```

### Array Support

```typescript
const state = lay({ items: ["a", "b", "c"] });
const first = state.using("items").using(0);
first.get();  // "a"
first.set("x");
state.get();  // { items: ["x", "b", "c"] }
```

## React Bindings

```bash
npm install @minamorl/lay react
```

```tsx
import { lay } from "@minamorl/lay";
import { useFocus } from "@minamorl/lay/react";

const state = lay({ count: 0, name: "Alice" });

function Counter() {
  const count = useFocus(state.using("count"));
  return <div>{count}</div>;
}
// Re-renders only when `count` changes, not when `name` changes.
```

### `useFocus<S>(focus: Focus<S>, comparator?: Comparator<S>): S`

React hook that subscribes to a Focus and returns its current value. Automatically cleans up on unmount.

## Design

- Single flat subscription set at the root — no nested stores or contexts
- Each `using(key)` creates a closure-based getter/setter pair, not a new store
- On mutation, all subscriptions check their own path via their getter and comparator
- Zero runtime dependencies. React is an optional peer dependency.

## License

MIT
