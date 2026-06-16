// WanderAlt redesign — shared chrome (icons, masthead, dock, colophon)
const S = { fill:'none', stroke:'currentColor', strokeWidth:1.6, strokeLinecap:'square', strokeLinejoin:'miter' };
const Ic = ({children, vb='0 0 24 24', cls='ic'}) => (
  <svg className={cls} viewBox={vb} {...S} aria-hidden="true">{children}</svg>
);
const IDoc      = () => <Ic><path d="M5 3h11l3 3v15H5V3z"/><path d="M8 8h8M8 12h8M8 16h5"/></Ic>;
const ISearch   = () => <Ic><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></Ic>;
const IBookmark = () => <Ic><path d="M6 3h12v18l-6-4-6 4V3z"/></Ic>;
const IUser     = () => <Ic><circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3.1-7 7-7s7 3 7 7"/></Ic>;
const IChevD    = () => <Ic vb="0 0 10 10"><path d="M1.5 3.5L5 7l3.5-3.5"/></Ic>;
const IArrowR   = () => <Ic><path d="M4 12h15M13 6l6 6-6 6"/></Ic>;
const IArrowL   = () => <Ic><path d="M20 12H5M11 6l-6 6 6 6"/></Ic>;
const IPlus     = () => <Ic><path d="M12 5v14M5 12h14"/></Ic>;
const IMinus    = () => <Ic><path d="M5 12h14"/></Ic>;
const ILocate   = () => <Ic><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></Ic>;
const ISpark    = () => <Ic><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/></Ic>;
const IMap      = () => <Ic><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></Ic>;
const IRepo     = () => <Ic><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></Ic>;
const IMail     = () => <Ic><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/></Ic>;
const IShuffle  = () => <Ic><path d="M3 7h4l10 10h4M21 17l-3 3M21 17l-3-3M3 17h4l3-3M14 7h7M21 7l-3 3M21 7l-3-3"/></Ic>;

// ── Brand lockup ─────────────────────────────────────────────
const Brand = () => (
  <a className="brand" href="#">
    <span className="brand__tile"><span className="brand__diamond"></span></span>
    <span className="brand__word">WanderAlt</span>
  </a>
);

const CitySelect = () => (
  <button className="cityselect" type="button">
    <span className="cityselect__dot"></span>
    <span>TALLINN</span>
    <IChevD/>
  </button>
);

// ── Desktop chrome: topbar → banner plate → masthead tabs ────
const TABS = [
  { id:'today',    label:'Today',    icon:<IDoc/> },
  { id:'discover', label:'Discover', icon:<ISearch/> },
  { id:'saved',    label:'Saved',    icon:<IBookmark/> },
  { id:'profile',  label:'Profile',  icon:<IUser/> },
];

const DeskChrome = ({active, aside}) => (
  <React.Fragment>
    <header className="topbar">
      <div className="shell topbar__in">
        <Brand/>
        <div className="topbar__right">
          <a className="toplink" href="#">About</a>
          <a className="toplink" href="#">Sign in</a>
          <CitySelect/>
        </div>
      </div>
    </header>
    <div className="banner shell">
      <div className="banner__plate">
        <img className="banner__img" src="assets/tallinn-overview.svg" alt=""/>
      </div>
    </div>
    <nav className="tabs shell" aria-label="Primary">
      <div className="tabs__row">
        {TABS.map(t => (
          <a key={t.id} className={'tabs__item' + (t.id===active ? ' tabs__item--on' : '')} href="#">
            {t.icon}<span>{t.label}</span>
          </a>
        ))}
        {aside ? <span className="tabs__aside">{aside}</span> : null}
      </div>
    </nav>
  </React.Fragment>
);

// ── Mobile chrome ────────────────────────────────────────────
const MobTopbar = () => (
  <header className="topbar">
    <div className="shell topbar__in">
      <Brand/>
      <div className="topbar__right"><CitySelect/></div>
    </div>
  </header>
);

const MobBanner = () => (
  <div className="banner shell">
    <div className="banner__plate">
      <img className="banner__img" src="assets/tallinn-overview.svg" alt=""/>
    </div>
  </div>
);

const Dock = ({active}) => (
  <nav className="dock" aria-label="Primary">
    {TABS.map(t => (
      <a key={t.id} className={'dock__item' + (t.id===active ? ' dock__item--on' : '')} href="#">
        {t.icon}<span className="dock__label">{t.label}</span>
      </a>
    ))}
  </nav>
);

const Colophon = () => (
  <footer className="colophon">
    <div className="shell colophon__in">
      <span><a href="#">About</a> · WanderAlt · Tallinn edition</span>
      <span>A curator vouched for every pick. AI is the index, not the editor.</span>
    </div>
  </footer>
);

Object.assign(window, {
  Ic, IDoc, ISearch, IBookmark, IUser, IChevD, IArrowR, IArrowL, IPlus, IMinus,
  ILocate, ISpark, IMap, IRepo, IMail, IShuffle,
  Brand, CitySelect, DeskChrome, MobTopbar, MobBanner, Dock, Colophon, TABS,
});
