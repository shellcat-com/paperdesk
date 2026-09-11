export type ElementKind =
  "text" | "erase" | "highlight" | "rectangle" | "image";
export interface PageElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fontSize?: number;
  font?: string;
  color: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  src?: string;
}
export interface TextBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  font: string;
}
export interface DocumentPage {
  id: string;
  background: string;
  width: number;
  height: number;
  rotation: number;
  elements: PageElement[];
  textBoxes: TextBox[];
}
export interface DeskDocument {
  id: string;
  name: string;
  mode: "write" | "pages";
  source: string;
  updated: number;
  html: string;
  pages: DocumentPage[];
}
export const uid = () => crypto.randomUUID();
export const emptyDocument = (name = "Untitled document"): DeskDocument => ({
  id: uid(),
  name,
  mode: "write",
  source: "Document",
  updated: Date.now(),
  html: "<p></p>",
  pages: [],
});
export const SAMPLE = `<p><strong>STUDIO NOTES</strong></p><h1>Good things start<br>with a little space.</h1><p>A place to put your thoughts in order, make a small correction, or begin something entirely new.</p><hr><h2>A simpler way to work</h2><p>This is your document. Click anywhere to start writing. Select a few words to change their style, or try <strong>Find & replace</strong> to make a quick correction.</p><ul><li>Make room for the details that matter.</li><li>Keep your work on your own device.</li><li>Export it when it feels just right.</li></ul><h2>The next small step</h2><p>Bring a document, an idea, or a first draft. We’ll take it from here.</p><p><em>Made for a calmer kind of paperwork.</em></p>`;
