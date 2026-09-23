// Conversion band — Figma "06 · Subscribe (Blue Slate · full bleed)" 794:95: GROUND
// gradient, three sheets at the Figma offsets, centred copy, onDark + onDarkAlt pair.
export default function ContactBand() {
  return (
    <section className="nw-band">
      <span className="nv-sheet nv-sheet--1" aria-hidden="true" />
      <span className="nv-sheet nv-sheet--2" aria-hidden="true" />
      <span className="nv-sheet nv-sheet--focal" aria-hidden="true" />
      <div className="nw-wrap nw-band__inner">
        <h2>Can&apos;t find what you&apos;re looking for?</h2>
        <p>
          Tell us what you were trying to do and we&apos;ll point you to the right answer —
          or write the article if it doesn&apos;t exist yet.
        </p>
        <div className="nw-band__actions">
          <a href="mailto:support@nuvho.com" className="nv-btn nv-btn--ondark nw-band__btn">Email support</a>
          <a href="https://nuvho.com/contact" target="_blank" rel="noopener noreferrer" className="nv-btn nv-btn--ondark-alt nw-band__btn">
            Speak to our Experts
          </a>
        </div>
      </div>
    </section>
  )
}
