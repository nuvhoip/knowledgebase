export interface Article {
  slug: string
  title: string
  description: string
  content?: string
  categorySlug: string
  updatedAt: string
  readTime: number // minutes
  featured?: boolean
}

export interface Category {
  slug: string
  title: string
  description: string
  icon: string // icon filename without path, e.g. "rocket.svg"
  articleCount: number
  articles: Article[]
}
