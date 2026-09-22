import Header from './Header'
import { getCategories, canView } from '@/lib/data'
import { getSession } from '@/lib/auth'

// Server wrapper: resolves the session and the visible topics once per request and
// hands plain props to the client Header, so the header renders with no auth flicker
// and the Topics mega-menu is populated without a client-side fetch.
export default async function SiteHeader() {
  const [categories, session] = await Promise.all([getCategories(), getSession()])
  const hasSession = !!session

  const topics = categories
    .filter(c => canView(c.visibility, hasSession))
    .map(c => ({
      slug: c.slug,
      title: c.title,
      description: c.description,
      icon: c.icon,
      isPrivate: c.visibility === 'private',
    }))

  const user = session ? { email: session.email, name: session.name } : null

  return <Header user={user} topics={topics} />
}
