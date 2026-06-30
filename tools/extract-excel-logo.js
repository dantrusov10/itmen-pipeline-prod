const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../kp/Index.html"), "utf8");
const m = html.match(/ui-topright-logo[\s\S]*?src="data:image\/png;base64,([^"]+)"/);
if (!m) {
  console.error("logo not found");
  process.exit(1);
}
const out = `window.KP_EXCEL_LOGO_B64 = "${m[1]}";\n`;
fs.writeFileSync(path.join(__dirname, "../kp/assets/kp-excel-logo-embed.js"), out);
console.log("written", m[1].length, "chars");
