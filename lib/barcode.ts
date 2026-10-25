import bwipjs from "bwip-js/node";

// Barcodes are Code 128 and encode exactly the variant code. They are drawn
// as SVG so they print sharply at any printer resolution.

const BASE = {
  bcid: "code128",
  includetext: false,
  paddingwidth: 0,
  paddingheight: 0,
} as const;

/**
 * SVG markup for a variant code, including the blank margins (quiet zones)
 * scanners need on both sides. It scales to whatever width the label gives it.
 */
export function barcodeSvg(code: string): string {
  return bwipjs
    .toSVG({ ...BASE, text: code, height: 10, paddingwidth: 10 })
    .replace("<svg ", '<svg preserveAspectRatio="none" shape-rendering="crispEdges" ');
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
