// 공유 미리보기 이미지(1200x630)를 images/og/ 에 만든다. 글을 추가하거나 제목을 바꿀 때만 실행: npm run og
// 크롬(Google Chrome)이 설치돼 있어야 한다.
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "images/og";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 사진은 images/og/src/<slug>.jpg (Unsplash). 없으면 파란 그라데이션만 쓴다. pos 는 잘라낼 때 세로 기준점.
const POS = { "2026-10-29-anmok-coffee-street": "92%", "2026-10-29-gangneung-free-spots": "62%", "2026-10-29-gangneung-pension-compare": "40%" };
const photoOf = async (slug) => {
  const f = path.resolve("images/og/src", slug + ".jpg");
  return (await fs.access(f).then(() => true, () => false)) ? f : null;
};

const card = ({ emoji, kind, title, foot, photo, pos = "55%" }) => `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#fff;
background:${photo ? `linear-gradient(180deg,rgba(8,20,50,.55) 0%,rgba(8,20,50,.25) 40%,rgba(8,20,50,.8) 100%),url("file://${photo}") center ${pos}/cover` : "linear-gradient(135deg,#1d63e0 0%,#4b8bf5 55%,#ff6b5b 130%)"};text-shadow:0 2px 14px rgba(0,0,0,.45);padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;align-items:center;gap:20px;font-size:34px;font-weight:700}
.badge{background:rgba(255,255,255,.22);border-radius:999px;padding:6px 22px;font-size:28px}
h1{font-size:${title.length > 30 ? 62 : 76}px;line-height:1.3;font-weight:800;letter-spacing:-.02em;word-break:keep-all}
.foot{font-size:30px;opacity:.9;display:flex;justify-content:space-between;align-items:center}
.emoji{font-size:120px}
</style><body>
<div class="top"><span>${esc(foot)}</span>${kind ? `<span class="badge">${esc(kind)}</span>` : ""}</div>
<h1>${esc(title)}</h1>
<div class="foot"><span>확인한 것과 못 한 것을 구분해 적습니다</span><span class="emoji">${emoji}</span></div>`;

const cards = [{ slug: "default", photo: await photoOf("default"), emoji: "🧭", kind: "", title: "여행 기록장", foot: "TRAVEL NOTES" }];
for (const f of (await fs.readdir("posts")).filter((f) => f.endsWith(".md"))) {
  const fm = (await fs.readFile(path.join("posts", f), "utf8")).match(/^---\n([\s\S]*?)\n---/)[1];
  const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1].trim() ?? "";
  const slug = f.replace(/\.md$/, "");
  cards.push({ slug, photo: await photoOf(slug), pos: POS[slug], emoji: get("emoji") || "🧭", kind: get("kind"), title: get("title"), foot: "여행 기록장" });
}

await fs.mkdir(OUT, { recursive: true });
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "og-"));
for (const c of cards) {
  const html = path.join(tmp, `${c.slug}.html`);
  await fs.writeFile(html, card(c));
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,630",
    `--screenshot=${path.resolve(OUT, c.slug + ".png")}`, `file://${html}`], { stdio: "ignore" });
  console.log("만듦:", `${OUT}/${c.slug}.png`);
}
await fs.rm(tmp, { recursive: true, force: true });
