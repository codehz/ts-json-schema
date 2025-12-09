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