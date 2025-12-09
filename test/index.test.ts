import { describe, it, expect } from 'bun:test';
import ts from 'typescript';
import { compile } from '../src/index';

function createProgramAndTypeChecker(code: string): {
  program: ts.Program;
  typeChecker: ts.TypeChecker;
  type: ts.Type;
} {
  const fileName = 'test.ts';
  const host = ts.createCompilerHost({});
  const originalReadFile = host.readFile;
  host.readFile = (fileName: string) => {
    if (fileName === 'test.ts') return code;
    return originalReadFile!(fileName);
  };
  host.fileExists = (fileName: string) => {
    if (fileName === 'test.ts') return true;
    return ts.sys.fileExists(fileName);
  };
  const program = ts.createProgram([fileName], {}, host);
  const typeChecker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(fileName)!;
  let type: ts.Type | undefined;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'T') {
      type = typeChecker.getTypeAtLocation(node.type);
    }
  });
  if (!type) throw new Error('Type not found');
  return { program, typeChecker, type };
}

describe('ts-json-schema', () => {
  describe('primitive types', () => {
    it('should compile string type', () => {
      const { typeChecker, type } =
        createProgramAndTypeChecker('type T = string;');
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ type: 'string' });
    });

    it('should compile number type', () => {
      const { typeChecker, type } =
        createProgramAndTypeChecker('type T = number;');
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ type: 'number' });
    });

    it('should compile boolean type', () => {
      const { typeChecker, type } =
        createProgramAndTypeChecker('type T = boolean;');
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ type: 'boolean' });
    });

    it('should compile null type', () => {
      const { typeChecker, type } =
        createProgramAndTypeChecker('type T = null;');
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ type: 'null' });
    });
  });

  describe('literal types', () => {
    it('should compile string literal', () => {
      const { typeChecker, type } =
        createProgramAndTypeChecker("type T = 'hello';");
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ type: 'string', const: 'hello' });
    });

    it('should compile number literal', () => {
      const { typeChecker, type } = createProgramAndTypeChecker('type T = 42;');
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ type: 'number', const: 42 });
    });

    it('should compile boolean literal true', () => {
      const { typeChecker, type } =
        createProgramAndTypeChecker('type T = true;');
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ type: 'boolean', const: true });
    });

    it('should compile boolean literal false', () => {
      const { typeChecker, type } =
        createProgramAndTypeChecker('type T = false;');
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ type: 'boolean', const: false });
    });
  });

  describe('enum types', () => {
    it('should compile string union as enum', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(
        "type T = 'a' | 'b' | 'c';"
      );
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ enum: ['a', 'b', 'c'] });
    });

    it('should compile number union as enum', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(
        'type T = 1 | 2 | 3;'
      );
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({ enum: [1, 2, 3] });
    });
  });

  describe('array types', () => {
    it('should compile array type', () => {
      const { typeChecker, type } =
        createProgramAndTypeChecker('type T = string[];');
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });
  });

  describe('object types', () => {
    it('should compile simple object type', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Person {
          name: string;
          age: number;
        }
        type T = Person;
      `);
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      });
    });

    it('should compile object with optional properties', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Person {
          name: string;
          age?: number;
        }
        type T = Person;
      `);
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });
    });

    it('should ignore optional property with @ignore tag', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Person {
          name: string;
          /** @ignore */
          age?: number;
        }
        type T = Person;
      `);
      const schema = compile(type, typeChecker);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      });
    });

    it('should throw error for required property with @ignore tag', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Person {
          name: string;
          /** @ignore */
          age: number;
        }
        type T = Person;
      `);
      expect(() => compile(type, typeChecker)).toThrow(
        'Cannot ignore required property: age'
      );
    });
  });

  describe('JSDoc tags', () => {
    it('should apply description from JSDoc', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Test {
          /** This is a string */
          prop: string;
        }
        type T = Test;
      `);
      const schema = compile(type, typeChecker);
      expect(schema.properties?.prop?.description).toBe('This is a string');
    });

    it('should apply minimum tag', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Test {
          /** @minimum 10 */
          prop: number;
        }
        type T = Test;
      `);
      const schema = compile(type, typeChecker);
      expect(schema.properties?.prop?.minimum).toBe(10);
    });

    it('should apply minLength tag', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Test {
          /** @minLength 5 */
          prop: string;
        }
        type T = Test;
      `);
      const schema = compile(type, typeChecker);
      expect(schema.properties?.prop?.minLength).toBe(5);
    });

    it('should not apply minimum tag to string type', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Test {
          /** @minimum 10 */
          prop: string;
        }
        type T = Test;
      `);
      const schema = compile(type, typeChecker);
      expect(schema.properties?.prop).toEqual({ type: 'string' });
    });

    it('should not apply minLength tag to number type', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Test {
          /** @minLength 5 */
          prop: number;
        }
        type T = Test;
      `);
      const schema = compile(type, typeChecker);
      expect(schema.properties?.prop).toEqual({ type: 'number' });
    });

    it('should apply unknown tags as x- extensions', () => {
      const { typeChecker, type } = createProgramAndTypeChecker(`
        interface Test {
          /** @customTag value */
          prop: string;
        }
        type T = Test;
      `);
      const schema = compile(type, typeChecker);
      expect(schema.properties?.prop).toEqual({
        type: 'string',
        'x-customTag': 'value',
      });
    });
  });
});
