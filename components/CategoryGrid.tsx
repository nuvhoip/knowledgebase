import { categories } from '@/lib/data'
import CategoryCard from './CategoryCard'

export default function CategoryGrid() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <h2 className="font-heading text-xl font-semibold text-iron-grey mb-8 text-center sm:text-left">
        Browse by topic
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-4">
        {categories.map(category => (
          <CategoryCard key={category.slug} category={category} />
        ))}
      </div>
    </section>
  )
}
