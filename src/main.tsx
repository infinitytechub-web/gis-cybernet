import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installCsrfHeader } from "./lib/csrf-fetch";

// Stamp every state-changing request with the X-Cybernet-App header so
// edge functions can reject calls forged from third-party origins.
installCsrfHeader();

createRoot(document.getElementById("root")!).render(<App />);
