import { debugLog } from "./debug";

// DEBUG-gated (like debugLog) trace of every server call to a remote
// service -- Google Vision, R2, ArcGIS, Resend, Firebase Admin link
// generation, etc. Logs both the outgoing call and its outcome (with
// duration), so a hung call is visible as a dangling "->" line rather than
// just going quiet. Actual error handling/reporting stays with each call
// site's own catch block; this only adds trace lines.
export async function logRemoteCall<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  debugLog(`[remote] ${service} ${operation} ->`);
  const start = Date.now();
  try {
    const result = await fn();
    debugLog(`[remote] ${service} ${operation} ok ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    debugLog(`[remote] ${service} ${operation} failed ${Date.now() - start}ms:`, error);
    throw error;
  }
}
