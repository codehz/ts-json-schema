import ts from "typescript";

// Read the compiled index
const indexModule = await import("./index.ts");
const { compile } = indexModule;

// Create a TypeScript program to test the compile function
const testCode = `
/**
 * User object with various properties
 */
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
  
  /**
   * Is the user verified?
   */
  isVerified: boolean;
  
  /**
   * Optional bio
   * @default "No bio provided"
   */
  bio?: string;
}

/**
 * A simple string type
 */
type SimpleString = string;

/**
 * A number with range
 * @minimum 10
 * @maximum 100
 */
type RangedNumber = number;

/**
 * An enum type
 */
type Color = "red" | "green" | "blue";

/**
 * An array of numbers
 * @minItems 2
 */
type NumberArray = number[];
`;

// Create a program with the test code
const fileName = "test.ts";
const sourceFile = ts.createSourceFile(
  fileName,
  testCode,
  ts.ScriptTarget.Latest,
  true
);

const compilerOptions = {
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
};

const host = ts.createCompilerHost(compilerOptions);
const originalGetSourceFile = host.getSourceFile;
host.getSourceFile = (name, languageVersion) => {
  if (name === fileName) {
    return sourceFile;
  }
  return originalGetSourceFile(name, languageVersion);
};

const program = ts.createProgram([fileName], compilerOptions, host);
const typeChecker = program.getTypeChecker();

// Test each type
const source = program.getSourceFile(fileName);
if (!source) {
  throw new Error("Source file not found");
}

console.log("Testing TypeScript to JSON Schema compilation\n");
console.log("=".repeat(60));

// Find and test each type declaration
ts.forEachChild(source, node => {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    const symbol = typeChecker.getSymbolAtLocation(node.name);
    if (symbol) {
      const type = typeChecker.getDeclaredTypeOfSymbol(symbol);
      const typeName = node.name.text;
      
      console.log(`\n${typeName}:`);
      console.log("-".repeat(60));
      
      try {
        const schema = compile(type, typeChecker);
        console.log(JSON.stringify(schema, null, 2));
      } catch (error) {
        console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
});

console.log("\n" + "=".repeat(60));
console.log("Testing complete!");
