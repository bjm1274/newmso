/* =========================================================
   채팅 프로토타입 앱 로직 (vanilla JS)
   ========================================================= */
(function () {
  const OFFICE = window.EMO_OFFICE;
  const HOSPITAL = window.EMO_HOSPITAL;
  const byId = {};
  [...OFFICE, ...HOSPITAL].forEach(d => byId[d.id] = d);

  // 방 설정
  const ROOMS = {
    office: {
      name: "회사 단톡방", sub: "팀원 4", color: "office",
      botName: "박팀장", botInit: "박", botColor: "#6d96da",
      set: OFFICE,
      seed: [
        { who: "bot", text: "다들 오늘 마감 잊지 마세요~" },
        { who: "bot", emo: "o-deadline" },
        { who: "me", emo: "o-meltdown" },
      ],
      replies: [
        "ㅋㅋㅋㅋ 화이팅합시다", "곧 점심시간이에요", "조금만 더 버텨요!",
        "퇴근까지 3시간 남았어요", "커피 한잔 하실분~", "수고 많으십니다 다들",
      ],
      replyEmos: ["o-coffee","o-fighting","o-leaveontime","o-praise","o-lunch","o-wanttogo"],
    },
    hospital: {
      name: "병동 단톡방", sub: "근무 5", color: "hospital",
      botName: "수간호사쌤", botInit: "수", botColor: "#5cb89f",
      set: HOSPITAL,
      seed: [
        { who: "bot", text: "야간 인수인계 곧 시작합니다" },
        { who: "bot", emo: "h-night" },
        { who: "me", emo: "h-drowsy" },
      ],
      replies: [
        "오늘도 고생 많으셨어요", "회진 곧 돕니다~", "다들 식사는 하셨나요?",
        "응급실에서 콜 왔어요", "교대 감사합니다!", "조심히 들어가세요",
      ],
      replyEmos: ["h-care","h-cheer","h-coffee","h-thanks","h-off","h-hungry"],
    },
  };

  let current = "office";
  const history = { office: [], hospital: [] };

  // ---- 이모티콘 DOM 생성 ----
  function makeEmo(def, cls) {
    const wrap = document.createElement("div");
    wrap.className = "emo " + (def.anim || "a-bounce") + (cls ? " " + cls : "");
    wrap.innerHTML = window.buildEmoticonSVG(def);
    return wrap;
  }

  // ---- 메시지 렌더 ----
  const msgArea = () => document.getElementById("messages");

  function appendMessage(m, animateIn) {
    const room = ROOMS[current];
    const row = document.createElement("div");
    row.className = "msg-row " + (m.who === "me" ? "mine" : "theirs");

    if (m.who === "bot") {
      const av = document.createElement("div");
      av.className = "avatar";
      av.style.background = room.botColor;
      av.textContent = room.botInit;
      row.appendChild(av);
    }

    const col = document.createElement("div");
    col.className = "msg-col";

    if (m.who === "bot") {
      const nm = document.createElement("div");
      nm.className = "sender";
      nm.textContent = room.botName;
      col.appendChild(nm);
    }

    if (m.emo) {
      const def = byId[m.emo];
      const bub = document.createElement("div");
      bub.className = "emo-bubble " + (animateIn ? "pop-in" : "");
      const e = makeEmo(def, "chat-emo");
      bub.appendChild(e);
      const lab = document.createElement("div");
      lab.className = "emo-label";
      lab.textContent = def.label;
      bub.appendChild(lab);
      col.appendChild(bub);
    } else {
      const bub = document.createElement("div");
      bub.className = "text-bubble " + room.color + (animateIn ? " pop-in" : "");
      bub.textContent = m.text;
      col.appendChild(bub);
    }

    const time = document.createElement("div");
    time.className = "time";
    time.textContent = m.time || nowTime();
    col.appendChild(time);

    row.appendChild(col);
    msgArea().appendChild(row);
    scrollBottom();
  }

  function nowTime() {
    const d = new Date();
    let h = d.getHours(); const ap = h < 12 ? "오전" : "오후";
    h = h % 12 || 12;
    return ap + " " + h + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function scrollBottom() {
    const a = msgArea();
    a.scrollTop = a.scrollHeight + 200;
  }

  // ---- 타이핑 인디케이터 ----
  function showTyping() {
    const room = ROOMS[current];
    const row = document.createElement("div");
    row.className = "msg-row theirs typing-row";
    row.id = "typing";
    row.innerHTML = `<div class="avatar" style="background:${room.botColor}">${room.botInit}</div>` +
      `<div class="msg-col"><div class="typing"><span></span><span></span><span></span></div></div>`;
    msgArea().appendChild(row);
    scrollBottom();
  }
  function hideTyping() {
    const t = document.getElementById("typing");
    if (t) t.remove();
  }

  // ---- 전송 ----
  function send(def) {
    const m = { who: "me", emo: def.id, time: nowTime() };
    history[current].push(m);
    appendMessage(m, true);
    // 봇 응답
    const room = ROOMS[current];
    setTimeout(() => {
      showTyping();
      setTimeout(() => {
        hideTyping();
        const useEmo = Math.random() < 0.55;
        let reply;
        if (useEmo) {
          const id = room.replyEmos[Math.floor(Math.random() * room.replyEmos.length)];
          reply = { who: "bot", emo: id, time: nowTime() };
        } else {
          reply = { who: "bot", text: room.replies[Math.floor(Math.random() * room.replies.length)], time: nowTime() };
        }
        history[current].push(reply);
        appendMessage(reply, true);
      }, 900 + Math.random() * 700);
    }, 450);
  }

  // ---- 트레이 렌더 ----
  function renderTray() {
    const tray = document.getElementById("tray");
    tray.innerHTML = "";
    ROOMS[current].set.forEach(def => {
      const cell = document.createElement("button");
      cell.className = "tray-cell";
      cell.title = def.label;
      const e = makeEmo(def);
      cell.appendChild(e);
      const lab = document.createElement("span");
      lab.className = "tray-label";
      lab.textContent = def.label;
      cell.appendChild(lab);
      cell.addEventListener("click", () => {
        cell.classList.remove("tapped"); void cell.offsetWidth;
        cell.classList.add("tapped");
        send(def);
      });
      tray.appendChild(cell);
    });
  }

  // ---- 방 전환 ----
  function switchRoom(key) {
    if (key === current && history[key].length) return;
    current = key;
    document.querySelectorAll(".room-pill").forEach(p =>
      p.classList.toggle("active", p.dataset.room === key));
    const room = ROOMS[key];
    document.getElementById("room-name").textContent = room.name;
    document.getElementById("room-sub").textContent = room.sub;
    document.getElementById("chat-head").className = "chat-head " + room.color;
    document.getElementById("tray-tab").className = "tray-tab " + room.color;
    // 메시지 초기화 후 시드/히스토리
    msgArea().innerHTML = "";
    if (!history[key].length) {
      room.seed.forEach(s => { history[key].push({ ...s, time: nowTime() }); });
    }
    history[key].forEach(m => appendMessage(m, false));
    renderTray();
    scrollBottom();
  }

  // ---- 갤러리 오버레이 ----
  function buildGallery() {
    const grid = document.getElementById("gallery-grid");
    grid.innerHTML = "";
    [["직장인","office",OFFICE],["의료진","hospital",HOSPITAL]].forEach(([title,color,set]) => {
      const sec = document.createElement("div");
      sec.className = "gal-section";
      sec.innerHTML = `<h3 class="gal-title ${color}">${title} · ${set.length}</h3>`;
      const g = document.createElement("div");
      g.className = "gal-grid";
      set.forEach(def => {
        const cell = document.createElement("div");
        cell.className = "gal-cell";
        cell.appendChild(makeEmo(def));
        const lab = document.createElement("span");
        lab.textContent = def.label;
        cell.appendChild(lab);
        g.appendChild(cell);
      });
      sec.appendChild(g);
      grid.appendChild(sec);
    });
  }

  function init() {
    document.querySelectorAll(".room-pill").forEach(p =>
      p.addEventListener("click", () => switchRoom(p.dataset.room)));
    document.getElementById("gal-open").addEventListener("click", () => {
      buildGallery();
      document.getElementById("gallery").classList.add("show");
    });
    document.getElementById("gal-close").addEventListener("click", () =>
      document.getElementById("gallery").classList.remove("show"));
    switchRoom("office");
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
