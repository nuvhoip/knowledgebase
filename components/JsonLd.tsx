import { jsonLdString } from '@/lib/seo'

/** Inline schema.org JSON-LD. The string is escaped so it can't close its own <script>. */
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />
}
