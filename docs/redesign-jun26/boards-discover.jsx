// Boards — DISCOVER page, desktop + mobile
const HOODS = ['Telliskivi','Kalamaja','Old Town','Kopli','Kadriorg'];
const CATS = [
  {label:'Cinema', on:true}, {label:'Live music', on:false}, {label:'Galleries', on:true},
  {label:'Club nights', on:false}, {label:'Markets', on:false},
];

const CURATORS = [
  { ava:'ST', handle:'@sigmundtells', picks:'41 picks',
    quote:'Film, sound, and the rooms where both misbehave.' },
  { ava:'VK', handle:'@veronika.k', picks:'28 picks',
    quote:'Chamber music in places it was never meant for.' },
  { ava:'OB', handle:'@ostblok', picks:'33 picks',
    quote:'Warehouses, freight yards, anything with a loading door.' },
];

const RESULTS = [
  { group:'Telliskivi · 4 picks', rows:[
    { tile:'ZINE', title:'Baltic zine fair — summer issue launch', meta:['SAT 14','MARKET','@ostblok'] },
    { tile:'F-60', title:'Fotografiska late: analogue night', meta:['FRI 13','GALLERIES','@veronika.k'] },
  ]},
  { group:'Old Town · 3 picks', rows:[
    { thumb:'assets/thumb-vivaldi.png', title:'Vivaldi recomposed, by candlelight', meta:['FRI 13','CONCERT','@veronika.k'] },
    { tile:'CAVE', title:'Vaults under Bastion — sound bath', meta:['SUN 15','SOUND','@sigmundtells'] },
  ]},
  { group:'Kopli · 2 picks', rows:[
    { tile:'CLUB', title:'Freight-yard all-nighter at Kopli depot', meta:['SAT 14','CLUB','@ostblok'] },
  ]},
];

const ResultRow = ({r}) => (
  <li className="row">
    {r.thumb ? <img className="row__thumb" src={r.thumb} alt=""/> : <span className="row__tile">{r.tile}</span>}
    <div>
      <h3 className="row__title">{r.title}</h3>
      <p className="row__meta meta">
        <b>{r.meta[0]}</b><span className="dotsep">·</span>{r.meta[1]}
        <span className="dotsep">·</span><span className="handle">{r.meta[2]}</span>
      </p>
    </div>
    <button className="pick__save" type="button" aria-label="Save"><IBookmark/></button>
  </li>
);

const Deck = ({mob}) => (
  <div className="deck">
    <div className="deck__row">
      <div className="seg" style={mob ? null : {flexShrink:0}}>
        <button className="seg__tab seg__tab--on" type="button">This week {mob ? null : <span className="seg__count">24</span>}</button>
        <button className="seg__tab" type="button">All</button>
        <button className="seg__tab" type="button">Venues</button>
      </div>
      {mob ? null : (
        <React.Fragment>
          <label className="field" style={{flex:1}}>
            <ISearch/>
            <input className="field__input" placeholder="Search events, venues, curators…"/>
          </label>
          <button className="btn btn--secondary" type="button" style={{flexShrink:0}}><IShuffle/>Surprise me</button>
        </React.Fragment>
      )}
    </div>
    {mob ? (
      <div className="deck__row">
        <label className="field" style={{flex:1, height:46}}>
          <ISearch/>
          <input className="field__input" placeholder="Search Tallinn…"/>
        </label>
        <button className="btn btn--secondary btn--sm" type="button" style={{flexShrink:0, height:46, padding:'0 16px'}}><IShuffle/></button>
      </div>
    ) : null}
    <hr className="deck__rule"/>
    <div className={'deck__row deck__row--wrap' + (mob ? ' hscroll' : '')}>
      <span className="eyebrow" style={{marginRight:2}}>Where</span>
      {HOODS.slice(0, mob ? 3 : 5).map((h,i) => (
        <button key={h} className={'chip' + (i===0 ? ' chip--on' : '')} type="button">{h}</button>
      ))}
      <span className="deck__div"></span>
      <span className="eyebrow" style={{marginRight:2}}>What</span>
      {CATS.slice(0, mob ? 3 : 5).map(c => (
        <button key={c.label} className={'chip' + (c.on ? ' chip--on' : '')} type="button">{c.label}</button>
      ))}
      {mob ? null : <button className="deck__reset" type="button">Reset</button>}
    </div>
  </div>
);

