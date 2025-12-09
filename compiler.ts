import ts from "typescript";
import type { JSONSchema } from "./types";
import { extractJSDocTags, getDescription, applyJSDocTags } from "./utils";

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