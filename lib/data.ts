import { Category, Article } from './types'

export const categories: Category[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    description: 'Set up your Nuvho account, onboard your team, and get your first booking engine live.',
    icon: 'rocket.svg',
    articleCount: 6,
    articles: [
      {
        slug: 'setting-up-your-account',
        title: 'Setting up your Nuvho account',
        description: 'A step-by-step guide to creating and configuring your Nuvho account for the first time.',
        categorySlug: 'getting-started',
        updatedAt: '2026-06-10',
        readTime: 5,
        featured: true,
      },
      {
        slug: 'inviting-team-members',
        title: 'Inviting team members',
        description: 'How to add staff, set roles, and manage user permissions across your Nuvho workspace.',
        categorySlug: 'getting-started',
        updatedAt: '2026-06-08',
        readTime: 3,
      },
      {
        slug: 'connecting-your-property',
        title: 'Connecting your property',
        description: 'Link your property details, room types, and amenities to start taking bookings.',
        categorySlug: 'getting-started',
        updatedAt: '2026-06-05',
        readTime: 7,
      },
      {
        slug: 'quick-start-checklist',
        title: 'Quick-start checklist',
        description: 'The 10-step checklist to ensure your property is fully configured before going live.',
        categorySlug: 'getting-started',
        updatedAt: '2026-06-01',
        readTime: 4,
        featured: true,
      },
      {
        slug: 'understanding-the-dashboard',
        title: 'Understanding the dashboard',
        description: 'A tour of the Nuvho dashboard — key metrics, navigation, and where to find everything.',
        categorySlug: 'getting-started',
        updatedAt: '2026-05-28',
        readTime: 6,
      },
      {
        slug: 'nuvho-glossary',
        title: 'Nuvho glossary',
        description: 'Definitions of key terms used throughout the Nuvho platform and documentation.',
        categorySlug: 'getting-started',
        updatedAt: '2026-05-20',
        readTime: 8,
      },
    ],
  },
  {
    slug: 'booking-engine',
    title: 'Booking Engine',
    description: 'Configure your online booking engine, manage availability, rates, and direct booking flows.',
    icon: 'booking-engine.svg',
    articleCount: 8,
    articles: [
      {
        slug: 'booking-engine-overview',
        title: 'Booking engine overview',
        description: 'An introduction to the Nuvho booking engine and how it powers direct reservations.',
        categorySlug: 'booking-engine',
        updatedAt: '2026-06-12',
        readTime: 5,
        featured: true,
      },
      {
        slug: 'embedding-on-your-website',
        title: 'Embedding the booking engine on your website',
        description: 'How to add the Nuvho booking widget to your hotel website in three simple steps.',
        categorySlug: 'booking-engine',
        updatedAt: '2026-06-10',
        readTime: 4,
      },
      {
        slug: 'rate-management',
        title: 'Managing rates and availability',
        description: 'Set, update, and manage room rates, seasonal pricing, and availability calendars.',
        categorySlug: 'booking-engine',
        updatedAt: '2026-06-08',
        readTime: 8,
      },
      {
        slug: 'promo-codes',
        title: 'Setting up promo codes',
        description: 'Create discount codes, loyalty rates, and corporate pricing for direct bookings.',
        categorySlug: 'booking-engine',
        updatedAt: '2026-06-03',
        readTime: 5,
      },
    ],
  },
  {
    slug: 'pms-integrations',
    title: 'PMS & Integrations',
    description: 'Connect Nuvho to your Property Management System, channel manager, and third-party tools.',
    icon: 'gears.svg',
    articleCount: 7,
    articles: [
      {
        slug: 'supported-pms',
        title: 'Supported PMS platforms',
        description: 'A complete list of Property Management Systems that integrate directly with Nuvho.',
        categorySlug: 'pms-integrations',
        updatedAt: '2026-06-15',
        readTime: 3,
        featured: true,
      },
      {
        slug: 'connecting-your-pms',
        title: 'Connecting your PMS',
        description: 'Step-by-step guide to linking your PMS with Nuvho for two-way data sync.',
        categorySlug: 'pms-integrations',
        updatedAt: '2026-06-10',
        readTime: 10,
      },
      {
        slug: 'channel-manager-setup',
        title: 'Channel manager setup',
        description: 'Integrate your channel manager to sync inventory across OTAs and direct channels.',
        categorySlug: 'pms-integrations',
        updatedAt: '2026-06-05',
        readTime: 6,
      },
    ],
  },
  {
    slug: 'revenue-management',
    title: 'Revenue Management',
    description: 'Maximise RevPAR with smart pricing, demand forecasting, and revenue optimisation tools.',
    icon: 'chart-line-up.svg',
    articleCount: 5,
    articles: [
      {
        slug: 'revenue-management-overview',
        title: 'Revenue management overview',
        description: 'How Nuvho helps you make smarter pricing decisions to maximise revenue.',
        categorySlug: 'revenue-management',
        updatedAt: '2026-06-14',
        readTime: 6,
        featured: true,
      },
      {
        slug: 'dynamic-pricing',
        title: 'Setting up dynamic pricing',
        description: 'Configure rules-based and AI-assisted dynamic pricing for your property.',
        categorySlug: 'revenue-management',
        updatedAt: '2026-06-09',
        readTime: 9,
      },
    ],
  },
  {
    slug: 'reports-analytics',
    title: 'Reports & Analytics',
    description: 'Access occupancy reports, RevPAR dashboards, booking source analysis, and custom exports.',
    icon: 'file-chart-pie.svg',
    articleCount: 6,
    articles: [
      {
        slug: 'reports-overview',
        title: 'Reports overview',
        description: 'A guide to all the reports available in your Nuvho dashboard and what they measure.',
        categorySlug: 'reports-analytics',
        updatedAt: '2026-06-11',
        readTime: 5,
        featured: true,
      },
      {
        slug: 'occupancy-report',
        title: 'Occupancy report',
        description: 'Understand your property occupancy trends across date ranges, room types, and segments.',
        categorySlug: 'reports-analytics',
        updatedAt: '2026-06-06',
        readTime: 4,
      },
    ],
  },
  {
    slug: 'account-billing',
    title: 'Account & Billing',
    description: 'Manage your subscription, invoices, payment methods, and account settings.',
    icon: 'credit-card-front.svg',
    articleCount: 5,
    articles: [
      {
        slug: 'subscription-plans',
        title: 'Subscription plans',
        description: 'Compare Nuvho plans and understand what is included at each tier.',
        categorySlug: 'account-billing',
        updatedAt: '2026-06-10',
        readTime: 4,
        featured: true,
      },
      {
        slug: 'updating-payment-method',
        title: 'Updating your payment method',
        description: 'How to add, remove, or change the payment method on your Nuvho account.',
        categorySlug: 'account-billing',
        updatedAt: '2026-06-03',
        readTime: 3,
      },
    ],
  },
  {
    slug: 'api-developers',
    title: 'API & Developers',
    description: 'Integrate with the Nuvho API, manage webhooks, and build custom hospitality solutions.',
    icon: 'sitemap.svg',
    articleCount: 7,
    articles: [
      {
        slug: 'api-overview',
        title: 'Nuvho API overview',
        description: 'Introduction to the Nuvho REST API — authentication, base URLs, and rate limits.',
        categorySlug: 'api-developers',
        updatedAt: '2026-06-12',
        readTime: 8,
        featured: true,
      },
      {
        slug: 'authentication',
        title: 'API authentication',
        description: 'How to generate and manage API keys for secure access to the Nuvho API.',
        categorySlug: 'api-developers',
        updatedAt: '2026-06-08',
        readTime: 5,
      },
    ],
  },
  {
    slug: 'support',
    title: 'Support & FAQs',
    description: 'Troubleshoot common issues, contact support, and find answers to frequently asked questions.',
    icon: 'head-side-headphones.svg',
    articleCount: 9,
    articles: [
      {
        slug: 'contacting-support',
        title: 'Contacting Nuvho support',
        description: 'The best ways to reach our support team — live chat, email, and priority escalation.',
        categorySlug: 'support',
        updatedAt: '2026-06-15',
        readTime: 2,
        featured: true,
      },
      {
        slug: 'common-booking-issues',
        title: 'Common booking engine issues',
        description: 'Troubleshooting the most frequently reported booking engine problems and their fixes.',
        categorySlug: 'support',
        updatedAt: '2026-06-10',
        readTime: 7,
      },
    ],
  },
]

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find(c => c.slug === slug)
}

export function getArticleBySlug(categorySlug: string, articleSlug: string): Article | undefined {
  const category = getCategoryBySlug(categorySlug)
  return category?.articles.find(a => a.slug === articleSlug)
}

export function getFeaturedArticles(limit = 5): Article[] {
  return categories
    .flatMap(c => c.articles)
    .filter(a => a.featured)
    .slice(0, limit)
}
