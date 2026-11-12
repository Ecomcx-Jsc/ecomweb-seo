import { useState } from "react";
import { AiIcon, Button, Card, Checkbox, EmptyState, Input, PageHeader, Select, Textarea, api, notify, useAi, useApi } from "@ecomcx/ecomweb-admin-sdk";
import { META_KEY, type PostSeo } from "../../../frontend/lib/settings";
import { extract } from "../../../frontend/lib/text";
import { Counter, Loading, SEO_AI, ScoreBadge, useContentTypes } from "../ui";
import { t } from "../i18n";

interface Row { id: number; type: string; title: string; slug: string; status: string; link: string; meta?: Record<string, any> | null }
interface ListResponse { result: { items: Row[]; total: number; page: number; totalPages: number } }
type Edit = Pick<PostSeo, "title" | "description"> & { keywords?: string; noindex?: boolean };

const STATUS: Record<string, string> = { publish: t("bulk.published"), draft: t("bulk.draft"), pending: t("bulk.pending"), scheduled: t("bulk.scheduled"), private: t("bulk.private") };

export function BulkPage() {
  const { postTypes } = useContentTypes();
  const [type, setType] = useState("post");
  const [status, setStatus] = useState("publish");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [saving, setSaving] = useState(false);
  const { data, reload } = useApi<ListResponse>(`/admin/posts?type=${type}&status=${status}&search=${encodeURIComponent(q)}&page=${page}&pageSize=25&meta=${META_KEY}&orderBy=date&order=desc`);
  const dirty = Object.keys(edits).length;

  const seoOf = (r: Row): PostSeo => (r.meta?.[META_KEY] ?? {}) as PostSeo;
  const value = (r: Row): Edit => {
    const s = seoOf(r);
    return { title: s.title ?? "", description: s.description ?? "", keywords: (s.focusKeywords ?? []).join(", "), noindex: !!s.robots?.noindex, ...edits[r.id] };
  };
  const edit = (id: number, patch: Partial<Edit>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const rows = (data?.result.items ?? []).filter((r) => {
    const s = seoOf(r);
    if (filter === "noDescription") return !s.description;
    if (filter === "noKeyword") return !s.focusKeywords?.length;
    if (filter === "low") return s.score != null && s.score < 50;
    return true;
  });

  // AI của core (cần quyền "ai", bật ở Cài đặt › AI): điền mô tả SEO từ nội dung bài; kết quả vào ô sửa, chỉ lưu khi bấm Lưu
  const ai = useAi();
  const [aiRow, setAiRow] = useState<number | "all" | null>(null);
  async function aiField(r: Row, field: "title" | "description" | "keywords") {
    const post = await api.get<{ content?: unknown }>(`/admin/posts/${r.id}`);
    const text = `${r.title}\n\n${extract(post.content as any).text}`.slice(0, 6000);
    if (field === "keywords") edit(r.id, { keywords: (await ai.ask("Suggest 3 to 5 SEO focus keywords for this page, in the page language. One line, comma separated, no numbering, no quotes. Most important first.", text)).trim().replace(/\n/g, ", ") });
    else edit(r.id, { [field]: (await ai.run(field === "title" ? "title" : "seo_description", text, SEO_AI)).trim().replace(/^["“]|["”]$/g, "") });
  }
  async function aiOne(r: Row, field: "title" | "description" | "keywords" = "description") {
    setAiRow(r.id);
    try { await aiField(r, field); } catch (e) { notify.error((e as Error).message); } finally { setAiRow(null); }
  }
  // Điền hàng loạt: gom thành MỘT changeset (core xem / áp dụng / hoàn tác được), không lưu từng dòng
  const [review, setReview] = useState<{ id: number; items: Array<{ title: string; description: string }> } | null>(null);
  const [applying, setApplying] = useState(false);
  async function aiMissing() {
    setAiRow("all");
    const items: Array<{ kind: string; target: string; label: string; after: unknown }> = [];
    const shown: Array<{ title: string; description: string }> = [];
    try {
      for (const r of rows.filter((x) => !value(x).description).slice(0, 10)) {
        const post = await api.get<{ content?: unknown }>(`/admin/posts/${r.id}`);
        const description = (await ai.run("seo_description", `${r.title}\n\n${extract(post.content as any).text}`.slice(0, 6000), SEO_AI)).trim().replace(/^["“]|["”]$/g, "");
        if (!description) continue;
        items.push({ kind: "post.update", target: String(r.id), label: r.title || `#${r.id}`, after: { meta: { [META_KEY]: { ...seoOf(r), description } } } });
        shown.push({ title: r.title || `#${r.id}`, description });
      }
      if (items.length) {
        const cs = await api.post<{ id: number }>("/admin/changesets", { title: t("bulk.ai_changeset_title"), source: "plugin:ecomcx-seo", items });
        setReview({ id: cs.id, items: shown });
      }
    }
    catch (e) { notify.error((e as Error).message); } finally { setAiRow(null); if (items.length) notify.success(t("bulk.ai_done", { count: items.length })); }
  }
  async function decide(apply: boolean) {
    if (!review) return;
    setApplying(true);
    try {
      await api.post(`/admin/changesets/${review.id}/${apply ? "apply" : "reject"}`, {});
      notify.success(apply ? t("bulk.ai_applied") : t("bulk.ai_rejected"));
      setReview(null); reload();
    } catch (e) { notify.error((e as Error).message); } finally { setApplying(false); }
  }

  function guard(fn: () => void) {
    if (dirty && !confirm(t("bulk.discard_unsaved_changes"))) return;
    setEdits({}); fn();
  }
  async function saveAll() {
    setSaving(true);
    let ok = 0;
    const failed: number[] = [];
    for (const [id, e] of Object.entries(edits)) {
      const row = data?.result.items.find((r) => r.id === Number(id));
      if (!row) continue;
      const cur = seoOf(row);
      const next: PostSeo = { ...cur };
      if (e.title !== undefined) next.title = e.title.trim() || undefined;
      if (e.description !== undefined) next.description = e.description.trim() || undefined;
      if (e.keywords !== undefined) next.focusKeywords = [...new Set(e.keywords.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 5);
      if (e.noindex !== undefined) next.robots = { ...(cur.robots ?? {}), noindex: e.noindex };
      try { await api.put(`/admin/posts/${id}`, { meta: { [META_KEY]: next } }); ok++; }
      catch { failed.push(Number(id)); }
    }
    setSaving(false);
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([id]) => failed.includes(Number(id)))));
    if (failed.length) notify.error(t("bulk.couldn_t_save_posts", { count: failed.length, failed: failed.map((x) => `#${x}`).join(", ") }));
    if (ok) notify.success(t("bulk.saved_posts", { ok }));
    reload();
  }

  return (
    <>
      <PageHeader title={t("bulk.bulk_seo_editor")} description={t("bulk.quickly_edit_seo_titles_descriptions")}
        actions={<Button variant="primary" loading={saving} disabled={!dirty} onClick={saveAll}>{dirty ? t("bulk.save_posts", { dirty }) : t("common.save_changes")}</Button>} />
      {review && (
        <Card title={t("bulk.ai_review_title", { count: review.items.length })}>
          <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            {review.items.map((x, i) => <li key={i}><strong>{x.title}</strong>: {x.description}</li>)}
          </ul>
          <div className="ecx-flex">
            <Button variant="primary" loading={applying} onClick={() => void decide(true)}>{t("bulk.ai_apply")}</Button>
            <Button variant="secondary" disabled={applying} onClick={() => void decide(false)}>{t("bulk.ai_reject")}</Button>
          </div>
        </Card>
      )}
      <Card>
        <div className="ecx-flex" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <Select style={{ width: 160 }} value={type} onChange={(e) => { const v = e.target.value; guard(() => { setType(v); setPage(1); }); }}
            options={postTypes.map((p) => ({ value: p.name, label: p.label }))} />
          <Select style={{ width: 150 }} value={status} onChange={(e) => { const v = e.target.value; guard(() => { setStatus(v); setPage(1); }); }}
            options={[{ value: "all", label: t("bulk.all_statuses") }, ...Object.entries(STATUS).map(([value, label]) => ({ value, label }))]} />
          <Select style={{ width: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}
            options={[{ value: "", label: t("bulk.all_posts") }, { value: "noDescription", label: t("bulk.no_seo_description") }, { value: "noKeyword", label: t("bulk.no_keyword_yet") }, { value: "low", label: t("bulk.score_below_50") }]} />
          <span className="ecx-spacer" />
          {ai.enabled && <Button icon={<AiIcon />} variant="secondary" loading={aiRow === "all"} onClick={() => void aiMissing()}>{t("bulk.ai_fill_missing")}</Button>}
          <Input style={{ width: 220 }} value={search} placeholder={t("bulk.search_posts")} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") guard(() => { setQ(search); setPage(1); }); }} />
        </div>
        {!data ? <Loading /> : rows.length === 0 ? <EmptyState title={t("bulk.no_matching_posts")} /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="ecx-table">
              <thead><tr>
                <th style={{ width: 56 }}>{t("bulk.score")}</th><th style={{ minWidth: 200 }}>{t("bulk.posts")}</th>
                <th style={{ minWidth: 260 }}>{t("common.seo_title")}</th><th style={{ minWidth: 300 }}>{t("common.seo_description")}</th>
                <th style={{ minWidth: 180 }}>{t("bulk.focus_keyword")}</th><th style={{ width: 80 }}>noindex</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const v = value(r);
                  const changed = !!edits[r.id];
                  return (
                    <tr key={r.id} style={changed ? { background: "var(--app-accent-soft)" } : undefined}>
                      <td><ScoreBadge score={seoOf(r).score} size="sm" /></td>
                      <td>
                        <a className="ecx-link" href={`#/content/${r.type}/${r.id}`}><strong>{r.title || t("bulk.no_title")}</strong></a>
                        <div className="ecx-muted ecx-trunc" style={{ maxWidth: 240 }}>{r.link}</div>
                        {r.status !== "publish" && <div className="ecx-muted">{STATUS[r.status] ?? r.status}</div>}
                      </td>
                      <td>
                        <Input value={v.title} placeholder={r.title} onChange={(e) => edit(r.id, { title: e.target.value })} />
                        <Counter value={v.title || r.title} min={30} max={60} />
                        {ai.enabled && <Button icon={<AiIcon />} size="sm" variant="ghost" loading={aiRow === r.id} onClick={() => void aiOne(r, "title")}>{t("bulk.ai_fill")}</Button>}
                      </td>
                      <td>
                        <Textarea rows={2} value={v.description} onChange={(e) => edit(r.id, { description: e.target.value })} />
                        <Counter value={v.description ?? ""} min={120} max={160} />
                        {ai.enabled && <Button icon={<AiIcon />} size="sm" variant="ghost" loading={aiRow === r.id} onClick={() => void aiOne(r)}>{t("bulk.ai_fill")}</Button>}
                      </td>
                      <td>
                        <Input value={v.keywords} placeholder={t("bulk.comma_separated")} onChange={(e) => edit(r.id, { keywords: e.target.value })} />
                        {ai.enabled && <Button icon={<AiIcon />} size="sm" variant="ghost" loading={aiRow === r.id} onClick={() => void aiOne(r, "keywords")}>{t("bulk.ai_fill")}</Button>}
                      </td>
                      <td><Checkbox checked={!!v.noindex} onChange={(c) => edit(r.id, { noindex: c })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.result.totalPages > 1 && (
          <div className="ecx-flex" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => guard(() => setPage(page - 1))}>‹</Button>
            <span className="ecx-muted">{t("common.page", { page, totalPages: data.result.totalPages })}</span>
            <Button size="sm" variant="secondary" disabled={page >= data.result.totalPages} onClick={() => guard(() => setPage(page + 1))}>›</Button>
          </div>
        )}
      </Card>
    </>
  );
}
