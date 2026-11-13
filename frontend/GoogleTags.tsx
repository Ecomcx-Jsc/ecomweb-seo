"use client";

import { useEffect } from "react";
import * as client from "@ecomcx/ecomweb-theme-sdk/client";
import { googleConsent } from "./lib/consent";

// Consent API (theme-sdk ≥ 1.40). Core cũ chưa có → coi như được phép (như trước khi có banner).
const has = (client as { hasConsent?: (category: string) => boolean }).hasConsent ?? (() => true);
type Gtag = (...args: unknown[]) => void;
type GoogleWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag; __ecxSeoTags?: boolean };

function addScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/**
 * GA4 / GTM theo Google Consent Mode v2 (chế độ cơ bản): chưa có nhóm "statistics" hay "marketing" nào được phép thì không tải
 * script Google; khách cho phép sau (sự kiện "consent.changed") thì tải ngay; khách đổi ý → gtag("consent", "update").
 * Chạy hoàn toàn ở trình duyệt nên HTML của trang không phụ thuộc cookie của khách (cache trang được).
 */
export function GoogleTags({ ga, gtm }: { ga: string | null; gtm: string | null }) {
  useEffect(() => {
    const w = window as GoogleWindow;
    const state = () => googleConsent(["statistics", "marketing"].filter((c) => has(c)));
    const load = () => {
      if (w.__ecxSeoTags || (!has("statistics") && !has("marketing"))) return;
      w.__ecxSeoTags = true; // một lần cho cả trang (StrictMode chạy effect 2 lần, chuyển trang phía client)
      w.dataLayer = w.dataLayer || [];
      // gtag phải đẩy đúng đối tượng arguments (yêu cầu của Google), không phải mảng
      // eslint-disable-next-line prefer-rest-params
      w.gtag = w.gtag || function gtag() { w.dataLayer!.push(arguments); };
      w.gtag("consent", "default", state());
      if (ga) { addScript(`https://www.googletagmanager.com/gtag/js?id=${ga}`); w.gtag("js", new Date()); w.gtag("config", ga); }
      if (gtm) { w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" }); addScript(`https://www.googletagmanager.com/gtm.js?id=${gtm}`); }
    };
    load();
    return client.on("consent.changed" as never, () => (w.__ecxSeoTags ? w.gtag?.("consent", "update", state()) : load()));
  }, [ga, gtm]);
  return null;
}
