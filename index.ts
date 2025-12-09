import ts from "typescript";

/**
 * JSON Schema type definition
 */
export interface JSONSchema {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  description?: string;
  
  // String validations
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  
  // Number validations
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  
  // Array validations
  items?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  
  // Object validations
  properties?: { [key: string]: JSONSchema };
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  
  // Enum
  enum?: any[];
  
  // Other
  default?: any;
  const?: any;
  
  // Combining schemas (not supported, but included for type completeness)
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  not?: JSONSchema;
}

/**
 * Extract JSDoc tags from a TypeScript symbol
 */
function extractJSDocTags(symbol: ts.Symbol | undefined, typeChecker: ts.TypeChecker): Map<string, string> {
  const tags = new Map<string, string>();
  
  if (!symbol) {
    return tags;
  }
  
  // Get JSDoc tags from the symbol
  const jsDocTags = symbol.getJsDocTags(typeChecker);
  
  for (const tag of jsDocTags) {
    const tagName = tag.name;
    const tagText = tag.text?.map(part => part.text).join('') || '';
    tags.set(tagName, tagText);
  }
  
  return tags;
}

/**
 * Get description from JSDoc comment
 */
function getDescription(symbol: ts.Symbol | undefined, typeChecker: ts.TypeChecker): string | undefined {
  if (!symbol) {
    return undefined;
  }
  
  const documentation = symbol.getDocumentationComment(typeChecker);
  if (documentation.length > 0) {
    return documentation.map(part => part.text).join('');
  }
  
  return undefined;
}

/**
 * Parse a float value from a JSDoc tag
 */
