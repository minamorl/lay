# Changelog

All notable changes to `@minamorl/lay` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-26

Adds **Traversal**: the lens algebra extends from "exactly one focus" to
"zero or more foci", closing the gap between row-projection and
collection-projection.

### Added

- **`Traversal<S, A>`** — discriminated union with `kind: 'rw' | 'ro'`,
  parallel to `Lens<S, A>` but with `get: S => A[]` and
  `set: (S, A[]) => S`. Writes with mismatched length are **silently
  no-op** (preserving monoid laws under traversal composition).
- **`rwTraversal(get, set)`** / **`roTraversal(get)`** — builders.
- **`arrayTraversal<A>()`** — standard traversal over every element of
  an array (`Traversal<A[], A>`).
- **`filteredTraversal<A>(predicate)`** — narrows a traversal to elements
  satisfying a predicate. Writes back only into matching positions; non-
  matching positions remain unchanged.
- **`Focus.eachOf(traversal)`** — produce `Focus<A>[]` from a traversal.
  Each element-focus carries write-back propagation to the parent state,
  with `reflect` notifying on element-level updates.
- **`Focus.atIndex(i)`** (sugar) — single-element lens for arrays.
  Out-of-range writes are no-op.

### Composition Laws Preserved

- `eachOf` followed by `usingLens` composes cleanly: traversal element
  focuses behave identically to direct field focuses on cloned rows.
- Length-mismatch detection between `get` and `set` keeps traversal
  composition associative under structural mutation of the parent.
- `eachOf` followed by `decompose` produces multi-row, multi-view
  observations (e.g. `users[].displayName` + `users[].isAdult`) without
  intermediate copies.

### Tests

- 12 new tests covering: array traversal read/write/notify, atIndex sugar
  with out-of-range no-op, filteredTraversal positional write-back,
  nested `using('users').eachOf(...)`, RO traversal silent-noop, length-
  mismatch noop, traversal × decompose composition, and `fromFocus` on
  traversal elements.
- Total test count: **73** (up from 61), plus 5 React tests = **78/78 pass**.
- TypeScript `tsc --noEmit`: clean.

## [1.0.0] - 2026-04-26

First stable release. Lay graduates from a deep-lens state container into a
full **observation algebra** for arbitrary objects.

### Added

- **`Lens<S, A>`** — discriminated union with `kind: 'rw' | 'ro'` for explicit
  read/write capability tracking at the type level.
  - `rwLens(get, set)` — bidirectional lens for fields with well-defined
    backward semantics.
  - `roLens(get)` — read-only lens for computed/derived fields.
  - Writes to read-only lenses are **silently no-op** (not an error), preserving
    monoid laws under lens composition: `set_ro ; set_rw ≡ set_rw`.
- **`Focus.usingLens(lens)`** — generalization of `using(key)` that accepts an
  arbitrary lens (rw or ro) instead of a literal key. Composable with `using`.
- **`decompose(focus, lensMap?)`** — factor an object into an indexed bundle of
  observations.
  - With no `lensMap`: auto-generates `rwLens` for every plain field of the
    state. Equivalent to making the object fully observable via the algebra.
  - With explicit `lensMap`: produces a `Decomposition<S, M>` whose `focuses`
    field carries per-key `Focus<A>` instances with type-level key→value
    inference (`M[K] extends Lens<S, infer A> ? Focus<A> : never`).
- **`focusOf(decomposition, key)`** — extract a single `Focus<A>` from a
  decomposition. Type-safe with respect to the lens map.
- **`fromFocus(focus)`** — adapter to a Cray-compatible interface
  (`CrayLike<A>`) carrying `get`, `set`, `map`, `contramap` without depending on
  Cray itself. Satisfies the functor composition law:
  `fromFocus(f).map(g).map(h) ≡ fromFocus(f).map(h ∘ g)`.

### Changed

- Internal `createFocus` now accepts a nullable setter to encode read-only
  capability and propagate writability through nested foci.
- Vitest config now sets `process.env.NODE_ENV = 'development'` so React tests
  run against the development build (`act()` requires it).

### Theoretical foundations

This release crystallizes Lay's design into three composable layers:

1. **Lens algebra** — RW/RO lenses with monoid-preserving composition.
2. **Decomposition** — presheaf-style indexed observation bundles over a single
   underlying entity.
3. **Cray-compatible projection** — exit point to downstream effect/distributed
   computation systems via `fromFocus`.

Together these eliminate the traditional "mapping layer" between persistence,
domain, DTO, and view models: a single entity can be observed through many
lens bundles without copies and without transformation code.

### Migration from 0.0.x

No breaking changes for existing `lay()`, `using(key)`, `reflect()`, `useFocus`
users. All new APIs are additive. The version bump to 1.0.0 reflects API
stability commitment, not breaking changes.

## [0.0.2] - prior

Initial public release as deep-lens state container with `using(key)` and
React `useFocus` binding.
