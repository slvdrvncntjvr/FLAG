import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function isPrivateIntakeEnabled(): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.PRIVATE_INTAKE_ENABLED === "true";
  } catch {
    return false;
  }
}
