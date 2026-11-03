"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { OptionSelect } from "@/components/mail/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REPLY_HISTORY_ATTRIBUTE } from "@/lib/mail/message-layout.mts";

// Preserve the reply boundary through editing and draft save/reopen cycles.
const ReplyHistory = Extension.create({
  name: "replyHistory",
  addGlobalAttributes() {
    return [{
      types: ["blockquote"],
      attributes: {
        replyHistory: {
          default: null,
          parseHTML: (element) => element.getAttribute(REPLY_HISTORY_ATTRIBUTE) === "true" ? true : null,
          renderHTML: (attributes) => attributes.replyHistory ? { [REPLY_HISTORY_ATTRIBUTE]: "true" } : {},
        },
      },
    }];
  },
});

interface RichTextEditorProps {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange(html: string, text: string): void;
}

function plainTextToHtml(value: string): string {
  return value.split(/\n{2,}/).map((paragraph) =>
    `<p>${paragraph.split("\n").map((line) => line
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")).join("<br>") || "<br>"}</p>`,
  ).join("");
}

export function RichTextEditor({
  id,
  label,
  value,
  disabled = false,
  onChange,
}: RichTextEditorProps) {
  const lastExternalValue = useRef(value);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    extensions: [
      ReplyHistory,
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
    ],
    content: value || "<p></p>",
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": label,
        id,
        spellcheck: "true",
        "data-rich-text-input": "true",
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      lastExternalValue.current = html;
      onChange(html, current.getText({ blockSeparator: "\n" }));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextValue = value || "<p></p>";
    if (editor.getHTML() !== nextValue && lastExternalValue.current !== nextValue) {
      editor.commands.setContent(nextValue, { emitUpdate: false });
    }
    lastExternalValue.current = nextValue;
  }, [editor, value]);

  useEffect(() => {
    // Toggling editability is not an edit, so it must not emit an update.
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);

  function openLinkEditor() {
    if (!editor || disabled) return;
    editor.chain().extendMarkRange("link").run();
    const { from, to } = editor.state.selection;
    setLinkHref(editor.getAttributes("link").href ?? "");
    setLinkText(editor.state.doc.textBetween(from, to, " "));
    setLinkError("");
    setLinkEditorOpen(true);
  }

  function saveLink() {
    if (!editor || disabled) return;
    try {
      const parsed = new URL(linkHref.trim());
      if (
        !["http:", "https:", "mailto:"].includes(parsed.protocol) ||
        parsed.username || parsed.password ||
        (parsed.protocol === "mailto:" && !parsed.pathname)
      ) throw new Error("invalid_link");
      const { from, to, empty } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, " ");
      const displayText = linkText.trim();
      if ((displayText && displayText !== selectedText) || (empty && !editor.isActive("link"))) {
        editor.chain().focus().insertContent({
          type: "text",
          text: displayText || parsed.href,
          marks: [
            ...editor.state.selection.$from.marks().filter((mark) => mark.type.name !== "link").map((mark) => mark.toJSON()),
            { type: "link", attrs: { href: parsed.href } },
          ],
        }).run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href: parsed.href }).run();
      }
      setLinkEditorOpen(false);
    } catch {
      setLinkError("Enter a complete http, https, or mailto link.");
    }
  }

  function toolbarButton(
    name: string,
    labelText: string,
    active: boolean | null,
    command: () => void,
  ) {
    return (
      <Button
        aria-label={labelText}
        aria-pressed={active === null ? undefined : active}
        className="rich-text-tool aria-pressed:bg-accent aria-pressed:text-accent-foreground"
        disabled={!editor || disabled}
        key={name}
        onMouseDown={(event) => event.preventDefault()}
        onClick={command}
        size="sm"
        variant="ghost"
      >
        {id === "compose-body" && ["bold", "italic", "underline", "strike"].includes(name)
          ? <img src={`/figma-mail/format-${name}.svg`} alt="" />
          : labelText}
      </Button>
    );
  }

  if (!editor) {
    return <div className="rich-text-editor is-loading" aria-busy="true" />;
  }

  return (
    <div className={`rich-text-editor${disabled ? " is-disabled" : ""}`}>
      <div className="rich-text-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {toolbarButton("bold", "Bold", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
        {toolbarButton("italic", "Italic", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
        {toolbarButton("underline", "Underline", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run())}
        {toolbarButton("strike", "Strikethrough", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run())}
        <label className="rich-text-heading-label" htmlFor={`${id}-heading`}>Heading</label>
        <OptionSelect
          className="w-40 shrink-0"
          label="Text style"
          disabled={disabled}
          id={`${id}-heading`}
          onChange={(heading) => {
            if (heading === "paragraph") editor.chain().setParagraph().run();
            else editor.chain().toggleHeading({ level: Number(heading) as 1 | 2 | 3 }).run();
          }}
          options={[
            { value: "paragraph", label: "Paragraph" },
            { value: "1", label: "Heading 1" },
            { value: "2", label: "Heading 2" },
            { value: "3", label: "Heading 3" },
          ]}
          value={editor.isActive("heading", { level: 1 }) ? "1"
            : editor.isActive("heading", { level: 2 }) ? "2"
              : editor.isActive("heading", { level: 3 }) ? "3" : "paragraph"}
        />
        {toolbarButton("bullet-list", "Bulleted list", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
        {toolbarButton("ordered-list", "Numbered list", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
        {toolbarButton("blockquote", "Quote", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
        {toolbarButton("link", "Link", editor.isActive("link"), openLinkEditor)}
        {toolbarButton("undo", "Undo", null, () => editor.chain().focus().undo().run())}
        {toolbarButton("redo", "Redo", null, () => editor.chain().focus().redo().run())}
      </div>
      {linkEditorOpen ? (
        <div className="rich-text-link-form" role="group" aria-label="Edit link"
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
              // Applying a link must never submit the enclosing message form.
              event.preventDefault();
              event.stopPropagation();
              saveLink();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setLinkEditorOpen(false);
              editor.commands.focus();
            }
          }}>
          <div className="rich-text-link-field">
          <label htmlFor={`${id}-link`}>Link address</label>
          <Input
            autoComplete="url"
            autoFocus
            disabled={disabled}
            aria-invalid={Boolean(linkError)}
            aria-describedby={linkError ? `${id}-link-error` : undefined}
            id={`${id}-link`}
            onChange={(event) => setLinkHref(event.target.value)}
            placeholder="https://example.com"
            type="text"
            value={linkHref}
          />
          </div>
          <div className="rich-text-link-field">
            <label htmlFor={`${id}-link-text`}>Display text (optional)</label>
            <Input
              autoComplete="off"
              disabled={disabled}
              id={`${id}-link-text`}
              onChange={(event) => setLinkText(event.target.value)}
              placeholder="Selected text or link address"
              type="text"
              value={linkText}
            />
          </div>
          <Button disabled={disabled} onClick={saveLink} size="sm">Apply link</Button>
          <Button disabled={disabled} onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            setLinkEditorOpen(false);
          }} size="sm" variant="outline">Remove link</Button>
          <Button disabled={disabled} onClick={() => { setLinkEditorOpen(false); editor.commands.focus(); }} size="sm" variant="outline">Cancel</Button>
          {linkError ? <span id={`${id}-link-error`} role="alert">{linkError}</span> : null}
        </div>
      ) : null}
      <EditorContent className="rich-text-content" editor={editor} />
    </div>
  );
}

export function plainTextEditorContent(value: string): string {
  return plainTextToHtml(value);
}
