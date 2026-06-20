---
name: huuma-ui-i18n
description: Adding translations and multilingual routing to a Huuma UI app with setupI18n, useI18n middleware, and the T component.
---

# Huuma UI i18n

Use this skill when the agent is adding translations, multilingual routing, or locale-dependent text in a Huuma UI app.

## Setup

- Configure i18n with `setupI18n(options)` from `@huuma/ui/i18n`.
- Install the i18n middleware with `useI18n()` from `@huuma/ui/i18n/middleware` so URLs are prefixed with `/<lang>`.
- Define languages, default language, and translation dictionaries. See the README "Internationalization (i18n)" section for a full `setupI18n` + `useI18n` example.

## URL structure

- All localized URLs must lead with `/<lang>`.
- Requests without a language prefix may be redirected or throw, depending on middleware configuration.
- Route definitions in `app/` are language-agnostic; the language prefix is handled by middleware.

## Translations

- Server components use `$t()` or `<T name="key" />`.
- Islands use `$t`, `$activeLang`, and `$languages`.
- Nested keys are dot-separated: `name="a.b.c"` resolves `a.b.c` in the dictionary.
- Interpolation uses `{{param}}` syntax: `<T name="greeting" props={{ name: "World" }} />`.

## Active language

- `$activeLang` gives the current language.
- `$languages` gives the configured languages.
- Use these in UI to render language switchers or conditional content.

## Dangerously inner HTML

- Some variants support a `dangerouslyInnerHTML` prop for raw HTML translations.
- Use only when the translation content is trusted, to avoid XSS.

## Files to reference

- `@huuma/ui/i18n` — core i18n API (`setupI18n`, `T`, `$t`, `$activeLang`, `$languages`). Inspect with `deno doc jsr:@huuma/ui/i18n`.
- `@huuma/ui/i18n/middleware` — language-prefix middleware (`useI18n`). Inspect with `deno doc jsr:@huuma/ui/i18n/middleware`.

## Things to check

- `useI18n` middleware is registered before localized routes are served.
- Translation keys match the dictionary structure.
- URL helpers (`$url`, `$route`) respect the active language prefix.
- Client-side language switching triggers the expected navigation/re-render.
