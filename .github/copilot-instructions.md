# Copilot / AI Agent Instructions for `ts-json-schema`

This document provides project-specific guidance to help an AI coding agent be instantly productive in this repo.

Big-picture
- Single-file library: `index.ts` is the only source file and contains the entire library implementation.
- Purpose: Convert TypeScript `ts.Type` (Compiler API) into JSON Schema objects using `compile(type, typeChecker)` and exported `JSONSchema` type.
- Build: Compiled with `tsdown` into ESM/CJS + DTS according to `tsdown.config.ts` and `tsconfig.build.json`.

Key files
- `index.ts` — Implementation. Focus here for features and bug fixes.
- `README.md` — Usage examples and supported JSDoc tags. Use as the authoritative sample and to include examples in PRs.
- `tsdown.config.ts`, `tsconfig.build.json`, `tsconfig.json` — Build & type-check configuration.
- `package.json` — Build & dev scripts (see section below).

Developer workflows / commands
- Install: `bun i` (project uses Bun, dev dependencies include `tsdown` and `typescript`).
- Type-check: `bunx tsc --noEmit` (script: `typecheck`).
- Build: `bunx tsdown -c tsdown.config.ts` (script: `build`, `prepare`).
- Local test run: No test harness configured; unit tests should be added with any runner (Vitest, Bun test, Jest). For quick manual checks, use Node to run a small script that creates a TypeScript `Program` and invokes `compile` (example in `README.md`).

Project patterns & conventions (code-level)
- Uses the TypeScript Compiler API extensively. When working on type resolution, favor using `Program`, `TypeChecker`, `typeToString`, and symbol-based JSDoc extraction.
- JSDoc tags: `@minimum`, `@maximum`, `@multipleOf`, `@minLength`, `@maxLength`, `@pattern`, `@format`, `@minItems`, `@maxItems`, `@default`, `@integer` are parsed and applied to the generated schema. Keep this in mind when adding constraints.
- Symbol vs aliasSymbol: The code uses `type.getSymbol() || type.aliasSymbol` to attempt to find symbols for JSDoc extraction (watch for aliased types).
- Optional property detection: The code detects optional properties with a union that includes `undefined`, or `prop.flags & ts.SymbolFlags.Optional`. Use the same logic when adding new property-related handling.
- Default value parsing: The `@default` tag attempts `JSON.parse` and falls back to a string value — stay consistent if you add more tag parsing logic.
- Unsupported types: Several features throw errors intentionally (e.g. intersection, tuples, complex unions). Tests or stronger fallback implementations are preferred instead of silent failures. The thrown error uses `typeChecker.typeToString(type)` to help debugging.

When editing `index.ts` for new TypeScript features
- Update README: If you add support for new type features, include an example input TypeScript interface + expected JSON Schema output in `README.md`.
- Add tests: Create unit tests to assert the expected schema for new features. Pick a test runner and add to package scripts.
- Follow existing patterns: Use `extractJSDocTags`, `applyJSDocTags`, and `getDescription` helpers to set schema metadata.
- Performance & recursion: `compile` is recursive; if adding more complex types (e.g. recursive types), add cycle detection or depth limits to prevent infinite recursion.

Debugging tips
- Use `typeChecker.typeToString(type)` to get a helpful human-readable description of a `Type` or sub-type.
- For quick manual testing, copy the snippet in `README.md` to a new local `example.ts`, then create a small script that sets up a `Program` and prints `compile(...)` output.
- If JSDoc tags don't appear, inspect `symbol.getJsDocTags(typeChecker)` and `symbol.getDocumentationComment(typeChecker)` — tags are read from the symbol, not the type directly.

Suggested PR checklist for AI agents
1. Add a focused unit test for the change (or a manual example in README if test harness not configured).  
2. Update the README usage example when behavior changes or new features are added.  
3. Add or update TypeScript types when the JSON Schema structure changes.  
4. Run `bunx tsc --noEmit` and `bunx tsdown -c tsdown.config.ts` before opening a PR.  

Examples
- Use `compile()` directly (from README):
  - Build `Program`, obtain `typeChecker`, find the `InterfaceDeclaration`, call `compile(type, typeChecker)`.
- The Person interface example demonstrates property-level JSDoc tags and results.

Edge cases and non-goals
- This repository intentionally does NOT support cross-file type inference, intersection types, tuples, complex union types, generics, and certain advanced TS features; the code throws descriptive errors for unsupported cases.
- Avoid changes that silently alter semantics (e.g. mapping `undefined` to `null`) without explicit tests and README updates.

If you need anything else
- Propose additions for tests and CI, including a recommended test harness and a short set of tests that assert the library’s core behaviors (primitive types, JSDoc tags, arrays, object `required` detection, literal unions -> `enum`).
