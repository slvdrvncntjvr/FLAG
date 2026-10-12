import type { MetadataRoute } from "next";

// INV-7: only the landing page may be crawled.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/$", disallow: "/" } };
}
