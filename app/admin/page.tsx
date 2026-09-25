import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import { getSession } from '@/lib/auth'
import AdminDashboard from './AdminDashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Admin dashboard — Nuvho Knowledge Base',
}

// Admin stays inside the site chrome (decision 3); the page body follows the
// browser-app law: page title UI H1, 1280 max-width, Figma table/badge/field/modal.
export default async function AdminPage() {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    redirect('/login')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1 na-page">
        <div className="nw-wrap nw-wrap--app">
          <div className="na-head">
            <div>
              <h1 className="na-title">Admin dashboard</h1>
              <p className="na-sub">Signed in as <strong>{session.email}</strong></p>
            </div>
          </div>
          <AdminDashboard />
        </div>
      </main>
      <Footer />
    </div>
  )
}
