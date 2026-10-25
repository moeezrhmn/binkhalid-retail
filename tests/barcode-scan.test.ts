import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { barcodePng, barcodeSvg } from "@/lib/barcode";

// Load the reader's WebAssembly from node_modules instead of its default CDN,
// so the test works offline.
const wasmPath = createRequire(import.meta.url).resolve("zxing-wasm/reader/zxing_reader.wasm");
prepareZXingModule({ overrides: { wasmBinary: new Uint8Array(readFileSync(wasmPath)).buffer } });

// A 203 dpi label printer has 8 dots per mm. A 50 mm label leaves about 46 mm
// (368 dots) for the barcode, so a code must fit at 1 or 2 dots per module.
const DOTS_PER_MM = 203 / 25.4;
const PRINTABLE_MM = 46;

const SAMPLE_CODES = ["CAP-0012-BLK-M", "WST-0001-NVY-42", "ATR-0031-100ML", "HNY-0004-500G"];

async function scan(png: Buffer) {
  const results = await readBarcodes(new Uint8Array(png), { formats: ["Code128"] });
  return results.map((result) => result.text);
}

function widthMm(png: Buffer) {
  return png.readUInt32BE(16) / DOTS_PER_MM;
}

describe("barcodes", () => {
  it.each(SAMPLE_CODES)("%s scans back to the same code", async (code) => {
    const png = await barcodePng(code, 2);
    expect(await scan(png)).toEqual([code]);
  });

  it.each(SAMPLE_CODES)("%s fits a 50 mm label at 203 dpi", async (code) => {
    const png = await barcodePng(code, 1);
    expect(widthMm(png)).toBeLessThanOrEqual(PRINTABLE_MM);
    expect(await scan(png)).toEqual([code]);
  });

  it("renders a scalable SVG", () => {
    const svg = barcodeSvg("CAP-0012-BLK-M");
    expect(svg).toMatch(/^<svg preserveAspectRatio="none" shape-rendering="crispEdges" viewBox=/);
  });
});
