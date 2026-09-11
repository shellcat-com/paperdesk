# Document editing on the web

## Product decision

Paperdesk uses two connected workspaces: a rich text editor for flowing documents and a page editor for fixed-layout files. A single canvas cannot faithfully represent both Word's document structure and the independent drawing instructions in a PDF. The interface should keep file opening and export consistent while giving each format the controls it needs.

The initial product is a local browser application for everyday document corrections. Its emphasis is on clear operations, readable controls, predictable exports, and an untouched original file. It does not claim feature parity with Acrobat or Word. Precise font reconstruction, editable PDF content streams, office layout round-tripping, certified signatures, and collaborative review require additional engines or substantial development.

## The problems behind a simple edit

### A PDF is not a word processing document

A visible sentence may consist of independently positioned glyphs with subset fonts, custom encoding, and transformed coordinates. Adding a line to the page is materially different from rewriting its underlying objects. The pdf-lib project explicitly documents that its APIs do not remove or edit existing page text outside form fields. Its strengths include creating documents, embedding images, and organizing pages. [1]

**Implementation decision:** render the original page, identify text locations, and let the user place a replacement with a configurable background. The exported PDF embeds only the resulting page pixels. This makes the visual correction concrete and avoids retaining covered original text as hidden PDF content. It also means the result has no original text layer or interactive controls. The app explains this before export.

For small corrections on plain backgrounds, this approach is practical. For text over a photograph, pattern, gradient, stamp, or another line of text, filling a rectangle will visibly remove that background. The user can adjust the fill color, position, and size, but the app does not invent missing artwork.

### A scan has pixels, not editable characters

Tesseract.js performs OCR in the browser using WebAssembly. Its project scope distinguishes OCR from direct PDF handling: PDF pages need to be rendered as images before recognition. Recognition is not a guarantee of accurate spelling or faithful layout. [2]

**Implementation decision:** offer English OCR for the active rendered page. Open recognized text as a separate writing document and keep the source draft. Do not silently replace names, dates, amounts, or identifiers with guesses. The extracted document is a transcription for review, not a reconstruction of the original layout. Engine and language assets may require a network connection on the first run, but the document image is processed locally.

### Font matching has real limits

Adobe's editing guidance discusses unavailable fonts and the limitations of editing with embedded fonts. Substitution may visibly change the page. Its scan-editing guidance also recommends checking recognition results and handling complex visual elements carefully. These are constraints in established commercial software as well. [3][4]

**Implementation decision:** use a small set of browser font families and explicit size controls. Detected PDF text suggests a serif, sans-serif, or monospace family. The choice is an approximation, not identification of the original font. Users can resize the replacement area and inspect the result. Automatic width matching, kerning reconstruction, and extraction of embedded fonts are not claimed.

### Word content and Word layout are different deliverables

Mammoth converts DOCX into semantic HTML and favors structure over exact visual replication. The project documents both browser conversion and the need to sanitize generated HTML. It does not provide a general Word layout engine. [5]

**Implementation decision:** retain supported paragraphs, headings, lists, links, inline formatting, tables, and embedded raster images. Convert these into the editor's schema. Show an import notice for complex layouts, headers, floating objects, and tracked changes. Preserve the original file rather than representing the imported document as a lossless replacement. The legacy binary `.doc` format is rejected with a useful conversion instruction.

### Erasing and watermarks need precise language

Adobe provides watermark-specific removal for watermarks represented in supported PDF structures. That does not establish that all visible marks in arbitrary files are independently removable objects. [6]

**Implementation decision:** Paperdesk provides a manually placed solid-fill eraser. It can clean a mark or watermark on an otherwise blank background. It does not detect watermark objects, reconstruct occluded content, or remove every watermark automatically. A visible fill rectangle is a preview of the final composited pixels. Users can undo it before exporting. Marketing the operation as universal, invisible watermark removal would misstate the product.

### Redaction and visual cover-up are different

A rectangle added above PDF text may hide it visually while retaining the original object. Paperdesk avoids that specific failure by constructing a new PDF from the composited page images. Original text objects, metadata, annotations, attachments, and form structures are not copied into the output.

This is a product architecture choice, not a certification of a general redaction system. A user must cover every visible instance of the information, including fragments at the selection boundary. Local source drafts still contain the original page background until deleted. The exported result loses selectability, hyperlinks, accessibility tags, and digital signatures. These tradeoffs should remain visible in the app and documentation.

## Feature and format matrix

