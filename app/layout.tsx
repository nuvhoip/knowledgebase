import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nuvho Knowledge Base',
  description: 'Find answers to your Nuvho questions. Guides, tutorials, and documentation for Smart Hoteliers.',
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;500;600;700&family=Raleway:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#F7F8F9] font-body text-iron-grey">
        {children}
      </body>
    </html>
  )
}
