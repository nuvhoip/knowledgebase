import Link from 'next/link'
import { Article } from '@/lib/types'

interface Props {
  article: Article
  showCategory?: boolean
}

export default function ArticleCard({ article, showCategory = false }: Props) {
  return (
    <Link
      href={`/articles/${article.categorySlug}/${article.slug}`}
      className="nuvho-card p-5 flex items-start gap-4 group"
    >
      {/* Document icon */}
      <div className="flex-shrink-0 mt-0.5">
        <svg className="w-5 h-5 text-steel-blue group-hover:text-blue-slate transition-colors"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414A1 1 0 0 1 19 9.414V19a2 2 0 0 1-2 2z" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-heading font-semibold text-iron-grey text-sm group-hover:text-blue-slate
                       transition-colors leading-snug mb-1">
          {article.title}
        </h3>
        <p className="font-body text-xs text-gray-500 leading-relaxed line-clamp-2">
          {article.description}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-400">{article.readTime} min read</span>
          {showCategory && (
            <span className="text-xs text-tropical-teal capitalize">
              {article.categorySlug.replace(/-/g, ' ')}
            </span>
          )}
        </div>
      </div>

      <svg className="flex-shrink-0 w-4 h-4 text-tropical-teal opacity-0 group-hover:opacity-100
                     group-hover:translate-x-0.5 transition-all mt-1"
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  )
}
