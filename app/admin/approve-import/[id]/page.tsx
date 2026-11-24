import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import { getSession, isStaffEmail } from '@/lib/auth'
import { getGrant, grantTableReady, GRANT_HOURS } from '@/lib/importGrants'
import ApproveImport from './ApproveImport'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Approve an upload from Claude — Nuvho Knowledge Base',
  robots: { index: false, follow: false },
}

// Where the nuvho-knowledge-save skill sends the person: one click lets Claude upload pages
// as them, as pending articles, for the rest of the session (lib/importGrants.ts).
export default async function ApproveImportPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  const staff = !!session && isStaffEmail(session.email)
  const grant = staff && (await grantTableReady()) ? await getGrant(params.id) : null

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1 na-page">
        <div className="nw-wrap nw-wrap--app">
          <div className="na-approve">
            {!staff ? (
              <>
                <h1>Sign in to approve</h1>
                <p>Sign in with your @nuvho.com account, then open the link from Claude again.</p>
                <div className="na-approve__actions">
                  <Link href="/login" className="nv-btn">Sign in</Link>
                </div>
              </>
            ) : !grant ? (
              <>
                <h1>Nothing to approve</h1>
                <p>This approval link is not valid. Start the save again in Claude to get a new one.</p>
              </>
            ) : (
              <ApproveImport grant={grant} email={session!.email} hours={GRANT_HOURS} />
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
