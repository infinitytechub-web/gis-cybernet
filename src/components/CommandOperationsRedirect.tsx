import { Navigate, useLocation } from "react-router-dom";

export function CommandOperationsRedirect({ tab }: { tab: "enforcement" | "operations" | "holding" }) {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", tab);
  return <Navigate replace to={`/command-operations?${params.toString()}${hash}`} />;
}