import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const files = ["src", "tests"].flatMap(walk);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : /\.tsx?$/.test(entry.name) ? [target] : [];
  });
}

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("await")) continue;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let changed = false;
  const transformer = (context) => {
    const isIntermediateChainAwait = (node) => {
      let current = node;
      while (ts.isParenthesizedExpression(current.parent) && current.parent.expression === current) {
        current = current.parent;
      }
      return ts.isPropertyAccessExpression(current.parent) && current.parent.expression === current;
    };
    const visitor = (node) => {
      if (ts.isAwaitExpression(node) && isIntermediateChainAwait(node)) {
        changed = true;
        return ts.visitNode(node.expression, visitor);
      }
      return ts.visitEachChild(node, visitor, context);
    };
    return (root) => ts.visitNode(root, visitor);
  };
  const result = ts.transform(source, [transformer]);
  if (changed) fs.writeFileSync(file, ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]));
  result.dispose();
}
