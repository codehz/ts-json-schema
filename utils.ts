import ts from "typescript";
import type { JSONSchema } from "./types";

/**
 * Extract JSDoc tags from a TypeScript symbol
 */
export function extractJSDocTags(symbol: ts.Symbol | undefined, typeChecker: ts.TypeChecker): Map<string, string> {
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
export function getDescription(symbol: ts.Symbol | undefined, typeChecker: ts.TypeChecker): string | undefined {
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
export function parseFloatTag(tags: Map<string, string>, tagName: string): number | undefined {
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
export function parseIntTag(tags: Map<string, string>, tagName: string): number | undefined {
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
export function applyJSDocTags(schema: JSONSchema, tags: Map<string, string>, description?: string): void {
  if (description) {
    schema.description = description;
  }
  
  // Number validations
  if (schema.type === "number" || schema.type === "integer") {
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
  }
  
  // String validations
  if (schema.type === "string") {
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
  }
  
  // Array validations
  if (schema.type === "array") {
    const minItems = parseIntTag(tags, 'minItems');
    if (minItems !== undefined) {
      schema.minItems = minItems;
    }
    
    const maxItems = parseIntTag(tags, 'maxItems');
    if (maxItems !== undefined) {
      schema.maxItems = maxItems;
    }
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

  // Known tags set
  const knownTags = new Set(['minimum', 'maximum', 'multipleOf', 'integer', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'default']);

  // Apply unknown tags as x- extensions
  for (const [tagName, tagText] of tags) {
    if (!knownTags.has(tagName)) {
      try {
        schema[`x-${tagName}`] = JSON.parse(tagText);
      } catch {
        schema[`x-${tagName}`] = tagText;
      }
    }
  }
}