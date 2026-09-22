import InnerHero from './InnerHero'
import SearchForm from './SearchForm'

const POPULAR = ['Booking engine setup', 'PMS integration', 'Dynamic pricing', 'API keys']

export default function HomeHero() {
  return (
    <InnerHero
      home
      title="Find answers to your questions"
      lede="Guides, tutorials and documentation for Smart Hoteliers — organised so your team finds the right answer first time."
    >
      <div className="nw-hero__search">
        <SearchForm popular={POPULAR} />
      </div>
    </InnerHero>
  )
}
