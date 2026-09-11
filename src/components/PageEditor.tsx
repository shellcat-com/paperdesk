import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  MousePointer2,
  Type,
  Eraser,
  Highlighter,
  Square,
  ImagePlus,
  Undo2,
  Redo2,
  RotateCw,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  ScanText,
  FileText,
  Download,
  Minus,
  Move,
  Check,
} from "lucide-react";
import { IconButton } from "./ui";
import {
  uid,
  type DeskDocument,
  type DocumentPage,
  type PageElement,
  type TextBox,
} from "../lib/types";
import {
  fileDataUrl,
  loadImage,
  exportPages,
  renderPage,
  download,
  plainToHtml,
} from "../lib/files";
export interface PageEditorHandle {
  export: (format: string) => Promise<void>;
  append: (incoming: DocumentPage[]) => void;
}
type Tool = "select" | "text" | "erase" | "highlight" | "rectangle";
export const PageEditor = forwardRef<
  PageEditorHandle,
  {
    document: DeskDocument;
    onChange: (pages: DocumentPage[]) => void;
    notify: (s: string) => void;
    setBusy: (s: string) => void;
    onText: (html: string) => void;
    onAppend: () => void;
  }
>(({ document: doc, onChange, notify, setBusy, onText, onAppend }, ref) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string>();
  const [zoom, setZoom] = useState(100);
  const [color, setColor] = useState("#ffffff");
  const [history, setHistory] = useState<DocumentPage[][]>([]);
  const [future, setFuture] = useState<DocumentPage[][]>([]);
  const [draft, setDraft] = useState<PageElement>();
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const pages = doc.pages;
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const element = page.elements.find((e) => e.id === selected);
  const gesture = useRef<{
    start: { x: number; y: number };
    original?: PageElement;
    mode: "draw" | "move" | "resize";
    before: DocumentPage[];
  } | null>(null);
  const commit = (next: DocumentPage[], before = pages) => {
    setHistory((h) => [...h.slice(-34), before]);
    setFuture([]);
    onChange(next);
  };
  const replacePage = (next: DocumentPage, save = true) => {
    const updated = pages.map((p) => (p.id === page.id ? next : p));
    if (save) commit(updated);
    else onChange(updated);
  };
  const update = (patch: Partial<PageElement>) => {
    if (element)
      replacePage({
        ...page,
        elements: page.elements.map((e) =>
          e.id === element.id ? { ...e, ...patch } : e,
        ),
      });
  };
  const undo = () => {
    if (history.length) {
      const previous = history[history.length - 1];
      setFuture((f) => [pages, ...f]);
      setHistory((h) => h.slice(0, -1));
      onChange(previous);
      setSelected(undefined);
      setPageIndex((i) => Math.min(i, previous.length - 1));
    }
  };
  const redo = () => {
    if (future.length) {
      const next = future[0];
      setHistory((h) => [...h, pages]);
      setFuture((f) => f.slice(1));
      onChange(next);
      setPageIndex((i) => Math.min(i, next.length - 1));
    }
  };
  const remove = () => {
    if (element) {
      replacePage({
        ...page,
        elements: page.elements.filter((e) => e.id !== element.id),
      });
      setSelected(undefined);
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]"))
        return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        remove();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === "Escape") {
        setSelected(undefined);
        setTool("select");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useImperativeHandle(
    ref,
    () => ({
      append: (incoming: DocumentPage[]) => {
        commit([...pages, ...incoming]);
        setPageIndex(pages.length);
        setSelected(undefined);
      },
      export: async (format) => {
        if (format === "png") {
          const canvas = await renderPage(page);
          const rotated = document.createElement("canvas");
          const swap = page.rotation % 180 !== 0;
          rotated.width = swap ? canvas.height : canvas.width;
          rotated.height = swap ? canvas.width : canvas.height;
          const ctx = rotated.getContext("2d")!;
          ctx.translate(rotated.width / 2, rotated.height / 2);
          ctx.rotate((page.rotation * Math.PI) / 180);
          ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          const blob = await new Promise<Blob>((resolve, reject) =>
            rotated.toBlob(
              (b) =>
                b ? resolve(b) : reject(new Error("Image export failed.")),
              "image/png",
            ),
          );
          download(blob, `${doc.name}-page-${pageIndex + 1}.png`);
        } else
          await exportPages(
            format === "page" ? [page] : pages,
            doc.name,
            setBusy,
          );
      },
    }),
    [pages, page, doc.name, pageIndex, setBusy],
  );
  const swap = page.rotation % 180 !== 0;
  const vw = swap ? page.height : page.width;
  const vh = swap ? page.width : page.height;
  const transform =
    page.rotation === 90
      ? `translate(${page.height} 0) rotate(90)`
      : page.rotation === 180
        ? `translate(${page.width} ${page.height}) rotate(180)`
        : page.rotation === 270
          ? `translate(0 ${page.width}) rotate(270)`
          : "";
  const point = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * vw) / rect.width;
    const y = ((e.clientY - rect.top) * vh) / rect.height;
    const p =
      page.rotation === 90
        ? { x: y, y: page.height - x }
        : page.rotation === 180
          ? { x: page.width - x, y: page.height - y }
          : page.rotation === 270
            ? { x: page.width - y, y: x }
            : { x, y };
    return {
      x: Math.max(0, Math.min(page.width, p.x)),
      y: Math.max(0, Math.min(page.height, p.y)),
    };
  };
  const chooseTool = (next: Tool) => {
    setTool(next);
    setSelected(undefined);
    if (next === "erase") setColor("#ffffff");
    if (next === "highlight") setColor("#ead35f");
    if (next === "rectangle") setColor("#536747");
  };
  const correct = (box: TextBox) => {
    const el: PageElement = {
      id: uid(),
      kind: "text",
      x: Math.max(0, box.x - 1),
      y: Math.max(0, box.y - 1),
      w: Math.min(page.width - box.x, box.w + 4),
      h: box.h + 3,
      text: box.text,
      fontSize: Math.round(box.fontSize * 10) / 10,
      font: box.font,
      color: "#222222",
      background: "#ffffff",
    };
    replacePage({ ...page, elements: [...page.elements, el] });
    setSelected(el.id);
    setTool("select");
  };
  const pointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = point(e);
    const target = e.target as SVGElement;
    const hit = target.closest("[data-element]")?.getAttribute("data-element");
    if (tool === "select" && hit) {
      const original = page.elements.find((el) => el.id === hit)!;
      setSelected(hit);
      gesture.current = {
        start: p,
        original,
        mode: target.getAttribute("data-resize") ? "resize" : "move",
        before: pages,
      };
    } else if (tool === "text") {
      const el: PageElement = {
        id: uid(),
        kind: "text",
        x: p.x,
        y: p.y,
        w: Math.min(180, page.width - p.x),
        h: 30,
        text: "Your text",
        fontSize: 18,
        font: "Arial",
        color: "#242a26",
        background: "transparent",
      };
      replacePage({ ...page, elements: [...page.elements, el] });
      setSelected(el.id);
      setTool("select");
      return;
    } else if (tool !== "select") {
      gesture.current = { start: p, mode: "draw", before: pages };
      setDraft({ id: uid(), kind: tool, x: p.x, y: p.y, w: 0, h: 0, color });
    } else {
      setSelected(undefined);
      return;
    }
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const pointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.mode === "draw") {
      setDraft((d) =>
        d
          ? {
              ...d,
              x: Math.min(p.x, g.start.x),
              y: Math.min(p.y, g.start.y),
              w: Math.abs(p.x - g.start.x),
              h: Math.abs(p.y - g.start.y),
            }
          : d,
      );
    } else if (g.original) {
      const el = g.original;
      const next =
        g.mode === "move"
          ? {
              ...el,
              x: Math.max(
                0,
                Math.min(page.width - el.w, el.x + p.x - g.start.x),
              ),
              y: Math.max(
                0,
                Math.min(page.height - el.h, el.y + p.y - g.start.y),
              ),
            }
          : {
              ...el,
              w: Math.max(
                4,
                Math.min(page.width - el.x, el.w + p.x - g.start.x),
              ),
              h: Math.max(
                4,
                Math.min(page.height - el.y, el.h + p.y - g.start.y),
              ),
            };
      replacePage(
        {
          ...page,
          elements: page.elements.map((item) =>
            item.id === el.id ? next : item,
          ),
        },
        false,
      );
    }
  };
  const pointerUp = () => {
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "draw" && draft && draft.w > 2 && draft.h > 2) {
      commit(
        pages.map((p) =>
          p.id === page.id ? { ...p, elements: [...p.elements, draft] } : p,
        ),
        g.before,
      );
      setSelected(draft.id);
      setTool("select");
    } else if (g.mode !== "draw") {
      setHistory((h) => [...h.slice(-34), g.before]);
      setFuture([]);
    }
    gesture.current = null;
    setDraft(undefined);
    setDragging(false);
  };
  const ocr = async () => {
    setBusy("Preparing English text recognition…");
    let worker:
      | Awaited<ReturnType<typeof import("tesseract.js").createWorker>>
      | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status)
            setBusy(
              `${m.status.charAt(0).toUpperCase() + m.status.slice(1)}${m.progress ? ` · ${Math.round(m.progress * 100)}%` : ""}`,
            );
        },
      });
      const canvas = await renderPage(page, 2);
      const result = await worker.recognize(canvas);
      if (!result.data.text.trim())
        throw new Error("No readable text was found. Try a clearer scan.");
      onText(plainToHtml(result.data.text));
      notify(
        "Recognized text opened as a new document. Check names and dates carefully.",
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Text recognition failed. Please try again.",
      );
    } finally {
      await worker?.terminate();
      setBusy("");
    }
  };
  const paint = (el: PageElement, preview = false) => (
    <g
      key={el.id}
      data-element={preview ? undefined : el.id}
      className={`page-object ${selected === el.id ? "selected" : ""}`}
    >
      {el.kind === "erase" && (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={el.color} />
      )}
      {el.kind === "highlight" && (
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          fill={el.color}
          opacity={0.32}
        />
      )}
      {el.kind === "rectangle" && (
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          fill="none"
          stroke={el.color}
          strokeWidth={1.5}
        />
      )}
      {el.kind === "image" && (
        <image
          href={el.src}
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          preserveAspectRatio="none"
        />
      )}
      {el.kind === "text" && (
        <>
          <rect
            x={el.x}
            y={el.y}
            width={el.w}
            height={el.h}
            fill={el.background || "transparent"}
          />
          <text
            x={el.x}
            y={el.y}
            fontFamily={el.font || "Arial"}
            fontSize={el.fontSize || 16}
            fontWeight={el.bold ? "bold" : "normal"}
            fontStyle={el.italic ? "italic" : "normal"}
            fill={el.color}
            dominantBaseline="text-before-edge"
          >
            {(el.text || "").split("\n").map((line, i) => (
              <tspan key={i} x={el.x} dy={i ? (el.fontSize || 16) * 1.2 : 0}>
                {line || " "}
              </tspan>
            ))}
          </text>
        </>
      )}
      <rect
        x={el.x}
        y={el.y}
        width={el.w}
        height={el.h}
        fill="transparent"
        stroke={selected === el.id ? "#627b51" : "none"}
        strokeWidth={1}
        strokeDasharray={selected === el.id ? "4 3" : undefined}
        className="object-hit"
      />
      {selected === el.id && (
        <rect
          data-resize="true"
          x={el.x + el.w - 4}
          y={el.y + el.h - 4}
          width={8}
          height={8}
          fill="#536747"
          stroke="white"
          strokeWidth={1}
          style={{ cursor: "nwse-resize" }}
        />
      )}
    </g>
  );
  return (
    <div className="page-editor">
      <div className="format-bar page-format" aria-label="Page editing tools">
        <div className="tool-group">
          <IconButton label="Undo" disabled={!history.length} onClick={undo}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton label="Redo" disabled={!future.length} onClick={redo}>
            <Redo2 size={17} />
          </IconButton>
        </div>
        <div className="tool-group page-tool-group">
          {(
            [
              { id: "select", label: "Select", Icon: MousePointer2 },
              { id: "text", label: "Add text", Icon: Type },
              { id: "erase", label: "Erase", Icon: Eraser },
              { id: "highlight", label: "Highlight", Icon: Highlighter },
              { id: "rectangle", label: "Shape", Icon: Square },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={`small-button ${tool === t.id ? "active" : ""}`}
              aria-pressed={tool === t.id}
              onClick={() => chooseTool(t.id)}
            >
              <t.Icon size={16} />
              {t.label}
            </button>
          ))}
          <button
            className="small-button"
            onClick={() => imageRef.current?.click()}
          >
            <ImagePlus size={16} />
            Image / signature
          </button>
        </div>
        <button className="small-button" onClick={ocr}>
          <ScanText size={16} />
          Recognize text
        </button>
      </div>
      <div className="page-workspace">
        <aside className="pages-panel">
          <div className="panel-title">
            <span>
              Pages <span className="count-badge">{pages.length}</span>
            </span>
            <IconButton label="Append file" onClick={onAppend}>
              <Plus size={16} />
            </IconButton>
          </div>
          <div className="page-thumbnails">
            {pages.map((p, i) => (
              <button
                key={p.id}
                className={`thumbnail ${i === pageIndex ? "current" : ""}`}
                aria-label={`Go to page ${i + 1}`}
                aria-current={i === pageIndex ? "page" : undefined}
                onClick={() => {
                  setPageIndex(i);
                  setSelected(undefined);
                }}
              >
                <div className="thumb-paper">
                  <img
                    src={
                      p.background ||
                      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280"%3E%3Crect width="200" height="280" fill="white"/%3E%3C/svg%3E'
                    }
                    alt=""
                    style={{ transform: `rotate(${p.rotation}deg)` }}
                  />
                  {p.elements.length > 0 && (
                    <span className="edited-badge">
                      <Check size={10} />
                    </span>
                  )}
                </div>
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
          <button
            className="add-page-button"
            onClick={() => {
              commit([
                ...pages,
                {
                  id: uid(),
                  background: "",
                  width: 595,
                  height: 842,
                  rotation: 0,
                  elements: [],
                  textBoxes: [],
                },
              ]);
              setPageIndex(pages.length);
            }}
          >
            <Plus size={15} />
            Blank page
          </button>
        </aside>
        <div className="page-canvas-area">
          <div className="page-context">
            <span>
              Page {pageIndex + 1} of {pages.length}
            </span>
            <div>
              <IconButton
                label="Move page earlier"
                disabled={pageIndex === 0}
                onClick={() => {
                  const next = [...pages];
                  [next[pageIndex - 1], next[pageIndex]] = [
                    next[pageIndex],
                    next[pageIndex - 1],
                  ];
                  commit(next);
                  setPageIndex((i) => i - 1);
                }}
              >
                <ChevronUp size={16} />
              </IconButton>
              <IconButton
                label="Move page later"
                disabled={pageIndex === pages.length - 1}
                onClick={() => {
                  const next = [...pages];
                  [next[pageIndex + 1], next[pageIndex]] = [
                    next[pageIndex],
                    next[pageIndex + 1],
                  ];
                  commit(next);
                  setPageIndex((i) => i + 1);
                }}
              >
                <ChevronDown size={16} />
              </IconButton>
              <IconButton
                label="Rotate page"
                onClick={() =>
                  replacePage({ ...page, rotation: (page.rotation + 90) % 360 })
                }
              >
                <RotateCw size={16} />
              </IconButton>
              <IconButton
                label="Duplicate page"
                onClick={() => {
                  const next = [...pages];
                  next.splice(pageIndex + 1, 0, {
                    ...page,
                    id: uid(),
                    elements: page.elements.map((e) => ({ ...e, id: uid() })),
                  });
                  commit(next);
                  setPageIndex((i) => i + 1);
                }}
              >
                <Copy size={16} />
              </IconButton>
              <IconButton
                label="Delete page"
                disabled={pages.length === 1}
                onClick={() => {
                  commit(pages.filter((p) => p.id !== page.id));
                  setPageIndex((i) => Math.max(0, i - 1));
                  setSelected(undefined);
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          </div>
          <div className="pdf-scroll">
            <svg
              ref={svgRef}
              className={`pdf-canvas tool-${tool} ${dragging ? "dragging" : ""}`}
              style={{
                width: `${(Math.min(720, vw) * zoom) / 100}px`,
                maxWidth: zoom > 100 ? "none" : "100%",
              }}
              viewBox={`0 0 ${vw} ${vh}`}
              role="group"
              aria-label={`Editable page ${pageIndex + 1}. Choose a tool and drag on the page. Text lines are keyboard selectable.`}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerUp}
            >
              <g transform={transform}>
                <rect width={page.width} height={page.height} fill="white" />
                {page.background && (
                  <image
                    href={page.background}
                    width={page.width}
                    height={page.height}
                  />
                )}
                {tool === "select" &&
                  !dragging &&
                  page.textBoxes.map((box, i) => (
                    <rect
                      key={i}
                      className="text-hit"
                      x={box.x}
                      y={box.y}
                      width={box.w}
                      height={box.h}
                      fill="transparent"
                      tabIndex={0}
                      role="button"
                      aria-label={`Edit text: ${box.text}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => correct(box)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          correct(box);
                        }
                      }}
                    />
                  ))}
                {page.elements.map((el) => paint(el))}
                {draft && paint(draft, true)}
              </g>
            </svg>
          </div>
          <p className="canvas-hint">
            {tool === "select"
              ? "Click a text line to correct it. Drag added elements to move them."
              : tool === "text"
                ? "Click anywhere on the page to add text."
                : `Drag across the area you want to ${tool === "erase" ? "erase" : tool === "highlight" ? "highlight" : "outline"}.`}
          </p>
        </div>
        <aside className="properties-panel">
          <span className="section-label">MAKE IT YOURS</span>
          <h3>
            {element
              ? element.kind === "text"
                ? "Text properties"
                : element.kind === "erase"
                  ? "Erase area"
                  : element.kind === "image"
                    ? "Image properties"
                    : "Appearance"
              : "Page tools"}
          </h3>
          {element ? (
            <div className="property-fields">
              {element.kind === "text" && (
                <>
                  <label>
                    Text
                    <textarea
                      autoFocus
                      key={element.id}
                      aria-label="Replacement text"
                      value={element.text || ""}
                      onChange={(e) => update({ text: e.target.value })}
                      rows={4}
                    />
                  </label>
                  <div className="field-row">
                    <label>
                      Font
                      <select
                        value={element.font || "Arial"}
                        onChange={(e) => update({ font: e.target.value })}
                      >
                        <option>Arial</option>
                        <option>Georgia</option>
                        <option>Verdana</option>
                        <option>Courier New</option>
                      </select>
                    </label>
                    <label>
                      Size
                      <input
                        type="number"
                        min="4"
                        max="144"
                        value={element.fontSize || 16}
                        onChange={(e) =>
                          update({
                            fontSize: Math.max(
                              4,
                              Math.min(144, Number(e.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <button
                      className={`small-button ${element.bold ? "active" : ""}`}
                      onClick={() => update({ bold: !element.bold })}
                    >
                      Bold
                    </button>
                    <button
                      className={`small-button ${element.italic ? "active" : ""}`}
                      onClick={() => update({ italic: !element.italic })}
                    >
                      Italic
                    </button>
                  </div>
                  <label>
                    Background
                    <select
                      value={
                        element.background === "transparent"
                          ? "transparent"
                          : "solid"
                      }
                      onChange={(e) =>
                        update({
                          background:
                            e.target.value === "transparent"
                              ? "transparent"
                              : "#ffffff",
                        })
                      }
                    >
                      <option value="transparent">Transparent</option>
                      <option value="solid">Solid fill</option>
                    </select>
                  </label>
                  {element.background !== "transparent" && (
                    <label className="color-field">
                      Background color
                      <input
                        type="color"
                        value={element.background || "#ffffff"}
                        onChange={(e) => update({ background: e.target.value })}
                      />
                    </label>
                  )}
                </>
              )}
              {element.kind !== "image" && (
                <label className="color-field">
                  {element.kind === "text" ? "Text color" : "Fill color"}
                  <input
                    type="color"
                    value={element.color}
                    onChange={(e) => update({ color: e.target.value })}
                  />
                </label>
              )}
              <div className="field-row">
                <label>
                  X
                  <input
                    type="number"
                    min="0"
                    max={page.width}
                    value={Math.round(element.x)}
                    onChange={(e) =>
                      update({
                        x: Math.max(
                          0,
                          Math.min(page.width, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Y
                  <input
                    type="number"
                    min="0"
                    max={page.height}
                    value={Math.round(element.y)}
                    onChange={(e) =>
                      update({
                        y: Math.max(
                          0,
                          Math.min(page.height, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Width
                  <input
                    type="number"
                    min="4"
                    max={page.width}
                    value={Math.round(element.w)}
                    onChange={(e) =>
                      update({
                        w: Math.max(
                          4,
                          Math.min(page.width, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Height
                  <input
                    type="number"
                    min="4"
                    max={page.height}
                    value={Math.round(element.h)}
                    onChange={(e) =>
                      update({
                        h: Math.max(
                          4,
                          Math.min(page.height, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <button className="small-button danger" onClick={remove}>
                <Trash2 size={15} />
                Remove element
              </button>
              <p className="muted small">
                Drag the corner handle to resize. Text keeps its size; adjust
                the font size to fit the area.
              </p>
            </div>
          ) : (
            <div className="page-tips">
              {tool !== "select" && tool !== "text" && (
                <label className="color-field">
                  Tool color
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </label>
              )}
              <div className="tip-illustration">
                <Move size={28} strokeWidth={1.2} />
              </div>
              <h4>A small fix. A fresh page.</h4>
              <p>
                Select something on the page to fine-tune its text, size, or
                position.
              </p>
              <button
                className="small-button full-width"
                disabled={!page.textBoxes.length || page.elements.length > 0}
                onClick={() =>
                  onText(
                    plainToHtml(page.textBoxes.map((b) => b.text).join("\n")),
                  )
                }
              >
                <FileText size={15} />
                Extract original text
              </button>
              <p className="muted small">
                For an edited page or a scan, use Recognize text.
              </p>
            </div>
          )}
          <div className="export-note">
            <Download size={16} />
            <p>
              PDF exports are flattened. Erased areas stay erased; original text
              selection and form fields are removed.
            </p>
          </div>
        </aside>
      </div>
      <div className="editor-status">
        <span>
          <span className="status-dot" />
          Editing locally
        </span>
        <span>
          {page.elements.length} {page.elements.length === 1 ? "edit" : "edits"}{" "}
          on this page
        </span>
        <div className="zoom-tools">
          <IconButton
            label="Zoom out"
            disabled={zoom <= 50}
            onClick={() => setZoom((z) => z - 10)}
          >
            <Minus size={14} />
          </IconButton>
          <span>{zoom}%</span>
          <IconButton
            label="Zoom in"
            disabled={zoom >= 180}
            onClick={() => setZoom((z) => z + 10)}
          >
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <input
        ref={imageRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 8 * 1024 * 1024) {
            notify("Choose an image smaller than 8 MB.");
            return;
          }
          try {
            const src = await fileDataUrl(file);
            const img = await loadImage(src);
            const scale = Math.min(
              1,
              (page.width * 0.5) / img.width,
              (page.height * 0.5) / img.height,
            );
            const el: PageElement = {
              id: uid(),
              kind: "image",
              src,
              x: 30,
              y: 30,
              w: img.width * scale,
              h: img.height * scale,
              color: "#000000",
            };
            replacePage({ ...page, elements: [...page.elements, el] });
            setSelected(el.id);
            setTool("select");
          } catch {
            notify("Could not add this image.");
          }
        }}
      />
    </div>
  );
});
