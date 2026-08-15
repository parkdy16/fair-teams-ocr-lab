export function workspaceClosureConfirmationMatches(workspaceName: string, confirmationName: string) {
  const normalize = (value: string) => String(value || "").trim();
  return Boolean(normalize(confirmationName)) && normalize(workspaceName) === normalize(confirmationName);
}
