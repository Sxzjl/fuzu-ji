import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url));
const outputs = [
  ["public/favicon-32.png", 32],
  ["public/apple-touch-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
];

for (const [file, size] of outputs) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  writeFileSync(new URL(`../${file}`, import.meta.url), png);
}
