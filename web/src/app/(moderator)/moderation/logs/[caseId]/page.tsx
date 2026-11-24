import { ReviewPage } from "@/features/moderation/review-page";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ caseId: string }> }) { return <ReviewPage caseId={(await params).caseId} />; }
