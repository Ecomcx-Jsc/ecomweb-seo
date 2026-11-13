# Ecomcx SEO — guide for AI

All-in-one SEO for Ecomweb. Each feature group is a module switched on/off in **SEO › Dashboard**.

## What it outputs on the website
- `<title>`, meta description, canonical, robots, Open Graph and X/Twitter tags (filter `document.metadata`), from per-type templates (`%title%`, `%sep%`, `%sitename%`, `%excerpt%`, `%category%`, `%currentyear%`…) or the post's own SEO box.
- One JSON-LD `@graph` (Organization/Person, WebSite, WebPage, Article, BreadcrumbList + per-post schema such as FAQ, HowTo, Product, Event, LocalBusiness) at `body.end`.
- GA4 / Tag Manager in `head`, `robots.txt`, `/llms.txt`, `/news-sitemap.xml`, `/video-sitemap.xml`, `/indexnow-key.txt`.
- Per-post SEO data for the website: `post.extra.ecxSeo`.

## Shortcodes (for pages)
| Shortcode | Shows |
|---|---|
| `[ecx_breadcrumbs]` | Breadcrumbs (matches the BreadcrumbList schema) |
| `[ecx_toc levels="2,3" title="Contents"]` | Table of contents from headings |
| `[ecx_faq]` | Questions of the post's FAQ schema |
| `[ecx_contact_info show="name,address,phone,email,hours,map"]` | Contact info from Local SEO settings |
| `[ecx_html_sitemap types="page,post" limit="200"]` | Human-readable sitemap page |

## Writing content
Use the bundled skill `seo-writing` (focus keyword in title first half, title 30–60 chars, description 120–160 chars, etc.). The editor scores posts 0–100.

## Do / don't
- Do let the plugin own meta tags and JSON-LD; code themes should not print their own `<title>`/description/JSON-LD or BreadcrumbList when it is active.
- Do use `[ecx_contact_info]` instead of retyping address/phone when Local SEO is filled.
- Don't create redirects or sitemaps by hand; use SEO › Redirects and the sitemap settings.
