// MSO 모바일 — 인사·재고·관리자 세부메뉴 Leaf 화면 (데이터 기반 렌더러)
// 모든 세부메뉴를 탭하면 열리는 풀 상세 화면. 스펙은 순수 데이터(LEAF), 렌더는 LeafView가 담당.

const LF_GRAD = {
  dark: 'linear-gradient(135deg,#0B0B0E,#1A1A21)',
  green: 'linear-gradient(135deg,#047857,#10B981)',
  blue: 'linear-gradient(135deg,#1D4ED8,#2563EB)',
  amber: 'linear-gradient(135deg,#B45309,#F59E0B)',
};

function LfHero({ h }) {
  return (
    <div className="msm-hero" style={{ background: LF_GRAD[h.tone] || LF_GRAD.blue }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.72)' }}>{h.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 7, position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 30, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{h.big}</div>
        {h.unit && <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{h.unit}</div>}
      </div>
      {h.sub && <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 3 }}>{h.sub}</div>}
    </div>
  );
}

function LfKpis({ kpis }) {
  return (
    <div className="mm-kpis">
      {kpis.map((k, i) => {
        const t = msmTone(k[1]);
        return (
          <div key={i} className="mm-kpi">
            <span className="ic" style={{ background: t.bg, color: t.fg }}><Icon name={k[0]} size={16} /></span>
            <div className="info"><div className="lbl">{k[2]}</div><div className="sub">{k[3]}</div></div>
            <div className="v" style={{ color: k[6] ? msmTone(k[1]).fg : undefined }}>{k[4]}{k[5] && <small>{k[5]}</small>}</div>
          </div>
        );
      })}
    </div>
  );
}

function LfStat({ sec, stat }) {
  return (
    <>
      {sec && <div className="msm-sec"><span className="msm-sec-t">{sec}</span></div>}
      <div className="msm-stat2">
        {stat.map((s, i) => <div key={i} className="msm-statcard"><div className="v" style={{ color: s[2] ? msmTone(s[2]).fg : undefined }}>{s[0]}</div><div className="l">{s[1]}</div></div>)}
      </div>
    </>
  );
}

function LfSecHead({ sec, more }) {
  if (!sec) return null;
  return <div className="msm-sec"><span className="msm-sec-t">{sec}</span>{more && <span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>{more}</span>}</div>;
}

function LfList({ sec, more, list, onOpen }) {
  return (
    <>
      <LfSecHead sec={sec} more={more} />
      <div className="msm-list">
        {list.map((r, i) => {
          const t = msmTone(r.tone || 'muted');
          const lead = r.av
            ? <span className="org-pic sm" style={{ background: avTone(r.av) }}>{r.av[0]}</span>
            : <span className="lead" style={{ background: t.bg, color: t.fg }}><Icon name={r.ic || 'fileText'} size={18} /></span>;
          const meta = (
            <div className="meta">
              {r.val && (r.vBadge
                ? <span className={'msm-badge ' + (r.vTone || 'muted')}>{r.val}</span>
                : <span className="msm-row-val" style={{ fontSize: 13, fontWeight: 800 }}>{r.val}</span>)}
              {r.time && <span className="time" style={{ fontFeatureSettings: '"tnum"' }}>{r.time}</span>}
              {r.nav && <Icon name="chevR" size={16} color="var(--z-300)" />}
            </div>
          );
          const inner = (
            <>
              {lead}
              <div className="main">
                <div className="nm" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'normal' }}>{r.nm}{r.badge && <span className={'msm-badge ' + (r.bt || 'muted')} style={{ fontSize: 10 }}>{r.badge}</span>}</div>
                {r.sub && <div className="sub" style={{ whiteSpace: 'normal' }}>{r.sub}</div>}
              </div>
              {meta}
            </>
          );
          return r.nav && onOpen
            ? <button key={i} className="msm-row" style={{ alignItems: 'flex-start' }} onClick={() => onOpen(r.nav, r.params)}>{inner}</button>
            : <div key={i} className="msm-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>{inner}</div>;
        })}
      </div>
    </>
  );
}

