import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["src", "tests"];
const files = roots.flatMap((root) => walk(root));

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return /\.tsx?$/.test(entry.name) ? [target] : [];
  });
}

function asyncModifiers(factory, modifiers) {
  if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) return modifiers;
  return factory.createNodeArray([...(modifiers ?? []), factory.createModifier(ts.SyntaxKind.AsyncKeyword)]);
}

for (const file of files) {
  const sourceText = fs.readFileSync(file, "utf8");
  if (!/\.(get|all|run)\(\)/.test(sourceText)) continue;
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let changed = false;
  const transformer = (context) => {
    const { factory } = context;
    const visitFunction = (node, update) => {
      let needsAsync = false;
      const nestedVisitor = (child) => {
        if (ts.isFunctionLike(child) && child !== node) return visitor(child);
        if (ts.isCallExpression(child) && child.arguments.length === 0 && ts.isPropertyAccessExpression(child.expression)) {
          const terminal = child.expression.name.text;
          if (["get", "all", "run"].includes(terminal)) {
            changed = true;
            needsAsync = true;
            const query = ts.visitNode(child.expression.expression, nestedVisitor);
            const awaited = factory.createAwaitExpression(query);
            return terminal === "get"
              ? factory.createElementAccessExpression(factory.createParenthesizedExpression(awaited), factory.createNumericLiteral(0))
              : awaited;
          }
        }
        return ts.visitEachChild(child, nestedVisitor, context);
      };
      const visited = ts.visitEachChild(node, nestedVisitor, context);
      return update(visited, needsAsync ? asyncModifiers(factory, visited.modifiers) : visited.modifiers);
    };
    const visitor = (node) => {
      if (ts.isFunctionDeclaration(node)) return visitFunction(node, (n, modifiers) => factory.updateFunctionDeclaration(n, modifiers, n.asteriskToken, n.name, n.typeParameters, n.parameters, n.type, n.body));
      if (ts.isFunctionExpression(node)) return visitFunction(node, (n, modifiers) => factory.updateFunctionExpression(n, modifiers, n.asteriskToken, n.name, n.typeParameters, n.parameters, n.type, n.body));
      if (ts.isArrowFunction(node)) return visitFunction(node, (n, modifiers) => factory.updateArrowFunction(n, modifiers, n.typeParameters, n.parameters, n.type, n.equalsGreaterThanToken, n.body));
      if (ts.isMethodDeclaration(node)) return visitFunction(node, (n, modifiers) => factory.updateMethodDeclaration(n, modifiers, n.asteriskToken, n.name, n.questionToken, n.typeParameters, n.parameters, n.type, n.body));
      return ts.visitEachChild(node, visitor, context);
    };
    return (root) => ts.visitNode(root, visitor);
  };
  const result = ts.transform(source, [transformer]);
  if (changed) {
    const output = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]);
    fs.writeFileSync(file, output);
  }
  result.dispose();
}
