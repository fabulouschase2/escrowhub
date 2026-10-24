// Centralized per-page SEO: title, meta description, canonical URL, Open Graph
// tags and BreadcrumbList JSON-LD. Called from each page's useEffect so every
// route presents unique, crawler-friendly head data.

interface PageMeta {
  title: string;
  description: string;
  /** Path for the canonical URL, e.g. "/dashboard" */
  path: string;
  /** Breadcrumb trail: [{ name, path }] from Home to this page */
  breadcrumbs?: { name: string; path: string }[];
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function setPageMeta({ title, description, path, breadcrumbs }: PageMeta) {
  const origin = window.location.origin;
  const url = `${origin}${path}`;

  document.title = title;
  upsertMeta('name', 'description', description);
  upsertCanonical(url);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:image', `${origin}/og-image.png`);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', `${origin}/og-image.png`);

  // Replace any previous breadcrumb JSON-LD
  const scriptId = 'ld-breadcrumbs';
  document.getElementById(scriptId)?.remove();
  if (breadcrumbs && breadcrumbs.length > 1) {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.name,
        item: `${origin}${crumb.path}`,
      })),
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = scriptId;
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }
}
