import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

// PDF.js loads these assets only when a document needs them. Serve matching,
// pinned assets locally so CJK text and image codecs do not depend on a CDN.
const root = new URL("../", import.meta.url);
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const destination = new URL(`public/pdf-assets/${directory}/`, root);
  await mkdir(destination, { recursive: true });
  await cp(
    fileURLToPath(new URL(`node_modules/pdfjs-dist/${directory}/`, root)),
    fileURLToPath(destination),
    { recursive: true },
  );
}