| Need                           | Current implementation                                                                               | Boundary                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Correct a name or date in Word | Direct text editing; literal find and replace across inline formatting                               | User supplies the correct value                                 |
| Correct a PDF text line        | Select detected line; edit replacement; adjust font, color, and position                             | Visual replacement; no original-font reconstruction             |
| Add text to an image or scan   | Place and style text over the page                                                                   | Does not automatically remove scanned text below it             |
| Remove an unwanted mark        | Draw and adjust an opaque erase area                                                                 | No background reconstruction or automatic watermark detection   |
| Format writing                 | Headings, bold, italic, underline, strike, color, highlight, alignment, lists, links, tables, images | No tracked changes, comments, footnotes, or collaboration       |
| Organize pages                 | Append PDFs/images, add blank page, reorder, duplicate, rotate, delete                               | Up to 60 pages and browser memory limits                        |
| Recognize scanned text         | English OCR on the active rendered page                                                              | Review required; no layout recreation                           |
| Signature placement            | Insert a local raster signature image                                                                | Visual signature only, not cryptographic signing                |
| Word export                    | Generate OOXML paragraphs, lists, tables, links, formatting, images                                  | Rebuilt structure; not the original Word package                |
| PDF export                     | Flattened image pages                                                                                | Loss of selectable text, forms, tags, and signatures            |
| Other exports                  | HTML and TXT for writing; PNG and current-page PDF for pages                                         | No spreadsheet or presentation export                           |
| Recovery                       | Automatic local drafts with a visible save state                                                     | Same browser/origin only; storage can be unavailable or cleared |

| Input                              | Workspace | Notes                                                                      |
| ---------------------------------- | --------- | -------------------------------------------------------------------------- |
| `.pdf`                             | Pages     | Text detection plus visual edits; locked PDFs need an unlocked source copy |
| `.docx`                            | Writing   | Semantic import with a layout notice                                       |
| `.txt`                             | Writing   | Text is escaped, not interpreted as HTML                                   |
| `.md`                              | Writing   | Parse Markdown and sanitize resulting HTML                                 |
| `.html`, `.htm`                    | Writing   | Sanitize; strip remote images and active content                           |
| `.png`, `.jpg`, `.jpeg`, `.webp`   | Pages     | Image-backed page with optional OCR                                        |
| `.doc`, `.xlsx`, `.pptx`, archives | Rejected  | No silent partial import                                                   |

## Architecture and library selection

### React, TypeScript, and Vite

The application is a static client with no document ingestion endpoint. This reduces hosting complexity and prevents document contents from being sent to a conversion service. TypeScript represents pages, editable elements, and document modes explicitly. Heavy dependencies are dynamically imported when opening their formats or invoking exports. The home screen does not load the full PDF or Word editor engine.

This architecture is suitable for personal editing and modest document sizes. It is not a substitute for a server worker farm for large scans, batch conversion, or office rendering. Browser memory limits and local storage quotas remain real constraints.

### Tiptap and ProseMirror

Tiptap offers a headless editor and a schema-driven extension system. Its React integration and table extension provide a foundation for rich text commands and editable tables without dictating the app's visual design. Some advanced functionality in its ecosystem belongs to commercial products; the application uses the installed open-source extensions and a local find/replace implementation. [7][8]

**Implementation decision:** use the editor transaction model for text changes and undo, rather than rewriting the HTML string during every replacement. Searching across inline formatting should preserve unaffected marks and avoid replacing a phrase by deleting entire paragraphs. Paragraph boundaries remain search boundaries. The renderer sanitizes imported and pasted HTML.

### PDF.js

PDF.js provides page rendering and text extraction. Its examples describe the viewport transformation needed to reconcile PDF coordinates with canvas coordinates. Rotation, page sizing, and output scale must be handled explicitly. [9]

**Implementation decision:** render sequentially, cap image dimensions, limit cumulative pixels, and release temporary canvases. Keep normalized document coordinates separate from display zoom. Rotate the page's SVG coordinate system and use the inverse transform for pointer input. Export page rotation along with the composited image. Text hit boxes are a convenience layer; they are not the PDF's original editable objects.

### pdf-lib, docx, and html2pdf.js

Use pdf-lib to build new PDFs from page images. Use docx to generate actual OOXML packages that Word can open, including paragraphs, formatting, tables, and raster images. Its browser API supports Blob export. [10]

Writing-to-PDF uses html2pdf.js. Its documented rendering pipeline has browser canvas limitations and uses image-based output. Large content or difficult page-break layouts need review; a download completing does not prove every page is correct. [11]

**Implementation decision:** make PDF flattening explicit for both workspaces. Offer HTML and DOCX when selectable or editable content matters. Do not imply that PDF export preserves the original accessibility structure. Include tests that reopen exported files and examine content, page counts, and edited pixels.

### DOMPurify and local storage

DOMPurify is a maintained HTML sanitizer with configurable restrictions. It provides an appropriate boundary before file-derived markup enters the rich text editor, but application-specific URL and image rules still need explicit handling. [12]

**Implementation decision:** remove scripts, frames, forms, and remote image sources. Allow embedded raster images; reject active or unknown data formats. Remove styles that reference external URLs. Normalize external links to supported schemes. Serve fonts locally. Add a Content Security Policy and keep the OCR engine's asset hosts narrowly specified.

