/** Nhóm đồng ý của Consent API → trạng thái Google Consent Mode v2. */
export function googleConsent(...lists: string[][]) {
  const all = lists.flat();
  const v = (on: boolean) => (on ? "granted" : "denied");
  const ads = v(all.includes("marketing"));
  return { analytics_storage: v(all.includes("statistics")), ad_storage: ads, ad_user_data: ads, ad_personalization: ads };
}
