import fs from "node:fs";
import sharp from "sharp";
import * as mupdf from "mupdf";
const slugs = ["burung-merak","candide","hujan-tere-liye","gigi-koko"];
const scan = JSON.parse(fs.readFileSync("../.cache/scan.json","utf8"));
const groups = JSON.parse(fs.readFileSync("../.cache/groups.json","utf8"));
const render = JSON.parse(fs.readFileSync("../.cache/render.json","utf8"));
for (const slug of slugs) {
  const entry = Object.entries(groups.slugMap).find(([, s]) => s === slug);
  if (!entry) { console.log(slug, "tidak ada di slugMap"); continue; }
  const sc = scan[entry[0]];
  const name = sc.name;
  const ext = name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? "pdf";
  const p = fs.existsSync(`../.cache/pdf/${entry[0]}.${ext}`) ? `../.cache/pdf/${entry[0]}.${ext}` : `../.cache/pdf/${entry[0]}.pdf`;
  if (ext !== "pdf") { console.log(slug, "bukan pdf"); continue; }
  const doc = mupdf.Document.openDocument(fs.readFileSync(p), "application/pdf");
  const out = [];
  for (let i = 0; i < 3; i++) {
    const page = doc.loadPage(i);
    const b = page.getBounds();
    const s = 900/(b[2]-b[0]);
    const pix = page.toPixmap(mupdf.Matrix.scale(s,s), mupdf.ColorSpace.DeviceRGB, false, true);
    const w = pix.getWidth(), h = pix.getHeight();
    const px = pix.getPixels();
    const raw = Buffer.from(px.buffer.slice(px.byteOffset, px.byteOffset+px.length));
    const st = await sharp(raw, {raw:{width:w,height:h,channels:3}}).greyscale().stats();
    out.push(`hal${i+1}: stdev=${st.channels[0].stdev.toFixed(1)}`);
    pix.destroy(); page.destroy();
  }
  console.log(slug.padEnd(18), out.join("  "));
}
