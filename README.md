# @codehz/ts-json-schema

A simple TypeScript library to convert TypeScript types to JSON Schema with JSDoc support.

## Installation

```bash
npm install @codehz/ts-json-schema typescript
```

## Usage

```typescript
import ts from "typescript";
import { compile, JSONSchema } from "@codehz/ts-json-schema";

// Create a TypeScript program and type checker
const program = ts.createProgram(["your-file.ts"], {});
const typeChecker = program.getTypeChecker();

// Get a type from your source file
const sourceFile = program.getSourceFile("your-file.ts");
const symbol = typeChecker.getSymbolAtLocation(/* node */);
const type = typeChecker.getDeclaredTypeOfSymbol(symbol);

// Compile to JSON Schema
const schema: JSONSchema = compile(type, typeChecker);
console.log(JSON.stringify(schema, null, 2));
```

## Supported Types

- **Basic types**: `string`, `number`, `boolean`, `null`
- **Literal types**: String, number, and boolean literals
- **Object types**: Interfaces and object type literals
- **Array types**: `Array<T>` and `T[]`
- **Enum types**: Union of literal types (e.g., `"a" | "b" | "c"`)

## JSDoc Support

The library extracts validation information from JSDoc comments:

### String Validations
- `@minLength` - Minimum string length
- `@maxLength` - Maximum string length
- `@pattern` - Regular expression pattern
- `@format` - String format (e.g., "email", "uri", "date-time")

### Number Validations
- `@minimum` - Minimum value
- `@maximum` - Maximum value
- `@multipleOf` - Number must be a multiple of this value
- `@integer` - Mark the number as an integer

### Array Validations
- `@minItems` - Minimum number of items
- `@maxItems` - Maximum number of items

### Other
- `@default` - Default value (will be parsed as JSON if possible)
- Description text in JSDoc comments becomes the schema's `description`

### Example

```typescript
interface User {
  /**
   * User's name
   * @minLength 1
   * @maxLength 50
   */
  name: string;
  
  /**
   * User's age
   * @minimum 0
   * @maximum 120
   * @integer
   */
  age: number;
  
  /**
   * User's email
   * @format email
   */
  email: string;
  
  /**
   * User's tags
   * @minItems 1
   * @maxItems 10
   */
  tags: string[];
  
  /**
   * User's status
   */
  status: "active" | "inactive" | "pending";
}
```

Will produce:

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "User's name",
      "minLength": 1,
      "maxLength": 50
    },
    "age": {
      "type": "integer",
      "description": "User's age",
      "minimum": 0,
      "maximum": 120
    },
    "email": {
      "type": "string",
      "description": "User's email",
      "format": "email"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "User's tags",
      "minItems": 1,
      "maxItems": 10
    },
    "status": {
      "enum": ["active", "inactive", "pending"],
      "description": "User's status"
    }
  },
  "required": ["name", "age", "email", "tags", "status"]
}
```

## Unsupported Features

The library intentionally does not support complex type constructs:

- Intersection types (`A & B`)
- Tuple types (`[string, number]`)
- Complex union types (unions that are not literal enums)
- Schema composition (`anyOf`, `oneOf`, `allOf`, `not`)

Attempting to compile these types will throw an error.

## Development

To install dependencies:

```bash
npm install
```

To check TypeScript compilation:

```bash
npx tsc --noEmit
```

This project was created using `bun init` in bun v1.3.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
