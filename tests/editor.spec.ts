import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
} from "docx";
import mammoth from "mammoth";
import fs from "node:fs/promises";
async function pdfFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([595, 842]);
  p.drawText("Alex Jonson", {
    x: 60,
    y: 735,
    size: 22,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  p.drawText("September 11, 2025", { x: 60, y: 695, size: 16, font });
  p.drawText("DRAFT", { x: 60, y: 650, size: 18, font });
  pdf
    .addPage([595, 842])
    .drawText("Second page", { x: 60, y: 740, size: 22, font });
  return Buffer.from(await pdf.save());
}
async function upload(
  page: Page,
  buffer: Buffer,
  name: string,
  mimeType: string,
) {
  await page
    .getByLabel("Open document file", { exact: true })
    .setInputFiles({ buffer, name, mimeType });
  await expect(page.getByLabel("Document name")).toBeVisible();
  await expect(page.locator(".busy-overlay")).toHaveCount(0);
}
async function exportFile(page: Page, label: RegExp) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return { file, buffer: await fs.readFile((await file.path())!) };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ page }) => {
  await page.goto("./");
});
test("home and editor work at desktop, tablet, and narrow phone widths", async ({
  page,
}, info) => {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("heading", { name: "A little less paperwork." }),
    ).toBeVisible();
    await noOverflow(page);
    if (info.project.name === "chromium" && width !== 768)
      await page.screenshot({
        path: `docs/screenshots/home-${width}.png`,
        fullPage: true,
      });
  }
  await page
    .getByRole("button", { name: "Take the editor for a spin" })
    .click();
  await expect(page.getByLabel("Document text")).toContainText(
    "Good things start",
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
    if (info.project.name === "chromium")
      await page.screenshot({
        path: `docs/screenshots/editor-${width}.png`,
        fullPage: true,
      });
  }
});
test("corrects text across formatting, undoes, exports and restores saved drafts", async ({
  page,
}) => {
  await upload(
    page,
    Buffer.from(
      "<p>Alex <strong>Jonson</strong> meets Alex Jonson on 2025-09-11.</p>",
    ),
    "corrections.html",
    "text/html",
  );
  await page
    .getByRole("button", { name: "Find & replace", exact: true })
    .click();
  await page.getByLabel("Find", { exact: true }).fill("Alex Jonson");
  await page.getByLabel("Replace with").fill("Alex Johnson");
  await expect(page.getByText("2 matches", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Replace all", exact: true }).click();
  await expect(page.getByLabel("Document text")).toHaveText(
    "Alex Johnson meets Alex Johnson on 2025-09-11.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Document text")).toContainText("Alex Jonson");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByLabel("Document name").fill("Corrected notes");
  const { buffer } = await exportFile(page, /Plain text/);
  expect(buffer.toString()).toContain("Alex Johnson meets Alex Johnson");
  await page.getByRole("button", { name: "Back to my desk" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Corrected notes", exact: true })
    .click();
  await expect(page.getByLabel("Document text")).toContainText("Alex Johnson");
});
test("imports Word formatting and tables and exports a real DOCX", async ({
  page,
}) => {
  const input = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Client notes", bold: true })],
            }),
            new Paragraph("Name: Alex Jonson"),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Date")] }),
                    new TableCell({ children: [new Paragraph("2025-09-11")] }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    }),
  );
  await upload(
    page,
    input,
    "notes.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  await expect(page.locator(".document-prose strong")).toContainText(
    "Client notes",
  );
  await expect(page.locator(".document-prose table")).toContainText(
    "2025-09-11",
  );
  const { buffer } = await exportFile(page, /Word document/);
  expect(buffer.slice(0, 2).toString()).toBe("PK");
  const text = await mammoth.extractRawText({ buffer });
  expect(text.value).toContain("Alex Jonson");
  const html = await mammoth.convertToHtml({ buffer });
  expect(html.value).toContain("<table>");
  expect(html.value).toContain("<strong>Client notes</strong>");
});
test("writes and formats text and exports a nonempty PDF", async ({ page }) => {
  await page.getByRole("button", { name: "Start with a blank page" }).click();
  const editor = page.getByLabel("Document text");
  await editor.fill("A new document with real words.");
  await editor.selectText();
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(page.locator(".document-prose strong")).toHaveText(
    "A new document with real words.",
  );
  const { buffer } = await exportFile(page, /PDF document/);
  const pdf = await PDFDocument.load(buffer);
  expect(pdf.getPageCount()).toBe(1);
  expect(buffer.length).toBeGreaterThan(6000);
});
test("corrects PDF text and exports flattened pages without original text content", async ({
  page,
}) => {
  await upload(page, await pdfFixture(), "sample.pdf", "application/pdf");
  await page
    .getByRole("button", { name: "Edit text: Alex Jonson", exact: true })
    .click();
  await page.getByLabel("Replacement text").fill("Alex Johnson");
  await expect(page.locator("svg.pdf-canvas text")).toContainText(
    "Alex Johnson",
  );
  await page.getByRole("button", { name: "Rotate page", exact: true }).click();
  await page
    .getByRole("button", { name: "Duplicate page", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Go to page 3", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move page later" }).click();
  const { buffer } = await exportFile(page, /All pages as PDF/);
  const pdf = await PDFDocument.load(buffer);
  expect(pdf.getPageCount()).toBe(3);
  expect(pdf.getPage(2).getRotation().angle).toBe(90);
  await upload(page, buffer, "exported.pdf", "application/pdf");
  await expect(page.locator(".text-hit")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Go to page 3", exact: true }),
  ).toBeVisible();
});
test("erase modifies exported pixels, supports undo, and leaves nearby content intact", async ({
  page,
}) => {
  await upload(page, await pdfFixture(), "erase.pdf", "application/pdf");
  await page.getByRole("button", { name: "Erase", exact: true }).click();
  const svg = page.locator(".pdf-canvas");
  const box = (await svg.boundingBox())!;
  const start = {
    x: box.x + (50 / 595) * box.width,
    y: box.y + (160 / 842) * box.height,
  };
  const end = {
    x: box.x + (180 / 595) * box.width,
    y: box.y + (205 / 842) * box.height,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByText("1 edit on this page", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByText("0 edits on this page", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const { buffer } = await exportFile(page, /Current page as image/);
  expect(buffer.slice(1, 4).toString()).toBe("PNG");
  const pixels = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    function dark(x: number, y: number, w: number, h: number) {
      const data = ctx.getImageData(x * 2, y * 2, w * 2, h * 2).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) count++;
      return count;
    }
    return { erased: dark(55, 165, 120, 35), nearby: dark(55, 85, 200, 35) };
  }, buffer.toString("base64"));
  expect(pixels.erased).toBe(0);
  expect(pixels.nearby).toBeGreaterThan(50);
});
test("PDF workspace fits mobile and offers accessible properties", async ({
  page,
}, info) => {
  await upload(page, await pdfFixture(), "mobile.pdf", "application/pdf");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
    if (info.project.name === "chromium")
      await page.screenshot({
        path: `docs/screenshots/pdf-${width}.png`,
        fullPage: true,
      });
  }
  await page
    .getByRole("button", { name: "Edit text: Alex Jonson", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Replacement text")).toBeVisible();
  await page.getByLabel("Replacement text").fill("Alex Johnson");
  await noOverflow(page);
});
test("sanitizes HTML and prevents imported tracking images from loading", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("attacker.invalid")) requests.push(r.url());
  });
  await upload(
    page,
    Buffer.from(
      '<h1>Safe content</h1><script>window.pwned=true</script><img src="https://attacker.invalid/pixel.png" onerror="window.pwned=true"><p style="background:url(https://attacker.invalid/style)">Notes</p><a href="javascript:alert(1)">Bad link</a><iframe src="https://attacker.invalid/frame"></iframe>',
    ),
    "unsafe.html",
    "text/html",
  );
  await expect(page.getByLabel("Document text")).toContainText("Safe content");
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);
  await expect(
    page.locator(
      ".document-prose script,.document-prose iframe,.document-prose img",
    ),
  ).toHaveCount(0);
  expect(requests).toHaveLength(0);
});
test("rejects unsupported and empty documents with useful feedback", async ({
  page,
}) => {
  await page.getByLabel("Open document file", { exact: true }).setInputFiles({
    buffer: Buffer.from("old word binary"),
    name: "old.doc",
    mimeType: "application/msword",
  });
  await expect(page.getByRole("status")).toContainText("save as .docx");
  await page.getByLabel("Open document file", { exact: true }).setInputFiles({
    buffer: Buffer.alloc(0),
    name: "empty.txt",
    mimeType: "text/plain",
  });
  await expect(page.getByRole("status")).toContainText("empty");
  await expect(
    page.getByRole("heading", { name: "A little less paperwork." }),
  ).toBeVisible();
});
test("deletes a local draft after confirmation", async ({ page }) => {
  await upload(
    page,
    Buffer.from("Temporary text"),
    "temporary.txt",
    "text/plain",
  );
  await page.getByRole("button", { name: "Back to my desk" }).click();
  await page
    .getByRole("button", { name: "Delete temporary", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open temporary", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete temporary", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open temporary", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("A clean slate feels good.")).toBeVisible();
});
test("home, editor and help pass WCAG AA automated checks", async ({
  page,
}) => {
  let scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Take the editor for a spin" })
    .click();
  await expect(page.getByLabel("Document text")).toBeVisible();
  scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.getByRole("button", { name: "Help and format guide" }).click();
  scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("append has its own undo step and blank pages stay organized", async ({
  page,
}) => {
  await upload(page, await pdfFixture(), "first.pdf", "application/pdf");
  await page.getByLabel("Append document file").setInputFiles({
    buffer: await pdfFixture(),
    name: "second.pdf",
    mimeType: "application/pdf",
  });
  await expect(
    page.getByRole("button", { name: "Go to page 4", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".busy-overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Go to page 3", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Blank page", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Go to page 3", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Go to page 3", exact: true }),
  ).toHaveCount(0);
});

test("a failed save keeps the unsaved document open and exportable", async ({
  page,
}) => {
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Start with a blank page" }).click();
  await page.getByLabel("Document text").fill("Keep this unsaved text.");
  await expect(
    page.getByText("Not saved · export a copy", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to my desk" }).click();
  await expect(page.getByLabel("Document text")).toContainText(
    "Keep this unsaved text.",
  );
  const { buffer } = await exportFile(page, /Plain text/);
  expect(buffer.toString()).toContain("Keep this unsaved text.");
});

test("PDF controls and export dialog pass automated accessibility checks", async ({
  page,
}) => {
  await upload(page, await pdfFixture(), "accessible.pdf", "application/pdf");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const modal = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(modal.violations).toEqual([]);
});

test("recognizes English text locally from a real page", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "chromium",
    "OCR engine smoke test; core workflows run in every browser.",
  );
  test.setTimeout(120000);
  await upload(page, await pdfFixture(), "scan.pdf", "application/pdf");
  await page
    .getByRole("button", { name: "Recognize text", exact: true })
    .click();
  await expect(page.getByLabel("Document text")).toContainText("Alex", {
    timeout: 100000,
  });
  await expect(page.getByLabel("Document text")).toContainText("September");
  await expect(page.getByLabel("Document name")).toHaveValue("scan · text");
});

test("literal replacements keep Unicode offsets and punctuation intact", async ({
  page,
}) => {
  await upload(
    page,
    Buffer.from("İnci met Alex. Ref: [A.1] and [A.1]."),
    "unicode.txt",
    "text/plain",
  );
  await page
    .getByRole("button", { name: "Find & replace", exact: true })
    .click();
  await page.getByLabel("Find", { exact: true }).fill("Alex");
  await page.getByLabel("Replace with").fill("Ali");
  await page.getByRole("button", { name: "Replace all", exact: true }).click();
  await expect(page.getByLabel("Document text")).toContainText("İnci met Ali.");
  await page.getByLabel("Find", { exact: true }).fill("[A.1]");
  await page.getByLabel("Replace with").fill("[B.2]");
  await page.getByRole("button", { name: "Replace all", exact: true }).click();
  await expect(page.getByLabel("Document text")).toHaveText(
    "İnci met Ali. Ref: [B.2] and [B.2].",
  );
});
