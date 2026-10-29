// posts/*.md 를 읽어 docs/ 에 정적 사이트를 만든다. (GitHub Pages는 docs/ 폴더를 배포)
import { promises as fs } from "node:fs";
import path from "node:path";
import { marked } from "marked";

const SITE = {
  // GitHub Pages 주소. 도메인을 바꾸면 여기만 고친다. (canonical, 공유 미리보기, sitemap 에 쓰인다)
  url: "https://yoondaekwon.github.io/travel-log/",
  title: "여행 기록장",
  description: "가기 전에 조사하고, 확인한 것과 못 한 것을 구분해서 적는 여행 블로그",
};
// 다른 지역 글 신청을 받는 에어테이블 폼
const REQUEST_URL = "https://airtable.com/app6EFbkYAXaLDpcg/shrqm0djpOXjd2fUc";
const POSTS_DIR = "posts";
const OUT_DIR = "docs";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 글 맨 위 --- 사이의 key: value 를 읽는다. tags 는 쉼표로 구분.
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("frontmatter(---)가 없습니다");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  meta.tags = (meta.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return { meta, body: m[2] };
}

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d63e0"/><stop offset="1" stop-color="#ff6b5b"/></linearGradient></defs><circle cx="16" cy="16" r="14" fill="url(#g)"/></svg>',
  );

const abs = (p = "") => new URL(p, SITE.url).href;

