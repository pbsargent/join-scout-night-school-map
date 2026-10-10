export function formatRecruitmentDate(value: unknown, includeTime = true) {
  const text = String(value ?? "");
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(date);
}

export function normalizeWebsite(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}
