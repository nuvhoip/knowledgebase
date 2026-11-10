import { describe, it, expect } from 'vitest'
import { articleJsonLd, extractFaq, htmlToMarkdown, htmlToText, jsonLdString, absoluteUrl, siteJsonLd } from './seo'

const FAQ_HTML = `
<h2>Overview</h2><p>Intro text that is long enough to count.</p>
<h2>How do I reset my <em>password</em>?</h2><p>Open <strong>Settings</strong> and choose Reset password, then follow the email.</p>
<h3>Can I change my email address?</h3><ul><li>Yes, from Profile.</li><li>Staff need admin approval.</li></ul>
<h3>Why?</h3><p>short</p>
<h2>Next steps</h2><p>Done.</p>`

describe('extractFaq', () => {
  it('pairs question headings with the text up to the next heading', () => {
    expect(extractFaq(FAQ_HTML)).toEqual([
      { question: 'How do I reset my password?', answer: 'Open Settings and choose Reset password, then follow the email.' },
      { question: 'Can I change my email address?', answer: 'Yes, from Profile. Staff need admin approval.' },
    ])
  })
  it('returns nothing for articles without question headings', () => {
    expect(extractFaq('<h2>Setup</h2><p>Steps…</p>')).toEqual([])
    expect(extractFaq(null)).toEqual([])
  })
})

describe('articleJsonLd', () => {
  const ld = articleJsonLd({
    title: 'Reset your password',
    description: 'How to reset a Nuvho password.',
    categorySlug: 'getting-started',
    slug: 'reset-your-password',
    categoryTitle: 'Getting Started',
    updatedIso: '2026-11-10',
    readTime: 3,
    html: FAQ_HTML,
    heroSrc: '/uploads/abc.jpg',
    tags: [{ name: 'Account', slug: 'account' }, { name: 'Security', slug: 'security' }],
  })
  const graph = ld['@graph'] as any[]
  const article = graph.find(n => n['@type'] === 'TechArticle')

  it('describes the article with canonical URL, dates, tags and image', () => {
    expect(article.url).toBe('https://knowledge.nuvho.com/articles/getting-started/reset-your-password')
    expect(article.dateModified).toBe('2026-11-10')
    expect(article.keywords).toBe('Account, Security')
    expect(article.about[1]).toEqual({ '@type': 'Thing', name: 'Security', url: 'https://knowledge.nuvho.com/tags/security' })
    expect(article.image).toBe('https://knowledge.nuvho.com/uploads/abc.jpg')
    expect(article.timeRequired).toBe('PT3M')
    expect(article.inLanguage).toBe('en-AU')
  })
  it('adds breadcrumbs and an FAQPage', () => {
    expect(graph.find(n => n['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(3)
    expect(graph.find(n => n['@type'] === 'FAQPage').mainEntity).toHaveLength(2)
  })
  it('omits keywords and FAQ when there is nothing to say', () => {
    const plain = articleJsonLd({ title: 'T', description: 'D', categorySlug: 'c', slug: 's', categoryTitle: 'C', html: '<p>x</p>' })
    const g = plain['@graph'] as any[]
    expect(g.find(n => n['@type'] === 'TechArticle').keywords).toBeUndefined()
    expect(g.some(n => n['@type'] === 'FAQPage')).toBe(false)
  })
})

describe('jsonLdString', () => {
  it('cannot close the script tag it sits in', () => {
    const out = jsonLdString({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('</script>')
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>')
  })
})

describe('htmlToMarkdown / htmlToText', () => {
  it('keeps headings, lists, bold and absolute links', () => {
    const md = htmlToMarkdown('<h2>Steps</h2><ol><li>Open <a href="/categories/x">X</a></li><li><strong>Save</strong></li></ol><p>Done &amp; dusted.</p>')
    expect(md).toBe('## Steps\n\n- Open [X](https://knowledge.nuvho.com/categories/x)\n- **Save**\n\nDone & dusted.')
  })
  it('drops the hero figure', () => {
    expect(htmlToMarkdown('<figure class="kb-hero"><img src="/a.jpg" alt=""></figure><p>Body</p>')).toBe('Body')
  })
  it('flattens HTML to text', () => {
    expect(htmlToText('<p>A<br>B</p><p>C&nbsp;D</p>')).toBe('A B C D')
  })
})

describe('absoluteUrl / siteJsonLd', () => {
  it('leaves absolute URLs alone', () => {
    expect(absoluteUrl('https://cdn.nuvho.com/x.png')).toBe('https://cdn.nuvho.com/x.png')
    expect(absoluteUrl('x')).toBe('https://knowledge.nuvho.com/x')
  })
  it('declares the site search', () => {
    const site = (siteJsonLd()['@graph'] as any[]).find(n => n['@type'] === 'WebSite')
    expect(site.potentialAction.target.urlTemplate).toContain('/search?q={search_term_string}')
  })
})
