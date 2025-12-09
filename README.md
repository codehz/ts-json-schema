# @codehz/ts-json-schema

将 TypeScript 类型转换为 JSON Schema 的简单工具（基于 TypeScript Compiler API）。该库会根据 TypeScript 类型信息、类型字面量和属性上的 JSDoc 注释生成对应的 JSON Schema。

---

## 特性

- 将基本 TypeScript 类型（string/number/boolean/null/array/object）转换为 JSON Schema。
- 支持字面量类型 & 字面量联合（转换为 `enum`）。
- 支持数组元素类型推断（`Array<T>` / `T[]`）。
- 从 JSDoc 注释提取额外限制（例如 `@minimum`、`@minLength` 等）。
- 支持属性级别的 `@default`、`@pattern`、`@format` 等标签。

---

## 安装

> 本项目将 `typescript` 作为 `peerDependency`，请确保在项目中安装 `typescript`（推荐 v5 及以上）。

使用 bun:

```bash
bun add -D typescript @codehz/ts-json-schema
```

---

## 快速开始（示例）

1. 创建 `example.ts`：

```ts
/**
 * 表示用户信息
 */
interface Person {
  /**
   * 用户名
   * @minLength 2
   * @maxLength 50
   */
  name: string;

  /**
   * 年龄（可选）
   * @minimum 0
   * @maximum 120
   */
  age?: number;

  /** @default true */
  isActive: boolean;

  /**
   * 内部使用，不输出到 schema
   * @ignore
   */
  internalId?: string;

  tags: string[];

  status: 'active' | 'banned';
}
```

2. 运行 TypeScript Compiler API 并使用 `compile`:

```ts
import ts from 'typescript';
import { compile } from '@codehz/ts-json-schema';

// 创建 program（可以按需配置 compilerOptions）
const program = ts.createProgram(['./example.ts'], {
  noEmit: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
});

const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile('./example.ts')!;

ts.forEachChild(sourceFile, (node) => {
  if (ts.isInterfaceDeclaration(node) && node.name.text === 'Person') {
    const type = checker.getTypeAtLocation(node);
    const schema = compile(type, checker);
    console.log(JSON.stringify(schema, null, 2));
  }
});
```

输出（示例）：

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 2,
      "maxLength": 50,
      "description": "用户名"
    },
    "age": {
      "type": "number",
      "minimum": 0,
      "maximum": 120,
      "description": "年龄（可选）"
    },
    "isActive": { "type": "boolean", "default": true },
    "tags": { "type": "array", "items": { "type": "string" } },
    "status": { "enum": ["active", "banned"] }
  },
  "required": ["name", "isActive", "tags", "status"]
}
```

---

## API

- `compile(type: ts.Type, typeChecker: ts.TypeChecker): JSONSchema`
  - 将给定的 `ts.Type` 编译为 `JSONSchema`。
  - `typeChecker` 是从 `ts.Program` 中获取到的 `TypeChecker` 实例。

### `JSONSchema`（导出类型）

该接口在 `index.ts` 中定义，包含常见 JSON Schema 字段，如 `type, description, enum, const, properties, items, minLength, maxLength, minimum, maximum` 等。

---

## 支持的 JSDoc 标签（可用于类型或属性）

- `@minimum`, `@maximum`, `@multipleOf`（数字验证）
- `@minLength`, `@maxLength`, `@pattern`, `@format`（字符串验证）
- `@minItems`, `@maxItems`（数组验证）
- `@default`（默认值，如果是合法 JSON 值会尝试解析）
- `@integer`（将类型标记为 `integer`）
- `@ignore`（忽略属性：可选属性会被跳过，必选属性会报错）

说明：标签值是从 JSDoc 标签字符串中提取的，如果存在 `@default` 会尝试 `JSON.parse`，解析失败则作为字符串保留。

未知的 JSDoc 标签会被转换为 `x-{tagName}` 的自定义扩展属性。例如，`@customTag value` 会生成 `"x-customTag": "value"`。

---

## 支持/限制

支持：

- 基本类型（string, number, boolean, null）
- 字面量类型（string/number/boolean literals）与字面量联合（转换为 `enum`）
- 对象（`properties`, `required`）、数组与元素类型
- 从 JSDoc 提取额外约束

限制（当前未支持或有限支持的项）：

- 交叉类型（intersection）不支持，会抛出错误
- 复杂联合类型（包含非字面量的 union）不支持，会抛出错误
- 元组类型不支持，会抛出错误
- `undefined` 被映射为 JSON Schema 中的 `null`
- 泛型 & 高级类型（如函数、映射类型、索引签名等）没有完整支持

如果遇到未支持的类型，会抛出错误并包含 `typeChecker.typeToString(type)` 的信息，用于调试和增强库支持。

---

## 开发

- 代码位于 `index.ts`。
- 该项目以 `typescript` 的 `TypeChecker` 为核心，建议阅读 TypeScript Compiler API 文档来扩展功能。

---

## 贡献

欢迎 PR 与 issue。如果想扩展对更多 TypeScript 特性的支持（例如交叉/元组/泛型），请在 PR 中包含示例输入和期望输出。
