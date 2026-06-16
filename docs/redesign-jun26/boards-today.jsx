// Boards — TODAY page, desktop + mobile
const PICKS = [
  { thumb:'assets/thumb-vivaldi.png', title:'Vivaldi recomposed, by candlelight',
    meta:['FRI 13','CONCERT','Old Town'], handle:'@veronika.k' },
  { tile:'ZINE', title:'Baltic zine fair — summer issue launch',
    meta:['SAT 14','MARKET','Telliskivi'], handle:'@ostblok' },
  { tile:'CLUB', title:'Freight-yard all-nighter at Kopli depot',
    meta:['SAT 14','CLUB','Kopli'], handle:'@ostblok' },
  { tile:'OPEN', title:'Open studios at ARS art factory',
    meta:['SUN 15','GALLERIES','Kadriorg'], handle:'@veronika.k' },
];

const PickRow = ({p, mob}) => (
  <li className="pick">
    {p.thumb
      ? <img className="pick__thumb" src={p.thumb} alt=""/>
      : <span className="pick__tile">{p.tile}</span>}
    <div>
      <h3 className="pick__title">{p.title}</h3>
      <p className="pick__meta meta">
        <b>{p.meta[0]}</b><span className="dotsep">·</span>{p.meta[1]}
        <span className="dotsep">·</span>{p.meta[2]}
        <span className="dotsep">·</span><span className="handle">{p.handle}</span>
      </p>
    </div>
    <button className="pick__save" type="button" aria-label="Save"><IBookmark/></button>
  </li>
);

const Standfirst = () => (
  <div className="standfirst shell">
    <h1 className="standfirst__t">The alternative-culture briefing for <em>Tallinn</em>.</h1>
    <span className="standfirst__meta">Issue 1 · Thu 12 Jun 2026</span>
  </div>
);

const Tonight = ({mob}) => (
  <section className="tonight shell">
    <div>
      <div className="tonight__signal">
        <span className="tag tag--live">Tonight</span>
        <span className="tonight__kicker"><b>21:30</b> · Kino Artis · Cinema</span>
      </div>
      <h2 className="tonight__title">Stalker on 35mm, scored live by a modular-synth trio.</h2>
      {mob ? <MediaPlate mob/> : null}
      <figure className="quote">
        <blockquote className="quote__t">One screening, one print, one chance. The reel hiss is the whole point — don't wait for streaming.</blockquote>
        <figcaption className="quote__attr">
          <span className="handle">@sigmundtells</span>
          <span className="meta">vouched Tue · Film &amp; sound</span>
        </figcaption>
      </figure>
      <div className="tonight__actions">
        <button className="btn btn--primary" type="button">I'm going<IArrowR/></button>
        <button className="btn btn--secondary" type="button"><IShuffle/>Surprise me</button>
        <button className="btn btn--quiet" type="button"><IBookmark/>Save</button>
      </div>
    </div>
    {mob ? null : <MediaPlate/>}
  </section>
);

const MediaPlate = ({mob}) => (
  <div className="tonight__media">
    <figure className="tonight__photo">
      <img src="assets/hero-portrait.png" alt="Kino Artis at dusk"/>
      <span className="tag tag--photo">35mm</span>
    </figure>
    {mob ? null : (
      <div className="tonight__venue">
        <div>
          <b>Kino Artis · Hall 2</b>
          <span className="meta">Estonia pst 9 · doors 21:00 · 8€ at the door</span>
        </div>
        <a className="linkact" href="#">Venue<IArrowR/></a>
      </div>
    )}
  </div>
);

const TheColumn = () => (
  <aside className="column">
    <div className="column__head">
      <span className="eyebrow" style={{color:'var(--petrol)'}}>The Column · Issue 1</span>
      <span className="meta">weekly</span>
    </div>
    <p className="column__body">Tallinn breathes differently in June — courtyards stay light past eleven and the city forgets to go home. Skip the festival main stage; <em>the courtyard shows are where the city talks to itself.</em></p>
    <div className="column__sig">
      <span className="column__ava">ST</span>
      <div>
        <span className="handle" style={{display:'block'}}>@sigmundtells</span>
        <span className="meta" style={{fontSize:11.5}}>Founding curator · 41 picks vouched</span>
      </div>
    </div>
  </aside>
);

const Digest = () => (
  <div className="digest">
    <span className="eyebrow">The digest</span>
    <p style={{margin:'10px 0 2px', fontSize:15.5, lineHeight:1.55, color:'var(--ink-soft)'}}>One email, Thursday mornings. Every pick vouched by a human.</p>
    <div className="digest__row">
      <label className="field"><IMail/><input className="field__input" placeholder="you@example.com"/></label>
      <button className="btn btn--petrol" type="button">Subscribe</button>
    </div>
  </div>
);

const WeekDesk = () => (
  <section className="week shell">
    <div>
      <div className="sechead">
        <h2 className="sechead__t">This week</h2>
        <span className="meta"><b>24</b> picks · 11 venues</span>
      </div>
      <ul>{PICKS.map(p => <PickRow key={p.title} p={p}/>)}</ul>
      <div className="week__foot">
        <a className="linkact" href="#">Browse all this week<IArrowR/></a>
        <span className="meta">curated, never ranked</span>
      </div>
    </div>
    <div>
      <div className="sechead">
        <h2 className="sechead__t">From the desk</h2>
      </div>
      <TheColumn/>
      <Digest/>
    </div>
  </section>
);

// ── Desktop artboard ─────────────────────────────────────────
const TodayDesk = () => (
  <div className="wa">
    <DeskChrome active="today" aside="Tallinn · 59.43°N"/>
    <Standfirst/>
    <Tonight/>
    <WeekDesk/>
    <Colophon/>
  </div>
);

// ── Mobile artboard (viewport snapshot, docked nav) ──────────
const TodayMob = () => (
  <div className="wa wa--mob">
    <div className="viewport">
      <div className="page--tabbed">
        <MobTopbar/>
        <MobBanner/>
        <div className="standfirst shell">
          <h1 className="standfirst__t">The alternative-culture briefing for <em>Tallinn</em>.</h1>
          <span className="standfirst__meta">Issue 1 · Thu 12 Jun</span>
        </div>
        <Tonight mob/>
      </div>
      <Dock active="today"/>
    </div>
  </div>
);

// Mobile, scrolled to the week list + column
const TodayMobScrolled = () => (
  <div className="wa wa--mob">
    <div className="viewport">
      <div className="page--tabbed">
        <div className="week shell" style={{paddingTop:18}}>
          <div>
            <div className="sechead">
              <h2 className="sechead__t">This week</h2>
              <span className="meta"><b>24</b> picks</span>
            </div>
            <ul>{PICKS.slice(0,3).map(p => <PickRow key={p.title} p={p} mob/>)}</ul>
            <div className="week__foot">
              <a className="linkact" href="#">Browse all this week<IArrowR/></a>
            </div>
            <TheColumn/>
          </div>
        </div>
      </div>
      <Dock active="today"/>
    </div>
  </div>
);

Object.assign(window, { TodayDesk, TodayMob, TodayMobScrolled, PICKS, PickRow, TheColumn, Digest });
