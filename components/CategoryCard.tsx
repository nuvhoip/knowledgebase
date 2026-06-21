import Image from 'next/image'
import Link from 'next/link'
import { Category } from '@/lib/types'

interface Props {
  category: Category
}

export default function CategoryCard({ category }: Props) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="nuvho-card p-6 flex gap-4 items-start group cursor-pointer"
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-12 h-12 bg-tropical-teal/10 rounded-xl flex items-center justify-center
                      group-hover:bg-tropical-teal/20 transition-colors">
        <Image
          src={`/icons/${category.icon}`}
          alt={category.title}
          width={28}
          height={28}
          className="icon-primary"
        />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <h3 className="font-heading font-semibold text-iron-grey text-base mb-1
                       group-hover:text-blue-slate transition-colors leading-tight">
          {category.title}
        </h3>
        <p className="font-body text-sm text-gray-500 leading-snug line-clamp-2">
          {category.description}
        </p>
        <span className="inline-block mt-2 text-xs text-steel-blue font-body">
          {category.articleCount} articles
        </span>
      </div>

      {/* Arrow */}
      <svg
        className="flex-shrink-0 w-4 h-4 text-tropical-teal opacity-0 group-hover:opacity-100
                   group-hover:translate-x-0.5 transition-all mt-1"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  )
}
