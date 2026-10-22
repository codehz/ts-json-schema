import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isTypeAliasDeclaration } from 'typescript/ast/is';
import { API } from 'typescript/async';
import { compile, type JSONSchema } from '../src/index';

let api: API | undefined;

beforeAll(() => {
  api = new API();
});

afterAll(async () => {
  await api?.close();
});

async function compileSource(code: string): Promise<JSONSchema> {
  if (!api) throw new Error('TypeScript API was not started');
  const dir = mkdtempSync(join(tmpdir(), 'ts-json-schema-'));
  const file = join(dir, 'test.ts');
  writeFileSync(file, code);
  const program = await api.createProgram([file], { noEmit: true });
  try {
    const sourceFile = await program.getSourceFile(file);
    if (!sourceFile) throw new Error('Source file not found');
    const typeChecker = program.getProject().checker;
    const alias = sourceFile.statements.find(
      (node) => isTypeAliasDeclaration(node) && node.name.text === 'T'
    );
    if (!alias || !isTypeAliasDeclaration(alias)) {
      throw new Error('Type not found');
    }
    const type = await typeChecker.getTypeFromTypeNode(alias.type);
    return await compile(type, typeChecker);
  } finally {
    await program.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function captureError(code: string): Promise<Error> {
  const error = await compileSource(code).then(
    () => undefined,
    (reason: unknown) => reason
  );
  if (!(error instanceof Error)) {
    throw new Error(`Expected compile to throw, got ${String(error)}`);
  }
  return error;
}

describe('ts-json-schema', () => {
  describe('primitive types', () => {
    it('should compile string type', async () => {
      const schema = await compileSource('type T = string;');
      expect(schema).toEqual({ type: 'string' });
    });

    it('should compile number type', async () => {
      const schema = await compileSource('type T = number;');
      expect(schema).toEqual({ type: 'number' });
    });

    it('should compile boolean type', async () => {
      const schema = await compileSource('type T = boolean;');
      expect(schema).toEqual({ type: 'boolean' });
    });

    it('should compile null type', async () => {
      const schema = await compileSource('type T = null;');
      expect(schema).toEqual({ type: 'null' });
    });
  });

  describe('literal types', () => {
    it('should compile string literal', async () => {
      const schema = await compileSource("type T = 'hello';");
      expect(schema).toEqual({ type: 'string', const: 'hello' });
    });

    it('should compile number literal', async () => {
      const schema = await compileSource('type T = 42;');
      expect(schema).toEqual({ type: 'number', const: 42 });
    });

    it('should compile boolean literal true', async () => {
      const schema = await compileSource('type T = true;');
      expect(schema).toEqual({ type: 'boolean', const: true });
    });

    it('should compile boolean literal false', async () => {
      const schema = await compileSource('type T = false;');
      expect(schema).toEqual({ type: 'boolean', const: false });
    });
  });

  describe('enum types', () => {
    it('should compile string union as enum', async () => {
      const schema = await compileSource("type T = 'a' | 'b' | 'c';");
      expect(schema).toEqual({ enum: ['a', 'b', 'c'] });
    });

    it('should compile number union as enum', async () => {
      const schema = await compileSource('type T = 1 | 2 | 3;');
      expect(schema).toEqual({ enum: [1, 2, 3] });
    });

    it('should ignore undefined in top-level primitive union', async () => {
      const schema = await compileSource('type T = number | undefined;');
      expect(schema).toEqual({ type: 'number' });
    });

    it('should merge primitive unions into type arrays', async () => {
      const schema = await compileSource('type T = string | number;');
      expect(schema).toEqual({ type: ['string', 'number'] });
    });

    it('should compile complex unions with anyOf', async () => {
      const schema = await compileSource(`
        type T = { a: number } | { b: string };
      `);
      expect(schema).toEqual({
        anyOf: [
          {
            type: 'object',
            properties: {
              a: { type: 'number' },
            },
            required: ['a'],
          },
          {
            type: 'object',
            properties: {
              b: { type: 'string' },
            },
            required: ['b'],
          },
        ],
      });
    });
  });

  describe('array types', () => {
    it('should compile array type', async () => {
      const schema = await compileSource('type T = string[];');
      expect(schema).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });
  });

  describe('object types', () => {
    it('should compile simple object type', async () => {
      const schema = await compileSource(`
        interface Person {
          name: string;
          age: number;
        }
        type T = Person;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      });
    });

    it('should compile top-level object unioned with undefined', async () => {
      const schema = await compileSource(`
        interface Person {
          name: string;
          age?: number;
        }
        type T = Person | undefined;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });
    });

    it('should compile object with optional properties', async () => {
      const schema = await compileSource(`
        interface Person {
          name: string;
          age?: number;
        }
        type T = Person;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });
    });

    it('should compile optional literal union properties', async () => {
      const schema = await compileSource(`
        interface Person {
          role?: 'admin' | 'user';
        }
        type T = Person;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          role: { enum: ['admin', 'user'] },
        },
      });
    });

    it('should ignore optional property with @ignore tag', async () => {
      const schema = await compileSource(`
        interface Person {
          name: string;
          /** @ignore */
          age?: number;
        }
        type T = Person;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      });
    });

    it('should throw error for required property with @ignore tag', async () => {
      const error = await captureError(`
        interface Person {
          name: string;
          /** @ignore */
          age: number;
        }
        type T = Person;
      `);
      expect(error.message).toBe('Cannot ignore required property: age');
    });

    it('should keep required properties with explicit undefined unions required', async () => {
      const schema = await compileSource(`
        interface Person {
          age: number | undefined;
        }
        type T = Person;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
        required: ['age'],
      });
    });

    it('should compile optional mixed primitive union properties', async () => {
      const schema = await compileSource(`
        interface Person {
          value?: string | number;
        }
        type T = Person;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          value: { type: ['string', 'number'] },
        },
      });
    });
  });

  describe('intersection types', () => {
    it('should merge two object types', async () => {
      const schema = await compileSource(`
        interface A { name: string; }
        interface B { age: number; }
        type T = A & B;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      });
    });

    it('should merge object with optional properties', async () => {
      const schema = await compileSource(`
        interface A { name: string; }
        interface B { age?: number; }
        type T = A & B;
      `);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });
    });

    it('should use allOf for mixed intersections', async () => {
      const schema = await compileSource(`
        type T = { name: string } & string[];
      `);
      expect(schema.allOf).toBeDefined();
      expect(schema.allOf).toHaveLength(2);
    });
  });

  describe('JSDoc tags', () => {
    it('should apply description from JSDoc', async () => {
      const schema = await compileSource(`
        interface Test {
          /** This is a string */
          prop: string;
        }
        type T = Test;
      `);
      expect(schema.properties?.prop?.description).toBe('This is a string');
    });

    it('should apply minimum tag', async () => {
      const schema = await compileSource(`
        interface Test {
          /** @minimum 10 */
          prop: number;
        }
        type T = Test;
      `);
      expect(schema.properties?.prop?.minimum).toBe(10);
    });

    it('should apply minLength tag', async () => {
      const schema = await compileSource(`
        interface Test {
          /** @minLength 5 */
          prop: string;
        }
        type T = Test;
      `);
      expect(schema.properties?.prop?.minLength).toBe(5);
    });

    it('should not apply minimum tag to string type', async () => {
      const schema = await compileSource(`
        interface Test {
          /** @minimum 10 */
          prop: string;
        }
        type T = Test;
      `);
      expect(schema.properties?.prop).toEqual({ type: 'string' });
    });

    it('should not apply minLength tag to number type', async () => {
      const schema = await compileSource(`
        interface Test {
          /** @minLength 5 */
          prop: number;
        }
        type T = Test;
      `);
      expect(schema.properties?.prop).toEqual({ type: 'number' });
    });

    it('should apply unknown tags as x- extensions', async () => {
      const schema = await compileSource(`
        interface Test {
          /** @customTag value */
          prop: string;
        }
        type T = Test;
      `);
      expect(schema.properties?.prop).toEqual({
        type: 'string',
        'x-custom-tag': 'value',
      });
    });

    it('should emit prototype-named tags as x- extensions', async () => {
      const schema = await compileSource(`
        interface Test {
          /**
           * @constructor value
           * @toString text
           */
          prop: string;
        }
        type T = Test;
      `);
      expect(schema.properties?.prop).toEqual({
        type: 'string',
        'x-constructor': 'value',
        'x-to-string': 'text',
      });
    });
  });
});
