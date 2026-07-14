import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { javaLanguage } from './javaMonarch';
import { getCompletions } from './javaCompletion';
import { isJavaAutocompleteEnabled } from './javaCompletionSettings';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

monaco.editor.defineTheme('dracula', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'f8f8f2' },
    { token: 'invalid', foreground: 'ff5555' },
    { token: 'emphasis', fontStyle: 'italic' },
    { token: 'strong', fontStyle: 'bold' },
    { token: 'comment', foreground: '6272a4' },
    { token: 'string', foreground: 'f1fa8c' },
    { token: 'string.key.json', foreground: '8be9fd' },
    { token: 'string.value.json', foreground: 'f1fa8c' },
    { token: 'number', foreground: 'bd93f9' },
    { token: 'regexp', foreground: 'f1fa8c' },
    { token: 'constant', foreground: 'bd93f9' },
    { token: 'variable', foreground: 'f8f8f2' },
    { token: 'variable.predefined', foreground: 'ff9d00' },
    { token: 'keyword', foreground: 'ff79c6' },
    { token: 'keyword.flow', foreground: 'ff79c6' },
    { token: 'operator', foreground: 'ff79c6' },
    { token: 'namespace', foreground: '50fa7b' },
    { token: 'type', foreground: '8be9fd' },
    { token: 'annotation', foreground: '50fa7b' },
    { token: 'function', foreground: '50fa7b' },
    { token: 'member', foreground: '50fa7b' },
    { token: 'tag', foreground: 'ff79c6' },
    { token: 'attribute.name', foreground: '50fa7b' },
    { token: 'attribute.value', foreground: 'f1fa8c' },
    { token: 'delimiter', foreground: 'f8f8f2' },
  ],
  colors: {
    'editor.background': '#282a36',
    'editor.foreground': '#f8f8f2',
    'editorCursor.foreground': '#f8f8f0',
    'editor.lineHighlightBackground': '#44475a',
    'editorLineNumber.foreground': '#6272a4',
    'editorLineNumber.activeForeground': '#f8f8f2',
    'editor.selectionBackground': '#44475a',
    'editor.inactiveSelectionBackground': '#44475a80',
  },
});

monaco.languages.setMonarchTokensProvider('java', javaLanguage);

monaco.languages.registerCompletionItemProvider('java', {
  triggerCharacters: ['.'],
  provideCompletionItems(model, position) {
    if (!isJavaAutocompleteEnabled()) return { suggestions: [] };

    const lineTextBeforeCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    const members = getCompletions(model.getValue(), lineTextBeforeCursor);
    if (members.length === 0) return { suggestions: [] };

    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

    const suggestions: monaco.languages.CompletionItem[] = members.map((member) => ({
      label: member.name,
      kind: member.kind === 'method' ? monaco.languages.CompletionItemKind.Method : monaco.languages.CompletionItemKind.Field,
      insertText: member.name + member.snippet,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: member.detail,
      range,
    }));
    return { suggestions };
  },
});

loader.config({ monaco });
