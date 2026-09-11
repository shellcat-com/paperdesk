import type { JSONContent } from "@tiptap/react";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  ExternalHyperlink,
  ImageRun,
  WidthType,
  LevelFormat,
  UnderlineType,
  type ParagraphChild,
} from "docx";
import { download, loadImage } from "./files";
export async function exportDocx(json: JSONContent, name: string) {
  async function inline(nodes: JSONContent[] = []): Promise<ParagraphChild[]> {
    const children: ParagraphChild[] = [];
    for (const n of nodes) {
      if (n.type === "hardBreak") {
        children.push(new TextRun({ break: 1 }));
        continue;
      }
      if (n.type === "image" && n.attrs?.src) {
        const src = n.attrs.src as string;
        if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)) continue;
        const image = await loadImage(src);
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
        const data = Uint8Array.from(
          atob(canvas.toDataURL("image/png").split(",")[1]),
          (c) => c.charCodeAt(0),
        );
        const width = Math.min(570, image.width);
        children.push(
          new ImageRun({
            data,
            type: "png",
            transformation: {
              width,
              height: (width * image.height) / image.width,
            },
          }),
        );
        continue;
      }
      if (n.type !== "text") {
        children.push(...(await inline(n.content)));
        continue;
      }
      const marks = n.marks || [];
      const style = marks.find((m) => m.type === "textStyle")?.attrs;
      const color = style?.color?.replace("#", "");
      const run = new TextRun({
        text: n.text || "",
        bold: marks.some((m) => m.type === "bold"),
        italics: marks.some((m) => m.type === "italic"),
        strike: marks.some((m) => m.type === "strike"),
        underline: marks.some((m) => m.type === "underline")
          ? { type: UnderlineType.SINGLE }
          : undefined,
        highlight: marks.some((m) => m.type === "highlight")
          ? "yellow"
          : undefined,
        font: style?.fontFamily,
        size: style?.fontSize
          ? Math.round(parseFloat(style.fontSize) * 1.5)
          : undefined,
        color: /^[0-9a-f]{6}$/i.test(color || "") ? color : undefined,
      });
      const link = marks.find((m) => m.type === "link")?.attrs?.href;
      children.push(
        link && /^(https?:|mailto:)/i.test(link)
          ? new ExternalHyperlink({ children: [run], link })
          : run,
      );
    }
    return children;
  }
  async function blocks(
    nodes: JSONContent[] = [],
    list?: { ordered: boolean; level: number },
  ): Promise<(Paragraph | Table)[]> {
    const out: (Paragraph | Table)[] = [];
    for (const n of nodes) {
      if (n.type === "table") {
        const rows: TableRow[] = [];
        for (const row of n.content || []) {
          const cells: TableCell[] = [];
          for (const cell of row.content || [])
            cells.push(
              new TableCell({
                children: await blocks(cell.content),
                shading:
                  cell.type === "tableHeader" ? { fill: "F0F2EF" } : undefined,
                columnSpan: cell.attrs?.colspan || 1,
                rowSpan: cell.attrs?.rowspan || 1,
              }),
            );
          rows.push(new TableRow({ children: cells }));
        }
        out.push(
          new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        );
        continue;
      }
      if (n.type === "bulletList" || n.type === "orderedList") {
        out.push(
          ...(await blocks(n.content, {
            ordered: n.type === "orderedList",
            level: list ? Math.min(list.level + 1, 8) : 0,
          })),
        );
        continue;
      }
      if (n.type === "listItem" || n.type === "blockquote") {
        out.push(...(await blocks(n.content, list)));
        continue;
      }
      if (n.type === "horizontalRule") {
        out.push(
          new Paragraph({
            border: { bottom: { color: "D6DAD4", size: 6, style: "single" } },
          }),
        );
        continue;
      }
      const level = Math.max(1, Math.min(3, n.attrs?.level || 1));
      const heading =
        n.type === "heading"
          ? [
              HeadingLevel.HEADING_1,
              HeadingLevel.HEADING_2,
              HeadingLevel.HEADING_3,
            ][level - 1]
          : undefined;
      const alignment = (
        {
          left: AlignmentType.LEFT,
          center: AlignmentType.CENTER,
          right: AlignmentType.RIGHT,
          justify: AlignmentType.JUSTIFIED,
        } as Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]>
      )[n.attrs?.textAlign || "left"];
      out.push(
        new Paragraph({
          children: await inline(n.type === "image" ? [n] : n.content),
          heading,
          alignment,
          spacing: { after: 180 },
          bullet: list && !list.ordered ? { level: list.level } : undefined,
          numbering: list?.ordered
            ? { reference: "ordered", level: list.level }
            : undefined,
        }),
      );
    }
    return out.length ? out : [new Paragraph("")];
  }
  const children = await blocks(json.content);
  const doc = new Document({
    title: name,
    creator: "Paperdesk",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720 * (level + 1), hanging: 260 } },
            },
          })),
        },
      ],
    },
    sections: [{ children }],
  });
  download(await Packer.toBlob(doc), `${name}.docx`);
}