Drafts use localForage backed by browser storage. Save operations are queued. The UI distinguishes saving, saved, and failure states. A failed persistence operation must not silently report success. Downloads are independent of local draft storage, giving users a way to keep their work when a quota is exceeded.

## Reliability and validation strategy

A professional feel depends on operations completing predictably. Controls that merely display success messages are insufficient. Tests should exercise imports through the file input, manipulate real text or page elements, download outputs, and inspect those outputs independently.

The automated suite checks responsive widths, literal corrections across formatted text, history, draft persistence after reload, DOCX structure, PDF page count and rotation, pixel-level erasing, sanitized HTML, rejection of unsupported files, and draft deletion. Accessibility checks cover the home screen, writing editor, and help dialog. Chromium, Firefox, and WebKit exercise different browser implementations.

Use deterministic sample documents created by the test suite rather than personal documents. For erase validation, inspect the pixel region that previously contained a mark, then inspect nearby content to verify it remains visible. For DOCX, independently read the exported package with Mammoth. For PDF, reopen output and confirm that original text hit regions are absent in flattened pages.

A separate visual pass should examine desktop, 390px, and 320px screenshots after changes. Automated accessibility checks cannot replace keyboard and visual review. OCR requires a genuine recognition smoke test and clear failure feedback when the language assets cannot load.

Dependency review is part of maintenance. The September 2026 dependency check identified advisories affecting older PDF.js and html2pdf.js releases. The selected dependency versions were upgraded beyond the affected ranges, and the lockfile records the resolved versions. Future releases must rerun the audit; a clean result is time-bound, not a guarantee that a parser has no vulnerabilities. [13][14]

## Roadmap and explicit non-goals

The next major investment should be fidelity, not a longer list of superficial tools. Evaluate a dedicated PDF content editing engine if preserving original vector text is required. Evaluate an office layout engine if accurate DOCX page layout, headers, footers, and tracked changes become a product requirement. Both choices change licensing, hosting, privacy, and maintenance obligations.

Useful incremental work includes saved export presets, more OCR languages, accessible tagged PDF output, page crops with explicit semantics, recovery from interrupted long exports, improved font metrics, and per-document version history. These should be implemented with fixtures that demonstrate the required behavior.

Automatic removal of arbitrary marks while reconstructing hidden original content is not a supported guarantee. Neither are OCR-perfect transcriptions, unlimited file sizes, lossless Word round-tripping, or certified digital signatures. The current product is useful within its documented boundaries and should be evaluated on those behaviors.

## Sources

Sources inspected September 11, 2026. Vendor capabilities below are evidence for engineering constraints, not independent comparative benchmarks or promises about Paperdesk.

1. Hopding. [pdf-lib: Limitations](https://github.com/Hopding/pdf-lib#limitations). Project documentation; existing-text API limits and page construction.
2. Tesseract.js maintainers. [Tesseract.js: Scope](https://github.com/naptha/tesseract.js#scope). Project documentation; browser OCR and PDF scope.
3. Adobe. [Edit text in PDFs](https://helpx.adobe.com/acrobat/using/edit-text-pdfs1.html). Updated February 26, 2026; font substitution and editing limitations.
4. Adobe. [Edit scanned documents](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/edit-scans.html). Updated September 23, 2025; OCR review and complex-layout considerations.
5. Michael Williamson. [Mammoth.js documentation and security](https://github.com/mwilliamson/mammoth.js). Semantic DOCX conversion and sanitization requirements.
6. Adobe. [Remove watermarks](https://helpx.adobe.com/acrobat/desktop/edit-documents/add-backgrounds-and-watermarks/delete-watermarks.html). Updated September 23, 2025; watermark-specific workflow.
7. Tiptap. [React integration](https://tiptap.dev/docs/editor/getting-started/install/react). Editor integration and extension model.
8. Tiptap. [TableKit extension](https://tiptap.dev/docs/editor/extensions/functionality/table-kit). Table extension composition.
9. Mozilla. [PDF.js examples](https://mozilla.github.io/pdf.js/examples/). Viewports, canvas rendering, and coordinate transformations.
10. docx maintainers. [docx documentation](https://docx.js.org/) and [Packer API](https://docx.js.org/api/classes/Packer.html). Browser OOXML generation and Blob export.
11. Erik Koopmans. [html2pdf.js documentation](https://github.com/eKoopmans/html2pdf.js). Rendering pipeline and known limitations.
12. Cure53. [DOMPurify](https://github.com/cure53/DOMPurify). Sanitization and configuration.
13. Mozilla / GitHub Advisory Database. [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j). Reviewed August 6, 2026; affected PDF.js versions and patched release.
14. GitHub Advisory Database. [GHSA-w8x4-x68c-m6fc](https://github.com/advisories/GHSA-w8x4-x68c-m6fc). html2pdf.js cross-site scripting advisory.
