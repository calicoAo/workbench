import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "apps/web/src");
const messagesFile = path.join(sourceRoot, "app/i18n/messages.ts");
const chinese = /[\u3400-\u9fff]/;
const feedbackCalls = new Set(["onError", "setError", "setInlineError", "setNotice", "setMessage", "setStatusMessage", "confirm", "alert"]);
const feedbackHelpers = new Set(["message", "errorMessage", "apiError", "financeErrorMessage"]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(file);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [file];
  });
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function callName(node) {
  if (!ts.isCallExpression(node)) return undefined;
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return undefined;
}

function isTranslatedArgument(node) {
  const parent = node.parent;
  return ts.isCallExpression(parent) && (callName(parent) === "t" || callName(parent) === "tx") && parent.arguments[0] === node;
}

function dictionaryEntries() {
  const source = ts.createSourceFile(messagesFile, fs.readFileSync(messagesFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "englishMessages" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        if ((ts.isStringLiteral(property.name) || ts.isIdentifier(property.name)) && ts.isStringLiteral(property.initializer)) entries.set(property.name.text, property.initializer.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return entries;
}

function isVisibleBoundary(node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxExpression(current)) return true;
    if (ts.isCallExpression(current) && feedbackCalls.has(callName(current) ?? "")) return true;
    if (ts.isNewExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "Error") return true;
    if (ts.isFunctionDeclaration(current) && current.name && feedbackHelpers.has(current.name.text)) return true;
    if (ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

const used = new Set();
const unwrapped = [];
for (const file of walk(sourceRoot)) {
  if (file === messagesFile) continue;
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function report(node, value, kind) {
    const compact = value.replace(/\s+/g, " " ).trim();
    if (compact) unwrapped.push(`${path.relative(root, file)}:${lineOf(source, node)} [${kind}] ${compact}`);
  }
  function visit(node) {
    if (ts.isCallExpression(node) && (callName(node) === "t" || callName(node) === "tx")) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) used.add(argument.text);
    }
    if (ts.isJsxText(node) && chinese.test(node.text)) report(node, node.text, "jsx");
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && chinese.test(node.initializer.text)) report(node.initializer, node.initializer.text, "attribute");
    if (ts.isStringLiteralLike(node) && chinese.test(node.text) && !isTranslatedArgument(node) && isVisibleBoundary(node)) {
      const parent = node.parent;
      const structural = ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isPropertyAssignment(parent) && parent.name === node;
      if (!structural) report(node, node.text, ts.isNoSubstitutionTemplateLiteral(node) ? "template" : "string");
    }
    if (ts.isTemplateExpression(node) && chinese.test(node.getText(source)) && !isTranslatedArgument(node) && isVisibleBoundary(node)) report(node, node.getText(source), "template");
    if (ts.isNewExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.getText(source) === "Intl.DateTimeFormat" && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "zh-CN") report(node.arguments[0], node.arguments[0].text, "fixed-locale");
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const dictionary = dictionaryEntries();
const missing = [...used].filter((key) => !dictionary.has(key)).sort();
const untranslated = [...dictionary].filter(([, value]) => chinese.test(value));
console.log(`i18n keys: ${used.size}; English messages: ${dictionary.size}; missing: ${missing.length}; untranslated English: ${untranslated.length}; visible Chinese: ${unwrapped.length}`);
if (missing.length) console.log(`\nMissing English messages:\n${missing.map((key) => `- ${key}`).join("\n")}`);
if (untranslated.length) console.log(`\nEnglish messages containing Chinese:\n${untranslated.map(([key, value]) => `- ${key} => ${value}`).join("\n")}`);
if (unwrapped.length) console.log(`\nVisible Chinese outside i18n:\n${unwrapped.join("\n")}`);
if (missing.length || untranslated.length || unwrapped.length) process.exitCode = 1;
