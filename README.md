# @minamorl/lay

> **A lens algebra for TypeScript.** Zero dependencies. Optional React bindings.

`lay` is not a state management library. It's a small, principled algebra of **observation**: lenses you can compose, lens bundles you can layer onto any object, and a writeback discipline that makes the equation _"data = its observations"_ actually executable in TypeScript.

The practical consequence: **mapping layers disappear.** No more `User.fromRow(row)`, no more `toUserDTO(user)`, no more `toViewModel(domain)`. One physical entity, infinitely many composable views.

```
DB row → Domain → DTO → ViewModel        │  same row
       ↑       ↑      ↑                  │   ↑↓ lens bundle A (domain)
   mapper   mapper  mapper               │   ↑↓ lens bundle B (api)
                                         │   ↑↓ lens bundle C (view)
   traditional layered architecture      │   lay: layered observation, single entity
```

## Install

```bash
npm install @minamorl/lay
```

## Table of Contents

- [Quick Start](#quick-start)
- [Core Concept: Composable Focus](#core-concept-composable-focus)
- [Lens Algebra: `rwLens` and `roLens`](#lens-algebra-rwlens-and-rolens)
- [`decompose`: Layered Observation](#decompose-layered-observation)
- [`fromFocus`: Bridging to Cray-style Pipelines](#fromfocus-bridging-to-cray-style-pipelines)
- [Real-World Example: DB Row → Multiple Views](#real-world-example-db-row--multiple-views)
- [React Bindings](#react-bindings)
- [Theory: Why Lay Works](#theory-why-lay-works)
- [API Reference](#api-reference)
- [Design Notes](#design-notes)

---

## Quick Start

```typescript
import { lay } from "@minamorl/lay";

const state = lay({ user: { name: "Alice", age: 30 }, count: 0 });

// Zoom into a deeply nested field
const nameFocus = state.using("user").using("name");
nameFocus.get();         // "Alice"
nameFocus.set("Bob");
state.get();             // { user: { name: "Bob", age: 30 }, count: 0 }

// Subscribe to a focused path
const unsub = nameFocus.reflect((name) => console.log("name:", name));

state.using("count").set(1);                     // listener NOT called
state.using("user").using("name").set("Carol");  // listener called with "Carol"
unsub();
```

---

## Core Concept: Composable Focus

A `Focus<S>` is a reactive cursor pointing at a value of type `S` somewhere inside a larger entity. Focuses compose:

```typescript
const state    = lay({ users: [{ name: "Alice" }, { name: "Bob" }] });
const userList = state.using("users");          // Focus<User[]>
const second   = userList.using(1);             // Focus<User>
const name     = second.using("name");          // Focus<string>

name.set("Robert");
state.get(); // { users: [{ name: "Alice" }, { name: "Robert" }] }
```

`using(key)` is the static, type-safe form. For computed properties, projections, and read-only views, you use **lenses**.

---

## Lens Algebra: `rwLens` and `roLens`

A lens is a getter/setter pair. Lay distinguishes two kinds:

```typescript
import { rwLens, roLens } from "@minamorl/lay";

// Read-write: split a string into first/last name on writeback
const fullName = rwLens(
  (u: User) => `${u.firstName} ${u.lastName}`,
  (u, v: string) => {
    const [first, ...rest] = v.split(" ");
    return { ...u, firstName: first, lastName: rest.join(" ") };
  }
);

// Read-only: a derived value with no meaningful inverse
const ageFromBirth = roLens(
  (u: User) => new Date().getFullYear() - u.birthYear
);
```

Apply a lens to a focus with `usingLens`:

```typescript
const userFocus = state.using("user");
const fullNameFocus = userFocus.usingLens(fullName);

fullNameFocus.get();             // "Alice Smith"
fullNameFocus.set("Bob Jones");  // splits and writes back to firstName/lastName

const ageFocus = userFocus.usingLens(ageFromBirth);
ageFocus.get();                  // 30
ageFocus.set(99);                // silently no-op (RO lens)
```

### Why `roLens` writes are no-ops, not errors

Writing to a computed property has no canonical inverse. Three options exist:

1. **Throw** — breaks lens composition laws; one bad lens in a chain aborts the whole pipeline.
2. **Guess** — silent ambiguity, undebuggable.
3. **No-op** — write becomes the identity element. Composition stays clean.

Lay chooses (3). This makes RO writes the **identity in the monoid of writes**:

```
∀ chain: (writeNoop ; writeReal) ≡ writeReal
```

You can pipe RO and RW lenses together without special cases.

---

## `decompose`: Layered Observation

`decompose` is the heart of v1.0. It takes a focus and a **lens bundle** (a record of named lenses) and returns a structured view:

```typescript
import { lay, decompose, focusOf, rwLens, roLens } from "@minamorl/lay";

const state = lay({
  first_name: "Alice",
  last_name:  "Smith",
  birth_year: 1996,
  role_bits:  0b011,  // user + admin
});

const view = decompose(state, {
  fullName: rwLens(
    r => `${r.first_name} ${r.last_name}`,
    (r, v) => {
      const [f, ...rest] = v.split(" ");
      return { ...r, first_name: f, last_name: rest.join(" ") };
    }
  ),
  age:      roLens(r => new Date().getFullYear() - r.birth_year),
  isAdmin:  rwLens(
    r => (r.role_bits & 0b010) !== 0,
    (r, v) => ({ ...r, role_bits: v ? r.role_bits | 0b010 : r.role_bits & ~0b010 })
  ),
});

const nameFocus = focusOf(view, "fullName");
const ageFocus  = focusOf(view, "age");
const adminFocus = focusOf(view, "isAdmin");

nameFocus.get();   // "Alice Smith"
ageFocus.get();    // 30
adminFocus.get();  // true

nameFocus.set("Bob Jones");
state.get();       // { first_name: "Bob", last_name: "Jones", birth_year: 1996, role_bits: 3 }
```

Without a lens bundle, `decompose(state)` auto-generates `rwLens` for every plain property. Plain decomposition is the implicit identity bundle.

### The Equation

```
state.usingLens(lens)  ≡  focusOf(decompose(state, { k: lens }), "k")
```

`usingLens` is sugar for the singleton case of `decompose`. They are the same operation at different scales.

---

## `fromFocus`: Bridging to Cray-style Pipelines

`fromFocus` adapts a `Focus<A>` to a `CrayLike<A>` interface — a small read/write/map/contramap object suitable for pipeline-style composition (e.g. with [`@minamorl/cray`](https://github.com/minamorl/cray)).

```typescript
import { fromFocus } from "@minamorl/lay";

const ageFocus = focusOf(view, "age");
const ageCray  = fromFocus(ageFocus);

const isAdult = ageCray.map(a => a >= 18);
isAdult.get(); // true

// Functor laws hold
ageCray.map(f).map(g)  ≡  ageCray.map(x => g(f(x)))
```

`CrayLike<A>` does not require `@minamorl/cray` as a dependency. Lay stays self-contained; Cray (or any compatible consumer) can pick `fromFocus` up.

---

## Real-World Example: DB Row → Multiple Views

This is the canonical use case Lay was built for. Suppose Kysely returns:

```typescript
type Row = {
  id: number;
  first_name: string;
  last_name: string;
  email_local: string;
  email_domain: string;
  birth_year: number;
  role_bits: number;
};

const row = await db.selectFrom("users").selectAll().where("id", "=", 1).executeTakeFirstOrThrow();
const state = lay(row); // no mapping. row is the entity.
```

Now define **three coexisting views** — domain, API, and admin — over the **same physical row**:

```typescript
const domainView = decompose(state, {
  fullName: rwLens(
    r => `${r.first_name} ${r.last_name}`,
    (r, v) => {
      const [f, ...rest] = v.split(" ");
      return { ...r, first_name: f, last_name: rest.join(" ") };
    }
  ),
  email: rwLens(
    r => `${r.email_local}@${r.email_domain}`,
    (r, v) => {
      const [local, domain] = v.split("@");
      return { ...r, email_local: local, email_domain: domain };
    }
  ),
  age: roLens(r => new Date().getFullYear() - r.birth_year),
});

const apiView = decompose(state, {
  id:       rwLens(r => r.id, (r, v) => ({ ...r, id: v })),
  name:     focusOf(domainView, "fullName"),  // reuse the domain lens
  email:    focusOf(domainView, "email"),
});

const adminView = decompose(state, {
  isAdmin: rwLens(
    r => (r.role_bits & 0b010) !== 0,
    (r, v) => ({ ...r, role_bits: v ? r.role_bits | 0b010 : r.role_bits & ~0b010 })
  ),
});
```

**Properties:**

- All three views observe the **same underlying row**. No copies.
- `focusOf(domainView, "fullName").set("Yui Sama")` updates `first_name` and `last_name`, and the change is visible from `apiView.name` instantly.
- `focusOf(adminView, "isAdmin").set(true)` flips a single bit in `role_bits` without touching any other field.
- The traditional `Row → DomainObject → DTO → ViewModel` mapping pipeline — gone. ~20–30% of typical full-stack TypeScript code is physically eliminated.

---

## React Bindings

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

`useFocus` works with any Focus, including those produced by `usingLens`, `decompose`, and `focusOf`:

```tsx
function FullNameDisplay() {
  const fullName = useFocus(state.usingLens(fullNameLens));
  return <h1>{fullName}</h1>;
}
```

---

## Theory: Why Lay Works

Lay is a TypeScript realization of three classical structures:

### 1. The Category of Lenses 𝓛

- **Objects:** types
- **Morphisms:** `Lens<S, A>`
- **Composition:** lens composition (realized as `using` / `usingLens` / `decompose`)
- **Identity:** the trivial lens `(s) ↦ s`

Lenses obey the well-known laws ([Foster et al., 2007](https://www.cis.upenn.edu/~bcpierce/papers/lenses-toplas-final.pdf)):

```
GetPut:  set(s, get(s))     = s
PutGet:  get(set(s, a))     = a
PutPut:  set(set(s, a), b)  = set(s, b)
```

For RO lenses, `set` is the constant identity, so all three laws hold trivially. RO lenses are the **identity element in the writeback monoid**.

### 2. Presheaves over 𝓛

Decomposition realizes a presheaf-like structure:

```
F : 𝓛^op → Set
F(L) = "the entity as seen through lens L"
```

The entity is fixed; observations vary over the lens category. This is the formal content of _"data = its observations"_.

### 3. Yoneda-flavored Identity

In Lay, an entity's identity is the totality of its lens-views:

```
state.value      — the physical entity
decompose(state) — the bundle of all observations
```

Two states with identical observations through every lens are observationally indistinguishable — Yoneda's lemma in operational form.

### What this buys you in practice

- **Mapping layers disappear.** Domain, DTO, ViewModel — all become lens bundles over the source.
- **Composition is associative and law-abiding.** RO lenses are identity, not exceptions.
- **Writeback is principled.** Where an inverse exists (rwLens), it's bidirectional; where it doesn't (roLens), it's a no-op, never a guess.
- **Reactivity is path-precise.** `reflect` fires only when the focused path actually changes.

---

## API Reference

### Construction

| Function | Signature | Description |
|---|---|---|
| `lay<S>(initial)` | `(s: S) => Focus<S>` | Create a reactive entity. |
| `rwLens(get, set)` | `(g, s) => Lens<S, A>` | Read-write lens. `set(s, a) => S`. |
| `roLens(get)` | `(g) => Lens<S, A>` | Read-only lens. Writes are no-ops. |

### Focus Methods

| Method | Description |
|---|---|
| `get()` | Read current value. |
| `set(value)` | Replace value. |
| `update(fn)` | Apply a function to the value. |
| `using(key)` | Static-key focus on a nested property (or array index). |
| `usingLens(lens)` | Apply a `Lens<S, A>` to obtain `Focus<A>`. |
| `reflect(listener, comparator?)` | Subscribe to changes on this focused path. Returns unsubscribe. |

### Decomposition

| Function | Signature | Description |
|---|---|---|
| `decompose(focus)` | `Focus<S> => Decomposition<S, auto>` | Auto-bundle: every plain field becomes an `rwLens`. |
| `decompose(focus, bundle)` | `(Focus<S>, LensMap<S>) => Decomposition<S, M>` | Explicit lens bundle. |
| `focusOf(d, key)` | `(Decomposition<S, M>, K) => Focus<A>` | Extract a single focus from a decomposition. |
| `fromFocus(focus)` | `Focus<A> => CrayLike<A>` | Adapt to Cray-compatible pipeline interface. |

### Custom Comparator

```typescript
const sameLength = (a: string, b: string) => a.length === b.length;
nameFocus.reflect(listener, sameLength);
nameFocus.set("Clara"); // same length as "Alice" → NOT fired
nameFocus.set("Bo");    // different length → fired
```

---

## Design Notes

- **Single flat subscription set** at the root — no nested stores, no contexts.
- Each `using(key)` / `usingLens(lens)` creates a closure-based getter/setter pair, **not a new store**.
- On mutation, every subscription checks its own focused path via its getter and comparator.
- **Zero runtime dependencies.** React is an optional peer dependency.
- ~300 lines of source. ~66 tests covering lens laws, RO no-op, decomposition, monoid identity, and React integration.

---

## What Lay is Not

- **Not Redux/Zustand/Recoil.** Those are state stores; Lay is a lens algebra. They could be implemented on top of Lay, not the other way round.
- **Not an ORM.** Lay doesn't talk to databases. It eliminates the mapping layer between database and application — a different concern.
- **Not Immer.** Immer optimizes immutable updates; Lay restructures the relationship between data and its observations.
- **Not a validation library.** Validation can sit on top of `fromFocus(focus).map(validate)`, but Lay itself is value-preserving.

---

## Versioning

- **v1.0.0** — Lens algebra (`rwLens`/`roLens`), `usingLens`, `decompose`/`focusOf`/`fromFocus`. The "mapping layer eliminator" release.
- **v0.0.x** — Early exploration: `lay` + `using` + `reflect`.

See [CHANGELOG.md](./CHANGELOG.md) for details.

---

## License

MIT © minamorl

---

> _"Data is the totality of its observations."_
