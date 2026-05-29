/* ===========================================================
   이모티콘 파라메트릭 페이스 엔진 v2 — "사람답게"
   머리비율 축소 + 헤어스타일 + 목/상반신 유니폼
   buildEmoticonSVG(def) -> SVG 문자열
   =========================================================== */
(function () {
  const C = {
    line: "#42424f",
    skin: "#ffd9b8",
    cheek: "#ff9fb0",
    white: "#ffffff",
    mouth: "#c9566a",
    tongue: "#ff8fa3",
    // office uniform
    suit: "#5e6f96",     // 남색 정장
    suit2: "#7c8cb3",
    shirt: "#cfe0ff",
    tie: "#d96b7c",
    // medical uniform
    scrub: "#56c2a8",    // 청록 수술복
    scrub2: "#7ad3bd",
    coat: "#ffffff",     // 흰 가운
    mint: "#8fd8c4",
    cross: "#ff7a7a",
    coffee: "#c98a5e",
    // fx
    sweat: "#7ec8f0", tear: "#8fd2f4", steam: "#ff9a9a",
    spark: "#ffd166", moon: "#ffe39a", money: "#7fd59a",
  };
  const ST = C.line;
  const HAIRC = { dark:"#3c3540", brown:"#6b4f3a", lbrown:"#8a6648", auburn:"#79483a", gray:"#9b9099", soft:"#5a4636" };
  const SKIN = { a:"#ffe0c2", b:"#f7c9a3", c:"#e8b389", d:"#ffd2b0" };

  // ---- 좌표 (사람 비율) ----
  const CX = 50, CYH = 39, R = 24;      // 머리
  const LX = 41, RX = 59, EY = 40;      // 눈
  const MY = 52;                        // 입

  // ===== 헬퍼 도형 =====
  function heart(cx, cy, s, fill) {
    return `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 2 C-1.3 -1.4 -5 -0.8 -5 2 C-5 4.7 -1.6 6.2 0 8.2 C1.6 6.2 5 4.7 5 2 C5 -0.8 1.3 -1.4 0 2 Z" fill="${fill}"/>`;
  }
  function star(cx, cy, s, fill) {
    const p = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      p.push([Math.cos(a) * s, Math.sin(a) * s]);
      const a2 = a + Math.PI / 5;
      p.push([Math.cos(a2) * s * 0.45, Math.sin(a2) * s * 0.45]);
    }
    return `<polygon transform="translate(${cx} ${cy})" points="${p.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="${fill}"/>`;
  }
  function sparkle(cx, cy, s, fill) {
    return `<path transform="translate(${cx} ${cy})" d="M0 ${-s} C0 ${-s*0.3} ${s*0.3} 0 ${s} 0 C${s*0.3} 0 0 ${s*0.3} 0 ${s} C0 ${s*0.3} ${-s*0.3} 0 ${-s} 0 C${-s*0.3} 0 0 ${-s*0.3} 0 ${-s} Z" fill="${fill}"/>`;
  }
  function drop(cx, cy, s, fill) {
    return `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 -5 C2.8 -1 3 1 3 2.4 A3 3 0 1 1 -3 2.4 C-3 1 -2.8 -1 0 -5 Z" fill="${fill}"/>`;
  }

  // ===== 눈 =====
  function eyes(type) {
    const dot = (x) => `<circle cx="${x}" cy="${EY}" r="3" fill="${ST}"/>`;
    const shine = (x) => `<circle cx="${x + 1}" cy="${EY - 1.2}" r="0.9" fill="#fff"/>`;
    switch (type) {
      case "dot": return dot(LX) + dot(RX);
      case "shine":
        return `<circle cx="${LX}" cy="${EY}" r="4.4" fill="${ST}"/>${shine(LX)}<circle cx="${RX}" cy="${EY}" r="4.4" fill="${ST}"/>${shine(RX)}`;
      case "happy":
        return arc(LX, "up") + arc(RX, "up");
      case "smile":
        return arc(LX, "down") + arc(RX, "down");
      case "sleepy":
        return `<path d="M${LX-4.5} ${EY} Q${LX} ${EY+2.2} ${LX+4.5} ${EY}" stroke="${ST}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
               `<path d="M${RX-4.5} ${EY} Q${RX} ${EY+2.2} ${RX+4.5} ${EY}" stroke="${ST}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
      case "wide":
        return `<circle cx="${LX}" cy="${EY}" r="5.3" fill="#fff" stroke="${ST}" stroke-width="1.5"/><circle cx="${LX}" cy="${EY+0.4}" r="2.4" fill="${ST}"/>` +
               `<circle cx="${RX}" cy="${EY}" r="5.3" fill="#fff" stroke="${ST}" stroke-width="1.5"/><circle cx="${RX}" cy="${EY+0.4}" r="2.4" fill="${ST}"/>`;
      case "x":
        return `<g stroke="${ST}" stroke-width="2.4" stroke-linecap="round">` +
               `<path d="M${LX-3.6} ${EY-3.6} L${LX+3.6} ${EY+3.6}M${LX+3.6} ${EY-3.6} L${LX-3.6} ${EY+3.6}"/>` +
               `<path d="M${RX-3.6} ${EY-3.6} L${RX+3.6} ${EY+3.6}M${RX+3.6} ${EY-3.6} L${RX-3.6} ${EY+3.6}"/></g>`;
      case "dizzy":
        const sp = (cx) => `<path d="M${cx} ${EY} m-4 0 a4 4 0 1 1 8 0 a2.7 2.7 0 1 1 -5.4 0 a1.5 1.5 0 1 1 3 0" stroke="${ST}" stroke-width="1.6" fill="none"/>`;
        return sp(LX) + sp(RX);
      case "star": return star(LX, EY, 4.8, C.spark) + star(RX, EY, 4.8, C.spark);
      case "heart": return heart(LX, EY-2.5, 0.85, C.cheek) + heart(RX, EY-2.5, 0.85, C.cheek);
      case "money":
        return `<g font-family="monospace" font-weight="700" font-size="8" fill="${C.money}" text-anchor="middle">` +
               `<text x="${LX}" y="${EY+3}">\u20a9</text><text x="${RX}" y="${EY+3}">\u20a9</text></g>`;
      case "wink": return arc(LX, "up") + dot(RX) + shine(RX);
      case "cry":
        return `<path d="M${LX-4.5} ${EY-1.5} Q${LX} ${EY+3.5} ${LX+4.5} ${EY-1.5}" stroke="${ST}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
               `<path d="M${RX-4.5} ${EY-1.5} Q${RX} ${EY+3.5} ${RX+4.5} ${EY-1.5}" stroke="${ST}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      case "angry": return `<circle cx="${LX}" cy="${EY+1}" r="2.9" fill="${ST}"/><circle cx="${RX}" cy="${EY+1}" r="2.9" fill="${ST}"/>`;
      case "side":
        return `<ellipse cx="${LX}" cy="${EY}" rx="4.4" ry="3.8" fill="#fff" stroke="${ST}" stroke-width="1.3"/><circle cx="${LX+2.2}" cy="${EY}" r="2.1" fill="${ST}"/>` +
               `<ellipse cx="${RX}" cy="${EY}" rx="4.4" ry="3.8" fill="#fff" stroke="${ST}" stroke-width="1.3"/><circle cx="${RX+2.2}" cy="${EY}" r="2.1" fill="${ST}"/>`;
      case "blank": return `<circle cx="${LX}" cy="${EY}" r="2.1" fill="${ST}"/><circle cx="${RX}" cy="${EY}" r="2.1" fill="${ST}"/>`;
      default: return dot(LX) + dot(RX);
    }
  }
  function arc(cx, dir) {
    if (dir === "up")
      return `<path d="M${cx-4.5} ${EY+1} Q${cx} ${EY-4.5} ${cx+4.5} ${EY+1}" stroke="${ST}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    return `<path d="M${cx-4.5} ${EY-1} Q${cx} ${EY+4} ${cx+4.5} ${EY-1}" stroke="${ST}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  }

  // ===== 눈썹 =====
  function brow(type) {
    if (!type || type === "none") return "";
    const y = EY - 8;
    switch (type) {
      case "angry":
        return `<path d="M${LX-5} ${y-1} L${LX+4} ${y+2}" stroke="${ST}" stroke-width="2.2" stroke-linecap="round"/>` +
               `<path d="M${RX+5} ${y-1} L${RX-4} ${y+2}" stroke="${ST}" stroke-width="2.2" stroke-linecap="round"/>`;
      case "worried":
        return `<path d="M${LX-4} ${y+1} L${LX+4} ${y-1}" stroke="${ST}" stroke-width="2" stroke-linecap="round"/>` +
               `<path d="M${RX+4} ${y+1} L${RX-4} ${y-1}" stroke="${ST}" stroke-width="2" stroke-linecap="round"/>`;
      case "raised":
        return `<path d="M${LX-4} ${y} Q${LX} ${y-3} ${LX+4} ${y}" stroke="${ST}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
               `<path d="M${RX-4} ${y} Q${RX} ${y-3} ${RX+4} ${y}" stroke="${ST}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      case "flat":
        return `<path d="M${LX-4} ${y} H${LX+4}" stroke="${ST}" stroke-width="2" stroke-linecap="round"/>` +
               `<path d="M${RX-4} ${y} H${RX+4}" stroke="${ST}" stroke-width="2" stroke-linecap="round"/>`;
      default: return "";
    }
  }

  // ===== 입 =====
  function mouth(type) {
    switch (type) {
      case "none": return "";
      case "smile": return `<path d="M${CX-6.5} ${MY} Q${CX} ${MY+6} ${CX+6.5} ${MY}" stroke="${ST}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
      case "small": return `<path d="M${CX-3.5} ${MY} Q${CX} ${MY+3} ${CX+3.5} ${MY}" stroke="${ST}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      case "bigsmile":
        return `<path d="M${CX-8} ${MY-1} Q${CX} ${MY+10} ${CX+8} ${MY-1} Z" fill="${C.mouth}" stroke="${ST}" stroke-width="1.5" stroke-linejoin="round"/>` +
               `<path d="M${CX-4.5} ${MY+4} Q${CX} ${MY+7.5} ${CX+4.5} ${MY+4}" fill="${C.tongue}"/>`;
      case "grin":
        return `<path d="M${CX-7} ${MY} Q${CX} ${MY+7} ${CX+7} ${MY} Z" fill="#fff" stroke="${ST}" stroke-width="1.6" stroke-linejoin="round"/>` +
               `<path d="M${CX-7} ${MY+0.4} H${CX+7}" stroke="${ST}" stroke-width="1.2"/>`;
      case "open": return `<ellipse cx="${CX}" cy="${MY+1.5}" rx="4" ry="5.5" fill="${C.mouth}"/>`;
      case "gasp": return `<ellipse cx="${CX}" cy="${MY+1.5}" rx="5.2" ry="7" fill="${C.mouth}"/>`;
      case "frown": return `<path d="M${CX-6.5} ${MY+4} Q${CX} ${MY-2} ${CX+6.5} ${MY+4}" stroke="${ST}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
      case "flat": return `<path d="M${CX-5.5} ${MY+1} H${CX+5.5}" stroke="${ST}" stroke-width="2.2" stroke-linecap="round"/>`;
      case "wavy": return `<path d="M${CX-7} ${MY} q2.4 -3.5 3.6 0 t3.6 0 t3.6 0" stroke="${ST}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      case "smallo": return `<circle cx="${CX}" cy="${MY+0.5}" r="2.6" fill="${C.mouth}"/>`;
      case "cat": return `<path d="M${CX-6} ${MY} q3 4 6 0 q3 4 6 0" stroke="${ST}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      case "tongue":
        return `<path d="M${CX-6.5} ${MY} Q${CX} ${MY+6} ${CX+6.5} ${MY}" stroke="${ST}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
               `<path d="M${CX+0.5} ${MY+3} q3.5 1 2.5 5 q-3.5 1 -4.5 -2.5 Z" fill="${C.tongue}"/>`;
      case "yawn": return `<ellipse cx="${CX}" cy="${MY+2.5}" rx="5" ry="7.5" fill="${C.mouth}"/><ellipse cx="${CX}" cy="${MY+6}" rx="2.5" ry="2.5" fill="${C.tongue}"/>`;
      case "gritted":
        return `<rect x="${CX-7.5}" y="${MY-1}" width="15" height="6" rx="2" fill="#fff" stroke="${ST}" stroke-width="1.5"/>` +
               `<path d="M${CX-7.5} ${MY+2} H${CX+7.5}M${CX-3.5} ${MY-1} V${MY+5}M${CX} ${MY-1} V${MY+5}M${CX+3.5} ${MY-1} V${MY+5}" stroke="${ST}" stroke-width="1"/>`;
      case "smirk": return `<path d="M${CX-6} ${MY+2.5} Q${CX} ${MY+4} ${CX+7} ${MY-2}" stroke="${ST}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
      default: return `<path d="M${CX-6.5} ${MY} Q${CX} ${MY+6} ${CX+6.5} ${MY}" stroke="${ST}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    }
  }

  function blush() {
    return `<ellipse cx="${LX-5.5}" cy="${MY-3}" rx="3.8" ry="2.5" fill="${C.cheek}" opacity="0.5"/>` +
           `<ellipse cx="${RX+5.5}" cy="${MY-3}" rx="3.8" ry="2.5" fill="${C.cheek}" opacity="0.5"/>`;
  }

  // ===== 헤어스타일 =====
  function hair(style, col) {
    const h = HAIRC[col] || HAIRC.brown;
    const top = CYH - R;        // 머리 꼭대기 y (=15)
    switch (style) {
      case "short":
        return `<path d="M${CX-R} ${CYH+5} Q${CX-R-1} ${top-1} ${CX} ${top-2} Q${CX+R+1} ${top-1} ${CX+R} ${CYH+5} Q${CX+R-3} ${CYH-14} ${CX+11} ${CYH-15} Q${CX} ${CYH-12} ${CX-11} ${CYH-15} Q${CX-R+3} ${CYH-14} ${CX-R} ${CYH+5} Z" fill="${h}"/>`;
      case "sidepart":
        return `<path d="M${CX-R} ${CYH+4} Q${CX-R-1} ${top-1} ${CX} ${top-2} Q${CX+R+1} ${top-1} ${CX+R} ${CYH+4} Q${CX+R-3} ${CYH-13} ${CX+6} ${CYH-15} Q${CX-2} ${CYH-18} ${CX-9} ${CYH-12} Q${CX-14} ${CYH-9} ${CX-R} ${CYH+4} Z" fill="${h}"/>`;
      case "bob":
        return `<path d="M${CX-R-1} ${CYH+18} Q${CX-R-2} ${CYH-8} ${CX-R+2} ${top} Q${CX-12} ${top-5} ${CX} ${top-3} Q${CX+12} ${top-5} ${CX+R-2} ${top} Q${CX+R+2} ${CYH-8} ${CX+R+1} ${CYH+18} Q${CX+R-3} ${CYH+4} ${CX+R-5} ${CYH+1} Q${CX+R-4} ${CYH-13} ${CX+10} ${CYH-15} Q${CX} ${CYH-12} ${CX-10} ${CYH-15} Q${CX-R+4} ${CYH-13} ${CX-R+5} ${CYH+1} Q${CX-R+3} ${CYH+4} ${CX-R-1} ${CYH+18} Z" fill="${h}"/>`;
      case "ponytail":
        return `<path d="M${CX+R-2} ${CYH-4} q12 1 13 14 q-1 8 -8 9 q5 -10 -3 -22 Z" fill="${h}"/>` +
               `<path d="M${CX-R} ${CYH+4} Q${CX-R-1} ${top-1} ${CX} ${top-2} Q${CX+R+1} ${top-1} ${CX+R} ${CYH+4} Q${CX+R-3} ${CYH-13} ${CX+10} ${CYH-15} Q${CX} ${CYH-12} ${CX-10} ${CYH-15} Q${CX-R+3} ${CYH-13} ${CX-R} ${CYH+4} Z" fill="${h}"/>`;
      case "bun":
        return `<circle cx="${CX}" cy="${top-3}" r="6.5" fill="${h}"/>` +
               `<path d="M${CX-R} ${CYH+3} Q${CX-R-1} ${top+1} ${CX} ${top} Q${CX+R+1} ${top+1} ${CX+R} ${CYH+3} Q${CX+R-3} ${CYH-13} ${CX+10} ${CYH-15} Q${CX} ${CYH-12} ${CX-10} ${CYH-15} Q${CX-R+3} ${CYH-13} ${CX-R} ${CYH+3} Z" fill="${h}"/>`;
      case "quiff":
        return `<path d="M${CX-R} ${CYH+4} Q${CX-R-1} ${top-1} ${CX-4} ${top-3} Q${CX+2} ${top-8} ${CX+8} ${top-4} Q${CX+R+1} ${top} ${CX+R} ${CYH+4} Q${CX+R-3} ${CYH-13} ${CX+10} ${CYH-15} Q${CX} ${CYH-12} ${CX-10} ${CYH-15} Q${CX-R+3} ${CYH-13} ${CX-R} ${CYH+4} Z" fill="${h}"/>`;
      case "buzz":
        return `<path d="M${CX-R+1} ${CYH-4} Q${CX-R} ${top+1} ${CX} ${top} Q${CX+R} ${top+1} ${CX+R-1} ${CYH-4} Q${CX+R-4} ${CYH-12} ${CX} ${CYH-13} Q${CX-R+4} ${CYH-12} ${CX-R+1} ${CYH-4} Z" fill="${h}" opacity="0.9"/>`;
      case "baldsides":
        return `<path d="M${CX-R} ${CYH+6} Q${CX-R-1} ${CYH-9} ${CX-R+4} ${CYH-12} Q${CX-R+2} ${CYH-2} ${CX-R+3} ${CYH+6} Z" fill="${HAIRC.gray}"/>` +
               `<path d="M${CX+R} ${CYH+6} Q${CX+R+1} ${CYH-9} ${CX+R-4} ${CYH-12} Q${CX+R-2} ${CYH-2} ${CX+R-3} ${CYH+6} Z" fill="${HAIRC.gray}"/>`;
      case "none": return "";
      default:
        return `<path d="M${CX-R} ${CYH+5} Q${CX-R-1} ${top-1} ${CX} ${top-2} Q${CX+R+1} ${top-1} ${CX+R} ${CYH+5} Q${CX+R-3} ${CYH-14} ${CX+11} ${CYH-15} Q${CX} ${CYH-12} ${CX-11} ${CYH-15} Q${CX-R+3} ${CYH-14} ${CX-R} ${CYH+5} Z" fill="${h}"/>`;
    }
  }

  // ===== 안경 =====
  function glasses() {
    return `<g fill="none" stroke="${ST}" stroke-width="1.6">` +
      `<rect x="${LX-5}" y="${EY-4}" width="10" height="8" rx="3"/>` +
      `<rect x="${RX-5}" y="${EY-4}" width="10" height="8" rx="3"/>` +
      `<path d="M${LX+5} ${EY-1} H${RX-5}"/><path d="M${LX-5} ${EY-2} L${CX-R+2} ${EY-3}"/><path d="M${RX+5} ${EY-2} L${CX+R-2} ${EY-3}"/></g>`;
  }

  // ===== 청진기 =====
  function stethoscope() {
    return `<g fill="none" stroke="${ST}" stroke-width="2" stroke-linecap="round">` +
      `<path d="M${CX-7} ${CYH+R-3} C${CX-13} ${CYH+R+8} ${CX-10} ${CYH+R+22} ${CX-3} ${CYH+R+25}"/>` +
      `<path d="M${CX+7} ${CYH+R-3} C${CX+13} ${CYH+R+8} ${CX+10} ${CYH+R+20} ${CX+3} ${CYH+R+23}"/></g>` +
      `<circle cx="${CX}" cy="${CYH+R+25}" r="3.4" fill="${C.mint}" stroke="${ST}" stroke-width="1.6"/>`;
  }

  // ===== 유니폼(상반신) =====
  function torso(def) {
    const u = def.uniform || (def.group === "office" ? "suit" : "scrubs");
    const skin = def.face && def.face.skin ? def.face.skin : C.skin;
    const tieC = (def.face && def.face.tieColor) || C.tie;
    const sh = `M8 100 Q9 80 28 74 L40 71 Q50 81 60 71 L72 74 Q91 80 92 100 Z`; // 어깨/몸통 외곽
    let s = `<path d="${sh}" fill="${col(u)}" stroke="${ST}" stroke-width="2" stroke-linejoin="round"/>`;
    if (u === "suit") {
      s += `<path d="M40 71 Q50 81 60 71 L57 92 L43 92 Z" fill="#fff" stroke="${ST}" stroke-width="1.4" stroke-linejoin="round"/>`; // 셔츠
      s += `<path d="M41 71 L50 80 L45 86 Z" fill="#fff" stroke="${ST}" stroke-width="1.3"/>`; // 옷깃 좌
      s += `<path d="M59 71 L50 80 L55 86 Z" fill="#fff" stroke="${ST}" stroke-width="1.3"/>`; // 옷깃 우
      s += `<path d="M47 79 L50 77 L53 79 L51.5 82 L48.5 82 Z" fill="${tieC}" stroke="${ST}" stroke-width="0.8"/>`; // 넥타이 매듭
      s += `<path d="M48.5 82 L46.5 86 L50 99 L53.5 86 L51.5 82 Z" fill="${tieC}" stroke="${ST}" stroke-width="0.8"/>`; // 넥타이 몸
    } else if (u === "shirt") {
      s += `<path d="M41 71 L50 80 L45 86 Z" fill="${C.shirt}" stroke="${ST}" stroke-width="1.3"/>`;
      s += `<path d="M59 71 L50 80 L55 86 Z" fill="${C.shirt}" stroke="${ST}" stroke-width="1.3"/>`;
      s += `<path d="M47 79 L50 77 L53 79 L51.5 82 L48.5 82 Z" fill="${tieC}" stroke="${ST}" stroke-width="0.8"/>`;
      s += `<path d="M48.5 82 L46.5 86 L50 99 L53.5 86 L51.5 82 Z" fill="${tieC}" stroke="${ST}" stroke-width="0.8"/>`;
      s += `<path d="M30 78 V96M70 78 V96" stroke="${ST}" stroke-width="0.9" opacity="0.4"/>`;
    } else if (u === "scrubs") {
      s += `<path d="M40 71 Q50 80 60 71 L50 83 Z" fill="${skin}" stroke="${ST}" stroke-width="1.2"/>`; // V넥(피부)
      s += `<path d="M24 76 Q31 73 36 76M76 76 Q69 73 64 76" stroke="${ST}" stroke-width="1.1" fill="none" opacity="0.5"/>`; // 소매선
      s += `<rect x="60" y="86" width="11" height="9" rx="1.5" fill="none" stroke="${ST}" stroke-width="1.1" opacity="0.6"/>`; // 주머니
      s += stethoscope();
    } else if (u === "coat") {
      s += `<path d="M40 71 Q50 80 60 71 L50 82 Z" fill="${C.mint}" stroke="${ST}" stroke-width="1.2"/>`; // 안쪽 수술복 V
      s += `<path d="M42 71 L33 97M58 71 L67 97" stroke="${ST}" stroke-width="1.4" fill="none"/>`; // 가운 라펠
      s += `<rect x="60" y="85" width="12" height="10" rx="1.5" fill="none" stroke="${ST}" stroke-width="1.1" opacity="0.6"/>`; // 주머니
      s += `<rect x="62.5" y="82" width="2.4" height="7" rx="1" fill="${tieC}"/>`; // 펜
      s += stethoscope();
    } else if (u === "hoodie") {
      s += `<path d="M28 73 Q50 88 72 73 L70 94 L30 94 Z" fill="#78909c" stroke="${ST}" stroke-width="1.6" stroke-linejoin="round"/>`; // 후드 모자 뒤
      s += `<path d="M42 71 Q50 81 58 71 Z" fill="${skin}" stroke="${ST}" stroke-width="1.2"/>`; // 목부분 피부
      s += `<path d="M44 76 L40 92M56 76 L60 92" stroke="${ST}" stroke-width="1.6" stroke-linecap="round"/>`; // 후드 끈
      s += `<circle cx="40" cy="93" r="1.5" fill="#fff" stroke="${ST}" stroke-width="0.8"/>`;
      s += `<circle cx="60" cy="93" r="1.5" fill="#fff" stroke="${ST}" stroke-width="0.8"/>`;
    } else if (u === "checkshirt") {
      s += `<path d="M41 71 L50 80 L45 86 Z" fill="#ffebee" stroke="${ST}" stroke-width="1.3"/>`; // 깃 좌
      s += `<path d="M59 71 L50 80 L55 86 Z" fill="#ffebee" stroke="${ST}" stroke-width="1.3"/>`; // 깃 우
      s += `<g stroke="${ST}" stroke-width="0.7" opacity="0.25">` +
           `<path d="M12 80 H88M10 88 H90M8 96 H92"/>` +
           `<path d="M30 72 V100M40 72 V100M50 72 V100M60 72 V100M70 72 V100"/>` +
           `</g>`;
    }
    return s;
    function col(t) {
      if (t === "suit") return C.suit;
      if (t === "shirt") return C.shirt;
      if (t === "scrubs") return C.scrub;
      if (t === "coat") return C.coat;
      if (t === "hoodie") return "#90a4ae"; // 회색 후드티
      if (t === "checkshirt") return "#eef6ff"; // 체크셔츠
      return C.suit;
    }
  }

  // ===== 소품(손에 든 것: 머리 옆) =====
  function prop(type) {
    const handX = 79, handY = 44;
    switch (type) {
      case "coffee":
        return `<g transform="translate(${handX-2} ${handY})"><path d="M-5 0 h10 l-1.3 12 h-7.4 Z" fill="#fff" stroke="${ST}" stroke-width="1.4"/>` +
               `<rect x="-5.6" y="-2" width="11" height="3.2" rx="1.4" fill="${C.coffee}" stroke="${ST}" stroke-width="1.1"/>` +
               `<path class="emo-steam" d="M-1.5 -4 q-2 -3 0 -6" stroke="${C.steam}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
               `<path class="emo-steam" style="animation-delay:.4s" d="M2 -4 q2 -3 0 -6" stroke="${C.steam}" stroke-width="1.4" fill="none" stroke-linecap="round"/></g>` + hand(handX-6, handY+9);
      case "clipboard":
        return `<g transform="translate(${handX-4} ${handY-2}) rotate(6)"><rect x="0" y="0" width="15" height="20" rx="2" fill="#fff" stroke="${ST}" stroke-width="1.4"/>` +
               `<rect x="4.5" y="-3" width="6" height="4" rx="1.4" fill="${C.mint}" stroke="${ST}" stroke-width="1"/>` +
               `<path d="M3 6 H12M3 10 H12M3 14 H9" stroke="${ST}" stroke-width="1"/></g>` + hand(handX-7, handY+15);
      case "syringe":
        return `<g transform="translate(${handX-8} ${handY+2}) rotate(35)"><rect x="0" y="-2.4" width="15" height="4.8" rx="1" fill="#eef6ff" stroke="${ST}" stroke-width="1.2"/>` +
               `<rect x="-5" y="-3.2" width="5" height="6.4" rx="1" fill="${C.mint}" stroke="${ST}" stroke-width="1"/>` +
               `<path d="M15 0 H22" stroke="${ST}" stroke-width="1.3" stroke-linecap="round"/>` +
               `<rect x="3" y="-2.4" width="2" height="4.8" fill="${C.scrub2}" opacity="0.7"/></g>` + hand(handX-3, handY+10);
      case "pills":
        return `<g transform="translate(${handX-3} ${handY+2})"><rect x="-2" y="0" width="12" height="6" rx="3" fill="${C.cross}" stroke="${ST}" stroke-width="1.2"/>` +
               `<path d="M4 0 V6" stroke="${ST}" stroke-width="1"/><circle cx="2" cy="11" r="4" fill="${C.mint}" stroke="${ST}" stroke-width="1.1"/></g>` + hand(handX-7, handY+10);
      case "doc":
        return `<g transform="translate(${handX-5} ${handY-2}) rotate(-7)"><rect x="0" y="0" width="15" height="19" rx="1.5" fill="#fff" stroke="${ST}" stroke-width="1.4"/>` +
               `<path d="M3 5 H12M3 9 H12M3 13 H9" stroke="${ST}" stroke-width="1"/><circle cx="10.5" cy="14.5" r="2.4" fill="none" stroke="${C.cross}" stroke-width="1.3"/></g>` + hand(handX-8, handY+14);
      case "phone":
        return `<g transform="translate(${handX-2} ${handY}) rotate(10)"><rect x="-5" y="-8" width="10" height="17" rx="2.4" fill="#dff" stroke="${ST}" stroke-width="1.4"/>` +
               `<rect x="-3.4" y="-5.6" width="6.8" height="10" rx="1" fill="${C.mint}"/></g>` + hand(handX-6, handY+8);
      case "fist":
        return `<g transform="translate(${handX-1} ${handY-8})"><rect x="-6" y="-6" width="12" height="11" rx="4" fill="#ffd9b8" stroke="${ST}" stroke-width="1.6"/>` +
               `<path d="M-6 -2 H6M-6 1.4 H6" stroke="${ST}" stroke-width="1"/></g>`;
      case "mask":
        return `<path d="M${CX-12} ${MY-7} Q${CX} ${MY+1} ${CX+12} ${MY-7} L${CX+11} ${MY+7} Q${CX} ${MY+14} ${CX-11} ${MY+7} Z" fill="${C.scrub2}" stroke="${ST}" stroke-width="1.6" stroke-linejoin="round"/>` +
               `<path d="M${CX-12} ${MY-6} Q${CX-19} ${MY-9} ${CX-19} ${MY-4}" stroke="${ST}" stroke-width="1.3" fill="none"/>` +
               `<path d="M${CX+12} ${MY-6} Q${CX+19} ${MY-9} ${CX+19} ${MY-4}" stroke="${ST}" stroke-width="1.3" fill="none"/>` +
               `<path d="M${CX-9} ${MY-1} H${CX+9}M${CX-9} ${MY+3} H${CX+9}" stroke="${ST}" stroke-width="0.9" opacity="0.5"/>`;
      case "capdoc": // 수술 캡
        return `<path d="M${CX-R+2} ${CYH-13} Q${CX} ${CYH-R-9} ${CX+R-2} ${CYH-13} Q${CX} ${CYH-R+5} ${CX-R+2} ${CYH-13} Z" fill="${C.scrub2}" stroke="${ST}" stroke-width="1.6"/>` +
               `<path d="M${CX-3.5} ${CYH-R-2} h7 M${CX} ${CYH-R-5.5} v7" stroke="${C.cross}" stroke-width="2.2" stroke-linecap="round"/>`;
      case "capnurse": // 간호사 캡
        return `<path d="M${CX-14} ${CYH-R+5} Q${CX} ${CYH-R-7} ${CX+14} ${CYH-R+5} L${CX+11} ${CYH-R+8} Q${CX} ${CYH-R-1} ${CX-11} ${CYH-R+8} Z" fill="#f3fbf7" stroke="${ST}" stroke-width="1.7"/>` +
               `<path d="M${CX-2.4} ${CYH-R-1} h4.8 M${CX} ${CYH-R-3.4} v4.8" stroke="${C.cross}" stroke-width="2" stroke-linecap="round"/>`;
      case "clock":
        return `<g transform="translate(80 28)"><circle r="8" fill="#fff" stroke="${ST}" stroke-width="1.5"/>` +
               `<path class="emo-tick" d="M0 0 V-5M0 0 L3.5 1.8" stroke="${ST}" stroke-width="1.5" stroke-linecap="round" style="transform-origin:0 0"/></g>`;
      case "lanyard": // 사원증
        return `<path d="M${CX-9} ${CYH+R-2} L46 84M${CX+9} ${CYH+R-2} L54 84" stroke="${C.suit2}" stroke-width="1.6" fill="none"/>` +
               `<rect x="44" y="83" width="12" height="9" rx="1.5" fill="#fff" stroke="${ST}" stroke-width="1.2"/>` +
               `<rect x="46" y="85" width="4" height="5" rx="0.6" fill="${C.suit2}"/><path d="M52 86 H54M52 89 H54" stroke="${ST}" stroke-width="0.8"/>`;
      case "laptop":
        return `<g transform="translate(${handX-15} ${handY+6}) rotate(-3)">` +
               `<rect x="0" y="0" width="22" height="15" rx="1.5" fill="#cfd8dc" stroke="${ST}" stroke-width="1.4"/>` +
               `<path d="M0 13 H22" stroke="${ST}" stroke-width="1.4"/>` +
               `<circle cx="11" cy="7.5" r="2" fill="#78909c"/>` +
               `<rect x="-3" y="13" width="28" height="2.5" rx="0.8" fill="#78909c" stroke="${ST}" stroke-width="1.4"/>` +
               `</g>` + hand(handX-14, handY+16) + hand(handX+2, handY+16);
      case "headphones":
        return `<path d="M${CX-R-1} ${CYH} A${R+2} ${R+2} 0 0 1 ${CX+R+1} ${CYH}" fill="none" stroke="#e06666" stroke-width="3" stroke-linecap="round"/>` +
               `<rect x="${CX-R-4}" y="${CYH-4}" width="5" height="10" rx="1.8" fill="#333" stroke="${ST}" stroke-width="1.2"/>` +
               `<rect x="${CX+R-1}" y="${CYH-4}" width="5" height="10" rx="1.8" fill="#333" stroke="${ST}" stroke-width="1.2"/>`;
      case "mug":
        return `<g transform="translate(${handX-3} ${handY+2})">` +
               `<rect x="-4" y="0" width="9" height="11" rx="1.8" fill="#e06666" stroke="${ST}" stroke-width="1.4"/>` +
               `<path d="M5 3 C7.5 3 7.5 8 5 8" fill="none" stroke="${ST}" stroke-width="1.4"/>` +
               `<path class="emo-steam" d="M-1 -4 q-1.5 -2.5 0 -5" stroke="${C.steam}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
               `</g>` + hand(handX-6, handY+10);
      case "energy":
        return `<g transform="translate(${handX-3} ${handY+2})">` +
               `<rect x="-3" y="0" width="7" height="13" rx="1.5" fill="#3a86c8" stroke="${ST}" stroke-width="1.4"/>` +
               `<rect x="-2" y="3.5" width="5" height="7" fill="#ffd166"/>` +
               `<path d="M0 4.5 L2 6 L-1 8 L1 9.5" stroke="${ST}" stroke-width="1" fill="none"/>` +
               `</g>` + hand(handX-6, handY+10);
      case "bug":
        return `<g transform="translate(${handX-4} ${handY})">` +
               `<circle cx="4" cy="5" r="4.5" fill="${C.cross}" stroke="${ST}" stroke-width="1.2"/>` +
               `<circle cx="4" cy="1.5" r="2.2" fill="#333"/>` +
               `<path d="M4 1.5 V9.5M0.5 5 H7.5M1.5 2 L-1 0.5M6.5 2 L9 0.5M1.5 8 L-1 9.5M6.5 8 L9 9.5" stroke="${ST}" stroke-width="0.8"/>` +
               `<circle cx="2" cy="4" r="0.8" fill="#fff"/>` +
               `<circle cx="6" cy="4" r="0.8" fill="#fff"/>` +
               `</g>` + hand(handX-7, handY+11);
      default: return "";
    }
  }
  function hand(x, y) {
    return `<ellipse cx="${x}" cy="${y}" rx="4.5" ry="3.8" fill="${C.skin}" stroke="${ST}" stroke-width="1.6"/>`;
  }

  // ===== 효과 =====
  function fx(list) {
    let s = "";
    (list || []).forEach((f) => {
      switch (f) {
        case "sweat": s += `<g class="emo-sweat">${drop(CX+R-2, EY-1, 1.2, C.sweat)}</g>`; break;
        case "sweat2": s += `<g class="emo-sweat">${drop(CX+R-1, EY-2, 1.1, C.sweat)}</g><g class="emo-sweat" style="animation-delay:.5s">${drop(CX-R+1, EY+1, 1, C.sweat)}</g>`; break;
        case "tears": s += `<g class="emo-tearfall">${drop(LX-1, EY+7, 1, C.tear)}</g><g class="emo-tearfall" style="animation-delay:.4s">${drop(RX+1, EY+7, 1, C.tear)}</g>`; break;
        case "tearjoy": s += `<g class="emo-tearfall">${drop(RX+2, EY+6, 0.9, C.tear)}</g>`; break;
        case "anger": s += `<g transform="translate(74 26)"><path d="M0 -6 L2 -2 L6 -2 L3 1 L4 5 L0 2 L-4 5 L-3 1 L-6 -2 L-2 -2 Z" fill="none" stroke="${C.cross}" stroke-width="1.8" stroke-linejoin="round"/></g>`; break;
        case "steamhead": s += `<path class="emo-steam" d="M40 13 q-3 -5 0 -9" stroke="${C.steam}" stroke-width="2" fill="none" stroke-linecap="round"/><path class="emo-steam" style="animation-delay:.5s" d="M60 13 q3 -5 0 -9" stroke="${C.steam}" stroke-width="2" fill="none" stroke-linecap="round"/>`; break;
        case "zzz": s += `<g class="emo-zzz" font-family="monospace" font-weight="700" fill="${C.line}"><text x="74" y="24" font-size="8">z</text><text x="81" y="16" font-size="11">Z</text></g>`; break;
        case "sparkles": s += `<g class="emo-spark">${sparkle(76, 22, 4.5, C.spark)}</g><g class="emo-spark" style="animation-delay:.5s">${sparkle(24, 24, 3.5, C.spark)}</g><g class="emo-spark" style="animation-delay:.8s">${sparkle(80, 50, 3, C.spark)}</g>`; break;
        case "moon": s += `<g transform="translate(80 20)"><path d="M4.5 -5.5 A6.5 6.5 0 1 0 4.5 7.5 A5 5 0 1 1 4.5 -5.5 Z" fill="${C.moon}" stroke="${ST}" stroke-width="1.1"/></g>`; break;
        case "heartup": s += `<g class="emo-floatup">${heart(76, 28, 1.2, C.cheek)}</g><g class="emo-floatup" style="animation-delay:.7s">${heart(26, 30, 0.9, C.cheek)}</g>`; break;
        case "note": s += `<g class="emo-floatup" font-family="serif" font-size="12" fill="${C.suit2}"><text x="74" y="28">\u266a</text></g><g class="emo-floatup" style="animation-delay:.6s" font-family="serif" font-size="10" fill="${C.scrub}"><text x="24" y="24">\u266b</text></g>`; break;
        case "question": s += `<g class="emo-pop" font-family="monospace" font-weight="700" font-size="15" fill="${C.suit2}"><text x="74" y="24">?</text></g>`; break;
        case "exclaim": s += `<g class="emo-pop" font-family="monospace" font-weight="700" font-size="17" fill="${C.cross}"><text x="76" y="24">!</text></g>`; break;
        case "alarm": s += `<g class="emo-pop" font-family="monospace" font-weight="700" font-size="14" fill="${C.cross}"><text x="72" y="22">!</text><text x="80" y="22">!</text></g>`; break;
        case "bubble": s += `<g class="emo-spark" fill="${C.scrub2}" stroke="${ST}" stroke-width="0.8"><circle cx="76" cy="50" r="2.8"/><circle cx="82" cy="44" r="2"/><circle cx="24" cy="48" r="2.4"/></g>`; break;
        case "lines": s += `<g stroke="${C.line}" stroke-width="1.3" opacity="0.45" stroke-linecap="round"><path d="M40 16 V25M50 14 V25M60 16 V25"/></g>`; break;
        case "flypaper": s += `<g class="emo-fly"><rect x="78" y="24" width="8" height="10" rx="1" fill="#fff" stroke="${ST}" stroke-width="1" transform="rotate(20 82 29)"/></g><g class="emo-fly" style="animation-delay:.6s"><rect x="18" y="30" width="7" height="9" rx="1" fill="#fff" stroke="${ST}" stroke-width="1" transform="rotate(-15 21 34)"/></g>`; break;
        case "matrix":
          s += `<g class="emo-spark" font-family="monospace" font-weight="700" font-size="6.5" fill="#00ff66" opacity="0.85">` +
               `<text x="18" y="24">10</text><text x="76" y="20">01</text><text x="16" y="44">01</text><text x="80" y="48">10</text></g>`;
          break;
        case "error":
          s += `<g class="emo-pop" transform="translate(75 22)">` +
               `<rect x="-18" y="-18" width="36" height="11" rx="2" fill="${C.cross}" stroke="${ST}" stroke-width="1"/>` +
               `<text x="0" y="-10" font-family="monospace" font-weight="700" font-size="6.5" fill="#fff" text-anchor="middle">ERROR</text>` +
               `<polygon points="0,-3 6,7 -6,7" fill="${C.cross}" stroke="${ST}" stroke-width="1.2"/>` +
               `<text x="0" y="5.5" font-family="sans-serif" font-weight="900" font-size="6.5" fill="#fff" text-anchor="middle">!</text>` +
               `</g>`;
          break;
        case "fire":
          s += `<g class="emo-floatup" transform="translate(74 26) scale(0.95)">` +
               `<path d="M0 -8 C3 -4 6 -2 6 2 A6 6 0 1 1 -6 2 C-6 -2 -3 -4 0 -8 Z" fill="#ff7043"/>` +
               `<path d="M0 -4 C1.5 -2 3 -1 3 1 A3 3 0 1 1 -3 1 C-3 -1 -1.5 -2 0 -4 Z" fill="#ffeb3b"/>` +
               `</g>` +
               `<g class="emo-floatup" style="animation-delay:.7s" transform="translate(24 28) scale(0.7)">` +
               `<path d="M0 -8 C3 -4 6 -2 6 2 A6 6 0 1 1 -6 2 C-6 -2 -3 -4 0 -8 Z" fill="#ff7043"/>` +
               `<path d="M0 -4 C1.5 -2 3 -1 3 1 A3 3 0 1 1 -3 1 C-3 -1 -1.5 -2 0 -4 Z" fill="#ffeb3b"/>` +
               `</g>`;
          break;
        default: break;
      }
    });
    return s;
  }

  // ===== 메인 빌더 =====
  function buildEmoticonSVG(def) {
    const f = def.face || {};
    const skin = f.skin || C.skin;
    const parts = [];
    if (f.fxBehind) parts.push(fx(f.fxBehind));
    // 목
    parts.push(`<path d="M44 56 Q44 66 50 70 Q56 66 56 56 Z" fill="${skin}" stroke="${ST}" stroke-width="2" stroke-linejoin="round"/>`);
    // 상반신 유니폼
    parts.push(torso(def));
    // 머리
    parts.push(`<circle cx="${CX}" cy="${CYH}" r="${R}" fill="${skin}" stroke="${ST}" stroke-width="2.2"/>`);
    // 귀
    parts.push(`<circle cx="${CX-R+1}" cy="${CYH+3}" r="3.4" fill="${skin}" stroke="${ST}" stroke-width="1.8"/><circle cx="${CX+R-1}" cy="${CYH+3}" r="3.4" fill="${skin}" stroke="${ST}" stroke-width="1.8"/>`);
    // 헤어
    parts.push(hair(f.hair, f.hairColor));
    // 볼터치
    if (f.blush) parts.push(blush());
    // 표정
    parts.push(brow(f.brow));
    parts.push(eyes(f.eyes));
    if (f.glasses) parts.push(glasses());
    parts.push(mouth(f.mouth));
    // 앞 소품(캡/손에 든 것)
    (def.front || def.props || []).forEach((p) => parts.push(prop(p)));
    // 효과
    parts.push(fx(f.fx));

    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="emo-svg">${parts.join("")}</svg>`;
  }

  window.EmoFace = { build: buildEmoticonSVG, C, HAIRC, SKIN };
  window.buildEmoticonSVG = buildEmoticonSVG;
})();