function LfTable({ sec, more, cols, rows, w }) {
  const grid = w || ('1.4fr ' + cols.slice(1).map(() => '1fr').join(' '));
  return (
    <>
      <LfSecHead sec={sec} more={more} />
      <div className="lf-table">
        <div className="lf-tr lf-head" style={{ gridTemplateColumns: grid }}>{cols.map((c, i) => <span key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>)}</div>
        {rows.map((r, i) => (
          <div key={i} className="lf-tr" style={{ gridTemplateColumns: grid }}>
            {r.map((c, j) => {
              if (c && typeof c === 'object') return <span key={j} style={{ textAlign: 'right' }}><span className={'msm-badge ' + (c.bt || 'muted')}>{c.v}</span></span>;
              return <span key={j} style={{ textAlign: j === 0 ? 'left' : 'right', color: j === 0 ? 'var(--z-800)' : 'var(--z-600)' }}>{c}</span>;
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function LfProg({ sec, more, prog }) {
  return (
    <>
      <LfSecHead sec={sec} more={more} />
      <div className="msm-list">
        {prog.map((r, i) => (
          <div key={i} className="dc-row">
            <div className="dc-row-top">
              <span className="lead" style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-700)', display: 'grid', placeItems: 'center' }}><Icon name={r.ic || 'bar'} size={15} /></span>
              <span className="dc-row-nm" style={{ fontSize: 14 }}>{r.nm}</span>
              <span className={'msm-badge ' + (r.bt || 'muted')} style={{ marginLeft: 'auto' }}>{r.sub || (r.p + '%')}</span>
            </div>
            <div className="msm-prog"><i className={r.p >= 100 ? 'success' : r.p > 0 ? (r.bt === 'danger' ? 'danger' : 'warn') : 'danger'} style={{ width: Math.max(r.p, 2) + '%' }} /></div>
          </div>
        ))}
      </div>
    </>
  );
}

function LfNote({ note }) {
  const t = msmTone(note.tone || 'warn');
  return (
    <div className="lf-callout" style={{ background: t.bg, border: '1px solid ' + (note.tone === 'danger' ? '#FBD3D3' : note.tone === 'success' ? '#BBF0D6' : '#FDE9C8') }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: '#fff', color: t.fg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon name={note.ic || 'alertTri'} size={18} /></span>
      <div><div style={{ fontSize: 14, fontWeight: 800, color: t.fg }}>{note.t}</div>{note.s && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--z-600)', marginTop: 2 }}>{note.s}</div>}</div>
    </div>
  );
}

function LfChips({ chips }) {
  const [on, setOn] = React.useState(0);
  return (
    <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
      {chips.map((c, i) => <button key={i} className={'glm-chip' + (on === i ? ' on' : '')} onClick={() => setOn(i)}>{c}</button>)}
    </div>
  );
}

function LfForm({ sec, form, submit }) {
  return (
    <>
      <LfSecHead sec={sec} />
      <div className="msm-card" style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: 14 }}>
        {form.map((f, i) => (
          <div key={i} className="glm-field"><span className="lbl">{f.l}</span>
            {f.type === 'select'
              ? <select className="mm-select" style={{ width: '100%' }} defaultValue={f.v}>{(f.opts || []).map(o => <option key={o}>{o}</option>)}</select>
              : f.type === 'textarea'
                ? <textarea className="glm-textarea" placeholder={f.ph} defaultValue={f.v} />
                : <input className="glm-input" type={f.type === 'num' ? 'text' : (f.type || 'text')} placeholder={f.ph} defaultValue={f.v} />}
          </div>
        ))}
        {submit && <button className="msm-btn-lg accent" style={{ marginTop: 2 }}><Icon name={submit.ic || 'check'} size={17} /> {submit.t}</button>}
      </div>
    </>
  );
}

function LfBtns({ btns, onOpen }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {btns.map((b, i) => <button key={i} className={'msm-btn-lg' + (b.primary ? ' accent' : b.danger ? ' danger' : '')} style={{ flex: 1 }} onClick={() => b.nav && onOpen && onOpen(b.nav, b.params)}><Icon name={b.ic || 'check'} size={17} /> {b.t}</button>)}
    </div>
  );
}

// 단계형 입력 마법사 (PC 구성원 등록과 동일한 3-step 흐름)
function LfWizField({ f, val, setVal }) {
  const k = f.key || f.l;
  if (f.k === 'head') return <div className="lf-wiz-grouphead">{f.l}{f.action && <span className="lf-grp-act">{f.action}</span>}</div>;
  if (f.k === 'photo') {
    return (
      <div className="lf-photo">
        <span className="lf-photo-av"><Icon name="users" size={26} color="#fff" /></span>
        <div style={{ flex: 1, minWidth: 0 }}><div className="t">프로필 사진</div><div className="s">{f.sub || '등록 또는 정보 수정 저장 시 함께 반영됩니다.'}</div></div>
        <button className="lf-photo-btn">사진 등록</button>
      </div>
    );
  }
  if (f.k === 'summary') {
    return (
      <div className="lf-sumcard">
        <div className="lf-sum-row">
          {f.items.map((it, i) => <div key={i}><div className="l">{it[0]}</div><div className="v">{it[1]}</div></div>)}
        </div>
        {f.note && <div className="lf-sum-note">{f.note}</div>}
      </div>
    );
  }
  if (f.k === 'row') {
    return <div style={{ display: 'flex', gap: 10 }}>{f.cols.map((c, i) => <div key={i} style={{ flex: c.flex || 1, minWidth: 0 }}><LfWizField f={c} val={val} setVal={setVal} /></div>)}</div>;
  }
  if (f.k === 'cap') return <div className="lf-cap">{f.l}</div>;
  if (f.k === 'select') {
    return (
      <div className="glm-field"><span className="lbl">{f.l}{f.req && <span style={{ color: 'var(--danger)' }}> *</span>}</span>
        <select className="mm-select" style={{ width: '100%' }} value={val[k] !== undefined ? val[k] : f.v} onChange={e => setVal(k, e.target.value)}>{f.opts.map(o => <option key={o}>{o}</option>)}</select>
      </div>
    );
  }
  if (f.k === 'multiselect') {
    const sel = val[k] || f.v || [];
    const remaining = f.opts.filter(o => sel.indexOf(o) < 0);
    return (
      <div className="glm-field"><span className="lbl">{f.l}{f.sub && <span style={{ fontWeight: 600, color: 'var(--z-400)', marginLeft: 6 }}>{f.sub}</span>}</span>
        <select className="mm-select" style={{ width: '100%' }} value="" onChange={e => { if (e.target.value) setVal(k, sel.concat([e.target.value])); }}>
          <option value="">＋ {f.l} 추가</option>
          {remaining.map(o => <option key={o}>{o}</option>)}
        </select>
        {sel.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{sel.map(o => <span key={o} className="glm-kwtag">{o}<button onClick={() => setVal(k, sel.filter(x => x !== o))}><Icon name="x" size={11} /></button></span>)}</div>}
      </div>
    );
  }
  if (f.k === 'toggle') {
    const on = val[k] !== undefined ? val[k] : !!f.v;
    return (
      <button className="lf-tgl-row" onClick={() => setVal(k, !on)}>
        <span className="t">{f.l}{f.sub && <span className="s">{f.sub}</span>}</span>
        <span className={'lf-switch' + (on ? ' on' : '')}><i /></span>
      </button>
    );
  }
  if (f.k === 'seg') {
    return (
      <div className="glm-field"><span className="lbl">{f.l}{f.sub && <span style={{ fontWeight: 600, color: 'var(--z-400)', marginLeft: 6 }}>{f.sub}</span>}</span>
        <div className="mm-seg">{f.opts.map(o => <button key={o} className={(val[k] || f.v) === o ? 'on' : ''} onClick={() => setVal(k, o)}>{o}</button>)}</div>
      </div>
    );
  }
  if (f.k === 'chips') {
    return (
      <div className="glm-field"><span className="lbl">{f.l}</span>
        <div className="glm-chiprow" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{f.opts.map(o => <button key={o} className={'glm-chip' + ((val[k] || f.v) === o ? ' on' : '')} onClick={() => setVal(k, o)}>{o}</button>)}</div>
      </div>
    );
  }
  return (
    <div className="glm-field"><span className="lbl">{f.l}{f.req && <span style={{ color: 'var(--danger)' }}> *</span>}{f.sub && <span style={{ fontWeight: 600, color: 'var(--z-400)', marginLeft: 6 }}>{f.sub}</span>}</span>
      {f.k === 'textarea'
        ? <textarea className="glm-textarea" placeholder={f.ph} />
        : <input className="glm-input" type={f.k === 'date' ? 'date' : f.k === 'time' ? 'time' : 'text'} inputMode={f.k === 'tel' ? 'tel' : f.k === 'num' ? 'numeric' : f.k === 'email' ? 'email' : 'text'} placeholder={f.ph} defaultValue={f.v} />}
    </div>
  );
}

function LfWizard({ wiz }) {
  const [step, setStep] = React.useState(0);
  const [val, setV] = React.useState({});
  const setVal = (k, v) => setV(s => Object.assign({}, s, { [k]: v }));
  const steps = wiz.steps;
  const s = steps[step];
  const last = steps.length - 1;
  return (
    <>
      <div className="lf-wiz-head">
        <div className="lf-wiz-dots">{steps.map((st, i) => <span key={i} className={'lf-wiz-dot' + (i < step ? ' done' : i === step ? ' on' : '')}>{i < step ? '✓' : i + 1}</span>)}</div>
        <div className="lf-wiz-title">{step + 1}/{steps.length} · {s.title}</div>
        {s.sub && <div className="lf-wiz-sub">{s.sub}</div>}
      </div>
      {(s.fields || []).map((f, i) => <LfWizField key={step + '-' + i} f={f} val={val} setVal={setVal} />)}
      {s.roles && (
        <div className="msm-list">
          {s.roles.map(r => {
            const on = (val._auth || s.roles[0].id) === r.id;
            return (
              <button key={r.id} className="msm-row" style={{ alignItems: 'flex-start', borderColor: on ? 'var(--accent)' : undefined, background: on ? 'var(--accent-tint)' : undefined }} onClick={() => setVal('_auth', r.id)}>
                <span style={{ width: 22, height: 22, borderRadius: 999, flex: '0 0 auto', marginTop: 1, border: '2px solid ' + (on ? 'var(--accent)' : 'var(--border-strong)'), background: on ? 'var(--accent)' : '#fff', display: 'grid', placeItems: 'center' }}>{on && <Icon name="check" size={12} color="#fff" />}</span>
                <div className="main"><div className="nm">{r.t}{r.tone && <span className={'msm-badge ' + r.tone} style={{ fontSize: 10 }}>{r.tag || r.t}</span>}</div><div className="sub" style={{ whiteSpace: 'normal' }}>{r.d}</div></div>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {step > 0 && <button className="msm-btn-lg" style={{ flex: 1 }} onClick={() => setStep(step - 1)}><Icon name="chevL" size={16} /> 이전</button>}
        {step < last
          ? <button className="msm-btn-lg accent" style={{ flex: 2 }} onClick={() => setStep(step + 1)}>다음 <Icon name="chevR" size={16} /></button>
          : <button className="msm-btn-lg accent" style={{ flex: 2 }}><Icon name="check" size={17} /> {wiz.submit || '등록'}</button>}
      </div>
    </>
  );
}

function LfCal({ cal }) {
  const hol = cal.holidays || [];
  return (
    <>
      <LfSecHead sec={cal.sec || '근태달력 · 2026년 5월'} />
      <div className="wn-monthcal">
        <div className="mm-cal" style={{ marginBottom: 4 }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => <div key={d} className={'mm-cal-h' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{d}</div>)}
        </div>
        <div className="mm-cal">
          {[...Array(5)].map((_, i) => <div key={'e' + i} className="wn-mc-d empty" />)}
          {[...Array(31)].map((_, idx) => {
            const d = idx + 1; const wd = new Date(2026, 4, d).getDay();
            const holiday = hol.includes(d); const today = d === 12;
            return (
              <div key={d} className={'wn-mc-d' + (today ? ' today sel' : '') + (wd === 0 || holiday ? ' sun' : '') + (wd === 6 ? ' sat' : '')}>
                <span className="dn">{d}</span>
                {holiday ? <span className="cn" style={{ color: 'var(--danger)' }}>휴일</span> : (wd !== 0 && wd !== 6) ? <span className="cn">{cal.mark || '근무'}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function LfShift({ sec, shift }) {
  return (
    <>
      <LfSecHead sec={sec} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shift.map((g, i) => (
          <div key={i} className={'wn-shiftcard b-' + g.bt}>
            <div className="wn-sc-head">
              <div><span className={'wn-band-badge b-' + g.bt}>{g.b}</span><div className="wn-sc-time" style={{ marginTop: 4 }}>{g.t}</div></div>
              <span className="wn-count">{g.n}명</span>
            </div>
            <div className="wn-staffs" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {g.staff.map(n => <div key={n} className="wn-staff" style={{ textAlign: 'center', padding: '7px 4px' }}><span className="org-pic sm" style={{ background: avTone(n), margin: '0 auto 4px' }}>{n[0]}</span><div style={{ fontSize: 11, fontWeight: 700 }}>{n}</div></div>)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function LfCap({ cap }) { return <div className="lf-cap">{cap}</div>; }

// 라벨-값 명세 행 (공제 항목·급여 항목 등)
function LfKV({ sec, more, kv }) {
  return (
    <>
      <LfSecHead sec={sec} more={more} />
      <div className="lf-kv">
        {kv.map((r, i) => (
          <div key={i} className={'lf-kv-row' + (r.strong ? ' strong' : '')}>
            <span className="l">{r.l}{r.note && <span className="n">{r.note}</span>}</span>
            <span className={'v' + (r.tone ? ' ' + r.tone : '')}>{r.v}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function LfProfile({ p }) {
  return (
    <div className="lf-prof">
      <span className="lf-prof-av" style={{ background: avTone(p.av || p.nm) }}>{(p.av || p.nm || '?')[0]}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="lf-prof-nm">{p.nm}{p.code && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--z-400)', marginLeft: 6 }}>{p.code}</span>}</div>
        {p.role && <div className="lf-prof-role">{p.role}</div>}
        {p.chips && <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>{p.chips.map((c, i) => <span key={i} className={'msm-badge ' + (c.tone || 'muted')}>{c.t}</span>)}</div>}
      </div>
    </div>
  );
}

function LfMeta({ meta }) {
  return <div className="lf-meta">{meta.map((m, i) => <div key={i}><span className="lbl">{m[0]}</span><div className="val">{m[1]}</div></div>)}</div>;
}

function LfTimeline({ sec, timeline }) {
  return (
    <>
      <LfSecHead sec={sec} />
      <div className="lf-tl">
        {timeline.map((t, i) => (
          <div key={i} className="lf-tl-row">
            <span className="lf-tl-dot" style={{ background: msmTone(t.tone || 'accent').fg }} />
            <div><b style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-800)', fontFeatureSettings: '"tnum"' }}>{t.d}</b><div className="sub" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--z-500)', marginTop: 1 }}>{t.t}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}

function LeafBlocks({ blocks, onOpen }) {
  return (
    <>
      {(blocks || []).map((b, i) => {
        if (b.hero) return <LfHero key={i} h={b.hero} />;
        if (b.kpis) return <LfKpis key={i} kpis={b.kpis} />;
        if (b.stat) return <LfStat key={i} sec={b.sec} stat={b.stat} />;
        if (b.list) return <LfList key={i} sec={b.sec} more={b.more} list={b.list} onOpen={onOpen} />;
        if (b.table) return <LfTable key={i} sec={b.sec} more={b.more} cols={b.cols} rows={b.table} w={b.w} />;
        if (b.prog) return <LfProg key={i} sec={b.sec} more={b.more} prog={b.prog} />;
        if (b.note) return <LfNote key={i} note={b.note} />;
        if (b.chips) return <LfChips key={i} chips={b.chips} />;
        if (b.form) return <LfForm key={i} sec={b.sec} form={b.form} submit={b.submit} />;
        if (b.wizard) return <LfWizard key={i} wiz={b.wizard} />;
        if (b.cal) return <LfCal key={i} cal={b.cal} />;
        if (b.shift) return <LfShift key={i} sec={b.sec} shift={b.shift} />;
        if (b.profile) return <LfProfile key={i} p={b.profile} />;
        if (b.meta) return <LfMeta key={i} meta={b.meta} />;
        if (b.timeline) return <LfTimeline key={i} sec={b.sec} timeline={b.timeline} />;
        if (b.btns) return <LfBtns key={i} btns={b.btns} onOpen={onOpen} />;
        if (b.cap) return <LfCap key={i} cap={b.cap} />;
        if (b.kv) return <LfKV key={i} sec={b.sec} more={b.more} kv={b.kv} />;
        if (b.sec) return <LfSecHead key={i} sec={b.sec} more={b.more} />;
        return null;
      })}
    </>
  );
}

function LeafView({ id, params, onOpen }) {
  const spec = (window.LEAF || {})[id];
  const [tab, setTab] = React.useState(0);
  React.useEffect(() => { setTab(0); }, [id]);
  if (!spec) return <div className="msm-empty"><Icon name="fileText" size={26} />준비 중인 화면입니다.</div>;
  if (spec.tabs) {
    const t = spec.tabs[tab] || spec.tabs[0];
    return (
      <>
        <div className="lf-tabs">
          {spec.tabs.map((tb, i) => (
            <button key={i} className={'lf-tab' + (i === tab ? ' on' : '')} onClick={() => setTab(i)}>{tb.label}{tb.cnt != null && <span className="cnt">{tb.cnt}</span>}</button>
          ))}
        </div>
        <LeafBlocks blocks={t.blocks} onOpen={onOpen} />
      </>
    );
  }
  const blocks = spec.blocks || (spec.build ? spec.build(params || {}) : []);
  return <LeafBlocks blocks={blocks} onOpen={onOpen} />;
}

// 다단계 네비게이션 스택 (리스트 → 상세 → 폼)
function useLeafStack() {
  const [stack, setStack] = React.useState([]);
  const open = (id, params) => {
    const title = (params && params._title) || leafTitle(id) || ((window.LEAF || {})[id] && (window.LEAF || {})[id].title) || '';
    setStack(s => [...s, { id, params, title }]);
  };
  const back = () => setStack(s => s.slice(0, -1));
  return { stack, open, back, top: stack[stack.length - 1] || null };
}

// 그룹 트리 허브 렌더러 (세부메뉴 전부 노출)
function LeafHub({ tree, onOpen }) {
  return (
    <>
      {tree.map(g => (
        <React.Fragment key={g.group}>
          <div className="msm-sec"><span className="msm-sec-t">{g.group}</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>{g.items.length}</span></div>
          <div className="msm-list">
            {g.items.map(m => {
              const t = msmTone(m.tone);
              return (
                <button key={m.id} className="msm-row" onClick={() => onOpen(m.id)}>
                  <span className="lead" style={{ background: t.bg, color: t.fg }}><Icon name={m.icon} size={18} /></span>
                  <div className="main"><div className="nm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{m.label}{m.badge && <span className={'msm-badge ' + (m.bt || 'warn')} style={{ fontSize: 10 }}>{m.badge}</span>}</div>{m.sub && <div className="sub">{m.sub}</div>}</div>
                  <Icon name="chevR" size={16} color="var(--z-300)" />
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </>
  );
}

function leafTitle(id) {
  const trees = [window.HR_TREE, window.STOCK_TREE, window.ADMIN_TREE];
  for (const tr of trees) for (const g of (tr || [])) for (const it of g.items) if (it.id === id) return it.label;
  return '';
}

Object.assign(window, { LeafView, LeafBlocks, LeafHub, leafTitle, useLeafStack });
