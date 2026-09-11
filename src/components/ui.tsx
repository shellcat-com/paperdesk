import { useEffect, useRef, type ReactNode } from "react";
import { X, FileText, ArrowUpRight } from "lucide-react";
export function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="Paperdesk home">
      <span className="brand-symbol">
        <FileText size={21} strokeWidth={1.7} />
      </span>
      <span>
        paperdesk<span className="brand-dot">.</span>
      </span>
    </button>
  );
}
export function Guide({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="A little help with your paperwork" onClose={onClose} wide>
      <div className="guide-body">
        <p className="muted">
          Choose a file, make your changes, then export a new copy. Your
          original file stays untouched.
        </p>
        <div className="guide-grid">
          <section>
            <h3>Write & format</h3>
            <p>
              Open DOCX, TXT, Markdown, or HTML. Edit text, correct names and
              dates with Find & replace, and add tables, images, links, and
              formatting. Use your browser’s spelling suggestions by
              right-clicking an underlined word.
            </p>
            <p>
              Export to DOCX, PDF, HTML, or plain text. Word imports preserve
              document content; complex page layouts, headers, comments, tracked
              changes, and floating shapes are not retained.
            </p>
          </section>
          <section>
            <h3>Edit a page</h3>
            <p>
              Open a PDF, PNG, JPEG, or WebP. Click a detected PDF text line to
              replace it, or place new text anywhere. Drag to erase an area,
              highlight it, or add a rectangle. Fine-tune color, position, and
              size in the properties panel.
            </p>
            <p>
              Use Erase for unwanted marks and watermarks on documents you can
              edit. It fills the selected area; it cannot reconstruct writing or
              artwork hidden beneath a watermark.
            </p>
          </section>
          <section>
            <h3>Pages & scans</h3>
            <p>
              Reorder, duplicate, rotate, delete, or append PDF pages. Extract
              the current page as a PNG or PDF. Recognize text runs English OCR
              on the current page and opens the result as a new writing
              document.
            </p>
            <p>
              OCR may misread names, dates, or handwriting. Review the result.
              The first run downloads the OCR engine and English language data.
            </p>
          </section>
          <section>
            <h3>Privacy & export</h3>
            <p>
              Document processing happens in your browser. Drafts are saved in
              this browser’s local storage; they do not sync to another device.
              Delete a draft to remove its saved copy. No login or document
              upload server is used.
            </p>
            <p>
              Edited PDFs are flattened into images. Covered text is removed
              from exported pixels, but text selection, original form fields,
              links, accessibility tags, and digital signatures are lost. Keep
              your source file.
            </p>
          </section>
        </div>
        <p className="guide-limits">
          Up to 30 MB per file and 60 PDF pages, subject to browser memory
          limits. Legacy DOC, XLSX, PPTX, and encrypted PDFs are not supported.
          There is no automatic font reconstruction or certified digital
          signing.
        </p>
        <a
          className="text-link"
          href="https://github.com/shellcat-com/paperdesk"
          target="_blank"
          rel="noreferrer"
        >
          Source code & research <ArrowUpRight size={14} />
        </a>
      </div>
    </Modal>
  );
}
