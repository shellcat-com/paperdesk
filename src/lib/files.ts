import DOMPurify from "dompurify";
import { marked } from "marked";
import { uid, type DeskDocument, type DocumentPage } from "./types";
export const MAX_FILE_SIZE = 30 * 1024 * 1024;
export const ACCEPT = ".pdf,.docx,.txt,.md,.html,.htm,.png,.jpg,.jpeg,.webp";
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const plainToHtml = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");
export function sanitize(html: string) {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "form", "input", "video", "audio"],
    FORBID_ATTR: ["srcset"],
  });
  const doc = new DOMParser().parseFromString(clean, "text/html");
  // Imported files must not issue requests to remote tracking pixels or file paths.
  doc.querySelectorAll("img").forEach((img) => {
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(img.src))
      img.remove();
  });
  doc.querySelectorAll("[style]").forEach((el) => {
    const style = el.getAttribute("style") || "";
    if (/url\s*\(|expression\s*\(|@import/i.test(style))
      el.removeAttribute("style");
  });
  doc.querySelectorAll("a").forEach((a) => {
    if (!/^(https?:|mailto:)/i.test(a.getAttribute("href") || ""))
      a.removeAttribute("href");
    a.rel = "noreferrer noopener";
    a.target = "_blank";
  });
  return doc.body.innerHTML;
}
export async function fileDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () =>
      reject(new Error("Could not read the file. Try opening it again."));
    r.readAsDataURL(file);
  });
}
export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("This image could not be opened. Try a PNG or JPEG."));
    img.src = src;
  });
}
let pdfModule: Promise<typeof import("pdfjs-dist")> | undefined;
export async function pdfjs() {
  if (!pdfModule)
    pdfModule = import("pdfjs-dist").then(async (pdf) => {
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdf.GlobalWorkerOptions.workerSrc = worker.default;
      return pdf;
    });
  return pdfModule;
}
export async function readPdf(
  data: ArrayBuffer,
  progress: (s: string) => void,
): Promise<DocumentPage[]> {
  const pdf = await pdfjs();
  const task = pdf.getDocument({
    data,
    cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdf-assets/wasm/`,
    iccUrl: `${import.meta.env.BASE_URL}pdf-assets/iccs/`,
  });
  task.onPassword = () => {
    task.destroy();
  };
  let document;
  try {
    document = await task.promise;
  } catch {
    throw new Error(
      "Could not open this PDF. If it is password-protected, save an unlocked copy first.",
    );
  }
  try {
    if (document.numPages > 60)
      throw new Error(
        "This PDF has more than 60 pages. Split it into smaller files before opening.",
      );
    const pages: DocumentPage[] = [];
    let pixels = 0;
    for (let i = 1; i <= document.numPages; i++) {
      progress(`Opening page ${i} of ${document.numPages}…`);
      const page = await document.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        2,
        2400 / Math.max(viewport.width, viewport.height),
      );
      const renderViewport = page.getViewport({ scale });
      pixels += renderViewport.width * renderViewport.height;
      if (pixels > 100_000_000)
        throw new Error(
          "This PDF is too large to edit comfortably in your browser. Open a smaller page range.",
        );
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      const context = canvas.getContext("2d")!;
      await page.render({
        canvasContext: context,
        canvas,
        viewport: renderViewport,
      }).promise;
      const content = await page.getTextContent();
      const textBoxes = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        const t = pdf.Util.transform(viewport.transform, item.transform);
        const h = Math.hypot(t[2], t[3]);
        const style = content.styles[item.fontName];
        return [
          {
            text: item.str,
            x: t[4],
            y: t[5] - h * (style?.ascent || 0.85),
            w: Math.max(item.width, 6),
            h: h * 1.15,
            fontSize: h,
            font: style?.fontFamily?.includes("sans")
              ? "Arial"
              : style?.fontFamily?.includes("mono")
                ? "Courier New"
                : "Georgia",
          },
        ];
      });
      pages.push({
        id: uid(),
        background: canvas.toDataURL("image/png"),
        width: viewport.width,
        height: viewport.height,
        rotation: 0,
        elements: [],
        textBoxes,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
export async function importFile(
  file: File,
  progress: (s: string) => void,
): Promise<{ document: DeskDocument; notice?: string }> {
  if (file.size > MAX_FILE_SIZE)
    throw new Error(
      "This file is larger than 30 MB. Please open a smaller copy.",
    );
  if (!file.size)
    throw new Error("This file is empty. Please choose another file.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  const document: DeskDocument = {
    id: uid(),
    name: file.name.replace(/\.[^.]+$/, ""),
    mode: "write",
    source: (ext || "Document").toUpperCase(),
    updated: Date.now(),
    html: "",
    pages: [],
  };
  if (ext === "pdf") {
    document.mode = "pages";
    document.pages = await readPdf(await file.arrayBuffer(), progress);
    return {
      document,
      notice:
        "PDF ready. Select a text line to correct it, or use Erase for a precise cleanup. Exports are flattened image PDFs.",
    };
  }
  if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
    const src = await fileDataUrl(file);
    const img = await loadImage(src);
    if (img.width * img.height > 40_000_000)
      throw new Error(
        "This image is too large. Resize it below 40 megapixels first.",
      );
    const ratio = Math.min(1, 1400 / Math.max(img.width, img.height));
    document.mode = "pages";
    document.pages = [
      {
        id: uid(),
        background: src,
        width: img.width * ratio,
        height: img.height * ratio,
        rotation: 0,
        elements: [],
        textBoxes: [],
      },
    ];
    return { document };
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({
      arrayBuffer: await file.arrayBuffer(),
    });
    document.html = sanitize(result.value);
    return {
      document,
      notice:
        "Word content imported. Complex layouts, headers, floating objects, and tracked changes may differ. Keep the original for comparison.",
    };
  }
  if (ext === "txt") document.html = plainToHtml(await file.text());
  else if (ext === "md")
    document.html = sanitize(await marked.parse(await file.text()));
  else if (["html", "htm"].includes(ext || ""))
    document.html = sanitize(await file.text());
  else
    throw new Error(
      "Open a PDF, DOCX, TXT, Markdown, HTML, PNG, JPEG, or WebP file. For older .doc files, save as .docx in Word first.",
    );
  return { document };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function renderPage(page: DocumentPage, scale = 2) {
  const canvas = document.createElement("canvas");
  const boundedScale = Math.min(
    scale,
    3000 / Math.max(page.width, page.height),
  );
  canvas.width = Math.round(page.width * boundedScale);
  canvas.height = Math.round(page.height * boundedScale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(boundedScale, boundedScale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, page.width, page.height);
  if (page.background)
    ctx.drawImage(
      await loadImage(page.background),
      0,
      0,
      page.width,
      page.height,
    );
  for (const el of page.elements) {
    ctx.save();
    ctx.fillStyle = el.color;
    if (el.kind === "erase") ctx.fillRect(el.x, el.y, el.w, el.h);
    if (el.kind === "highlight") {
      ctx.globalAlpha = 0.32;
      ctx.fillRect(el.x, el.y, el.w, el.h);
    }
    if (el.kind === "rectangle") {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(el.x, el.y, el.w, el.h);
    }
    if (el.kind === "image" && el.src)
      ctx.drawImage(await loadImage(el.src), el.x, el.y, el.w, el.h);
    if (el.kind === "text") {
      const size = el.fontSize || 16;
      if (el.background && el.background !== "transparent") {
        ctx.fillStyle = el.background;
        ctx.fillRect(el.x, el.y, el.w, el.h);
      }
      ctx.fillStyle = el.color;
      ctx.textBaseline = "top";
      ctx.font = `${el.italic ? "italic " : ""}${el.bold ? "bold " : ""}${size}px "${el.font || "Arial"}"`;
      (el.text || "")
        .split("\n")
        .forEach((line, i) => ctx.fillText(line, el.x, el.y + i * size * 1.2));
    }
    ctx.restore();
  }
  return canvas;
}
export async function exportPages(
  pages: DocumentPage[],
  name: string,
  progress: (s: string) => void,
) {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    progress(`Exporting page ${i + 1} of ${pages.length}…`);
    const page = pages[i];
    const canvas = await renderPage(page);
    const img = await out.embedPng(canvas.toDataURL("image/png"));
    const p = out.addPage([page.width, page.height]);
    p.drawImage(img, { x: 0, y: 0, width: page.width, height: page.height });
    p.setRotation(degrees(page.rotation));
    canvas.width = 0;
    canvas.height = 0;
  }
  download(
    new Blob([new Uint8Array(await out.save())], { type: "application/pdf" }),
    `${name}.pdf`,
  );
}
