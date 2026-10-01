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
  // Lets relative URLs (e.g. /uploads/… hero images) resolve in Open Graph tags
  metadataBase: new URL('https://knowledge.nuvho.com'),
  title: 'Nuvho Knowledge Base',
  description: 'Find answers to your Nuvho questions. Guides, tutorials and documentation for Smart Hoteliers.',
  // Steel Blue favicon from the 2026 brand set (nuvho-favicons.zip). Browsers that
  // support SVG favicons use the vector; the PNGs cover the rest and home screens.
  icons: {
    icon: [
      { url: '/favicon/nuvho-favicon-steel-blue.svg', type: 'image/svg+xml' },
      { url: '/favicon/nuvho-favicon-steel-blue-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon/nuvho-favicon-steel-blue-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/favicon/nuvho-favicon-steel-blue-180.png', sizes: '180x180', type: 'image/png' },
  },
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
