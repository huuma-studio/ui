---
name: huuma-ui-signals-and-state
description: Managing reactive state in Huuma UI islands with signals, computed values, effects, and lifecycle hooks.
---

# Huuma UI Signals & State

Use this skill when the agent is managing reactive state, computed values, side effects, or component lifecycle inside a Huuma UI island.

## Signals

- Create a signal with `$signal(initialValue)` from `@huuma/ui/hooks/signal`.
- Read with `.get()`.
- Write with `.set(newValue)`.
- `.set()` short-circuits when the new value is `===` to the current value (behavior of `@huuma/ui/signal`).
- Signals work only in sync island scope (see `huuma-ui-islands-interactivity`).
- Read a signal _without_ subscribing to it by wrapping the read in `untracked(() => s.get())` from `@huuma/ui/signal`. Use it inside effects/computed when you need the current value of a signal without creating a dependency (e.g. logging, conditional bookkeeping, reading a ref-like value that shouldn't trigger re-runs).

## Computed

- Create a derived value with `$computed(() => ...)`.
- Reads via `.get()` and updates automatically when dependencies change.
- Keep computed callbacks pure and free of side effects.

## Effects

- Run side effects with `$effect(() => { ... })`.
- An effect callback can return a cleanup function.
- Effects automatically track signal dependencies and re-run when they change.

## Lifecycle hooks

- `$mount(fn)` — runs when the component mounts; return a cleanup function for destroy.
- `$destroy(fn)` — runs when the component is destroyed.
- Both are exported from `@huuma/ui/hooks/lifecycle` (see the README "Lifecycle Hooks" section for a `$mount` example).

## Signals vs refs

| Feature          | Signal              | Ref                   |
| ---------------- | ------------------- | --------------------- |
| Read             | `.get()`            | `.get` (property)     |
| Write            | `.set(value)`       | `.set` (setter)       |
| Reactive updates | yes                 | no — direct reference |
| Equality check   | `===` short-circuit | none                  |

Refs are for direct DOM/element handles; signals are for reactive state.

## Common mistakes to catch

- Calling `.get` without parentheses on a signal.
- Calling `.get()` on a ref.
- Using `$signal`/`$effect` inside an `async` function or after `await`.
- Mutating signal value directly instead of calling `.set`.
- Reading a signal inside an `$effect`/`$computed` purely for its current value, unintentionally adding a dependency — wrap such reads in `untracked(() => s.get())` (`@huuma/ui/signal`).
