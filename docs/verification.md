# Release verification

Verified September 11, 2026 with `npm run verify` against the production build, including the Vercel Content Security Policy in the local preview server.

- ESLint: passed.
- TypeScript and Vite production build: passed.
- Playwright: 46 passed, 2 intentionally skipped. Core workflows run in Chromium, Firefox, and WebKit. English OCR is exercised with a real engine in Chromium; its duplicate Firefox and WebKit cases are skipped.
- Automated accessibility: WCAG A/AA checks pass for home, rich editor, PDF controls, help, and export dialog.
- Responsive checks: no document-level horizontal overflow at 1440px, 768px, 390px, and 320px where applicable.
- Export evidence: generated DOCX packages are independently read; exported PDF page counts and rotation are checked; erased PNG pixels are inspected while confirming nearby text remains visible.
- Failure handling: unsupported files, empty input, and storage quota failures keep useful feedback and protect the current document.
- Unicode: literal replacements preserve character offsets and punctuation.
- Dependency audit: no known vulnerabilities reported by `npm audit --audit-level=high` at release time.
- Visual review: home, writing, and PDF screenshots inspected at desktop and phone widths. Screenshots are in `docs/screenshots/`.

These checks cover representative fixtures and supported workflows. They do not prove lossless conversion of arbitrary documents, perfect OCR, original-font matching, or commercial editor feature parity. Format limitations are documented in the README, research report, and in-app guide.
