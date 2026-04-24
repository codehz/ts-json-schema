import ts from 'typescript';
import type { JSONSchema } from './types';
import { extractJSDocTags, getDescription, applyJSDocTags } from './utils';

/**
 * Extract a literal value from a type, or undefined if not a literal type.
 * When includeBooleans is true, also extracts boolean literal values.
 */
function extractLiteralValue(
  t: ts.Type,
  typeChecker: ts.TypeChecker,
  includeBooleans: boolean
): string | number | boolean | undefined {
  if (t.flags & ts.TypeFlags.StringLiteral) {
    return (t as ts.StringLiteralType).value;
  }
  if (t.flags & ts.TypeFlags.NumberLiteral) {
    return (t as ts.NumberLiteralType).value;
  }
  if (includeBooleans && t.flags & ts.TypeFlags.BooleanLiteral) {
    return typeChecker.typeToString(t) === 'true';
  }
  return undefined;
}

/**
 * Compile object properties into a schema, shared by object types and merged intersections.
 */
function compileObjectProperties(
  schema: JSONSchema,
  type: ts.Type,
  typeChecker: ts.TypeChecker
): void {
  schema.type = 'object';
  schema.properties = {};
  const required: string[] = [];

  for (const prop of typeChecker.getPropertiesOfType(type)) {
    const propName = prop.getName();
    const propType = typeChecker.getTypeOfSymbol(prop);

    const isOptional = (prop.flags & ts.SymbolFlags.Optional) !== 0;

    if (!isOptional) {
      required.push(propName);
    }

    const propTags = extractJSDocTags(prop, typeChecker);
    if (propTags.has('ignore')) {
      if (!isOptional) {
        throw new Error(`Cannot ignore required property: ${propName}`);
      }
      continue;
    }

    schema.properties[propName] = compile(propType, typeChecker, {
      ignoreUndefinedInUnion: isOptional,
    });

    const propDescription = getDescription(prop, typeChecker);
    applyJSDocTags(schema.properties[propName], propTags, propDescription);
  }

  if (required.length > 0) {
    schema.required = required;
  }
}

/** Primitive type flag to JSON Schema type mapping */
const PRIMITIVE_TYPES: [number, JSONSchema['type']][] = [
  [ts.TypeFlags.String, 'string'],
  [ts.TypeFlags.Number, 'number'],
  [ts.TypeFlags.Boolean, 'boolean'],
  [ts.TypeFlags.Null, 'null'],
  [ts.TypeFlags.Undefined, 'null'],
];

/** Literal type flag to JSON Schema type mapping (for extracting const values) */
const LITERAL_TYPES: [
  number,
  JSONSchema['type'],
  (t: ts.Type, tc: ts.TypeChecker) => unknown,
][] = [
  [
    ts.TypeFlags.StringLiteral,
    'string',
    (t) => (t as ts.StringLiteralType).value,
  ],
  [
    ts.TypeFlags.NumberLiteral,
    'number',
    (t) => (t as ts.NumberLiteralType).value,
  ],
  [
    ts.TypeFlags.BooleanLiteral,
    'boolean',
    (t, tc) => tc.typeToString(t) === 'true',
  ],
];

/**
 * Compile a TypeScript type to JSON Schema
 */
