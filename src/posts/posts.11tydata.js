// Auto-generates JSON-LD for every post (feeds base.njk's `{% if schema %}` block).
// One @graph per post: BlogPosting + FAQPage (when the post has a `faq` list).
// author/publisher/isPartOf reference the sitewide Organization/WebSite entities
// (@id #org / #site) emitted in base.njk. DRY: no per-post edits.
const SITE = "https://agent-built.com";
const ORG = SITE + "/#org";
const WEBSITE = SITE + "/#site";

module.exports = {
  eleventyComputed: {
    schema: (data) => {
      if (!data.title) return data.schema; // non-post safety
      const url = SITE + (data.page && data.page.url ? data.page.url : "/");
      const iso = data.date ? new Date(data.date).toISOString() : undefined;
      const post = {
        "@type": "BlogPosting",
        "@id": url + "#article",
        "headline": data.title,
        "description": data.description,
        "datePublished": iso,
        "dateModified": iso,
        "url": url,
        "mainEntityOfPage": { "@type": "WebPage", "@id": url },
        "author": { "@id": ORG },
        "publisher": { "@id": ORG },
        "isPartOf": { "@id": WEBSITE }
      };
      if (data.hero) post.image = SITE + data.hero;
      if (Array.isArray(data.tags)) {
        const kw = data.tags.filter((t) => t && t !== "posts").join(", ");
        if (kw) post.keywords = kw;
      }
      const graph = [post];
      if (Array.isArray(data.faq) && data.faq.length) {
        const qs = data.faq.filter((f) => f && f.q && f.a).map((f) => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }));
        if (qs.length) {
          graph.push({ "@type": "FAQPage", "@id": url + "#faq", "mainEntity": qs });
        }
      }
      return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
    }
  }
};
