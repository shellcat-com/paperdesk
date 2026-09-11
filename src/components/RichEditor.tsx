import {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link,
  ImagePlus,
  Table2,
  Undo2,
  Redo2,
  Search,
  Minus,
  Plus,
  Type,
  RemoveFormatting,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { IconButton, Modal } from "./ui";
import { download, escapeHtml, fileDataUrl, sanitize } from "../lib/files";
import type { DeskDocument } from "../lib/types";
export interface RichEditorHandle {
  export: (format: string) => Promise<void>;
}
export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    document: DeskDocument;
    onChange: (html: string) => void;
    notify: (s: string) => void;
  }
>(({ document: doc, onChange, notify }, ref) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [zoom, setZoom] = useState(100);
  const [, rerender] = useState(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
        },
      }),
      Image.configure({ allowBase64: true }),
      TableKit.configure({ table: { resizable: true } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: "Start with a thought…" }),
    ],
    content: doc.html,
    editorProps: {
      attributes: {
        class: "document-prose",
        "aria-label": "Document text",
        spellcheck: "true",
      },
      transformPastedHTML: (html) => sanitize(html),
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML());
      rerender((n) => n + 1);
    },
    onSelectionUpdate: () => rerender((n) => n + 1),
  });
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setFindOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor]);
  useImperativeHandle(
    ref,
    () => ({
      export: async (format) => {
        if (!editor) return;
        if (format === "docx") {
          const { exportDocx } = await import("../lib/docx-export");
          await exportDocx(editor.getJSON(), doc.name);
        } else if (format === "txt")
          download(
            new Blob([editor.getText()], { type: "text/plain;charset=utf-8" }),
            `${doc.name}.txt`,
          );
        else if (format === "html")
          download(
            new Blob(
              [
                `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(doc.name)}</title><style>body{max-width:760px;margin:48px auto;padding:24px;font:16px/1.65 Arial;color:#252a25}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:8px}img{max-width:100%}blockquote{border-left:3px solid #aaa;padding-left:16px}</style></head><body>${sanitize(editor.getHTML())}</body></html>`,
              ],
              { type: "text/html" },
            ),
            `${doc.name}.html`,
          );
        else if (format === "pdf") {
          const { default: html2pdf } = await import("html2pdf.js");
          const el = window.document.createElement("div");
          el.className = "document-prose export-prose";
          el.innerHTML = sanitize(editor.getHTML());
          el.style.cssText =
            "width:650px;padding:0;background:white;color:#242a26;font-family:Arial,sans-serif;font-size:14px;line-height:1.65;";
          const options = {
            margin: 18,
            filename: `${doc.name}.pdf`,
            image: { type: "jpeg" as const, quality: 0.98 },
            html2canvas: {
              scale: 2,
              useCORS: false,
              backgroundColor: "#ffffff",
            },
            jsPDF: {
              unit: "mm" as const,
              format: "a4",
              orientation: "portrait" as const,
            },
            pagebreak: { mode: ["avoid-all", "css", "legacy"] },
          };
          await html2pdf().set(options).from(el).save();
        }
      },
    }),
    [editor, doc.name],
  );
  if (!editor) return null;
  const matches: { from: number; to: number }[] = [];
  if (query)
    editor.state.doc.descendants((node, pos) => {
      if (node.isTextblock) {
        let text = "";
        const positions: number[] = [];
        node.descendants((child, offset) => {
          if (child.isText) {
            for (let i = 0; i < (child.text || "").length; i++) {
              text += child.text![i];
              positions.push(pos + 1 + offset + i);
            }
          } else if (child.type.name === "hardBreak") {
            text += "\n";
            positions.push(pos + 1 + offset);
          }
        });
        // Match against the original string: lowercasing can change Unicode length.
        const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(literal, matchCase ? "gu" : "giu");
        for (const match of text.matchAll(pattern)) {
          const index = match.index;
          matches.push({
            from: positions[index],
            to: positions[index + match[0].length - 1] + 1,
          });
        }
        return false;
      }
    });
  const replace = (all: boolean) => {
    const selected = all ? matches : matches.slice(0, 1);
    let tr = editor.state.tr;
    [...selected].reverse().forEach((m) => {
      tr = tr.insertText(replacement, m.from, m.to);
    });
    editor.view.dispatch(tr);
    notify(
      `${selected.length} ${selected.length === 1 ? "correction" : "corrections"} made.`,
    );
  };
  const nextMatch = () => {
    const match =
      matches.find((m) => m.from > editor.state.selection.from) || matches[0];
    if (match)
      editor.chain().focus().setTextSelection(match).scrollIntoView().run();
  };
  const words = editor.getText().trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="rich-editor">
      <div className="format-bar" aria-label="Text formatting">
        <div className="tool-group">
          <IconButton
            label="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 size={17} />
          </IconButton>
          <IconButton
            label="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 size={17} />
          </IconButton>
        </div>
        <div className="tool-group">
          <select
            aria-label="Paragraph style"
            value={
              editor.isActive("heading", { level: 1 })
                ? "1"
                : editor.isActive("heading", { level: 2 })
                  ? "2"
                  : editor.isActive("heading", { level: 3 })
                    ? "3"
                    : "0"
            }
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v)
                editor
                  .chain()
                  .focus()
                  .setHeading({ level: v as 1 | 2 | 3 })
                  .run();
              else editor.chain().focus().setParagraph().run();
            }}
          >
            <option value="0">Normal text</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
          </select>
          <select
            aria-label="Font family"
            value={editor.getAttributes("textStyle").fontFamily || "Arial"}
            onChange={(e) =>
              editor.chain().focus().setFontFamily(e.target.value).run()
            }
          >
            <option>Arial</option>
            <option>Georgia</option>
            <option>Verdana</option>
            <option>Courier New</option>
          </select>
          <select
            aria-label="Font size"
            value={editor.getAttributes("textStyle").fontSize || "15px"}
            onChange={(e) =>
              editor.chain().focus().setFontSize(e.target.value).run()
            }
          >
            {[10, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72].map(
              (size) => (
                <option key={size} value={`${size}px`}>
                  {size}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="tool-group">
          <IconButton
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={17} />
          </IconButton>
          <IconButton
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={17} />
          </IconButton>
          <IconButton
            label="Underline"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline size={17} />
          </IconButton>
          <IconButton
            label="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={17} />
          </IconButton>
          <IconButton
            label="Highlight text"
            active={editor.isActive("highlight")}
            onClick={() =>
              editor.chain().focus().toggleHighlight({ color: "#ede6a8" }).run()
            }
          >
            <Highlighter size={17} />
          </IconButton>
          <label className="color-tool" title="Text color">
            <Type size={16} />
            <input
              aria-label="Text color"
              type="color"
              value={editor.getAttributes("textStyle").color || "#242a26"}
              onChange={(e) =>
                editor.chain().focus().setColor(e.target.value).run()
              }
            />
          </label>
        </div>
        <div className="tool-group">
          <IconButton
            label="Align left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft size={17} />
          </IconButton>
          <IconButton
            label="Align center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter size={17} />
          </IconButton>
          <IconButton
            label="Align right"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight size={17} />
          </IconButton>
          <IconButton
            label="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={17} />
          </IconButton>
          <IconButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={17} />
          </IconButton>
        </div>
        <div className="tool-group">
          <IconButton
            label="Insert link"
            onClick={() => {
              setUrl(editor.getAttributes("link").href || "");
              setLinkOpen(true);
            }}
          >
            <Link size={17} />
          </IconButton>
          <IconButton
            label="Insert image"
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus size={17} />
          </IconButton>
          <IconButton
            label="Insert table"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <Table2 size={17} />
          </IconButton>
          <IconButton
            label="Clear formatting"
            onClick={() =>
              editor.chain().focus().unsetAllMarks().clearNodes().run()
            }
          >
            <RemoveFormatting size={17} />
          </IconButton>
        </div>
        <button
          className={`small-button find-button ${findOpen ? "active" : ""}`}
          onClick={() => setFindOpen((v) => !v)}
        >
          <Search size={15} />
          <span>Find & replace</span>
        </button>
      </div>
      {findOpen && (
        <div className="find-panel">
          <label>
            Find
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, date, or text"
            />
          </label>
          <label>
            Replace with
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Corrected text"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
            />
            Match case
          </label>
          <span className="muted match-count">{matches.length} matches</span>
          <button
            className="small-button"
            disabled={!matches.length}
            onClick={nextMatch}
          >
            Find next
          </button>
          <button
            className="small-button"
            disabled={!matches.length}
            onClick={() => replace(false)}
          >
            Replace first
          </button>
          <button
            className="small-button filled"
            disabled={!matches.length}
            onClick={() => replace(true)}
          >
            Replace all
          </button>
        </div>
      )}
      {editor.isActive("table") && (
        <div className="table-actions">
          <span>Table</span>
          <button onClick={() => editor.chain().focus().addRowAfter().run()}>
            Add row
          </button>
          <button onClick={() => editor.chain().focus().addColumnAfter().run()}>
            Add column
          </button>
          <button onClick={() => editor.chain().focus().deleteRow().run()}>
            Delete row
          </button>
          <button onClick={() => editor.chain().focus().deleteColumn().run()}>
            Delete column
          </button>
          <button onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 size={13} />
            Delete table
          </button>
        </div>
      )}
      <div className="writing-workspace">
        <aside className="outline-panel">
          <span className="section-label">IN THIS DOCUMENT</span>
          <h3>Outline</h3>
          {(() => {
            const headings: { text: string; pos: number; level: number }[] = [];
            editor.state.doc.descendants((node, pos) => {
              if (node.type.name === "heading")
                headings.push({
                  text: node.textContent,
                  pos,
                  level: node.attrs.level,
                });
            });
            return headings.length ? (
              headings.map((h, i) => (
                <button
                  key={i}
                  className={`outline-link level-${h.level}`}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .setTextSelection(h.pos + 1)
                      .scrollIntoView()
                      .run()
                  }
                >
                  {h.text || "Untitled heading"}
                </button>
              ))
            ) : (
              <p className="muted">
                Your headings will appear here as you write.
              </p>
            );
          })()}
          <div className="outline-tip">
            <Type size={19} />
            <p>Small details, sorted.</p>
            <span>
              Use Find & replace to correct a name or date throughout your
              document.
            </span>
          </div>
        </aside>
        <div className="paper-scroll">
          <div className="paper-ruler" aria-hidden="true">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
          </div>
          <div className="writing-paper" style={{ zoom: zoom / 100 }}>
            <EditorContent editor={editor} />
          </div>
          <p className="paper-hint">A little space to make it your own.</p>
        </div>
      </div>
      <div className="editor-status">
        <span>
          <span className="status-dot" />
          Editing locally
        </span>
        <span>
          {words} words<span className="status-separator">·</span>
          {editor.getText().length} characters
        </span>
        <div className="zoom-tools">
          <IconButton
            label="Zoom out"
            disabled={zoom <= 60}
            onClick={() => setZoom((z) => z - 10)}
          >
            <Minus size={14} />
          </IconButton>
          <span>{zoom}%</span>
          <IconButton
            label="Zoom in"
            disabled={zoom >= 140}
            onClick={() => setZoom((z) => z + 10)}
          >
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > 8 * 1024 * 1024) {
              notify("Choose an image smaller than 8 MB.");
              return;
            }
            try {
              editor
                .chain()
                .focus()
                .setImage({ src: await fileDataUrl(file), alt: file.name })
                .run();
            } catch {
              notify("Could not insert this image.");
            }
          }
          e.target.value = "";
        }}
      />
      {linkOpen && (
        <Modal title="Add a link" onClose={() => setLinkOpen(false)}>
          <form
            className="modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^(https?:\/\/|mailto:)/i.test(url)) {
                notify("Use a full https:// or mailto: address.");
                return;
              }
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url })
                .run();
              setLinkOpen(false);
            }}
          >
            <label>
              Destination
              <input
                autoFocus
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="small-button"
                onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                Remove link
              </button>
              <button className="primary-button">
                Apply link
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
});
