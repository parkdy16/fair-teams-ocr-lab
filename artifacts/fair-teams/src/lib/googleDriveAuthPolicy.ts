export function normalizeGoogleDriveLoginHint(value?: string) {
  const hint = String(value || "").trim();
  return hint && hint.length <= 320 && hint.includes("@") ? hint : undefined;
}
