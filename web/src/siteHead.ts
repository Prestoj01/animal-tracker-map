/**
 * Adds the tags that social apps and search engines read to the head of each
 * page at build time. Values come from web/site.config.json.
 */

export interface SiteConfig {
  /** The site's public address, e.g. "https://animal-tracker-map.example.workers.dev". */
  siteUrl: string;
  /** Cloudflare Web Analytics' site token, or empty for no visitor stats. */
  analyticsToken?: string;
}

export interface PageInfo {
  title: string;
  description: string;
  /** The page's path from the site root, e.g. "/" or "/about.html". */
  path: string;
}

export const SITE_NAME = "Animal Tracker Map";
export const PREVIEW_IMAGE = "social-preview.jpg";
const PREVIEW_ALT = "A dark globe of Africa dotted with lion, elephant, giraffe and rhino sightings";

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Reverses `escape`, for text read back out of a page. */
function unescape(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** An absolute address when the site's address is known, otherwise from the root. */
export function siteAddress(config: SiteConfig, path: string): string {
  const base = config.siteUrl.replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}

/** The link-preview tags for a page. */
export function previewTags(config: SiteConfig, page: PageInfo): string {
  const image = siteAddress(config, PREVIEW_IMAGE);
  const tags: [string, string, string][] = [
    ["property", "og:type", "website"],
    ["property", "og:site_name", SITE_NAME],
    ["property", "og:title", page.title],
    ["property", "og:description", page.description],
    ["property", "og:image", image],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", PREVIEW_ALT],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", page.title],
    ["name", "twitter:description", page.description],
    ["name", "twitter:image", image],
  ];
  if (config.siteUrl) {
    tags.push(["property", "og:url", siteAddress(config, page.path)]);
  }
  const lines = tags.map(
    ([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escape(value)}" />`,
  );
  if (config.siteUrl) {
    lines.push(`<link rel="canonical" href="${escape(siteAddress(config, page.path))}" />`);
  }
  return lines.join("\n    ");
}

/** Validates web/site.config.json, so a typo fails the build rather than the previews. */
export function parseSiteConfig(data: unknown): SiteConfig {
  const config = (data ?? {}) as Partial<SiteConfig>;
  if (typeof config.siteUrl !== "string") {
    throw new Error("site.config.json needs a siteUrl string, which may be empty");
  }
  if (config.siteUrl && !/^https:\/\/[^/]+/.test(config.siteUrl)) {
    throw new Error("siteUrl in site.config.json must start with https://");
  }
  if (
    config.analyticsToken !== undefined &&
    (typeof config.analyticsToken !== "string" ||
      (config.analyticsToken !== "" && !/^[0-9a-f]{32}$/.test(config.analyticsToken)))
  ) {
    throw new Error("analyticsToken in site.config.json must be empty or a 32-character token");
  }
  return config as SiteConfig;
}

/**
 * Adds preview tags to a page, using its own title and description. Pages mark
 * where they go with a <!-- link-preview --> comment.
 */
export function addPreviewTags(html: string, config: SiteConfig, path: string): string {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1];
  if (!html.includes("<!-- link-preview -->")) {
    return html;
  }
  if (!title || !description) {
    throw new Error(`${path} needs a <title> and a description to make link previews`);
  }
  return html.replace(
    "<!-- link-preview -->",
    previewTags(config, { title: unescape(title), description: unescape(description), path }),
  );
}

/**
 * Adds Cloudflare Web Analytics, which counts visits without cookies or
 * tracking people across sites, and is free. Its token is public by design: it
 * appears in every page. Without a token, pages are left as they are.
 */
export function addAnalytics(html: string, config: SiteConfig): string {
  if (!config.analyticsToken) {
    return html;
  }
  const beacon = JSON.stringify({ token: config.analyticsToken });
  const tag = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${beacon}'></script>`;
  return html.replace("</body>", `  ${tag}\n  </body>`);
}
