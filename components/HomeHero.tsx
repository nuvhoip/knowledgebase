import InnerHero from './InnerHero'
import SearchForm from './SearchForm'

const POPULAR = ['Booking engine setup', 'PMS integration', 'Dynamic pricing', 'API keys']

// Blog hero photo (Figma 793:29 "Hero image / Byron Bay"), WebP at two widths.
const HERO = {
  src: '/hero/byron-bay-1920.webp',
  srcSet: '/hero/byron-bay-960.webp 960w, /hero/byron-bay-1920.webp 1920w',
  alt: '',
}

export default function HomeHero() {
  return (
    <InnerHero
      home
      image={HERO}
      title="Find answers to your questions"
      lede="Guides, tutorials and documentation for Smart Hoteliers — organised so your team finds the right answer first time."
    >
      <div className="nw-hero__search">
        <SearchForm popular={POPULAR} />
      </div>
    </InnerHero>
  )
}