export function compile(
  type: ts.Type,
  typeChecker: ts.TypeChecker,
  options?: {
    ignoreUndefinedInUnion?: boolean;
  }
): JSONSchema {
  if (!options?.ignoreUndefinedInUnion && type.isUnion()) {
    const unionTypes = type.types.filter(
      (t) => (t.flags & ts.TypeFlags.Undefined) === 0
    );

    const singleUnionType = unionTypes[0];
    if (unionTypes.length === 1 && singleUnionType) {
      if (singleUnionType.flags & ts.TypeFlags.Object) {
        return compile(singleUnionType, typeChecker);
      }
    }
  }

  const schema: JSONSchema = {};

  // Get symbol for JSDoc extraction
  const symbol = type.getSymbol() || type.aliasSymbol;
  const tags = extractJSDocTags(symbol, typeChecker);
  const description = getDescription(symbol, typeChecker);

  // Handle primitive types (string, number, boolean, null, undefined)
  for (const [flag, schemaType] of PRIMITIVE_TYPES) {
    if (type.flags & flag) {
      schema.type = schemaType;
      applyJSDocTags(schema, tags, description);
      return schema;
    }
  }

  // Handle literal types (string, number, boolean literals)
  for (const [flag, schemaType, getValue] of LITERAL_TYPES) {
    if (type.flags & flag) {
      schema.type = schemaType;
      schema.const = getValue(type, typeChecker);
      applyJSDocTags(schema, tags, description);
      return schema;
    }
  }

  // Handle enum type
  if (type.flags & ts.TypeFlags.EnumLike || type.flags & ts.TypeFlags.Enum) {
    if (type.isUnion()) {
      const enumValues = type.types
        .map((t) => extractLiteralValue(t, typeChecker, false))
        .filter((v): v is string | number => v !== undefined);
      if (enumValues.length > 0) {
        schema.enum = enumValues;
        applyJSDocTags(schema, tags, description);
        return schema;
      }
    }
  }

  // Handle union types as enums if they are literal types
  if (type.isUnion()) {
    const unionTypes = options?.ignoreUndefinedInUnion
      ? type.types.filter((t) => (t.flags & ts.TypeFlags.Undefined) === 0)
      : type.types;

    if (unionTypes.length === 1) {
      const [singleUnionType] = unionTypes;
      if (singleUnionType) {
        return compile(singleUnionType, typeChecker);
      }
    }

    const enumValues: (string | number | boolean)[] = [];
    let allLiterals = true;

    for (const unionType of unionTypes) {
      const value = extractLiteralValue(unionType, typeChecker, true);
      if (value !== undefined) {
        enumValues.push(value);
      } else {
        allLiterals = false;
        break;
      }
    }

    if (allLiterals && enumValues.length > 0) {
      schema.enum = enumValues;
      applyJSDocTags(schema, tags, description);
      return schema;
    }

    throw new Error(
      'Complex union types are not supported. Only literal type unions (enums) are supported.'
    );
  }

  // Handle array type
  if (typeChecker.isArrayType(type)) {
    schema.type = 'array';

    const typeRef = type as ts.TypeReference;
    const typeArguments =
      typeRef.typeArguments ||
      (
        typeRef as ts.TypeReference & {
          resolvedTypeArguments?: readonly ts.Type[];
        }
      ).resolvedTypeArguments;
    if (Array.isArray(typeArguments) && typeArguments.length > 0) {
      schema.items = compile(typeArguments[0], typeChecker);
    }

    applyJSDocTags(schema, tags, description);
    return schema;
  }

  // Handle tuple type
  if (typeChecker.isTupleType(type)) {
    throw new Error('Tuple types are not supported.');
  }

  // Handle object type
  if (type.flags & ts.TypeFlags.Object) {
    compileObjectProperties(schema, type, typeChecker);
    applyJSDocTags(schema, tags, description);
    return schema;
  }

  // Handle intersection types using allOf
  if (type.isIntersection()) {
    const allObjects = type.types.every(
      (t) =>
        t.flags & ts.TypeFlags.Object &&
        !typeChecker.isArrayType(t) &&
        !typeChecker.isTupleType(t)
    );

    if (allObjects) {
      compileObjectProperties(schema, type, typeChecker);
      applyJSDocTags(schema, tags, description);
      return schema;
    }

    // For mixed intersections, use allOf
    schema.allOf = type.types.map((t) => compile(t, typeChecker));
    applyJSDocTags(schema, tags, description);
    return schema;
  }

  // Unsupported type
  throw new Error(`Unsupported type: ${typeChecker.typeToString(type)}`);
}
