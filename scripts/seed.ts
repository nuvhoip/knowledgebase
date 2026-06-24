/**
 * Seed script — inserts all categories and articles into nuvho_kb.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/seed.ts
 *
 * Safe to re-run: uses ON CONFLICT DO UPDATE.
 */

import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ??
    'postgresql://nuvho_kb_user:NuvhoKB2026!@209.38.90.132:5432/nuvho_kb',
})

// ─── Seed data (migrated from old lib/data.ts) ──────────────────────────────

const categories = [
  { slug: 'getting-started',    title: 'Getting Started',     description: 'Set up your Nuvho account, onboard your team, and get your first booking engine live.',                                   icon: 'rocket.svg',               sortOrder: 1 },
  { slug: 'booking-engine',     title: 'Booking Engine',       description: 'Configure your online booking engine, manage availability, rates, and direct booking flows.',                             icon: 'booking-engine.svg',       sortOrder: 2 },
  { slug: 'pms-integrations',   title: 'PMS & Integrations',   description: 'Connect Nuvho to your Property Management System, channel manager, and third-party tools.',                              icon: 'gears.svg',                sortOrder: 3 },
  { slug: 'revenue-management', title: 'Revenue Management',   description: 'Maximise RevPAR with smart pricing, demand forecasting, and revenue optimisation tools.',                                 icon: 'chart-line-up.svg',        sortOrder: 4 },
  { slug: 'reports-analytics',  title: 'Reports & Analytics',  description: 'Access occupancy reports, RevPAR dashboards, booking source analysis, and custom exports.',                               icon: 'file-chart-pie.svg',       sortOrder: 5 },
  { slug: 'account-billing',    title: 'Account & Billing',    description: 'Manage your subscription, invoices, payment methods, and account settings.',                                              icon: 'credit-card-front.svg',    sortOrder: 6 },
  { slug: 'api-developers',     title: 'API & Developers',     description: 'Integrate with the Nuvho API, manage webhooks, and build custom hospitality solutions.',                                  icon: 'sitemap.svg',              sortOrder: 7 },
  { slug: 'support',            title: 'Support & FAQs',       description: 'Troubleshoot common issues, contact support, and find answers to frequently asked questions.',                            icon: 'head-side-headphones.svg', sortOrder: 8 },
]

interface ArticleSeed {
  slug: string
  title: string
  description: string
  categorySlug: string
  updatedAt: string
  readTime: number
  featured?: boolean
  sortOrder: number
}

