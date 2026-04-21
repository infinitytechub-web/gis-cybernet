import { useAuth } from "@/hooks/useAuth";
import { PostingRequestForm } from "@/components/postings/PostingRequestForm";
import { MyPostingHistory } from "@/components/postings/MyPostingHistory";
import { PostingTimeline } from "@/components/postings/PostingTimeline";
import { PostingApprovalQueue } from "@/components/postings/PostingApprovalQueue";

export default function PostingsTransfers() {
  const { isAdmin, isSupervisor, isAdminOrSupervisor } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Postings, Transfers & Reassignment</h1>

      <PostingRequestForm />
      <PostingTimeline />
      <MyPostingHistory />

      {isAdminOrSupervisor && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-secondary">
            Approval Queue {isSupervisor && !isAdmin && <span className="text-sm font-normal text-muted-foreground">(Your Department)</span>}
          </h2>
          <PostingApprovalQueue />
        </div>
      )}
    </div>
  );
}
