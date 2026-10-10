// Sanity checks for public/data.js. Run with `npm run check`.
import { CLASSES, STATUSES } from "../public/data.js";

const errors = [];
const seen = new Set();
const classes = new Set(CLASSES.map((c) => c.cls));

for (const s of STATUSES) {
  if (seen.has(s.code)) errors.push(`${s.code}: duplicate code`);
  seen.add(s.code);
  if (s.code < 100 || s.code > 599) errors.push(`${s.code}: out of range`);
  if (!classes.has(s.cls)) errors.push(`${s.code}: unknown class ${s.cls}`);
  if (!s.phrase || !s.desc) errors.push(`${s.code}: missing phrase or description`);
  if (!s.unofficial && !/^https:\/\/www\.rfc-editor\.org\/rfc\/rfc\d+\.html#section-[\d.]+$/.test(s.url)) {
    errors.push(`${s.code}: bad RFC url ${s.url}`);
  }
  if (s.unofficial && !s.source) errors.push(`${s.code}: unofficial code without source`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const registered = STATUSES.filter((s) => !s.unofficial).length;
console.log(`ok: ${STATUSES.length} codes (${registered} registered, ${STATUSES.length - registered} unofficial)`);