function parseFloatTag(tags: Map<string, string>, tagName: string): number | undefined {
  if (tags.has(tagName)) {
    const value = parseFloat(tags.get(tagName)!);
    if (!isNaN(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Parse an integer value from a JSDoc tag
 */
function parseIntTag(tags: Map<string, string>, tagName: string): number | undefined {
  if (tags.has(tagName)) {
    const value = parseInt(tags.get(tagName)!, 10);
    if (!isNaN(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Apply JSDoc tags to JSON Schema
 */
function applyJSDocTags(schema: JSONSchema, tags: Map<string, string>, description?: string): void {
  if (description) {
    schema.description = description;
  }
  
  // Number validations
  const minimum = parseFloatTag(tags, 'minimum');
  if (minimum !== undefined) {
    schema.minimum = minimum;
  }
  
  const maximum = parseFloatTag(tags, 'maximum');
  if (maximum !== undefined) {
    schema.maximum = maximum;
  }
  
  const multipleOf = parseFloatTag(tags, 'multipleOf');
  if (multipleOf !== undefined) {
    schema.multipleOf = multipleOf;
  }
  
  if (tags.has('integer')) {
    schema.type = 'integer';
  }
  
  // String validations
  const minLength = parseIntTag(tags, 'minLength');
  if (minLength !== undefined) {
    schema.minLength = minLength;
  }
  
  const maxLength = parseIntTag(tags, 'maxLength');
  if (maxLength !== undefined) {
    schema.maxLength = maxLength;
  }
  
  if (tags.has('pattern')) {
    schema.pattern = tags.get('pattern');
  }
  
  if (tags.has('format')) {
    schema.format = tags.get('format');
  }
  
  // Array validations
  const minItems = parseIntTag(tags, 'minItems');
  if (minItems !== undefined) {
    schema.minItems = minItems;
  }
  
  const maxItems = parseIntTag(tags, 'maxItems');
  if (maxItems !== undefined) {
    schema.maxItems = maxItems;
  }
  
  // Default value
  if (tags.has('default')) {
    const defaultValue = tags.get('default');
    try {
      schema.default = JSON.parse(defaultValue!);
    } catch {
      schema.default = defaultValue;
    }
  }
}

/**
 * Compile a TypeScript type to JSON Schema
 */
export function compile(type: ts.Type, typeChecker: ts.TypeChecker): JSONSchema {
  const schema: JSONSchema = {};
  
  // Get symbol for JSDoc extraction
  const symbol = type.getSymbol() || type.aliasSymbol;
  const tags = extractJSDocTags(symbol, typeChecker);
  const description = getDescription(symbol, typeChecker);
  
  // Handle string type
  if (type.flags & ts.TypeFlags.String) {
    schema.type = 'string';
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle string literal type
  if (type.flags & ts.TypeFlags.StringLiteral) {
    schema.type = 'string';
    schema.const = (type as ts.StringLiteralType).value;
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle number type
  if (type.flags & ts.TypeFlags.Number) {
    schema.type = 'number';
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle number literal type
  if (type.flags & ts.TypeFlags.NumberLiteral) {
    schema.type = 'number';
    schema.const = (type as ts.NumberLiteralType).value;
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle boolean type
  if (type.flags & ts.TypeFlags.Boolean) {
    schema.type = 'boolean';
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle boolean literal type
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    schema.type = 'boolean';
    // Boolean literal types: check the type string to determine true or false
    const typeString = typeChecker.typeToString(type);
    schema.const = typeString === 'true';
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle null type
  if (type.flags & ts.TypeFlags.Null) {
    schema.type = 'null';
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle undefined type (map to null for JSON Schema)
  if (type.flags & ts.TypeFlags.Undefined) {
    schema.type = 'null';
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle enum type
  if (type.flags & ts.TypeFlags.EnumLike || type.flags & ts.TypeFlags.Enum) {
    const enumValues: any[] = [];
    if (type.isUnion()) {
      for (const unionType of type.types) {
        if (unionType.flags & ts.TypeFlags.StringLiteral) {
          enumValues.push((unionType as ts.StringLiteralType).value);
        } else if (unionType.flags & ts.TypeFlags.NumberLiteral) {
          enumValues.push((unionType as ts.NumberLiteralType).value);
        }
      }
    }
    if (enumValues.length > 0) {
      schema.enum = enumValues;
      applyJSDocTags(schema, tags, description);
      return schema;
    }
  }
  
  // Handle union types as enums if they are literal types
  if (type.isUnion()) {
    const enumValues: any[] = [];
    let allLiterals = true;
    
    for (const unionType of type.types) {
      if (unionType.flags & ts.TypeFlags.StringLiteral) {
        enumValues.push((unionType as ts.StringLiteralType).value);
      } else if (unionType.flags & ts.TypeFlags.NumberLiteral) {
        enumValues.push((unionType as ts.NumberLiteralType).value);
      } else if (unionType.flags & ts.TypeFlags.BooleanLiteral) {
        const typeString = typeChecker.typeToString(unionType);
        enumValues.push(typeString === 'true');
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
    
    // Union types that are not enums are not supported
    throw new Error('Complex union types are not supported. Only literal type unions (enums) are supported.');
  }
  
  // Handle array type
  if (typeChecker.isArrayType(type)) {
    schema.type = 'array';
    
    // Try to get array element type from typeArguments
    const typeWithArgs = type as any;
    const typeArguments = typeWithArgs.typeArguments || typeWithArgs.resolvedTypeArguments;
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
    schema.type = 'object';
    schema.properties = {};
    const required: string[] = [];
    
    const properties = typeChecker.getPropertiesOfType(type);
    
    for (const prop of properties) {
      const propName = prop.getName();
      const propType = typeChecker.getTypeOfSymbol(prop);
      
      // Check if property is optional
      // A property is optional if it has the Optional flag or if its type includes undefined
      const isOptional = (prop.flags & ts.SymbolFlags.Optional) !== 0 ||
                        (propType.flags & ts.TypeFlags.Undefined) !== 0 ||
                        (propType.isUnion() && 
                         propType.types.some(t => t.flags & ts.TypeFlags.Undefined));
      
      if (!isOptional) {
        required.push(propName);
      }
      
      schema.properties[propName] = compile(propType, typeChecker);
      
      // Apply JSDoc tags to property
      const propTags = extractJSDocTags(prop, typeChecker);
      const propDescription = getDescription(prop, typeChecker);
      applyJSDocTags(schema.properties[propName], propTags, propDescription);
    }
    
    if (required.length > 0) {
      schema.required = required;
    }
    
    applyJSDocTags(schema, tags, description);
    return schema;
  }
  
  // Handle intersection types (not supported)
  if (type.isIntersection()) {
    throw new Error('Intersection types are not supported.');
  }
  
  // Unsupported type
  throw new Error(`Unsupported type: ${typeChecker.typeToString(type)}`);
}