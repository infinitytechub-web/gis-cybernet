import { useEffect } from "react";

const SITE_URL = "https://admin.infinitytechub.com";

type PageMeta = {
  title: string;
  description: string;
  /** Route path, e.g. "/login". Used for canonical + og:url. */
  path?: string;
};

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Sets a unique document title, description and social preview tags for a
 * public route. Values are restored on unmount so authenticated routes keep
 * the branding-provided title.
 */
export function usePageMeta({ title, description, path }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);

    if (path) {
      const url = `${SITE_URL}${path}`;
      setMeta('meta[property="og:url"]', "property", "og:url", url);
      let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        document.head.appendChild(canonical);
      }
      canonical.setAttribute("href", url);
    }

    return () => {
      document.title = previousTitle;
    };
  }, [title, description, path]);
}
