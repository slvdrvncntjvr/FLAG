import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Request-scoped Worker configuration only. Client input and process.env are
// never fallback authorities, and an unavailable context keeps intake closed.
export async function isPrivateIntakeEnabled(): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.PRIVATE_INTAKE_ENABLED === "true";
  } catch {
    return false;
  }
}
