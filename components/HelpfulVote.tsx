'use client'

import { useState } from 'react'
import Icon from './Icon'

// "Was this article helpful?" — local acknowledgement only; there is no feedback API.
export default function HelpfulVote() {
  const [voted, setVoted] = useState<'yes' | 'no' | null>(null)

  return (
    <div className="nw-helpful">
      <p>Was this article helpful?</p>
      {voted ? (
        <span className="nw-helpful__thanks">
          {voted === 'yes'
            ? 'Thanks — glad it helped.'
            : 'Thanks for letting us know. Email support@nuvho.com and we will improve it.'}
        </span>
      ) : (
        <div>
          <button type="button" className="nv-btn nv-btn--secondary" onClick={() => setVoted('yes')}>
            <Icon name="thumbs-up" size={16} />Yes
          </button>
          <button type="button" className="nv-btn nv-btn--secondary" onClick={() => setVoted('no')}>
            <Icon name="thumbs-down" size={16} />No
          </button>
        </div>
      )}
    </div>
  )
}
