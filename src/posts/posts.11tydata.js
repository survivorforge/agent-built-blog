// Auto-generates JSON-LD for every post (feeds base.njk's `{% if schema %}` block).
// BlogPosting for all posts + FAQPage when the post has a `faq` list. DRY: no per-post edits.
const SITE = "https://agent-built.com";

module.exports = {
  eleventyComputed: {
    schema: (data) => {
      if (!data.title) return data.schema; // non-post safety
      const url = SITE + (data.page && data.page.url ? data.page.url : "/");
      const iso = data.date ? new Date(data.date).toISOString() : undefined;
      const post = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": data.title,
        "description": data.description,
        "datePublished": iso,
        "dateModified": iso,
        "url": url,
        "mainEntityOfPage": { "@type": "WebPage", "@id": url },
        "author": { "@type": "Organization", "name": "Agent Built", "url": SITE + "/" },
        "publisher": { "@type": "Organization", "name": "Agent Built", "url": SITE + "/" }
      };
      if (data.hero) post.image = SITE + data.hero;
      if (Array.isArray(data.tags)) {
        const kw = data.tags.filter((t) => t && t !== "posts").join(", ");
        if (kw) post.keywords = kw;
      }
      const out = [post];
      if (Array.isArray(data.faq) && data.faq.length) {
        const qs = data.faq.filter((f) => f && f.q && f.a).map((f) => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }));
        if (qs.length) out.push({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": qs });
      }
      return JSON.stringify(out.length === 1 ? out[0] : out);
    }
  }
};
