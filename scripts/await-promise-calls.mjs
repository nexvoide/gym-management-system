import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

function asyncModifiers(factory, modifiers) {
  if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) return modifiers;
  return factory.createNodeArray([...(modifiers ?? []), factory.createModifier(ts.SyntaxKind.AsyncKeyword)]);
}

for (const source of program.getSourceFiles()) {
  const relativeFile = path.relative(process.cwd(), source.fileName).replaceAll(path.sep, "/");
  if (source.isDeclarationFile || !/^(src|tests)\//.test(relativeFile)) continue;
  let changed = false;
  const transformer = (context) => {
    const { factory } = context;
    const isPromise = (node) => Boolean(checker.getPropertyOfType(checker.getApparentType(checker.getTypeAtLocation(node)), "then"));
    const visitFunction = (node, update) => {
      let needsAsync = false;
      const nestedVisitor = (child) => {
        if (ts.isFunctionLike(child) && child !== node) return visitor(child);
        const visited = ts.visitEachChild(child, nestedVisitor, context);
        if (ts.isCallExpression(child) && !ts.isAwaitExpression(child.parent) && isPromise(child)) {
          changed = true;
          needsAsync = true;
          return factory.createAwaitExpression(visited);
        }
        return visited;
      };
      const visited = ts.visitEachChild(node, nestedVisitor, context);
      return update(visited, needsAsync ? asyncModifiers(factory, visited.modifiers) : visited.modifiers);
    };
    const visitor = (node) => {
      if (ts.isFunctionDeclaration(node)) return visitFunction(node, (n, modifiers) => factory.updateFunctionDeclaration(n, modifiers, n.asteriskToken, n.name, n.typeParameters, n.parameters, n.type, n.body));
      if (ts.isFunctionExpression(node)) return visitFunction(node, (n, modifiers) => factory.updateFunctionExpression(n, modifiers, n.asteriskToken, n.name, n.typeParameters, n.parameters, n.type, n.body));
      if (ts.isArrowFunction(node)) return visitFunction(node, (n, modifiers) => factory.updateArrowFunction(n, modifiers, n.typeParameters, n.parameters, n.type, n.equalsGreaterThanToken, n.body));
      if (ts.isMethodDeclaration(node)) return visitFunction(node, (n, modifiers) => factory.updateMethodDeclaration(n, modifiers, n.asteriskToken, n.name, n.questionToken, n.typeParameters, n.parameters, n.type, n.body));
      const visited = ts.visitEachChild(node, visitor, context);
      if (ts.isCallExpression(node) && !ts.isAwaitExpression(node.parent) && isPromise(node)) {
        changed = true;
        return factory.createAwaitExpression(visited);
      }
      return visited;
    };
    return (root) => ts.visitNode(root, visitor);
  };
  const result = ts.transform(source, [transformer]);
  if (changed) fs.writeFileSync(source.fileName, ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]));
  result.dispose();
}