function layout({ title, description, base, content, type = "website", image, pagePath = "", jsonLd, published }) {
  const url = abs(pagePath);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#1d63e0">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(SITE.title)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ko_KR">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">${published ? `\n<meta property="article:published_time" content="${esc(published)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="${FAVICON}">${jsonLd ? `\n<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
<link rel="stylesheet" href="${base}style.css">
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="${base}"><span class="dot"></span>${esc(SITE.title)}</a>
    <nav class="site-nav"><a href="${base}about/">소개</a></nav>
    <a class="request-btn" href="${REQUEST_URL}" target="_blank" rel="noopener noreferrer">다른 지역 신청하기</a>
  </div>
</header>
<main>
${content}
</main>
<footer class="site-footer"><div class="site-footer-inner">© ${new Date().getFullYear()} ${esc(SITE.title)}</div></footer>
</body>
</html>
`;
}

const fmtDate = (d) => d.replace(/-/g, ".");

// 태그마다 정해진 색(0~5번)을 돌려 쓴다.
const thumb = (p, base) =>
  p.image
    ? `<img class="thumb" src="${base}${esc(p.image)}" alt="" loading="lazy">`
    : `<div class="thumb thumb-fallback" aria-hidden="true">${esc(p.emoji ?? "🧭")}</div>`;
const badge = (p) => (p.kind ? `<span class="badge">${esc(p.kind)}</span>` : "");

const tagClass = (t) => "c" + ([...t].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 6);
const tagHtml = (tags) => tags.map((t) => `<span class="tag ${tagClass(t)}">${esc(t)}</span>`).join("");

// > [!SUMMARY] 제목 형태의 인용문을 색 박스로 바꾼다.
const CALLOUTS = {
  SUMMARY: { icon: "📍", cls: "summary" },
  WARN: { icon: "⚠️", cls: "warn" },
  CHECK: { icon: "✅", cls: "check" },
  TIP: { icon: "💡", cls: "tip" },
};
const slugify = (t) => t.replace(/<[^>]+>/g, "").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
marked.use({
  renderer: {
    blockquote(quote) {
      const m = quote.match(/^\s*<p>\[!(\w+)\]\s*(.*?)<\/p>\s*([\s\S]*)$/);
      const c = m && CALLOUTS[m[1]];
      if (!c) return `<blockquote>${quote}</blockquote>`;
      return `<aside class="callout ${c.cls}"><p class="callout-title"><span aria-hidden="true">${c.icon}</span> ${m[2]}</p>${m[3]}</aside>\n`;
    },
    heading(text, level) {
      return `<h${level} id="${slugify(text)}">${text}</h${level}>\n`;
    },
  },
});

const files = (await fs.readdir(POSTS_DIR)).filter((f) => f.endsWith(".md"));
const posts = [];
for (const file of files) {
  const { meta, body } = parseFrontmatter(await fs.readFile(path.join(POSTS_DIR, file), "utf8"));
  for (const key of ["title", "date", "description"]) {
    if (!meta[key]) throw new Error(`${file}: ${key} 가 없습니다`);
  }
  const text = body.replace(/^\s*# .*\n+/, ""); // 제목은 상단 배너에 따로 표시
  const toc = [...text.matchAll(/^(##|###) (.+)$/gm)].map((x) => ({ id: slugify(x[2]), label: x[2], sub: x[1] === "###" }));
  const minutes = Math.max(1, Math.round(text.replace(/\s/g, "").length / 500));
  posts.push({ ...meta, slug: file.replace(/\.md$/, ""), html: marked.parse(text), toc, minutes });
}
posts.sort((a, b) => b.date.localeCompare(a.date));

await fs.rm(OUT_DIR, { recursive: true, force: true });
await fs.mkdir(OUT_DIR, { recursive: true });
await fs.copyFile("style.css", path.join(OUT_DIR, "style.css"));
await fs.writeFile(path.join(OUT_DIR, ".nojekyll"), "");
// 글에서 쓰는 이미지: blog/images/ -> docs/images/
// (images/og/src 의 원본 사진은 공유 이미지를 만들 때만 쓰므로 배포에서 뺀다)
await fs.cp("images", path.join(OUT_DIR, "images"), { recursive: true, filter: (s) => !s.includes(path.join("og", "src")) }).catch(() => {});

for (const p of posts) {
  const dir = path.join(OUT_DIR, "posts", p.slug);
  await fs.mkdir(dir, { recursive: true });
  const toc = p.toc.map((t) => `<a${t.sub ? ' class="sub"' : ""} href="#${t.id}">${esc(t.label)}</a>`).join("");
  const content = `<header class="post-hero">
<div class="post-hero-inner">
<p class="meta">${badge(p)}<time datetime="${esc(p.date)}">${fmtDate(p.date)}</time><span>읽는 시간 약 ${p.minutes}분</span>${p.checked ? `<span>정보 확인일 ${fmtDate(p.checked)}</span>` : ""}</p>
<h1>${esc(p.title)}</h1>
<p class="lead">${esc(p.description)}</p>
<div class="tags">${tagHtml(p.tags)}</div>
</div>
</header>
<div class="page">
<nav class="toc" aria-label="목차">${toc}</nav>
<article class="post">
${p.html}
<p class="back"><a href="../../">← 글 목록으로</a></p>
</article>
</div>`;
  await fs.writeFile(
    path.join(dir, "index.html"),
    layout({
      title: `${p.title} | ${SITE.title}`,
      description: p.description,
      base: "../../",
      content,
      type: "article",
      image: abs(p.image ?? `images/og/${p.slug}.png`),
      pagePath: `posts/${p.slug}/`,
      published: p.date,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: p.title,
        description: p.description,
        datePublished: p.date,
        dateModified: p.checked ?? p.date,
        inLanguage: "ko-KR",
        image: abs(p.image ?? `images/og/${p.slug}.png`),
        mainEntityOfPage: abs(`posts/${p.slug}/`),
        keywords: p.tags.join(", "),
        publisher: { "@type": "Organization", name: SITE.title },
      },
    }),
  );
}

const list = posts
  .map(
    (p) => `<li class="card"><a href="posts/${p.slug}/">
${thumb(p, "")}
<div class="card-body">
<div class="tags">${badge(p)}${tagHtml(p.tags)}</div>
<h2>${esc(p.title)}</h2>
<p>${esc(p.description)}</p>
<p class="meta"><time datetime="${esc(p.date)}">${fmtDate(p.date)}</time><span>읽는 시간 약 ${p.minutes}분</span></p>
</div>
</a></li>`,
  )
  .join("\n");
await fs.writeFile(
  path.join(OUT_DIR, "index.html"),
  layout({
    title: SITE.title,
    description: SITE.description,
    base: "./",
    image: abs("images/og/default.png"),
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: SITE.title, url: SITE.url, description: SITE.description, inLanguage: "ko-KR" },
    content: `<section class="hero">
<div class="hero-inner">
<p class="eyebrow">TRAVEL NOTES</p>
<h1>${esc(SITE.title)}</h1>
<p class="lead">${esc(SITE.description)}</p>
</div>
</section>
<div class="page">
<h2 class="section-title">최신 글</h2>
<ul class="post-list">
${list}
</ul>
</div>`,
  }),
);

// 소개 페이지: about.md (frontmatter 없이 본문만)
const aboutHtml = marked.parse(await fs.readFile("about.md", "utf8"));
await fs.mkdir(path.join(OUT_DIR, "about"), { recursive: true });
await fs.writeFile(
  path.join(OUT_DIR, "about", "index.html"),
  layout({
    title: `소개 | ${SITE.title}`,
    description: SITE.description,
    base: "../",
    image: abs("images/og/default.png"),
    pagePath: "about/",
    content: `<div class="page"><article class="post about">\n${aboutHtml}<p class="back"><a href="../">← 글 목록으로</a></p></article></div>`,
  }),
);

// 검색엔진용: sitemap.xml, robots.txt
const urls = [
  { loc: abs(), date: posts[0]?.date },
  { loc: abs("about/") },
  ...posts.map((p) => ({ loc: abs(`posts/${p.slug}/`), date: p.checked ?? p.date })),
];
await fs.writeFile(
  path.join(OUT_DIR, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `<url><loc>${u.loc}</loc>${u.date ? `<lastmod>${u.date}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`,
);
await fs.writeFile(path.join(OUT_DIR, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${abs("sitemap.xml")}\n`);

console.log(`${posts.length}개 글을 ${OUT_DIR}/ 에 만들었습니다.`);
