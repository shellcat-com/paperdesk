import { useEffect, useRef, useState, lazy, Suspense } from "react";
import localforage from "localforage";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  Download,
  File,
  FileText,
  FolderOpen,
  HelpCircle,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  PenLine,
  Files,
  ScanText,
  Clock3,
  BookOpen,
} from "lucide-react";
import { Brand, Guide, IconButton, Modal } from "./components/ui";
import { type DeskDocument, emptyDocument, SAMPLE } from "./lib/types";
import { ACCEPT, importFile, exportPages } from "./lib/files";
import type { RichEditorHandle } from "./components/RichEditor";
import type { PageEditorHandle } from "./components/PageEditor";
const RichEditor = lazy(() =>
  import("./components/RichEditor").then((m) => ({ default: m.RichEditor })),
);
const PageEditor = lazy(() =>
  import("./components/PageEditor").then((m) => ({ default: m.PageEditor })),
);
const storage = localforage.createInstance({
  name: "paperdesk",
  storeName: "documents",
});
type Recent = Pick<DeskDocument, "id" | "name" | "mode" | "source" | "updated">;
export default function App() {
  const [doc, setDoc] = useState<DeskDocument>();
  const [recent, setRecent] = useState<Recent[]>([]);
  const [view, setView] = useState<"desk" | "library">("desk");
  const [search, setSearch] = useState("");
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [saveStatus, setSaveStatus] = useState("Saved on this device");
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Recent>();
  const [drag, setDrag] = useState(false);
  const [ready, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const appendInput = useRef<HTMLInputElement>(null);
  const richRef = useRef<RichEditorHandle>(null);
  const pageRef = useRef<PageEditorHandle>(null);
  const current = useRef(doc);
  current.current = doc;
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const notify = (s: string) => setToast(s);
  const refresh = async () => {
    const keys = await storage.keys();
    const data = await Promise.all(
      keys
        .filter((k) => k.startsWith("meta:"))
        .map((k) => storage.getItem<Recent>(k)),
    );
    setRecent(
      data
        .filter((r): r is Recent => !!r)
        .sort((a, b) => b.updated - a.updated),
    );
  };
  useEffect(() => {
    refresh()
      .catch(() =>
        notify(
          "Local storage is unavailable. Export your work before closing this tab.",
        ),
      )
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 9000);
    return () => clearTimeout(t);
  }, [toast]);
  const save = (d: DeskDocument) => {
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        await storage.setItem(`doc:${d.id}`, d);
        await storage.setItem(`meta:${d.id}`, {
          id: d.id,
          name: d.name,
          mode: d.mode,
          source: d.source,
          updated: d.updated,
        });
        if (
          current.current?.id === d.id &&
          current.current.updated === d.updated
        ) {
          pending.current = false;
          setSaveStatus("Saved on this device");
        }
        await refresh();
        return true;
      });
    queue.current = task;
    return task.catch(() => {
      setSaveStatus("Not saved · export a copy");
      notify(
        "Your browser could not save this draft. Export a copy before leaving this tab.",
      );
      return false;
    });
  };
  useEffect(() => {
    if (!doc) return;
    pending.current = true;
    setSaveStatus("Saving…");
    timer.current = setTimeout(() => {
      void save(doc);
    }, 600);
    return () => clearTimeout(timer.current);
  }, [doc]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  const persist = async () => {
    clearTimeout(timer.current);
    return current.current ? await save(current.current) : true;
  };
  const home = async () => {
    if (!(await persist())) return;
    setDoc(undefined);
    setView("desk");
    setSearch("");
  };
  const start = async (sample = false) => {
    if (!(await persist())) return;
    const next = emptyDocument(sample ? "A little space" : "Untitled document");
    if (sample) next.html = SAMPLE;
    setDoc(next);
  };
  const openDraft = async (r: Recent) => {
    setBusy("Opening your document…");
    try {
      if (!(await persist())) return;
      const value = await storage.getItem<DeskDocument>(`doc:${r.id}`);
      if (!value)
        throw new Error("This draft is no longer available on this device.");
      setDoc(value);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not open this draft.",
      );
    } finally {
      setBusy("");
    }
  };
  const openFile = async (file: File, append = false) => {
    setBusy("Opening your file…");
    try {
      if (!(await persist())) return;
      const result = await importFile(file, setBusy);
      if (append && current.current?.mode === "pages") {
        if (result.document.mode !== "pages")
          throw new Error("Append a PDF or image to this document.");
        if (current.current.pages.length + result.document.pages.length > 60)
          throw new Error("A document can contain up to 60 pages.");
        pageRef.current?.append(result.document.pages);
        notify("Pages added to the end of your document.");
      } else {
        setDoc(result.document);
        if (result.notice) notify(result.notice);
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "This file could not be opened. Please try another copy.",
      );
    } finally {
      setBusy("");
    }
  };
  const change = (patch: Partial<DeskDocument>) =>
    setDoc((d) => (d ? { ...d, ...patch, updated: Date.now() } : d));
  const exportDocument = async (format: string) => {
    if (!doc) return;
    setExportOpen(false);
    setBusy("Preparing your download…");
    try {
      if (doc.mode === "write") await richRef.current?.export(format);
      else if (pageRef.current) await pageRef.current.export(format);
      else await exportPages(doc.pages, doc.name, setBusy);
      notify("Your download is ready. Check your browser’s downloads.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Export failed. Your draft is still here; please try again.",
      );
    } finally {
      setBusy("");
    }
  };
  const textFromPage = async (html: string) => {
    if (!(await persist())) return;
    const next = emptyDocument(`${current.current?.name || "Scan"} · text`);
    next.html = html;
    next.source = "Extracted text";
    setDoc(next);
  };
  const matches = recent.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );
  const renderFiles = (limit?: number) => (
    <div className="file-list">
      {matches.slice(0, limit).map((d) => (
        <div className="file-row" key={d.id}>
          <button className="file-open" onClick={() => openDraft(d)}>
            <span
              className={`file-type-icon ${d.mode === "pages" ? "pdf" : "word"}`}
            >
              <FileText size={20} />
            </span>
            <span className="file-info">
              <strong>{d.name}</strong>
              <span>
                {d.source} <span>·</span>{" "}
                {new Date(d.updated).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </span>
          </button>
          <span className="local-tag">
            <span className="status-dot" />
            On this device
          </span>
          <IconButton
            label={`Delete ${d.name}`}
            className="file-delete"
            onClick={() => setDeleteTarget(d)}
          >
            <Trash2 size={16} />
          </IconButton>
          <IconButton label={`Open ${d.name}`} onClick={() => openDraft(d)}>
            <ArrowUpRight size={18} />
          </IconButton>
        </div>
      ))}
    </div>
  );
  return (
    <div className={`app ${doc ? "editing" : ""}`}>
      {!doc && (
        <aside className="sidebar">
          <Brand onClick={() => void home()} />
          <button className="new-document-button" onClick={() => void start()}>
            <Plus size={18} />
            New document<span>⌥ ⌘ N</span>
          </button>
          <nav aria-label="Main navigation">
            <button
              className={view === "desk" ? "nav-item active" : "nav-item"}
              onClick={() => setView("desk")}
            >
              <LayoutGrid size={18} />
              My desk
            </button>
            <button
              className={view === "library" ? "nav-item active" : "nav-item"}
              onClick={() => setView("library")}
            >
              <FolderOpen size={18} />
              All documents<span className="nav-count">{recent.length}</span>
            </button>
          </nav>
          <div className="sidebar-section">
            <span className="section-label">YOUR TOOLKIT</span>
            <button className="nav-item" onClick={() => input.current?.click()}>
              <PenLine size={18} />
              Edit a document
            </button>
            <button className="nav-item" onClick={() => input.current?.click()}>
              <Files size={18} />
              Organize PDF pages
            </button>
            <button
              className="nav-item"
              onClick={() => {
                notify(
                  "Open a PDF or image, then choose Recognize text in the toolbar.",
                );
                input.current?.click();
              }}
            >
              <ScanText size={18} />
              Read a scan
            </button>
          </div>
          <div className="sidebar-bottom">
            <div className="privacy-card">
              <span className="privacy-icon">
                <LockKeyhole size={17} />
              </span>
              <strong>Your files. Your space.</strong>
              <p>Documents stay in your browser, right on this device.</p>
              <button onClick={() => setGuide(true)}>
                How it works
                <ArrowUpRight size={13} />
              </button>
            </div>
            <button className="nav-item" onClick={() => setGuide(true)}>
              <HelpCircle size={18} />
              Help & format guide
            </button>
            <div className="sidebar-credit">
              <span className="avatar">P</span>
              <span>
                Your personal workspace<small>No account needed</small>
              </span>
            </div>
          </div>
        </aside>
      )}
      <main className="main-content">
        {doc ? (
          <>
            <header className="editor-header">
              <IconButton label="Back to my desk" onClick={() => void home()}>
                <ArrowLeft size={20} />
              </IconButton>
              <span className="header-file-icon">
                <FileText size={22} />
              </span>
              <div className="document-identity">
                <input
                  aria-label="Document name"
                  value={doc.name}
                  onChange={(e) => change({ name: e.target.value })}
                  onBlur={() => {
                    if (!doc.name.trim()) change({ name: "Untitled document" });
                  }}
                />
                <span>
                  <CheckCheck size={13} />
                  {saveStatus}
                </span>
              </div>
              <div className="editor-header-actions">
                <button
                  className="small-button"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={16} />
                  <span>Open file</span>
                </button>
                <IconButton
                  label="Help and format guide"
                  onClick={() => setGuide(true)}
                >
                  <HelpCircle size={19} />
                </IconButton>
                <button
                  className="primary-button export-button"
                  onClick={() => setExportOpen(true)}
                >
                  <Download size={16} />
                  <span>Export</span>
                  <ChevronDown size={13} />
                </button>
              </div>
            </header>
            <Suspense
              fallback={
                <div className="editor-loading">
                  <LoaderCircle className="spin" />
                  Opening your workspace…
                </div>
              }
            >
              {doc.mode === "write" ? (
                <RichEditor
                  key={doc.id}
                  ref={richRef}
                  document={doc}
                  onChange={(html) => change({ html })}
                  notify={notify}
                />
              ) : (
                <PageEditor
                  key={doc.id}
                  ref={pageRef}
                  document={doc}
                  onChange={(pages) => change({ pages })}
                  notify={notify}
                  setBusy={setBusy}
                  onText={(html) => void textFromPage(html)}
                  onAppend={() => appendInput.current?.click()}
                />
              )}
            </Suspense>
          </>
        ) : (
          <>
            <header className="home-topbar">
              <div className="breadcrumb">
                <span>Workspace</span>
                <span>/</span>
                <strong>{view === "desk" ? "My desk" : "All documents"}</strong>
              </div>
              <span className="private-indicator">
                <ShieldCheck size={15} />
                Private by design
              </span>
              <button
                className="small-button mobile-help"
                onClick={() => setGuide(true)}
              >
                <HelpCircle size={17} />
              </button>
            </header>
            <div className="home-body">
              {view === "desk" ? (
                <>
                  <div className="welcome">
                    <div>
                      <p className="welcome-note">
                        <span className="status-dot" />A CLEAR DESK. A FRESH
                        START.
                      </p>
                      <h1>A little less paperwork.</h1>
                      <p>
                        Edit, tidy up, and make it yours. All in one quiet
                        space.
                      </p>
                    </div>
                    <div className="desk-art" aria-hidden="true">
                      <div className="art-paper back"></div>
                      <div className="art-paper">
                        <span className="art-fold" />
                        <span className="art-line short" />
                        <span className="art-line" />
                        <span className="art-line" />
                        <span className="art-line medium" />
                        <span className="art-seal">
                          <Check size={16} />
                        </span>
                      </div>
                      <div className="art-pencil" />
                      <span className="art-star">✳</span>
                    </div>
                  </div>
                  <section
                    className={`upload-zone ${drag ? "drag-over" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node))
                        setDrag(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrag(false);
                      const file = e.dataTransfer.files[0];
                      if (file) void openFile(file);
                    }}
                    aria-label="Upload a document"
                  >
                    <div className="upload-icon">
                      <Upload size={24} strokeWidth={1.6} />
                    </div>
                    <h2>
                      {drag
                        ? "Make yourself at home."
                        : "Drop your document here"}
                    </h2>
                    <p>That small correction? Let’s take care of it.</p>
                    <button
                      className="primary-button"
                      onClick={() => input.current?.click()}
                    >
                      <Plus size={17} />
                      Choose a file
                    </button>
                    <div className="supported-formats">
                      <span>PDF</span>
                      <span>DOCX</span>
                      <span>TXT</span>
                      <span>IMAGES</span>
                      <span className="more-formats">+ Markdown & HTML</span>
                    </div>
                    <span className="upload-limit">
                      Up to 30 MB · Processed on your device
                    </span>
                  </section>
                  <div className="quick-actions">
                    <button
                      className="quick-action"
                      onClick={() => void start()}
                    >
                      <span className="quick-icon sage">
                        <PenLine size={21} />
                      </span>
                      <span>
                        <strong>Start with a blank page</strong>
                        <small>A thought, a draft, a new beginning.</small>
                      </span>
                      <ArrowUpRight size={19} />
                    </button>
                    <button
                      className="quick-action"
                      onClick={() => void start(true)}
                    >
                      <span className="quick-icon peach">
                        <BookOpen size={21} />
                      </span>
                      <span>
                        <strong>Take the editor for a spin</strong>
                        <small>Make yourself at home with a sample.</small>
                      </span>
                      <ArrowUpRight size={19} />
                    </button>
                  </div>
                  <section className="recent-section">
                    <div className="section-heading">
                      <h2>
                        On your desk{" "}
                        <span className="count-badge">{recent.length}</span>
                      </h2>
                      {recent.length > 0 && (
                        <button
                          className="text-link"
                          onClick={() => setView("library")}
                        >
                          View all
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                    {!ready ? (
                      <p className="muted">Opening your desk…</p>
                    ) : recent.length ? (
                      renderFiles(4)
                    ) : (
                      <div className="empty-desk">
                        <span className="empty-icon">
                          <Clock3 size={22} />
                        </span>
                        <div>
                          <strong>A clean slate feels good.</strong>
                          <p>
                            Your documents will appear here, saved on this
                            device.
                          </p>
                        </div>
                        <span className="empty-desk-dot" />
                      </div>
                    )}
                  </section>
                  <div className="home-footer">
                    <span>
                      <LockKeyhole size={13} />
                      No uploads. No sign-ups. Just your work.
                    </span>
                    <button onClick={() => setGuide(true)}>
                      A few things to know
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="library-heading">
                    <div>
                      <h1>All documents</h1>
                      <p>Your drafts, right where you left them.</p>
                    </div>
                    <button
                      className="primary-button"
                      onClick={() => input.current?.click()}
                    >
                      <Upload size={16} />
                      Open file
                    </button>
                  </div>
                  <label className="library-search">
                    <Search size={17} />
                    <input
                      aria-label="Search documents"
                      placeholder="Find a document…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <span>{matches.length} documents</span>
                  </label>
                  {matches.length ? (
                    renderFiles()
                  ) : (
                    <div className="empty-library">
                      <FolderOpen size={34} strokeWidth={1.2} />
                      <h2>
                        {search
                          ? "No matching documents"
                          : "Your documents live here"}
                      </h2>
                      <p>
                        {search
                          ? "Try another name."
                          : "Open a file or start a new document to get going."}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>
      <input
        ref={input}
        aria-label="Open document file"
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void openFile(file);
        }}
      />
      <input
        ref={appendInput}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        aria-label="Append document file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void openFile(file, true);
        }}
      />
      {guide && <Guide onClose={() => setGuide(false)} />}
      {exportOpen && doc && (
        <Modal
          title="Ready to leave your desk?"
          onClose={() => setExportOpen(false)}
        >
          <div className="export-dialog">
            <p className="muted">
              Choose a format for <strong>{doc.name}</strong>.
            </p>
            {(doc.mode === "write"
              ? [
                  {
                    format: "docx",
                    title: "Word document",
                    ext: ".docx",
                    description:
                      "Keep editing text, images, and tables in Word.",
                  },
                  {
                    format: "pdf",
                    title: "PDF document",
                    ext: ".pdf",
                    description: "A flattened copy for sharing and printing.",
                  },
                  {
                    format: "html",
                    title: "Web document",
                    ext: ".html",
                    description: "Formatted, selectable text for any browser.",
                  },
                  {
                    format: "txt",
                    title: "Plain text",
                    ext: ".txt",
                    description: "Just the words. Simple and portable.",
                  },
                ]
              : [
                  {
                    format: "pdf",
                    title: "All pages as PDF",
                    ext: ".pdf",
                    description: "Flattened pages with your edits applied.",
                  },
                  {
                    format: "page",
                    title: "Current page as PDF",
                    ext: ".pdf",
                    description: "Extract just the page you’re working on.",
                  },
                  {
                    format: "png",
                    title: "Current page as image",
                    ext: ".png",
                    description: "A high-resolution image of this page.",
                  },
                ]
            ).map((f) => (
              <button
                className="export-option"
                key={f.format}
                onClick={() => void exportDocument(f.format)}
              >
                <span className="file-type-icon">
                  <File size={22} />
                </span>
                <span>
                  <strong>
                    {f.title}
                    <small>{f.ext}</small>
                  </strong>
                  <span>{f.description}</span>
                </span>
                <Download size={17} />
              </button>
            ))}
            <p className="export-disclosure">
              <ShieldCheck size={16} />
              Your original file is unchanged. PDF export creates image pages
              and does not retain selectable text, form fields, or digital
              signatures.
            </p>
          </div>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title="Delete this saved draft?"
          onClose={() => setDeleteTarget(undefined)}
        >
          <div className="modal-form">
            <p>
              <strong>{deleteTarget.name}</strong> will be removed from this
              browser. Files you already downloaded stay on your device.
            </p>
            <div className="modal-actions">
              <button
                className="small-button"
                onClick={() => setDeleteTarget(undefined)}
              >
                Keep draft
              </button>
              <button
                className="primary-button destructive"
                onClick={async () => {
                  await queue.current.catch(() => {});
                  try {
                    await storage.removeItem(`doc:${deleteTarget.id}`);
                    await storage.removeItem(`meta:${deleteTarget.id}`);
                    await refresh();
                    setDeleteTarget(undefined);
                    notify("Saved draft deleted.");
                  } catch {
                    notify("Could not delete this draft. Please try again.");
                  }
                }}
              >
                Delete draft
              </button>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <IconButton label="Dismiss notification" onClick={() => setToast("")}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {busy && (
        <div
          className="busy-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Processing document"
        >
          <div>
            <LoaderCircle size={28} className="spin" />
            <p role="status">{busy}</p>
            <span>Your file stays on this device.</span>
          </div>
        </div>
      )}
      <KeyboardNew
        onNew={() => {
          if (!busy && !document.querySelector("dialog[open]")) void start();
        }}
      />
    </div>
  );
}
function KeyboardNew({ onNew }: { onNew: () => void }) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        onNew();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onNew]);
  return null;
}
