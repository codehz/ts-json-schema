# Copilot / AI Agent Instructions for `ts-json-schema`

This document provides project-specific guidance to help an AI coding agent be instantly productive in this repo.

Big-picture

- Source lives in `src/` (`compiler.ts`, `utils.ts`, `types.ts`, `index.ts`).
- Purpose: Convert a TypeScript 7.1 `Type` from `typescript/async` into JSON Schema using `await compile(type, checker)`.
- Build: Compiled with `tsdown` into ESM/CJS + DTS according to `tsdown.config.ts` and `tsconfig.build.json`.

Key files

- `src/compiler.ts` — Implementation. Focus here for features and bug fixes.
- `README.md` — Usage examples and supported JSDoc tags. Use as the authoritative sample and to include examples in PRs.
- `tsdown.config.ts`, `tsconfig.build.json`, `tsconfig.json` — Build & type-check configuration.
- `package.json` — Build & dev scripts (see section below).

Developer workflows / commands

- Install: `bun i` (project uses Bun, dev dependencies include `tsdown` and `typescript`).
- Type-check: `bunx tsc --noEmit` (script: `typecheck`).
- Build: `bunx tsdown -c tsdown.config.ts` (script: `build`). Declarations use `dts.tsgo` because TypeScript 7 has no legacy compiler API. That requires devDependency `@typescript/native-preview` aliased to the same `typescript` version.
- Local test run: `bun test`. Tests create a real `API` / `Program` from `typescript/async` and dispose both.

Project patterns & conventions (code-level)

- Uses the TypeScript 7.1 async Compiler API (`typescript/async`). Checker methods such as `getPropertiesOfType`, `getTypeOfSymbol`, `isArrayType`, `getTypeArguments`, `isTupleType`, and `typeToString` return promises. `Type#getTypes`, `getSymbol`, and `getAliasSymbol` do too.
- JSDoc tags: `@minimum`, `@maximum`, `@multipleOf`, `@minLength`, `@maxLength`, `@pattern`, `@format`, `@minItems`, `@maxItems`, `@default`, `@integer` are parsed and applied to the generated schema. Keep this in mind when adding constraints.
- Symbol vs alias symbol: `(await type.getSymbol()) ?? (await type.getAliasSymbol())`. Do not read `type.aliasSymbol`; that field is not on the public async `Type`.
- Optional property detection: `prop.flags & SymbolFlags.Optional`. Optional properties are compiled with `ignoreUndefinedInUnion` so `T | undefined` unwraps. `prop.name` replaces `prop.getName()`.
- Default value parsing: The `@default` tag attempts `JSON.parse` and falls back to a string value — stay consistent if you add more tag parsing logic.
- JSDoc text is already a string: `tag.text` and `symbol.getDocumentationComment(checker)`, not `SymbolDisplayPart[]`.
- Unsupported types still throw. The message includes `await typeChecker.typeToString(type)`.

When editing `index.ts` for new TypeScript features

- Update README: If you add support for new type features, include an example input TypeScript interface + expected JSON Schema output in `README.md`.
- Add tests: Create unit tests to assert the expected schema for new features. Pick a test runner and add to package scripts.
- Follow existing patterns: Use `extractJSDocTags`, `applyJSDocTags`, and `getDescription` helpers to set schema metadata.
- Performance & recursion: `compile` is recursive; if adding more complex types (e.g. recursive types), add cycle detection or depth limits to prevent infinite recursion.

Debugging tips

- `await typeChecker.typeToString(type)` is the human-readable description used in unsupported-type errors.
- For manual testing, follow the `typescript/async` snippet in `README.md`: `new API()`, `createProgram`, `program.getProject().checker`, `await compile(...)`, then `program.dispose()` and `api.close()`.
- If JSDoc tags don't appear, inspect `await symbol.getJsDocTags(checker)` and `await symbol.getDocumentationComment(checker)`.

Suggested PR checklist for AI agents

1. Add a focused unit test for the change (or a manual example in README if test harness not configured).
2. Update the README usage example when behavior changes or new features are added.
3. Add or update TypeScript types when the JSON Schema structure changes.
4. Run `bunx tsc --noEmit` and `bunx tsdown -c tsdown.config.ts` before opening a PR.

Examples

- Use `compile()` directly (from README):
  - Build a `Program` with `API` from `typescript/async`, obtain `program.getProject().checker`, find the `InterfaceDeclaration`, `await compile(type, checker)`.
- The Person interface example demonstrates property-level JSDoc tags and results.

Edge cases and non-goals

- This repository intentionally does NOT support cross-file type inference, intersection types, tuples, complex union types, generics, and certain advanced TS features; the code throws descriptive errors for unsupported cases.
- Avoid changes that silently alter semantics (e.g. mapping `undefined` to `null`) without explicit tests and README updates.

If you need anything else

- Propose additions for tests and CI, including a recommended test harness and a short set of tests that assert the library’s core behaviors (primitive types, JSDoc tags, arrays, object `required` detection, literal unions -> `enum`).