const MapPlate = ({mob}) => (
  <div className="mapplate" style={mob ? {position:'static', height:'100%'} : null}>
    <div className="mapplate__canvas"></div>
    <div className="mapplate__water"></div>
    <span className="mapplate__park" style={{width:130, height:90, right:60, bottom:120}}></span>
    <span className="mapplate__park" style={{width:90, height:70, left:40, bottom:60}}></span>
    {/* neighbourhood ink */}
    {[['TELLISKIVI',{left:'14%',top:'34%'}],['OLD TOWN',{left:'52%',top:'52%'}],['KOPLI',{left:'8%',top:'16%'}],['KADRIORG',{right:'8%',bottom:'30%'}]].map(([n,pos]) => (
      <span key={n} className="eyebrow" style={{position:'absolute', fontSize:10.5, color:'rgba(10,10,12,.38)', ...pos}}>{n}</span>
    ))}
    {/* pins */}
    <span className="mappin mappin--live" style={{left:'46%', top:'62%'}}></span>
    <span className="maplabel" style={{left:'46%', top:'62%'}}>Stalker on 35mm · tonight</span>
    <span className="mappin" style={{left:'20%', top:'40%'}}></span>
    <span className="mappin" style={{left:'24%', top:'46%'}}></span>
    <span className="mappin" style={{left:'58%', top:'48%'}}></span>
    <span className="mappin" style={{left:'12%', top:'22%'}}></span>
    <span className="mappin" style={{right:'14%', bottom:'34%'}}></span>
    <div className="mapctl">
      <button type="button" aria-label="Zoom in"><IPlus/></button>
      <button type="button" aria-label="Zoom out"><IMinus/></button>
      <button type="button" aria-label="Locate me"><ILocate/></button>
    </div>
    <span className="mapattr">Tallinn · OSM</span>
  </div>
);

// ── Desktop artboard ─────────────────────────────────────────
const DiscoverDesk = () => (
  <div className="wa">
    <DeskChrome active="discover" aside="24 picks live"/>
    <div className="standfirst shell">
      <h1 className="standfirst__t">Every pick, <em>on the map</em>.</h1>
      <span className="standfirst__meta">Curated by 3 humans · 0 algorithms</span>
    </div>
    <div className="shell"><Deck/></div>
    <div className="shell currail">
      {CURATORS.map(c => (
        <a key={c.handle} className="curcard" href="#">
          <div className="curcard__head">
            <span className="curcard__ava">{c.ava}</span>
            <span className="handle">{c.handle}</span>
            <span className="curcard__picks">{c.picks}</span>
          </div>
          <p className="curcard__quote">{c.quote}</p>
        </a>
      ))}
    </div>
    <div className="shell dsplit">
      <div>
        <div className="results__head">
          <span className="eyebrow">Results · by neighbourhood</span>
          <span className="meta"><b>9</b> match</span>
        </div>
        {RESULTS.map(g => (
          <div key={g.group}>
            <div className="groupline">
              <span className="meta" style={{letterSpacing:'.12em', textTransform:'uppercase'}}><b>{g.group.split(' ·')[0]}</b> ·{g.group.split('·')[1]}</span>
              <a className="meta" href="#" style={{textDecoration:'underline', textUnderlineOffset:3}}>map</a>
            </div>
            <ul>{g.rows.map(r => <ResultRow key={r.title} r={r}/>)}</ul>
          </div>
        ))}
        <div className="results__foot">
          <a className="linkact" href="#">Load 4 more<IArrowR/></a>
          <span className="meta">picks expire when they happen</span>
        </div>
      </div>
      <MapPlate/>
    </div>
    <Colophon/>
  </div>
);

// ── Mobile artboard ──────────────────────────────────────────
const DiscoverMob = () => (
  <div className="wa wa--mob">
    <div className="viewport">
      <div className="page--tabbed">
        <MobTopbar/>
        <div className="shell" style={{paddingTop:14}}>
          <Deck mob/>
        </div>
        <div className="shell" style={{paddingTop:18}}>
          <div className="results__head">
            <span className="eyebrow">Telliskivi · 4 picks</span>
            <span className="meta"><b>9</b> match</span>
          </div>
          <ul>
            <ResultRow r={RESULTS[0].rows[0]}/>
            <ResultRow r={RESULTS[0].rows[1]}/>
            <ResultRow r={RESULTS[1].rows[0]}/>
          </ul>
        </div>
      </div>
      <button className="mapfab" type="button"><IMap/>Map</button>
      <Dock active="discover"/>
    </div>
  </div>
);

Object.assign(window, { DiscoverDesk, DiscoverMob, Deck, MapPlate, CURATORS });
