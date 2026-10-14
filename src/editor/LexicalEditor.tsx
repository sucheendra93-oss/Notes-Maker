'use dom';

import './editor.css';

import { AutoLinkNode, LinkNode, createLinkMatcherWithRegExp } from '@lexical/link';
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor as Editor,
  type TextFormatType,
} from 'lexical';
import { useEffect } from 'react';

type Props = {
  initialJson: string | null;
  dark: boolean;
  onChange: (json: string, plainText: string) => Promise<void>;
  onError: (message: string) => Promise<void>;
  onOpenLink: (url: string) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
};

const URL_MATCHER = createLinkMatcherWithRegExp(/https?:\/\/[^\s<]+[^\s<.,:;"')\]]/, (t) => t);

const theme = {
  heading: { h1: 'h1', h2: 'h2', h3: 'h3' },
  quote: 'quote',
  link: 'link',
  list: { ul: 'ul', ol: 'ol', checklist: 'checklist', listitem: 'li', listitemChecked: 'checked', listitemUnchecked: 'unchecked' },
  text: { bold: 'b', italic: 'i', underline: 'u', strikethrough: 's', underlineStrikethrough: 'us', code: 'code' },
};

export default function LexicalEditor({ initialJson, dark, onChange, onError, onOpenLink }: Props) {
  const initialConfig = {
    namespace: 'notes',
    theme,
    // No image/attachment nodes registered: pasted images are dropped (out of scope v1).
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode],
    onError: (e: Error) => void onError(e.message),
    editorState: (editor: Editor) => {
      if (!initialJson) return;
      try {
        editor.setEditorState(editor.parseEditorState(initialJson));
      } catch (e) {
        // Keep the stored content untouched: lock editing so nothing overwrites it.
        editor.setEditable(false);
        void onError(`Unsupported note content: ${(e as Error).message}`);
      }
    },
  };

  return (
    <div className={dark ? 'editor dark' : 'editor'}>
      <LexicalComposer initialConfig={initialConfig}>
        <Toolbar />
        <RichTextPlugin
          contentEditable={<ContentEditable className="content" aria-label="Note body" />}
          placeholder={<div className="placeholder">Start writing…</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <LinkPlugin />
        <AutoLinkPlugin matchers={[URL_MATCHER]} />
        <LinkClicks onOpenLink={onOpenLink} />
        <OnChangePlugin
          ignoreSelectionChange
          onChange={(state, editor) => {
            if (!editor.isEditable()) return;
            const text = state.read(() => $getRoot().getTextContent());
            void onChange(JSON.stringify(state.toJSON()), text);
          }}
        />
      </LexicalComposer>
    </div>
  );
}

// Links must open outside the WebView, never navigate it.
function LinkClicks({ onOpenLink }: { onOpenLink: Props['onOpenLink'] }) {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerRootListener((root, prev) => {
        const handler = (e: MouseEvent) => {
          const a = (e.target as HTMLElement).closest('a');
          if (!a) return;
          e.preventDefault();
          void onOpenLink(a.href);
        };
        prev?.removeEventListener('click', handler);
        root?.addEventListener('click', handler);
      }),
    [editor, onOpenLink],
  );
  return null;
}

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const format = (f: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, f);
  const block = (create: () => any) =>
    editor.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) $setBlocksType(sel, create);
    });

  const buttons: [string, string, () => void][] = [
    ['↶', 'Undo', () => editor.dispatchCommand(UNDO_COMMAND, undefined)],
    ['↷', 'Redo', () => editor.dispatchCommand(REDO_COMMAND, undefined)],
    ['B', 'Bold', () => format('bold')],
    ['I', 'Italic', () => format('italic')],
    ['U', 'Underline', () => format('underline')],
    ['S', 'Strikethrough', () => format('strikethrough')],
    ['</>', 'Inline code', () => format('code')],
    ['¶', 'Paragraph', () => block(() => $createParagraphNode())],
    ['H1', 'Heading 1', () => block(() => $createHeadingNode('h1'))],
    ['H2', 'Heading 2', () => block(() => $createHeadingNode('h2'))],
    ['H3', 'Heading 3', () => block(() => $createHeadingNode('h3'))],
    ['•', 'Bullet list', () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)],
    ['1.', 'Numbered list', () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)],
    ['☑', 'Checklist', () => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)],
    ['❝', 'Quote', () => block(() => $createQuoteNode())],
  ];

  return (
    <div className="toolbar" role="toolbar">
      {buttons.map(([label, name, run]) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          // preventDefault keeps focus (and the keyboard) in the editor.
          onPointerDown={(e) => {
            e.preventDefault();
            run();
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}
