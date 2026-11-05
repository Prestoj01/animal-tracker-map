import { describe, expect, it } from "vitest";
import siteConfig from "../site.config.json";
import {
  addAnalytics,
  addPreviewTags,
  parseSiteConfig,
  previewTags,
  siteAddress,
} from "./siteHead";

const page = `<head>
    <meta
      name="description"
      content="Where animals live &amp; roam"
    />
    <title>Animal Tracker Map</title>
    <!-- link-preview -->
  </head>`;

describe("siteAddress", () => {
  it("joins the site's address and a path", () => {
    expect(siteAddress({ siteUrl: "https://example.dev/" }, "/about.html")).toBe(
      "https://example.dev/about.html",
    );
    expect(siteAddress({ siteUrl: "" }, "social-preview.jpg")).toBe("/social-preview.jpg");
  });
});

describe("previewTags", () => {
  it("describes the page for social apps, with absolute addresses", () => {
    const tags = previewTags(
      { siteUrl: "https://example.dev" },
      { title: 'A "quoted" title', description: "Lions & tigers", path: "/" },
    );
    expect(tags).toContain('<meta property="og:title" content="A &quot;quoted&quot; title" />');
    expect(tags).toContain('<meta property="og:description" content="Lions &amp; tigers" />');
    expect(tags).toContain(
      '<meta property="og:image" content="https://example.dev/social-preview.jpg" />',
    );
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(tags).toContain('<meta property="og:url" content="https://example.dev/" />');
    expect(tags).toContain('<link rel="canonical" href="https://example.dev/" />');
  });

  it("leaves out page addresses until the site's address is set", () => {
    const tags = previewTags({ siteUrl: "" }, { title: "T", description: "D", path: "/" });
    expect(tags).toContain('<meta property="og:image" content="/social-preview.jpg" />');
    expect(tags).not.toContain("og:url");
    expect(tags).not.toContain("canonical");
  });
});

describe("addPreviewTags", () => {
  it("fills the marker from the page's own title and description", () => {
    const html = addPreviewTags(page, { siteUrl: "https://example.dev" }, "/");
    expect(html).not.toContain("<!-- link-preview -->");
    expect(html).toContain('<meta property="og:title" content="Animal Tracker Map" />');
    // Already escaped in the page, so not escaped twice.
    expect(html).toContain('og:description" content="Where animals live &amp; roam"');
  });

  it("leaves pages without the marker alone, and needs a description", () => {
    expect(addPreviewTags("<title>T</title>", { siteUrl: "" }, "/")).toBe("<title>T</title>");
    expect(() =>
      addPreviewTags("<title>T</title><!-- link-preview -->", { siteUrl: "" }, "/x.html"),
    ).toThrow("/x.html needs a <title> and a description");
  });
});

describe("parseSiteConfig", () => {
  it("accepts an empty or https address", () => {
    expect(parseSiteConfig({ siteUrl: "" })).toEqual({ siteUrl: "" });
    expect(parseSiteConfig({ siteUrl: "https://example.dev" }).siteUrl).toBe(
      "https://example.dev",
    );
  });

  it.each([[null], [{}], [{ siteUrl: "example.dev" }], [{ siteUrl: "http://example.dev" }]])(
    "rejects %j",
    (data) => {
      expect(() => parseSiteConfig(data)).toThrow();
    },
  );
});

describe("addAnalytics", () => {
  const token = "0123456789abcdef0123456789abcdef";

  it("adds Cloudflare's beacon before the end of the body", () => {
    const html = addAnalytics("<body><p>Hi</p></body>", { siteUrl: "", analyticsToken: token });
    expect(html).toContain(
      `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${token}"}'></script>`,
    );
    expect(html.indexOf("beacon")).toBeLessThan(html.indexOf("</body>"));
  });

  it("leaves pages alone without a token", () => {
    expect(addAnalytics("<body></body>", { siteUrl: "" })).toBe("<body></body>");
    expect(addAnalytics("<body></body>", { siteUrl: "", analyticsToken: "" })).toBe(
      "<body></body>",
    );
  });

  it("rejects a token that isn't one", () => {
    expect(() => parseSiteConfig({ siteUrl: "", analyticsToken: "x' onload='alert(1)" })).toThrow(
      "analyticsToken",
    );
    expect(parseSiteConfig({ siteUrl: "", analyticsToken: token }).analyticsToken).toBe(token);
  });
});

describe("site.config.json", () => {
  it("is valid", () => {
    expect(() => parseSiteConfig(siteConfig)).not.toThrow();
  });
});
