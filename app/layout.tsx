import type { Metadata } from 'next'
import { Comfortaa, Raleway } from 'next/font/google'
import './globals.css'

// next/font downloads both families at build time and serves them from this
// deployment — no runtime request to Google Fonts (nuvho-web-design §6).
const comfortaa = Comfortaa({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-comfortaa',
  display: 'swap',
})

const raleway = Raleway({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-raleway',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Nuvho Knowledge Base',
  description: 'Find answers to your Nuvho questions. Guides, tutorials and documentation for Smart Hoteliers.',
  openGraph: {
    title: 'Nuvho Knowledge Base',
    description: 'Find answers to your Nuvho questions.',
    siteName: 'Nuvho Knowledge Base',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-AU" className={`${comfortaa.variable} ${raleway.variable}`}>
      <body className="nw-page min-h-screen font-body">
        {children}
      </body>
    </html>
  )
}
