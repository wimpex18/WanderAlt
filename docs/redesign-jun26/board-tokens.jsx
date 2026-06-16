// Board 0 — the shape language itself, as a reference sheet
const TokensBoard = () => (
  <div className="wa" style={{padding:'36px 40px', overflow:'auto'}}>
    <div className="eyebrow" style={{marginBottom:6}}>WanderAlt · Shape language · June 2026</div>
    <h2 style={{fontFamily:'var(--serif)', fontStyle:'italic', fontSize:34, fontWeight:400, marginBottom:28}}>Plate &amp; Rule</h2>

    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'28px 36px'}}>
      <section>
        <div className="meta" style={{marginBottom:14}}><b>Buttons</b> — one family, 8px radius, 52px tall</div>
        <div style={{display:'flex', flexWrap:'wrap', gap:12, alignItems:'center'}}>
          <button className="btn btn--primary" type="button">I'm going<IArrowR/></button>
          <button className="btn btn--secondary" type="button"><IShuffle/>Surprise me</button>
          <button className="btn btn--quiet" type="button"><IBookmark/>Save</button>
          <button className="btn btn--petrol btn--sm" type="button">Subscribe</button>
        </div>
        <div style={{marginTop:16}}>
          <a className="linkact" href="#">Browse all this week<IArrowR/></a>
        </div>
      </section>

      <section>
        <div className="meta" style={{marginBottom:14}}><b>Chips &amp; tags</b> — 8px controls, 4px tags. The 999px pill is retired.</div>
        <div style={{display:'flex', flexWrap:'wrap', gap:10, alignItems:'center'}}>
          <button className="chip chip--facet" type="button">Telliskivi</button>
          <button className="chip chip--on" type="button">Cinema</button>
          <button className="chip" type="button">Live music</button>
          <span className="tag tag--live">Tonight</span>
          <span className="tag tag--ghost">35mm</span>
        </div>
        <div style={{display:'flex', gap:12, marginTop:16, alignItems:'center'}}>
          <div className="seg">
            <button className="seg__tab seg__tab--on" type="button">This week <span className="seg__count">24</span></button>
            <button className="seg__tab" type="button">All events</button>
            <button className="seg__tab" type="button">Venues</button>
          </div>
        </div>
      </section>

      <section>
        <div className="meta" style={{marginBottom:14}}><b>Type ladder</b> — Geist UI · DM Serif voice · Geist Mono data</div>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          <span style={{fontSize:40, fontWeight:650, letterSpacing:'-.022em', lineHeight:1.05}}>Headline 40/650</span>
          <span style={{fontFamily:'var(--serif)', fontStyle:'italic', fontSize:26, color:'var(--ink-soft)'}}>Curator voice — always serif, always italic.</span>
          <span style={{fontSize:16.5, color:'var(--ink-soft)'}}>Body 16.5 — Geist regular, 1.5 leading.</span>
          <span className="meta">META 12.5 MONO · <b>COLUMN · ISSUE 1</b> · <span className="handle">@sigmundtells</span></span>
        </div>
      </section>

      <section>
        <div className="meta" style={{marginBottom:14}}><b>Radius vocabulary</b> — 4 · 8 · 12. Nothing else ships.</div>
        <div style={{display:'flex', gap:14, alignItems:'flex-end'}}>
          {[['4px','tags'],['8px','controls'],['12px','plates']].map(([r,l]) => (
            <div key={r} style={{textAlign:'center'}}>
              <div style={{width:86, height:64, border:'1.5px solid var(--ink)', borderRadius:r, background:'var(--paper-deep)', display:'grid', placeItems:'center', fontFamily:'var(--mono)', fontSize:13}}>{r}</div>
              <div className="meta" style={{marginTop:8}}>{l}</div>
            </div>
          ))}
          <div style={{flex:1}}></div>
          <div style={{display:'flex', gap:8}}>
            {[['var(--ink)','ink'],['var(--petrol)','petrol'],['var(--lime)','lime'],['var(--cream)','cream']].map(([c,l]) => (
              <div key={l} style={{textAlign:'center'}}>
                <div style={{width:52, height:52, borderRadius:8, background:c, border:'1px solid var(--rule)'}}></div>
                <div className="meta" style={{marginTop:8, fontSize:10.5}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{gridColumn:'1 / -1'}}>
        <div className="meta" style={{marginBottom:14}}><b>Inputs &amp; fields</b></div>
        <div style={{display:'flex', gap:12, maxWidth:680}}>
          <label className="field" style={{flex:1}}>
            <ISearch/>
            <input className="field__input" placeholder="Search events, venues, curators…" defaultValue=""/>
          </label>
          <button className="btn btn--primary" type="button">Search</button>
        </div>
      </section>
    </div>
  </div>
);
window.TokensBoard = TokensBoard;