const articles: ArticleSeed[] = [
  // Getting Started
  { slug: 'setting-up-your-account',     title: 'Setting up your Nuvho account',               description: 'A step-by-step guide to creating and configuring your Nuvho account for the first time.',         categorySlug: 'getting-started',    updatedAt: '2026-06-10', readTime: 5,  featured: true,  sortOrder: 1 },
  { slug: 'inviting-team-members',       title: 'Inviting team members',                        description: 'How to add staff, set roles, and manage user permissions across your Nuvho workspace.',            categorySlug: 'getting-started',    updatedAt: '2026-06-08', readTime: 3,  sortOrder: 2 },
  { slug: 'connecting-your-property',    title: 'Connecting your property',                     description: 'Link your property details, room types, and amenities to start taking bookings.',                  categorySlug: 'getting-started',    updatedAt: '2026-06-05', readTime: 7,  sortOrder: 3 },
  { slug: 'quick-start-checklist',       title: 'Quick-start checklist',                        description: 'The 10-step checklist to ensure your property is fully configured before going live.',             categorySlug: 'getting-started',    updatedAt: '2026-06-01', readTime: 4,  featured: true,  sortOrder: 4 },
  { slug: 'understanding-the-dashboard', title: 'Understanding the dashboard',                  description: 'A tour of the Nuvho dashboard — key metrics, navigation, and where to find everything.',          categorySlug: 'getting-started',    updatedAt: '2026-05-28', readTime: 6,  sortOrder: 5 },
  { slug: 'nuvho-glossary',              title: 'Nuvho glossary',                               description: 'Definitions of key terms used throughout the Nuvho platform and documentation.',                   categorySlug: 'getting-started',    updatedAt: '2026-05-20', readTime: 8,  sortOrder: 6 },
  // Booking Engine
  { slug: 'booking-engine-overview',     title: 'Booking engine overview',                      description: 'An introduction to the Nuvho booking engine and how it powers direct reservations.',               categorySlug: 'booking-engine',     updatedAt: '2026-06-12', readTime: 5,  featured: true,  sortOrder: 1 },
  { slug: 'embedding-on-your-website',   title: 'Embedding the booking engine on your website', description: 'How to add the Nuvho booking widget to your hotel website in three simple steps.',                categorySlug: 'booking-engine',     updatedAt: '2026-06-10', readTime: 4,  sortOrder: 2 },
  { slug: 'rate-management',             title: 'Managing rates and availability',               description: 'Set, update, and manage room rates, seasonal pricing, and availability calendars.',                categorySlug: 'booking-engine',     updatedAt: '2026-06-08', readTime: 8,  sortOrder: 3 },
  { slug: 'promo-codes',                 title: 'Setting up promo codes',                       description: 'Create discount codes, loyalty rates, and corporate pricing for direct bookings.',                 categorySlug: 'booking-engine',     updatedAt: '2026-06-03', readTime: 5,  sortOrder: 4 },
  // PMS & Integrations
  { slug: 'supported-pms',               title: 'Supported PMS platforms',                      description: 'A complete list of Property Management Systems that integrate directly with Nuvho.',               categorySlug: 'pms-integrations',   updatedAt: '2026-06-15', readTime: 3,  featured: true,  sortOrder: 1 },
  { slug: 'connecting-your-pms',         title: 'Connecting your PMS',                          description: 'Step-by-step guide to linking your PMS with Nuvho for two-way data sync.',                       categorySlug: 'pms-integrations',   updatedAt: '2026-06-10', readTime: 10, sortOrder: 2 },
  { slug: 'channel-manager-setup',       title: 'Channel manager setup',                        description: 'Integrate your channel manager to sync inventory across OTAs and direct channels.',                categorySlug: 'pms-integrations',   updatedAt: '2026-06-05', readTime: 6,  sortOrder: 3 },
  // Revenue Management
  { slug: 'revenue-management-overview', title: 'Revenue management overview',                  description: 'How Nuvho helps you make smarter pricing decisions to maximise revenue.',                          categorySlug: 'revenue-management', updatedAt: '2026-06-14', readTime: 6,  featured: true,  sortOrder: 1 },
  { slug: 'dynamic-pricing',             title: 'Setting up dynamic pricing',                   description: 'Configure rules-based and AI-assisted dynamic pricing for your property.',                        categorySlug: 'revenue-management', updatedAt: '2026-06-09', readTime: 9,  sortOrder: 2 },
  // Reports & Analytics
  { slug: 'reports-overview',            title: 'Reports overview',                             description: 'A guide to all the reports available in your Nuvho dashboard and what they measure.',             categorySlug: 'reports-analytics',  updatedAt: '2026-06-11', readTime: 5,  featured: true,  sortOrder: 1 },
  { slug: 'occupancy-report',            title: 'Occupancy report',                             description: 'Understand your property occupancy trends across date ranges, room types, and segments.',          categorySlug: 'reports-analytics',  updatedAt: '2026-06-06', readTime: 4,  sortOrder: 2 },
  // Account & Billing
  { slug: 'subscription-plans',          title: 'Subscription plans',                           description: 'Compare Nuvho plans and understand what is included at each tier.',                               categorySlug: 'account-billing',    updatedAt: '2026-06-10', readTime: 4,  featured: true,  sortOrder: 1 },
  { slug: 'updating-payment-method',     title: 'Updating your payment method',                 description: 'How to add, remove, or change the payment method on your Nuvho account.',                        categorySlug: 'account-billing',    updatedAt: '2026-06-03', readTime: 3,  sortOrder: 2 },
  // API & Developers
  { slug: 'api-overview',                title: 'Nuvho API overview',                           description: 'Introduction to the Nuvho REST API — authentication, base URLs, and rate limits.',               categorySlug: 'api-developers',     updatedAt: '2026-06-12', readTime: 8,  featured: true,  sortOrder: 1 },
  { slug: 'authentication',              title: 'API authentication',                           description: 'How to generate and manage API keys for secure access to the Nuvho API.',                        categorySlug: 'api-developers',     updatedAt: '2026-06-08', readTime: 5,  sortOrder: 2 },
  // Support & FAQs
  { slug: 'contacting-support',          title: 'Contacting Nuvho support',                     description: 'The best ways to reach our support team — live chat, email, and priority escalation.',           categorySlug: 'support',            updatedAt: '2026-06-15', readTime: 2,  featured: true,  sortOrder: 1 },
  { slug: 'common-booking-issues',       title: 'Common booking engine issues',                 description: 'Troubleshooting the most frequently reported booking engine problems and their fixes.',            categorySlug: 'support',            updatedAt: '2026-06-10', readTime: 7,  sortOrder: 2 },
]

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const cat of categories) {
      await client.query(
        `INSERT INTO nuvho_kb.categories (slug, title, description, icon, article_count, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           icon = EXCLUDED.icon,
           sort_order = EXCLUDED.sort_order`,
        [cat.slug, cat.title, cat.description, cat.icon,
         articles.filter(a => a.categorySlug === cat.slug).length,
         cat.sortOrder]
      )
    }

    for (const art of articles) {
      await client.query(
        `INSERT INTO nuvho_kb.articles
           (slug, title, description, category_slug, updated_at, read_time, featured, sort_order)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8)
         ON CONFLICT (category_slug, slug) DO UPDATE SET
           title       = EXCLUDED.title,
           description = EXCLUDED.description,
           updated_at  = EXCLUDED.updated_at,
           read_time   = EXCLUDED.read_time,
           featured    = EXCLUDED.featured,
           sort_order  = EXCLUDED.sort_order`,
        [art.slug, art.title, art.description, art.categorySlug,
         art.updatedAt, art.readTime, art.featured ?? false, art.sortOrder]
      )
    }

    // Refresh article_count from actual rows
    await client.query(`
      UPDATE nuvho_kb.categories c
      SET article_count = (
        SELECT COUNT(*) FROM nuvho_kb.articles a WHERE a.category_slug = c.slug
      )
    `)

    await client.query('COMMIT')
    console.log(`✅  Seeded ${categories.length} categories and ${articles.length} articles.`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌  Seed failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
