import type { Checker, Symbol } from 'typescript/async';
import type { JSONSchema } from './types';

/**
 * Extract JSDoc tags from a TypeScript symbol.
 * Tag text is the rendered string from the TS 7.1 checker, not display parts.
 */
export async function extractJSDocTags(
  symbol: Symbol | undefined,
  typeChecker: Checker
): Promise<Map<string, string>> {
  const tags = new Map<string, string>();

  if (!symbol) {
    return tags;
  }

  const jsDocTags = await symbol.getJsDocTags(typeChecker);

  for (const tag of jsDocTags) {
    tags.set(tag.name, tag.text ?? '');
  }

  return tags;
}

/**
 * Get description from JSDoc comment
 */
export async function getDescription(
  symbol: Symbol | undefined,
  typeChecker: Checker
): Promise<string | undefined> {
  if (!symbol) {
    return undefined;
  }

  const documentation = await symbol.getDocumentationComment(typeChecker);
  if (documentation.length > 0) {
    return documentation;
  }

  return undefined;
}

/**
 * Parse a float value from a JSDoc tag
 */
export function parseFloatTag(
  tags: Map<string, string>,
  tagName: string
): number | undefined {
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
export function parseIntTag(
  tags: Map<string, string>,
  tagName: string
): number | undefined {
  if (tags.has(tagName)) {
    const value = parseInt(tags.get(tagName)!, 10);
    if (!isNaN(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Apply JSDoc tags to JSON Schema
 */
export function applyJSDocTags(
  schema: JSONSchema,
  tags: Map<string, string>,
  description?: string
): void {
  if (description) {
    schema.description = description;
  }

  // Number validations
  if (schema.type === 'number' || schema.type === 'integer') {
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
  if (schema.type === 'string') {
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
  if (schema.type === 'array') {
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

  const knownTags: Record<string, true> = {
    minimum: true,
    maximum: true,
    multipleOf: true,
    integer: true,
    minLength: true,
    maxLength: true,
    pattern: true,
    format: true,
    minItems: true,
    maxItems: true,
    default: true,
  };

  // Apply unknown tags as x- extensions
  for (const [tagName, tagText] of tags) {
    if (!Object.hasOwn(knownTags, tagName)) {
      const kebabTagName = camelToKebab(tagName);
      try {
        schema[`x-${kebabTagName}`] = JSON.parse(tagText);
      } catch {
        schema[`x-${kebabTagName}`] = tagText;
      }
    }
  }
}
