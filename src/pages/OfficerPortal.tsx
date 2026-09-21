/**
 * Officer Portal — now folded into My Dashboard.
 *
 * The officer's own sign-off steps, leave standing and posting history all live
 * on `/portal`, so this route simply opens the matching tab. Old links and
 * bookmarks keep working.
 */
import { Navigate } from "react-router-dom";

export default function OfficerPortal() {
  return <Navigate to="/portal?tab=record" replace />;
}
