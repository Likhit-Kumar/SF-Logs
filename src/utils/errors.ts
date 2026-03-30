/**
 * Classify Salesforce API errors into actionable messages.
 */
export function classifySfError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Session expired / invalid
  if (lower.includes("session expired") || lower.includes("invalid_session_id") || lower.includes("invalid session")) {
    return `Session expired. Re-authenticate with: sf org login web --alias <your-org>\nOriginal: ${message}`;
  }

  // API request limit
  if (lower.includes("request_limit_exceeded") || lower.includes("api limit")) {
    return `Salesforce API request limit exceeded. Wait and retry, or check API usage in Setup > System Overview.\nOriginal: ${message}`;
  }

  // Insufficient permissions
  if (lower.includes("insufficient_access") || lower.includes("insufficient access") || lower.includes("no access")) {
    return `Insufficient permissions. The connected user needs "View All Data" or "Manage Users" permission for debug log operations.\nOriginal: ${message}`;
  }

  // Entity being traced
  if (lower.includes("entity already being traced") || lower.includes("already being traced")) {
    return `This user already has an active trace flag. Use manage_trace_flags with action=list to find it, then delete or update it.\nOriginal: ${message}`;
  }

  // Trace flag 24-hour rule
  if (lower.includes("24 hour") || lower.includes("24hour")) {
    return `Trace flags cannot span more than 24 hours. The StartDate may be too old — delete and recreate the trace flag.\nOriginal: ${message}`;
  }

  // Invalid ID
  if (lower.includes("malformed id") || lower.includes("malformed_id") || lower.includes("invalid id")) {
    return `Invalid Salesforce ID format. Ensure IDs are 15 or 18 character Salesforce record IDs.\nOriginal: ${message}`;
  }

  // Not found
  if (lower.includes("not_found") || lower.includes("not found") || lower.includes("entity is deleted")) {
    return `Record not found. It may have been deleted or the ID is incorrect.\nOriginal: ${message}`;
  }

  // Network / connection
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("etimedout") || lower.includes("fetch failed")) {
    return `Network error connecting to Salesforce. Check your internet connection and that the org instance URL is accessible.\nOriginal: ${message}`;
  }

  // Auth file missing
  if (lower.includes("no authorization found") || lower.includes("namedorginfonotfound")) {
    return `No SF CLI auth found for this org. Authenticate with: sf org login web --alias <your-org>\nOriginal: ${message}`;
  }

  return message;
}
