import bwipjs from "bwip-js/node";

// Labels carry the variant code as a QR code (the default) or a Code 128 line
// barcode. Both encode exactly the code, so a scan types it like a keyboard.

const BASE = {
  bcid: "code128",
  includetext: false,
  paddingwidth: 0,
  paddingheight: 0,
} as const;

/** The blank margin (quiet zone) scanners need on each side, in bar units. */
const QUIET_MODULES = 10;

/**
 * Bars are drawn this many dots narrower on each side. The Mac's print
 * rendering blackens every dot a bar touches, which closes 1-dot gaps; inset
 * bars still fill exactly their own dots.
 */
const INSET_DOTS = 0.25;

export type PrinterBarcode = { svg: string; widthMm: number; dotsPerModule: number };

/**
 * SVG for a label printer, spanning the whole label: place it at the label's
 * left edge, exactly `widthMm` wide. Every bar and space is a whole number of
 * printer dots. A barcode stretched to fit lands bars on fractions of a dot and
 * the printer rounds them unevenly, which scanners can't read. The left edge
 * matters too: the browser rounds a box's position to its own pixel grid, so a
 * centred box can sit half a dot off; the label's edge is always on a dot.
 * Uses the widest bars that fit with their quiet zones; the SVG fills its height.
 */
export function printerBarcode(code: string, dpi: number, labelWidthMm: number): PrinterBarcode {
  const [{ sbs }] = bwipjs.raw({ ...BASE, text: code }) as { sbs: number[] }[];
  const modules = sbs.reduce((sum, width) => sum + width, 0);
  const labelDots = Math.floor((labelWidthMm * dpi) / 25.4);
  const dotsPerModule = Math.max(1, Math.floor(labelDots / (modules + 2 * QUIET_MODULES)));

  // sbs alternates bar, space, bar, …
  const rects: string[] = [];
  let x = Math.floor((labelDots - modules * dotsPerModule) / 2);
  sbs.forEach((width, index) => {
    const dots = width * dotsPerModule;
    if (index % 2 === 0) {
      rects.push(`<rect x="${x + INSET_DOTS}" width="${dots - 2 * INSET_DOTS}" height="1"/>`);
    }
    x += dots;
  });

  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${labelDots} 1" ` +
      `preserveAspectRatio="none" shape-rendering="crispEdges">${rects.join("")}</svg>`,
    widthMm: (labelDots * 25.4) / dpi,
    dotsPerModule,
  };
}

/** The blank margin a QR code needs on each side, in squares. */
const QR_QUIET_MODULES = 2;

export type PrinterQrCode = { svg: string; sizeMm: number; dotsPerModule: number };

/**
 * QR code for a label printer, as large as fits in `maxSizeMm` (blank margin
 * included), with every square a whole number of printer dots. Medium error
 * correction (about 15%) still scans a slightly dark or smudged print. The
 * SVG must be shown exactly `sizeMm` square.
 */
export function printerQrCode(code: string, dpi: number, maxSizeMm: number): PrinterQrCode {
  const [{ pixs, pixx }] = bwipjs.raw("qrcode", code, "eclevel=M") as {
    pixs: number[];
    pixx: number;
  }[];
  const modules = pixx + 2 * QR_QUIET_MODULES;
  const maxDots = Math.floor((maxSizeMm * dpi) / 25.4);
  const dotsPerModule = Math.max(1, Math.floor(maxDots / modules));

  // One rect per run of dark squares in a row; pixs is row by row, 1 = dark.
  const rects: string[] = [];
  for (let y = 0; y < pixx; y++) {
    for (let x = 0; x < pixx; x++) {
      if (!pixs[y * pixx + x]) continue;
      let end = x;
      while (end + 1 < pixx && pixs[y * pixx + end + 1]) end++;
      rects.push(
        `<rect x="${(x + QR_QUIET_MODULES) * dotsPerModule}" y="${(y + QR_QUIET_MODULES) * dotsPerModule}" ` +
          `width="${(end - x + 1) * dotsPerModule}" height="${dotsPerModule}"/>`,
      );
      x = end;
    }
  }

  const size = modules * dotsPerModule;
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
      `shape-rendering="crispEdges">${rects.join("")}</svg>`,
    sizeMm: (size * 25.4) / dpi,
    dotsPerModule,
  };
}

/** PNG at a given number of printer dots per bar module (used by tests). */
export function barcodePng(code: string, dotsPerModule: number): Promise<Buffer> {
  return bwipjs.toBuffer({
    ...BASE,
    text: code,
    scale: dotsPerModule,
    height: 8,
    paddingwidth: 10,
    paddingheight: 4,
    backgroundcolor: "FFFFFF",
  });
}
