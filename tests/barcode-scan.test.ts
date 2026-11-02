import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import bwipjs from "bwip-js/node";
import { barcodePng, printerBarcode, printerQrCode } from "@/lib/barcode";

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

  it.each([203, 300])("puts every bar on whole printer dots at %i dpi", (dpi) => {
    for (const code of SAMPLE_CODES) {
      const barcode = printerBarcode(code, dpi, 50);
      expect(barcode.widthMm).toBeLessThanOrEqual(50);
      // Each bar starts a quarter dot in and is half a dot narrower than its whole dots.
      const bars = [...barcode.svg.matchAll(/<rect x="([\d.]+)" width="([\d.]+)"/g)];
      expect(bars.length).toBeGreaterThan(10);
      for (const [, x, width] of bars) {
        expect(Number.isInteger(Number(x) - 0.25)).toBe(true);
        expect(Number.isInteger(Number(width) + 0.5)).toBe(true);
      }
    }
  });

  it.each(SAMPLE_CODES)("%s scans back from a QR code", async (code) => {
    // The same 2-square blank margin the labels use.
    const png = await bwipjs.toBuffer({
      bcid: "qrcode",
      text: code,
      eclevel: "M",
      scale: 4,
      paddingwidth: 2,
      paddingheight: 2,
      backgroundcolor: "FFFFFF",
    } as never);
    const results = await readBarcodes(new Uint8Array(png), { formats: ["QRCode"] });
    expect(results.map((result) => result.text)).toEqual([code]);
  });

  it.each([203, 300])("puts every QR square on whole printer dots at %i dpi", (dpi) => {
    // A 50 x 25 mm label gives the QR code up to 17 mm.
    for (const code of [...SAMPLE_CODES, "ABCD-10000-ABCDEFGH-ABCDEFGH-AB"]) {
      const qr = printerQrCode(code, dpi, 17);
      expect(qr.sizeMm).toBeLessThanOrEqual(17);
      expect(qr.dotsPerModule).toBeGreaterThanOrEqual(dpi === 203 ? 4 : 6);
      const numbers = [...qr.svg.matchAll(/(?:x|y|width|height)="([\d.]+)"/g)].map((m) =>
        Number(m[1]),
      );
      expect(numbers.every((n) => Number.isInteger(n) && n % qr.dotsPerModule === 0)).toBe(true);
    }
  });

  it("uses wider bars when they fit", () => {
    expect(printerBarcode("CAP-0012-BLK-M", 203, 50).dotsPerModule).toBe(1);
    expect(printerBarcode("CAP-0012-BLK-M", 300, 50).dotsPerModule).toBe(2);
    expect(printerBarcode("HNY-0001", 203, 50).dotsPerModule).toBe(3);
  });
});
