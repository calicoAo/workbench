// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

// Browser assertions verify layout; this guard keeps every existing dialog family on that contract.
it('keeps modal panels on the shared header, close and action presentation contract', () => {
  const panels = new Set(['time-modal', 'writing-modal', 'tool-modal', 'task-selection-modal', 'feedback-modal', 'finish-dialog', 'quick-note-editor', 'inspiration-dialog', 'library-create-dialog', 'backpack-create-dialog', 'backpack-detail', 'earth-entry', 'onboarding-welcome', 'category-editor-form']);
  const seen = new Set<string>();
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(resolve(dir, item.name)) : item.name.endsWith('.tsx') && !item.name.includes('.test.') ? [resolve(dir, item.name)] : []);
  for (const file of files(resolve(process.cwd(), 'src'))) {
    const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node)) {
        const attribute = node.openingElement.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(tree) === 'className') as ts.JsxAttribute | undefined;
        const value = attribute?.initializer;
        const classes = value && ts.isStringLiteral(value) ? value.text.split(' ') : value?.getText(tree).includes('feedback-modal') ? ['feedback-modal', ...(value.getText(tree).includes('ui-dialog') ? ['ui-dialog'] : [])] : [];
        const family = classes.find(name => panels.has(name));
        if (family) {
          seen.add(family);
          expect(classes, file).toContain('ui-dialog');
          const first = node.children.find(item => ts.isJsxElement(item) || ts.isJsxSelfClosingElement(item));
          const tag = first && ts.isJsxElement(first) ? first.openingElement.tagName.getText(tree) : first && ts.isJsxSelfClosingElement(first) ? first.tagName.getText(tree) : '';
          expect(['header', 'ToolModalHeader'], file).toContain(tag);
          expect(node.getText(tree), file).toMatch(/(?:CloseButton|IconButton|Button iconOnly|ToolModalHeader)/);
          // Read-only completed history can close entirely from its header.
          if (!node.getText(tree).includes('task-pool-list') || node.getText(tree).includes('<form')) expect(node.getText(tree), file).toMatch(/(?:<footer|ModalActions)/);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  expect(seen).toEqual(panels);
});
