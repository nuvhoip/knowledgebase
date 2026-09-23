import { Fragment } from 'react'
import Link from 'next/link'
import Icon from './Icon'

export interface Crumb {
  label: string
  href?: string
}

export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="nw-crumb" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <Fragment key={`${c.label}-${i}`}>
          {i > 0 && <Icon name="angle-right" size={10} />}
          {c.href
            ? <Link href={c.href}>{c.label}</Link>
            : <span className="nw-crumb__current" aria-current="page">{c.label}</span>}
        </Fragment>
      ))}
    </nav>
  )
}
