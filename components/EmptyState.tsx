import type { ReactNode } from 'react'
import Icon from './Icon'

interface Props {
  icon: string
  title: string
  body: string
  action?: ReactNode
}

export default function EmptyState({ icon, title, body, action }: Props) {
  return (
    <div className="nw-empty">
      <div className="nw-empty__icon"><Icon name={icon} size={32} /></div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  )
}
