// Boards — ABOUT page, desktop + mobile (with the dead-end fix)
const STEPS = [
  { n:'01', t:'Curators vouch', b:'Three humans walk the city. Nothing gets listed unless one of them puts their name on it.' },
  { n:'02', t:'The index sorts', b:'AI files picks by neighbourhood, date and mood — it never chooses what you see first.' },
  { n:'03', t:'Picks expire', b:'When an event happens, it leaves the index. No archive of stale listings, ever.' },
];

const AboutBody = ({mob}) => (
  <React.Fragment>
    <section className="about-hero shell">
      <div>
        <span className="eyebrow">About WanderAlt</span>
        <h1 className="about-hero__t">Culture without the algorithm.</h1>
        <p className="about-hero__lede">WanderAlt is a weekly briefing on the alternative culture of one city at a time — cinema in attics, concerts in vaults, markets in freight yards. Every pick is vouched for by a named curator.</p>
      </div>
      <span className="about-hero__mark"><span></span></span>
    </section>

    <section className="about-sec shell" style={{paddingTop: mob ? 24 : 36}}>
      <h2 className="about-sec__t">How it works</h2>
      <div className="steps" style={{paddingTop:0}}>
        {STEPS.map(s => (
          <div key={s.n} className="step">
            <div className="step__num">{s.n}</div>
            <h3 className="step__t">{s.t}</h3>
            <p className="step__b">{s.b}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="about-sec shell">
      <h2 className="about-sec__t">One city at a time</h2>
      <div className="cities">
        <div>
          <div className="citycard__plate"><img src="assets/tallinn-overview.svg" alt="Tallinn skyline"/></div>
          <div className="citycard__cap">
            <span style={{fontWeight:600, fontSize:16}}>Tallinn</span>
            <span className="tag tag--live" style={{padding:'5px 10px'}}>Live</span>
          </div>
        </div>
        <div>
          <div className="citycard__plate" style={{display:'grid', placeItems:'center'}}>
            <span className="eyebrow" style={{color:'var(--faint)'}}>Riga — autumn</span>
          </div>
          <div className="citycard__cap">
            <span style={{fontWeight:600, fontSize:16, color:'var(--ink-mute)'}}>Riga</span>
            <span className="tag tag--ghost" style={{padding:'5px 10px'}}>Next</span>
          </div>
        </div>
        <div>
          <div className="citycard__plate" style={{display:'grid', placeItems:'center'}}>
            <span className="eyebrow" style={{color:'var(--faint)'}}>Vilnius — 2027</span>
          </div>
          <div className="citycard__cap">
            <span style={{fontWeight:600, fontSize:16, color:'var(--ink-mute)'}}>Vilnius</span>
            <span className="tag tag--ghost" style={{padding:'5px 10px'}}>Soon</span>
          </div>
        </div>
      </div>
    </section>

    <section className="about-sec shell" style={{paddingBottom: mob ? 8 : 0}}>
      <h2 className="about-sec__t">Write to the desk</h2>
      <div className="linkrow">
        <a className="linkcard" href="#">
          <span className="linkcard__ic"><IMail/></span>
          <span><b>desk@wanderalt.eu</b><span>Tips, venues, corrections</span></span>
        </a>
        <a className="linkcard" href="#">
          <span className="linkcard__ic"><IUser/></span>
          <span><b>Become a curator</b><span>One city, your name on it</span></span>
        </a>
        <a className="linkcard" href="#">
          <span className="linkcard__ic"><IRepo/></span>
          <span><b>The changelog</b><span>What shipped this week</span></span>
        </a>
      </div>
    </section>
  </React.Fragment>
);

// ── Desktop artboard ─────────────────────────────────────────
const AboutDesk = () => (
  <div className="wa">
    <DeskChrome active="" aside="est. 2026"/>
    <AboutBody/>
    <Colophon/>
  </div>
);

// ── Mobile artboard — note the return bar killing the dead end ─
const AboutMob = () => (
  <div className="wa wa--mob">
    <div className="viewport">
      <div className="page--tabbed">
        <MobTopbar/>
        <a className="returnbar" href="#">
          <IArrowL/>
          <span>Back to today's briefing</span>
        </a>
        <AboutBody mob/>
      </div>
      <Dock active=""/>
    </div>
  </div>
);

Object.assign(window, { AboutDesk, AboutMob });
