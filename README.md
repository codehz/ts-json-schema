# @codehz/ts-json-schema

将 TypeScript 类型转换为 JSON Schema 的简单工具（基于 TypeScript Compiler API）。该库会根据 TypeScript 类型信息、类型字面量和属性上的 JSDoc 注释生成对应的 JSON Schema。

---

## 特性

- 将基本 TypeScript 类型（string/number/boolean/null/array/object）转换为 JSON Schema。
- 支持字面量类型 & 字面量联合（转换为 `enum`）。
- 支持复杂联合类型（转换为 `type` 数组或 `anyOf`）。
- 支持数组元素类型推断（`Array<T>` / `T[]`）。
- 从 JSDoc 注释提取额外限制（例如 `@minimum`、`@minLength` 等）。
- 支持属性级别的 `@default`、`@pattern`、`@format` 等标签。

---

## 安装

> 本项目将 `typescript@7.1.0-beta` 作为 `peerDependency`。类型查询走 `typescript/async`（仅 ESM），`compile` 是异步的。本包同样只提供 ESM，没有 `require` 入口。

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

2. 用 `typescript/async` 创建 program，再 `await compile`:

```ts
import { isInterfaceDeclaration } from 'typescript/ast/is';
import { API, ModuleKind } from 'typescript/async';
import { ScriptTarget } from 'typescript/ast';
import { compile } from '@codehz/ts-json-schema';

const api = new API();
try {
  const program = await api.createProgram(['./example.ts'], {
    noEmit: true,
    target: ScriptTarget.ES2020,
    module: ModuleKind.ESNext,
  });
  try {
    const checker = program.getProject().checker;
    const sourceFile = await program.getSourceFile('./example.ts');
    if (!sourceFile) throw new Error('example.ts not found');

    for (const node of sourceFile.statements) {
      if (isInterfaceDeclaration(node) && node.name.text === 'Person') {
        const type = await checker.getTypeAtLocation(node);
        const schema = await compile(type, checker);
        console.log(JSON.stringify(schema, null, 2));
      }
    }
  } finally {
    await program.dispose();
  }
} finally {
  await api.close();
}
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

- `compile(type, typeChecker, options?): Promise<JSONSchema>`
  - 将给定的 `typescript/async` `Type` 编译为 `JSONSchema`。
  - `typeChecker` 是 `program.getProject().checker`。
  - `options.ignoreUndefinedInUnion` 为真时，从联合类型里去掉 `undefined`（可选属性会自动打开）。

### `JSONSchema`（导出类型）

该接口在 `src/types.ts` 中定义，包含常见 JSON Schema 字段，如 `type, description, enum, const, properties, items, minLength, maxLength, minimum, maximum` 等。

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
- 复杂联合类型（`T | undefined` 解包，简单基础类型 union 合并为 `type` 数组，其余使用 `anyOf`）
- 对象（`properties`, `required`）、数组与元素类型
- 交叉类型（纯对象交叉直接合并，混合交叉使用 `allOf`）
- 从 JSDoc 提取额外约束

限制（当前未支持或有限支持的项）：

- 元组类型不支持，会抛出错误
- 顶层裸 `undefined` 仍会映射为 JSON Schema 中的 `null`；在 union 中会优先按可选语义解包
- 泛型 & 高级类型（如函数、映射类型、索引签名等）没有完整支持

如果遇到未支持的类型，会抛出错误并包含 `typeChecker.typeToString(type)` 的结果，用于调试和增强库支持。

---

## 开发

- 代码位于 `src/`。`compile` 以及符号上的 `getJsDocTags` / `getDocumentationComment` / `getSymbol` 都是异步的。
- 该项目以 `typescript/async` 的 `Checker` 为核心。program 用完要 `dispose()`，进程用完要 `api.close()`。

---

## 贡献

欢迎 PR 与 issue。如果想扩展对更多 TypeScript 特性的支持（例如交叉/元组/泛型），请在 PR 中包含示例输入和期望输出。
