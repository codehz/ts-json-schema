import {
  SymbolFlags,
  TypeFlags,
  type Checker,
  type Type,
  type TypeReference,
} from 'typescript/async';
import type { JSONSchema, JSONSchemaType } from './types';
import { applyJSDocTags, extractJSDocTags, getDescription } from './utils';

export interface CompileOptions {
  ignoreUndefinedInUnion?: boolean;
}

/**
 * Extract a literal value from a type, or undefined if not a literal type.
 * When includeBooleans is true, also extracts boolean literal values.
 */
function extractLiteralValue(
  type: Type,
  includeBooleans: boolean
): string | number | boolean | undefined {
  if (type.isStringLiteralType()) return type.value;
  if (type.isNumberLiteralType()) return type.value;
  if (includeBooleans && type.isBooleanLiteralType()) return type.value;
  return undefined;
}

/**
 * Compile object properties into a schema, shared by object types and merged intersections.
 */
async function compileObjectProperties(
  schema: JSONSchema,
  type: Type,
  typeChecker: Checker
): Promise<void> {
  schema.type = 'object';
  schema.properties = {};
  const required: string[] = [];

  for (const prop of await typeChecker.getPropertiesOfType(type)) {
    const propName = prop.name;
    const propType = await typeChecker.getTypeOfSymbol(prop);
    const isOptional = (prop.flags & SymbolFlags.Optional) !== 0;

    if (!isOptional) {
      required.push(propName);
    }

    const propTags = await extractJSDocTags(prop, typeChecker);
    if (propTags.has('ignore')) {
      if (!isOptional) {
        throw new Error(`Cannot ignore required property: ${propName}`);
      }
      continue;
    }

    schema.properties[propName] = await compile(propType, typeChecker, {
      ignoreUndefinedInUnion: isOptional,
    });

    const propDescription = await getDescription(prop, typeChecker);
    applyJSDocTags(schema.properties[propName], propTags, propDescription);
  }

  if (required.length > 0) {
    schema.required = required;
  }
}

/** Primitive type flag to JSON Schema type mapping */
const PRIMITIVE_TYPES: [number, JSONSchema['type']][] = [
  [TypeFlags.String, 'string'],
  [TypeFlags.Number, 'number'],
  [TypeFlags.Boolean, 'boolean'],
  [TypeFlags.Null, 'null'],
  [TypeFlags.Undefined, 'null'],
];

/**
 * Compile a TypeScript type to JSON Schema.
 * `type` and `typeChecker` come from `typescript/async`.
 */
export async function compile(
  type: Type,
  typeChecker: Checker,
  options?: CompileOptions
): Promise<JSONSchema> {
  const schema: JSONSchema = {};

  const symbol = (await type.getSymbol()) ?? (await type.getAliasSymbol());
  const tags = await extractJSDocTags(symbol, typeChecker);
  const description = await getDescription(symbol, typeChecker);

  for (const [flag, schemaType] of PRIMITIVE_TYPES) {
    if (type.flags & flag) {
      schema.type = schemaType;
      applyJSDocTags(schema, tags, description);
      return schema;
    }
  }

  if (type.isStringLiteralType()) {
    schema.type = 'string';
    schema.const = type.value;
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  if (type.isNumberLiteralType()) {
    schema.type = 'number';
    schema.const = type.value;
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  if (type.isBooleanLiteralType()) {
    schema.type = 'boolean';
    schema.const = type.value;
    applyJSDocTags(schema, tags, description);
    return schema;
  }

  if (type.flags & TypeFlags.EnumLike || type.flags & TypeFlags.Enum) {
    if (type.isUnionType()) {
      const enumValues = (await type.getTypes())
        .map((member) => extractLiteralValue(member, false))
        .filter((value): value is string | number => value !== undefined);
      if (enumValues.length > 0) {
        schema.enum = enumValues;
        applyJSDocTags(schema, tags, description);
        return schema;
      }
    }
  }

  if (type.isUnionType()) {
    const allTypes = await type.getTypes();
    const unionTypes =
      options?.ignoreUndefinedInUnion || allTypes.length > 1
        ? allTypes.filter(
            (member) => (member.flags & TypeFlags.Undefined) === 0
          )
        : allTypes;

    if (unionTypes.length === 1) {
      const singleUnionType = unionTypes[0];
      if (singleUnionType) {
        return compile(singleUnionType, typeChecker, options);
      }
    }

    const enumValues: (string | number | boolean)[] = [];
    let allLiterals = true;

    for (const unionType of unionTypes) {
      const value = extractLiteralValue(unionType, true);
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

    const memberSchemas: JSONSchema[] = [];
    for (const unionType of unionTypes) {
      memberSchemas.push(await compile(unionType, typeChecker, options));
    }

    const primitiveTypes = new Set<JSONSchemaType>();
    let canMergePrimitiveTypes = true;

    for (const memberSchema of memberSchemas) {
      const { type: memberType } = memberSchema;
      if (
        typeof memberType === 'string' &&
        Object.keys(memberSchema).length === 1 &&
        !primitiveTypes.has(memberType)
      ) {
        primitiveTypes.add(memberType);
      } else {
        canMergePrimitiveTypes = false;
        break;
      }
    }

    if (canMergePrimitiveTypes) {
      schema.type = [...primitiveTypes];
    } else {
      schema.anyOf = memberSchemas;
    }

    applyJSDocTags(schema, tags, description);
    return schema;
  }

  if (await typeChecker.isArrayType(type)) {
    schema.type = 'array';
    const typeArguments = await typeChecker.getTypeArguments(
      type as TypeReference
    );
    const itemType = typeArguments[0];
    if (itemType) {
      schema.items = await compile(itemType, typeChecker);
    }
    applyJSDocTags(schema, tags, description);
    return schema;
  }

  if (await typeChecker.isTupleType(type)) {
    throw new Error('Tuple types are not supported.');
  }

  if (type.flags & TypeFlags.Object) {
    await compileObjectProperties(schema, type, typeChecker);
    applyJSDocTags(schema, tags, description);
    return schema;
  }

  if (type.isIntersectionType()) {
    const intersectionTypes = await type.getTypes();
    let allObjectTypes = true;
    for (const member of intersectionTypes) {
      if (
        (member.flags & TypeFlags.Object) === 0 ||
        (await typeChecker.isArrayType(member)) ||
        (await typeChecker.isTupleType(member))
      ) {
        allObjectTypes = false;
        break;
      }
    }

    if (allObjectTypes) {
      await compileObjectProperties(schema, type, typeChecker);
      applyJSDocTags(schema, tags, description);
      return schema;
    }

    const memberSchemas: JSONSchema[] = [];
    for (const member of intersectionTypes) {
      memberSchemas.push(await compile(member, typeChecker));
    }
    schema.allOf = memberSchemas;
    applyJSDocTags(schema, tags, description);
    return schema;
  }

  throw new Error(`Unsupported type: ${await typeChecker.typeToString(type)}`);
}
