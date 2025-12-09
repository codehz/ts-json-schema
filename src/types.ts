/**
 * JSON Schema type definition
 */
export interface JSONSchema {
  type?:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null';
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
  enum?: (string | number | boolean)[];

  // Other
  default?: unknown;
  const?: unknown;

  // Combining schemas (not supported, but included for type completeness)
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  not?: JSONSchema;

  // Allow arbitrary extensions (e.g., x- prefixed custom properties)
  [key: `x-${string}`]: unknown;
}
