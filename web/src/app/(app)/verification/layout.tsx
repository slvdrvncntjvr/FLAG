import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";

export default async function VerificationLayout({ children }: { children: React.ReactNode }) {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "freelancer") notFound();
  return children;
}
