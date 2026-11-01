import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze } from "../frontend/lib/analysis";
import { extract } from "../frontend/lib/text";
import trangMau from "./fixtures/trang-mau.json";

const doc = (...content: unknown[]) => ({ version: 1, blocks: [{ type: "richtext", data: { type: "doc", content } }] }) as never;
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const h = (level: number, text: string) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const run = (content: never, keyword = "") => analyze({ keyword, title: "Tiêu đề bài", description: "", slug: "tieu-de", content, siteUrl: "https://shop.vn" });
const check = (r: ReturnType<typeof analyze>, id: string) => r.checks.find((c) => c.id === id);

test("nội dung có H1 → lỗi (trang sẽ có nhiều H1 vì tiêu đề bài đã là H1); không có → đạt", () => {
  assert.equal(check(run(doc(h(1, "Giới thiệu"), p("abc"), h(1, "Kết"))), "content-h1")?.status, "fail");
  assert.deepEqual(check(run(doc(h(1, "Giới thiệu"), p("abc"), h(1, "Kết"))), "content-h1")?.args, [2]);
  assert.equal(check(run(doc(h(2, "Giới thiệu"), p("abc"))), "content-h1")?.status, "pass");
});

test("nội dung thật của /trang-mau (slot 7) có H1 trong bài → hộp SEO báo lỗi", () => {
  const r = run(trangMau as never);
  assert.equal(check(r, "content-h1")?.status, "fail");
});

test("tiêu đề nhảy cấp (H2 → H4) → cảnh báo; theo thứ bậc → đạt", () => {
  assert.equal(check(run(doc(h(2, "A"), h(4, "B"), h(3, "C"))), "heading-order")?.status, "warning");
  assert.equal(check(run(doc(h(2, "A"), h(3, "B"), h(2, "C"), h(3, "D"))), "heading-order")?.status, "pass");
});

test("ảnh thiếu alt được đếm, kể cả ảnh của Ảnh bìa và Ảnh + chữ", () => {
  const r = run(doc({ type: "image", attrs: { src: "/a.jpg", alt: "" } }, { type: "cover", attrs: { src: "/b.jpg" }, content: [p("Chào")] }, { type: "mediaText", attrs: { src: "/c.jpg", alt: "Sản phẩm" }, content: [p("x")] }));
  assert.equal(check(r, "img-alt")?.status, "warning");
  assert.deepEqual(check(r, "img-alt")?.args, [2, 3]);
});

test("trình soạn v2: khối Mục lục được nhận là có mục lục; liên kết của Nút được đếm", () => {
  const ex = extract(doc({ type: "tableOfContents", attrs: {} }, { type: "buttons", content: [{ type: "button", attrs: { text: "Mua ngay", href: "/san-pham/ao" } }] }));
  assert.equal(ex.hasToc, true);
  assert.deepEqual(ex.links.map((l) => l.href), ["/san-pham/ao"]);
  const r = run(doc(p("x"), { type: "buttons", content: [{ type: "button", attrs: { text: "Liên hệ", href: "/lien-he" } }] }));
  assert.equal(r.links.internal, 1);
});

test("điểm 0–100 và mọi mục có trọng số", () => {
  const r = run(doc(h(2, "Áo thun"), p("Áo thun cotton mềm mát. ".repeat(80))), "áo thun");
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(r.checks.every((c) => c.weight > 0));
});
