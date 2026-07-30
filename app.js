/* ═══ しまい — 공유 캘린더 앱 ═══ */
const App = (() => {
  "use strict";
  const sb = () => window.sb;
  let currentUser = null;
  let currentPage = "landing";

  // ─── 캘린더 상태 ───
  let personalMonth = new Date();
  let roomMonth = new Date();
  let currentRoom = null;
  let roomEvents = [];
  let roomMembers = [];
  let selectedDay = null;

  const DOWS = ["일","월","화","수","목","금","토"];
  const MPAD = n => String(n).padStart(2, "0");
  const $ = s => document.querySelector(s);
  const errMsg = e => e?.message || "오류가 발생했습니다.";

  // ─── 토스트 ───
  function toast(msg) {
    let wrap = $(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
  }

  // ─── 모달 ───
  function openModal(title, bodyHtml) {
    $("#modal-body").innerHTML = "";
    if (pickerMap) { try { pickerMap.remove(); } catch(e){} pickerMap = null; pickerMarker = null; }
    pickedLocation = null;
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = bodyHtml;
    $("#modal-overlay").classList.add("show");
    $("#modal-box").classList.add("show");
  }
  function closeModal() {
    $("#modal-overlay").classList.remove("show");
    $("#modal-box").classList.remove("show");
    if (pickerMap) { try { pickerMap.remove(); } catch(e){} pickerMap = null; pickerMarker = null; }
    pickedLocation = null;
  }

  // ═══ 라우팅 ═══
  function go(page) {
    if ((page === "main" || page === "room" || page === "mypage") && !currentUser) {
      go("login");
      return;
    }
    currentPage = page;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    $("#" + page).classList.add("active");
    window.scrollTo(0, 0);
    if (page === "main") { renderMain(); }
    if (page === "mypage") { renderMypage(); }
  }

  function logoClick() {
    go(currentUser ? "main" : "landing");
  }

  function togglePw(id, btn) {
    const input = $("#" + id);
    if (!input) return;
    if (input.type === "password") { input.type = "text"; btn.textContent = "🙈"; }
    else { input.type = "password"; btn.textContent = "👁"; }
  }

  // ═══ 인증 ═══
  async function handleSignup(e) {
    e.preventDefault();
    const nm = $("#su-nm").value.trim();
    const em = $("#su-em").value.trim();
    const pw = $("#su-pw").value;
    const p2 = $("#su-p2").value;
    const err = $("#su-err");
    err.textContent = "";
    err.style.color = "";
    if (!nm) { err.textContent = "이름(닉네임)을 입력하세요"; return; }
    if (pw.length < 6) { err.textContent = "비밀번호는 최소 6자 이상이어야 합니다"; return; }
    if (pw !== p2) { err.textContent = "비밀번호가 일치하지 않습니다"; return; }
    try {
      const { data: existing } = await sb().from("user_search").select("id").eq("nickname", nm).maybeSingle();
      if (existing) { err.textContent = "이미 사용 중인 닉네임입니다. 다른 닉네임을 사용하세요."; return; }
      const { data, error } = await sb().auth.signUp({ email: em, password: pw, options: { data: { nickname: nm } } });
      if (error) throw error;
      if (data.user && !data.session) {
        err.style.color = "#0a8a40";
        err.textContent = "가입 완료! 바로 로그인할 수 있습니다.";
      }
    } catch (e) {
      const m = errMsg(e);
      if (m.includes("rate limit") || m.includes("over_email_send_rate_limit")) {
        err.textContent = "이메일 발송 제한에 걸렸습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.";
      } else if (m.includes("already registered") || m.includes("already been registered")) {
        err.textContent = "이미 가입된 이메일입니다. 로그인해 주세요.";
      } else if (m.includes("Invalid email")) {
        err.textContent = "올바른 이메일 주소를 입력하세요.";
      } else {
        err.textContent = m;
      }
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const em = $("#li-em").value.trim();
    const pw = $("#li-pw").value;
    const err = $("#li-err");
    err.textContent = "";
    try {
      const { error } = await sb().auth.signInWithPassword({ email: em, password: pw });
      if (error) throw error;
    } catch (e) {
      const m = errMsg(e);
      if (m.includes("Email not confirmed")) err.textContent = "이메일 인증이 필요합니다. 메일함을 확인하세요.";
      else if (m.includes("Invalid login")) err.textContent = "이메일 또는 비밀번호가 올바르지 않습니다.";
      else err.textContent = m;
    }
  }

  async function doLogout() {
    await sb().auth.signOut();
    currentUser = null;
    go("landing");
  }

  function initAuth() {
    sb().auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        currentUser = {
          id: session.user.id,
          email: session.user.email,
          nickname: session.user.user_metadata?.nickname || session.user.email?.split("@")[0] || "사용자"
        };
        try {
          const { data: profile } = await sb().from("profiles").select("nickname,avatar_url").eq("id", currentUser.id).single();
          if (profile?.nickname) currentUser.nickname = profile.nickname;
          if (profile?.avatar_url) currentUser.avatar_url = profile.avatar_url;
        } catch (e) {}
        if (event === "SIGNED_IN") {
          toast(`${currentUser.nickname}님 환영합니다!`);
          go("main");
        } else if (event === "INITIAL_SESSION") {
          go("main");
        }
      } else {
        currentUser = null;
        if (currentPage !== "landing" && currentPage !== "login" && currentPage !== "signup") go("landing");
      }
    });
  }

  // ═══ 메인 페이지 ═══
  async function renderMain() {
    renderPersonalCal();
    await renderPersonalEvents();
    await renderRoomInvites();
    await renderRoomList();
  }

  async function renderRoomInvites() {
    const el = $("#room-invites");
    if (!el) return;
    try {
      const { data: invites, error: iErr } = await sb().from("room_members")
        .select("room_id,id").eq("user_id", currentUser.id).eq("status", "pending");
      if (iErr) throw iErr;
      if (!invites || invites.length === 0) { el.innerHTML = ""; return; }
      const roomIds = invites.map(i => i.room_id);
      const { data: rooms, error: rErr } = await sb().from("calendar_rooms")
        .select("id,name,owner_id").in("id", roomIds);
      if (rErr) throw rErr;
      const ownerIds = [...new Set((rooms || []).map(r => r.owner_id))];
      let oMap = {};
      if (ownerIds.length > 0) {
        const { data: ownerProfiles } = await sb().from("profiles").select("id,nickname").in("id", ownerIds);
        (ownerProfiles || []).forEach(p => oMap[p.id] = p.nickname || "사용자");
      }
      const inviteMap = {};
      invites.forEach(i => inviteMap[i.room_id] = i.id);
      el.innerHTML = (rooms || []).map(r => `
        <div class="room-card" style="border-color:var(--pink);background:var(--pink-bg);margin-bottom:12px">
          <div class="room-card-top">
            <div class="room-card-name">📨 ${escapeHtml(r.name)}</div>
          </div>
          <div class="room-card-meta">${escapeHtml(oMap[r.owner_id] || "사용자")}님이 초대했어요</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-pink btn-sm" onclick="App.acceptRoomInvite('${inviteMap[r.id]}','${r.id}')">수락</button>
            <button class="btn btn-ghost btn-sm" onclick="App.declineRoomInvite('${inviteMap[r.id]}')">거절</button>
          </div>
        </div>`).join("");
    } catch (e) {
      console.error("renderRoomInvites error:", e);
      el.innerHTML = "";
    }
  }

  async function acceptRoomInvite(memberId, roomId) {
    try {
      const { error } = await sb().from("room_members").update({ status: "accepted" }).eq("id", memberId);
      if (error) throw error;
      toast("초대를 수락했습니다");
      await renderRoomInvites();
      await renderRoomList();
    } catch (e) { toast(errMsg(e)); }
  }

  async function declineRoomInvite(memberId) {
    try {
      const { error } = await sb().from("room_members").delete().eq("id", memberId);
      if (error) throw error;
      toast("초대를 거절했습니다");
      await renderRoomInvites();
    } catch (e) { toast(errMsg(e)); }
  }

  // ─── 개인 캘린더 ───
  let personalEvents = [];

  async function renderPersonalCal() {
    const y = personalMonth.getFullYear(), m = personalMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();
    const prevLast = new Date(y, m, 0).getDate();
    const today = new Date();
    const el = $("#personal-cal");
    if (!el) return;

    // 해당 월 일정 로드
    try {
      const monthStart = `${y}-${MPAD(m+1)}-01`;
      const monthEnd = `${y}-${MPAD(m+1)}-${MPAD(lastDate)}`;
      const { data } = await sb().from("personal_events").select("*").eq("user_id", currentUser.id)
        .lte("event_date", monthEnd).gte("event_date", monthStart);
      personalEvents = data || [];
    } catch (e) { personalEvents = []; }

    const evMap = {};
    personalEvents.forEach(ev => {
      const start = new Date(ev.event_date);
      const end = new Date(ev.end_date || ev.event_date);
      for (let d = start.getDate(); d <= end.getDate(); d++) {
        if (!evMap[d]) evMap[d] = [];
        evMap[d].push(ev);
      }
    });

    let html = `<div class="mini-calendar">
      <div class="mc-nav">
        <button class="mc-nav-btn" onclick="App.prevPersonalMonth()">‹</button>
        <div class="mc-title">${y}.${MPAD(m+1)}</div>
        <button class="mc-nav-btn" onclick="App.nextPersonalMonth()">›</button>
      </div>
      <div class="mc-grid">
        ${DOWS.map(d => `<div class="mc-wd">${d}</div>`).join("")}`;

    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ d: prevLast - i, cur: false });
    for (let i = 1; i <= lastDate; i++) cells.push({ d: i, cur: true });
    while (cells.length % 7 !== 0) cells.push({ d: cells.length - firstDay - lastDate + 1, cur: false });

    cells.forEach((c, idx) => {
      const col = idx % 7;
      let cls = "mc-day";
      if (!c.cur) cls += " other";
      const isToday = c.cur && y === today.getFullYear() && m === today.getMonth() && c.d === today.getDate();
      if (isToday) cls += " today";
      const evs = c.cur ? (evMap[c.d] || []) : [];
      const evBadges = evs.slice(0, 2).map(ev => `<div class="mc-ev-badge pink">${escapeHtml(ev.title.length > 8 ? ev.title.slice(0,8)+"…" : ev.title)}</div>`).join("");
      html += `<div class="${cls}"><span class="mc-dn">${c.d}</span>${evBadges}</div>`;
    });

    html += `</div></div>`;
    el.innerHTML = html;
  }

  function prevPersonalMonth() { personalMonth = new Date(personalMonth.getFullYear(), personalMonth.getMonth() - 1, 1); renderPersonalCal(); }
  function nextPersonalMonth() { personalMonth = new Date(personalMonth.getFullYear(), personalMonth.getMonth() + 1, 1); renderPersonalCal(); }

  async function renderPersonalEvents() {
    const el = $("#personal-events");
    if (!el) return;
    try {
      const { data, error } = await sb().from("personal_events").select("*").eq("user_id", currentUser.id).order("event_date", { ascending: true }).limit(10);
      if (error) throw error;
      if (!data || data.length === 0) {
        el.innerHTML = `<div class="empty">다가오는 일정이 없어요</div>`;
        return;
      }
      el.innerHTML = `<div class="ev-cards">${data.map(ev => {
        const d = new Date(ev.event_date);
        const isMulti = ev.end_date && ev.end_date !== ev.event_date;
        const dateRange = isMulti ? `${ev.event_date.slice(5)} ~ ${ev.end_date.slice(5)}` : `${ev.event_date.slice(5)}`;
        return `<div class="ecard">
          <div class="ecard-l"><div class="ecard-day">${d.getDate()}</div><div class="ecard-dow">${DOWS[d.getDay()]}</div></div>
          <div class="ecard-r">
            <div class="ecard-title">${escapeHtml(ev.title)}</div>
            <div class="ecard-meta">${dateRange}${ev.location ? " · " + escapeHtml(ev.location) : ""}${ev.memo ? " · " + escapeHtml(ev.memo) : ""}</div>
          </div>
          <button class="ecard-del" onclick="App.deletePersonalEvent('${ev.id}')">✕</button>
        </div>`;
      }).join("")}</div>`;
    } catch (e) { el.innerHTML = `<div class="empty">${errMsg(e)}</div>`; }
  }

  let pickerMap = null;
  let pickerMarker = null;
  let pickedLocation = null;

  function openPersonalEventModal() {
    pickedLocation = null;
    openModal("📅 개인 일정 추가", `
      <div class="modal-body">
        <input type="text" id="pe-title" placeholder="일정 제목">
        <div style="display:flex;gap:8px">
          <div style="flex:1"><label class="form-label">시작일</label><input type="date" id="pe-start"></div>
          <div style="flex:1"><label class="form-label">종료일</label><input type="date" id="pe-end"></div>
        </div>
        <div>
          <label class="form-label">장소 (선택)</label>
          <div class="map-search-row">
            <input type="text" id="pe-loc" placeholder="장소 검색 또는 주소">
            <button class="btn btn-pink btn-sm" onclick="App.searchPlace()">검색</button>
          </div>
          <div class="map-picker" id="pe-map"></div>
          <div class="map-result" id="pe-loc-result">지도를 클릭하거나 검색하세요</div>
        </div>
        <input type="text" id="pe-memo" placeholder="메모 (선택)">
        <button class="btn btn-pink" onclick="App.addPersonalEvent()">추가</button>
        <button class="modal-close" onclick="App.closeModal()">취소</button>
      </div>`);
    setTimeout(initPickerMap, 100);
  }

  function initPickerMap() {
    const mapEl = $("#pe-map");
    if (!mapEl || typeof L === "undefined") return;
    pickerMap = L.map(mapEl).setView([37.5665, 126.9780], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(pickerMap);
    pickerMap.on("click", (e) => {
      setPickerLocation(e.latlng.lat, e.latlng.lng);
    });
    setTimeout(() => pickerMap.invalidateSize(), 200);
  }

  function setPickerLocation(lat, lng) {
    pickedLocation = { lat, lng };
    if (pickerMarker) pickerMap.removeLayer(pickerMarker);
    pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      .then(r => r.json()).then(data => {
        const name = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        if ($("#pe-loc")) $("#pe-loc").value = name;
        if ($("#pe-loc-result")) $("#pe-loc-result").textContent = "📍 " + name;
      }).catch(() => {
        if ($("#pe-loc-result")) $("#pe-loc-result").textContent = `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      });
  }

  async function searchPlace() {
    const q = $("#pe-loc").value.trim();
    if (!q) { toast("검색어를 입력하세요"); return; }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
      const data = await res.json();
      if (!data.length) { toast("검색 결과가 없습니다"); return; }
      const { lat, lon, display_name } = data[0];
      pickerMap.setView([parseFloat(lat), parseFloat(lon)], 15);
      setPickerLocation(parseFloat(lat), parseFloat(lon));
    } catch (e) { toast("장소 검색 실패"); }
  }

  async function addPersonalEvent() {
    const title = $("#pe-title").value.trim();
    const start = $("#pe-start").value;
    const end = $("#pe-end").value || start;
    if (!title || !start) { toast("제목과 시작일을 입력하세요"); return; }
    if (end < start) { toast("종료일은 시작일보다 빠를 수 없습니다"); return; }
    try {
      const loc = $("#pe-loc").value.trim() || null;
      const { error } = await sb().from("personal_events").insert({
        user_id: currentUser.id, title, event_date: start, end_date: end,
        location: loc, memo: $("#pe-memo").value.trim() || null,
        lat: pickedLocation?.lat || null, lng: pickedLocation?.lng || null
      });
      if (error) throw error;
      closeModal();
      pickedLocation = null;
      toast("일정이 추가되었습니다");
      renderPersonalEvents();
    } catch (e) { toast(errMsg(e)); }
  }

  async function deletePersonalEvent(id) {
    try {
      const { error } = await sb().from("personal_events").delete().eq("id", id);
      if (error) throw error;
      renderPersonalEvents();
      toast("삭제되었습니다");
    } catch (e) { toast(errMsg(e)); }
  }

  // ─── 공유 캘린더 방 목록 ───
  async function renderRoomList() {
    const el = $("#room-list");
    if (!el) return;
    try {
      const { data: members } = await sb().from("room_members").select("room_id").eq("user_id", currentUser.id).eq("status", "accepted");
      const roomIds = (members || []).map(m => m.room_id);
      if (roomIds.length === 0) { el.innerHTML = `<div class="empty">참여 중인 공유 캘린더가 없어요<br>방을 만들어 친구를 초대해보세요!</div>`; return; }
      const { data: rooms, error } = await sb().from("calendar_rooms").select("*").in("id", roomIds).order("created_at", { ascending: false });
      if (error) throw error;
      el.innerHTML = (rooms || []).map(r => `
        <div class="room-card" onclick="App.enterRoom('${r.id}')">
          <div class="room-card-top">
            <div class="room-card-name">${escapeHtml(r.name)}</div>
            <div class="room-color-dot" style="background:${r.color || '#FFD1DC'}"></div>
          </div>
          <div class="room-card-meta">${escapeHtml(r.description || "설명 없음")}</div>
        </div>`).join("");
    } catch (e) { el.innerHTML = `<div class="empty">${errMsg(e)}</div>`; }
  }

  function openCreateRoomModal() {
    openModal("👥 공유 캘린더 만들기", `
      <div class="modal-body">
        <input type="text" id="cr-name" placeholder="방 이름 (예: 제주 여행)">
        <input type="text" id="cr-desc" placeholder="설명 (선택)">
        <div style="display:flex;gap:8px;align-items:center">
          <label class="form-label" style="margin:0">색상</label>
          <input type="color" id="cr-color" value="#FFD1DC" style="width:48px;height:40px;padding:2px">
        </div>
        <button class="btn btn-pink" onclick="App.createRoom()">만들기</button>
        <button class="modal-close" onclick="App.closeModal()">취소</button>
      </div>`);
  }

  async function createRoom() {
    const name = $("#cr-name").value.trim();
    if (!name) { toast("방 이름을 입력하세요"); return; }
    try {
      const { data, error } = await sb().from("calendar_rooms").insert({
        name, description: $("#cr-desc").value.trim() || null,
        owner_id: currentUser.id, color: $("#cr-color").value
      }).select("id").single();
      if (error) throw error;
      const { error: mErr } = await sb().from("room_members").insert({ room_id: data.id, user_id: currentUser.id });
      if (mErr && !mErr.message.includes("duplicate")) throw mErr;
      closeModal();
      toast("방이 생성되었습니다");
      enterRoom(data.id);
    } catch (e) { toast(errMsg(e)); }
  }

  // ═══ 공유 캘린더 방 ═══
  async function enterRoom(roomId) {
    currentRoom = roomId;
    go("room");
    await loadRoomData();
  }

  async function loadRoomData() {
    if (!currentRoom) return;
    try {
      const { data: room } = await sb().from("calendar_rooms").select("*").eq("id", currentRoom).single();
      if (room) { $("#room-name").textContent = room.name; }
      const { data: members } = await sb().from("room_members").select("user_id").eq("room_id", currentRoom).eq("status", "accepted");
      roomMembers = members || [];
      $("#room-meta").textContent = `멤버 ${roomMembers.length}명`;
      const memberIds = roomMembers.map(m => m.user_id);
      const { data: profiles } = await sb().from("profiles").select("id,nickname,avatar_url").in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
      const avs = (profiles || []).map(p => {
        const initial = (p.nickname || "?")[0].toUpperCase();
        const colors = ["#FFD1DC","#a0c4ff","#b5ead7","#ffd6a5","#c5b5ff"];
        const idx = memberIds.indexOf(p.id) % colors.length;
        const avInner = p.avatar_url ? `<img src="${p.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : escapeHtml(initial);
        return `<div class="sav" style="background:${colors[idx]}" title="${escapeHtml(p.nickname)}">${avInner}</div>`;
      }).join("");
      $("#room-members").innerHTML = avs + `<button class="sav-add" onclick="App.openInviteModal()">+</button>`;

      const { data: events } = await sb().from("calendar_events").select("*").eq("room_id", currentRoom).order("start_date", { ascending: true });
      roomEvents = events || [];
      renderRoomCal();
      renderRoomListCards();
      renderRoomVoteCards();
      renderRoomMemberList();
    } catch (e) { toast(errMsg(e)); }
  }

  function renderRoomCal() {
    const y = roomMonth.getFullYear(), m = roomMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();
    const prevLast = new Date(y, m, 0).getDate();
    const today = new Date();
    $("#room-mtitle").textContent = y + "." + MPAD(m + 1);

    const body = $("#room-cbody");
    body.innerHTML = "";
    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ d: prevLast - i, cur: false });
    for (let i = 1; i <= lastDate; i++) cells.push({ d: i, cur: true });
    while (cells.length % 7 !== 0) cells.push({ d: cells.length - firstDay - lastDate + 1, cur: false });

    cells.forEach((c, idx) => {
      const col = idx % 7;
      const div = document.createElement("div");
      let cls = "cday";
      if (!c.cur) cls += " other";
      if (col === 0) cls += " sun";
      if (col === 6) cls += " sat";
      const isToday = c.cur && y === today.getFullYear() && m === today.getMonth() && c.d === today.getDate();
      if (isToday) cls += " today";
      if (c.cur && c.d === selectedDay) cls += " sel";
      div.className = cls;
      div.onclick = () => c.cur && onDayClick(c.d, y, m);
      const dn = document.createElement("div");
      dn.className = "cdn"; dn.textContent = c.d;
      div.appendChild(dn);
      if (c.cur) {
        const dateStr = `${y}-${MPAD(m+1)}-${MPAD(c.d)}`;
        roomEvents.forEach(ev => {
          if (dateStr >= ev.start_date && dateStr <= ev.end_date) {
            const b = document.createElement("div");
            b.className = "cev cev-" + ev.type;
            b.textContent = ev.title;
            b.onclick = (e) => { e.stopPropagation(); App.openEventDetail(ev.id); };
            div.appendChild(b);
          }
        });
      }
      body.appendChild(div);
    });
    renderRoomPanel();
  }

  function renderRoomPanel() {
    const y = roomMonth.getFullYear(), m = roomMonth.getMonth();
    const today = new Date();
    const src = selectedDay
      ? roomEvents.filter(e => { const sd = `${y}-${MPAD(m+1)}-${MPAD(selectedDay)}`; return sd >= e.start_date && sd <= e.end_date; })
      : roomEvents.filter(e => new Date(e.start_date) >= today).slice(0, 5);
    $("#room-panel-title").textContent = selectedDay ? `${m+1}월 ${selectedDay}일` : "다가오는 약속";
    const el = $("#room-panel-cards");
    if (!src.length) { el.innerHTML = `<div class="empty">약속이 없어요 · 날짜를 클릭해 추가하세요</div>`; return; }
    el.innerHTML = src.map(ev => makeEventCard(ev, y, m)).join("");
  }

  function makeEventCard(ev, y, m) {
    const icon = { confirm: "✅", vote: "🗳", block: "🚫" }[ev.type] || "";
    const sDate = new Date(ev.start_date);
    const isMulti = ev.start_date !== ev.end_date;
    return `<div class="ecard ${ev.type === "vote" ? "vote" : ""}">
      <div class="ecard-l"><div class="ecard-day" style="${ev.type==="vote"?"color:#64b0ff":""}">${sDate.getDate()}</div><div class="ecard-dow">${DOWS[sDate.getDay()]}</div></div>
      <div class="ecard-r">
        <div class="ecard-title">${icon} ${escapeHtml(ev.title)}</div>
        <div class="ecard-meta">${escapeHtml(ev.location || "장소 미정")}${isMulti ? " · " + ev.start_date.slice(8) + "~" + ev.end_date.slice(8) + "일" : ""}</div>
      </div>
    </div>`;
  }

  function renderRoomListCards() {
    const el = $("#room-list-cards");
    const confirms = roomEvents.filter(e => e.type === "confirm");
    if (!confirms.length) { el.innerHTML = `<div class="empty" style="padding:40px 0">확정된 약속이 없어요</div>`; return; }
    const y = roomMonth.getFullYear(), m = roomMonth.getMonth();
    el.innerHTML = confirms.map(ev => makeEventCard(ev, y, m)).join("");
  }

  function renderRoomVoteCards() {
    const el = $("#room-vote-cards");
    const votes = roomEvents.filter(e => e.type === "vote");
    if (!votes.length) { el.innerHTML = `<div class="empty" style="padding:40px 0">진행 중인 투표가 없어요</div>`; return; }
    const y = roomMonth.getFullYear(), m = roomMonth.getMonth();
    el.innerHTML = votes.map(ev => makeEventCard(ev, y, m)).join("");
  }

  async function renderRoomMemberList() {
    const el = $("#room-member-list");
    if (!el) return;
    const memberIds = roomMembers.map(m => m.user_id);
    if (!memberIds.length) { el.innerHTML = `<div class="empty">멤버가 없습니다</div>`; return; }
    const { data: profiles } = await sb().from("profiles").select("id,nickname,avatar_url").in("id", memberIds);
    el.innerHTML = (profiles || []).map(p => {
      const initial = (p.nickname || "?")[0].toUpperCase();
      const colors = ["#FFD1DC","#a0c4ff","#b5ead7","#ffd6a5","#c5b5ff"];
      const idx = memberIds.indexOf(p.id) % colors.length;
      const avInner = p.avatar_url ? `<img src="${p.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : escapeHtml(initial);
      return `<div class="friend-item"><div class="friend-av" style="background:${colors[idx]}">${avInner}</div><div class="friend-name">${escapeHtml(p.nickname || "사용자")}</div></div>`;
    }).join("");
  }

  function onDayClick(d, y, m) {
    selectedDay = selectedDay === d ? null : d;
    renderRoomCal();
    if (selectedDay) {
      const dateStr = `${y}-${MPAD(m+1)}-${MPAD(d)}`;
      openModal(`${m+1}월 ${d}일 (${DOWS[new Date(y,m,d).getDay()]})`, `
        <div class="modal-body">
          <button class="modal-opt" onclick="App.openEventForm('confirm','${dateStr}')"><strong>✅ 약속 확정</strong><span>날짜와 장소를 확정된 약속으로 등록</span></button>
          <button class="modal-opt" onclick="App.openEventForm('vote','${dateStr}')"><strong>🗳 날짜 투표 열기</strong><span>멤버들에게 가능 여부 투표</span></button>
          <button class="modal-opt" onclick="App.openEventForm('block','${dateStr}')"><strong>🚫 안 되는 날 표시</strong><span>이 날짜 참여 불가능 알림</span></button>
          <button class="modal-close" onclick="App.closeModal()">취소</button>
        </div>`);
    }
  }

  function openEventForm(type, dateStr) {
    const labels = { confirm: "약속 확정", vote: "날짜 투표", block: "안 되는 날" };
    pickedLocation = null;
    openModal(`${labels[type]} 추가`, `
      <div class="modal-body">
        <input type="text" id="ev-title" placeholder="제목" value="${labels[type]}">
        <div style="display:flex;gap:8px">
          <div style="flex:1"><label class="form-label">시작일</label><input type="date" id="ev-start" value="${dateStr}"></div>
          <div style="flex:1"><label class="form-label">종료일</label><input type="date" id="ev-end" value="${dateStr}"></div>
        </div>
        ${type !== "block" ? `
        <div>
          <label class="form-label">장소 (선택)</label>
          <div class="map-search-row">
            <input type="text" id="ev-loc" placeholder="장소 검색 또는 주소">
            <button class="btn btn-pink btn-sm" onclick="App.searchEventPlace()">검색</button>
          </div>
          <div class="map-picker" id="ev-map"></div>
          <div class="map-result" id="ev-loc-result">지도를 클릭하거나 검색하세요</div>
        </div>` : ""}
        <button class="btn btn-pink" onclick="App.addRoomEvent('${type}')">추가</button>
        <button class="modal-close" onclick="App.closeModal()">취소</button>
      </div>`);
    if (type !== "block") setTimeout(initEventPickerMap, 100);
  }

  function initEventPickerMap() {
    const mapEl = $("#ev-map");
    if (!mapEl || typeof L === "undefined") return;
    pickerMap = L.map(mapEl).setView([37.5665, 126.9780], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(pickerMap);
    pickerMap.on("click", (e) => setEventLocation(e.latlng.lat, e.latlng.lng));
    setTimeout(() => pickerMap.invalidateSize(), 200);
  }

  function setEventLocation(lat, lng) {
    pickedLocation = { lat, lng };
    if (pickerMarker) pickerMap.removeLayer(pickerMarker);
    pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      .then(r => r.json()).then(data => {
        const name = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        if ($("#ev-loc")) $("#ev-loc").value = name;
        if ($("#ev-loc-result")) $("#ev-loc-result").textContent = "📍 " + name;
      }).catch(() => {
        if ($("#ev-loc-result")) $("#ev-loc-result").textContent = `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      });
  }

  async function searchEventPlace() {
    const q = $("#ev-loc").value.trim();
    if (!q) { toast("검색어를 입력하세요"); return; }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
      const data = await res.json();
      if (!data.length) { toast("검색 결과가 없습니다"); return; }
      const { lat, lon } = data[0];
      pickerMap.setView([parseFloat(lat), parseFloat(lon)], 15);
      setEventLocation(parseFloat(lat), parseFloat(lon));
    } catch (e) { toast("장소 검색 실패"); }
  }

  async function addRoomEvent(type) {
    const title = $("#ev-title").value.trim();
    const start = $("#ev-start").value;
    const end = $("#ev-end").value;
    if (!title || !start || !end) { toast("제목과 날짜를 입력하세요"); return; }
    if (end < start) { toast("종료일은 시작일보다 빠를 수 없습니다"); return; }
    try {
      const loc = $("#ev-loc") ? $("#ev-loc").value.trim() : null;
      const { error } = await sb().from("calendar_events").insert({
        room_id: currentRoom, user_id: currentUser.id, title, type,
        start_date: start, end_date: end, location: loc, created_by: currentUser.id,
        lat: pickedLocation?.lat || null, lng: pickedLocation?.lng || null
      });
      if (error) throw error;
      closeModal();
      selectedDay = null;
      toast("추가되었습니다");
      await loadRoomData();
    } catch (e) { toast(errMsg(e)); }
  }

  function prevRoomMonth() { roomMonth = new Date(roomMonth.getFullYear(), roomMonth.getMonth() - 1, 1); selectedDay = null; renderRoomCal(); }
  function nextRoomMonth() { roomMonth = new Date(roomMonth.getFullYear(), roomMonth.getMonth() + 1, 1); selectedDay = null; renderRoomCal(); }

  function switchRoomTab(name, el) {
    document.querySelectorAll(".stab").forEach(t => t.classList.remove("active"));
    el.classList.add("active");
    ["cal","list","vote","members"].forEach(n => {
      const t = $("#rt-" + n);
      if (t) t.style.display = n === name ? "block" : "none";
    });
    $("#room-panel").style.display = name === "cal" ? "block" : "none";
  }

  // ─── 친구 초대 ───
  function openInviteModal() {
    openModal("친구 초대", `
      <div class="modal-body">
        <p style="font-size:13px;color:var(--sub)">닉네임으로 검색하세요</p>
        <div class="map-search-row">
          <input type="text" id="iv-search" placeholder="닉네임 입력" oninput="App.searchUsers('iv')">
          <button class="btn btn-pink btn-sm" onclick="App.searchUsers('iv')">검색</button>
        </div>
        <div id="iv-results" style="max-height:300px;overflow-y:auto"></div>
        <button class="modal-close" onclick="App.closeModal()">취소</button>
      </div>`);
  }

  // ═══ 마이페이지 ═══
  async function renderMypage() {
    if (!currentUser) return;
    try {
      const { data: profile } = await sb().from("profiles").select("nickname,avatar_url,email").eq("id", currentUser.id).single();
      if (profile?.nickname) currentUser.nickname = profile.nickname;
      currentUser.avatar_url = profile?.avatar_url || null;
    } catch (e) {}
    const avatarEl = $("#mp-avatar");
    if (currentUser.avatar_url) {
      avatarEl.innerHTML = `<img src="${currentUser.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
      avatarEl.textContent = currentUser.nickname[0].toUpperCase();
    }
    $("#mp-name").textContent = currentUser.nickname;
    $("#mp-email").textContent = currentUser.email;
    await renderFriends();
  }

  function triggerAvatarUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { toast("이미지는 2MB 이하만 가능합니다"); return; }
      try {
        const ext = file.name.split(".").pop();
        const path = `${currentUser.id}.${ext}`;
        const { error: upErr } = await sb().storage.from("avatars").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = sb().storage.from("avatars").getPublicUrl(path);
        const url = urlData.publicUrl + "?t=" + Date.now();
        const { error: pErr } = await sb().from("profiles").update({ avatar_url: url }).eq("id", currentUser.id);
        if (pErr) throw pErr;
        currentUser.avatar_url = url;
        $("#mp-avatar").innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        toast("프로필 사진이 변경되었습니다");
      } catch (e) { toast(errMsg(e)); }
    };
    input.click();
  }

  async function updateProfile(e) {
    e.preventDefault();
    const newName = $("#mp-newname").value.trim();
    if (!newName) { toast("이름을 입력하세요"); return; }
    if (newName === currentUser.nickname) { toast("현재 이름과 같습니다"); return; }
    try {
      const { data: existing } = await sb().from("profiles").select("id").eq("nickname", newName).neq("id", currentUser.id).maybeSingle();
      if (existing) { toast("이미 사용 중인 닉네임입니다"); return; }
      const { error: pErr } = await sb().from("profiles").update({ nickname: newName }).eq("id", currentUser.id);
      if (pErr) throw pErr;
      await sb().auth.updateUser({ data: { nickname: newName } });
      currentUser.nickname = newName;
      if (!currentUser.avatar_url) $("#mp-avatar").textContent = newName[0].toUpperCase();
      $("#mp-name").textContent = newName;
      $("#mp-newname").value = "";
      toast("이름이 변경되었습니다");
    } catch (e) { toast(errMsg(e)); }
  }

  // ─── 친구 시스템 ───
  async function renderFriends() {
    const el = $("#friend-list");
    const reqEl = $("#friend-requests");
    const colors = ["#FFD1DC","#a0c4ff","#b5ead7","#ffd6a5","#c5b5ff"];
    try {
      const { data: friends, error: fErr } = await sb().from("friends")
        .select("*").or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`);
      if (fErr) throw fErr;
      const accepted = (friends || []).filter(f => f.status === "accepted");
      const pending = (friends || []).filter(f => f.status === "pending" && f.friend_id === currentUser.id);
      const sentPending = (friends || []).filter(f => f.status === "pending" && f.user_id === currentUser.id);

      const allIds = [...new Set([
        ...accepted.map(f => f.user_id === currentUser.id ? f.friend_id : f.user_id),
        ...pending.map(f => f.user_id),
        ...sentPending.map(f => f.friend_id)
      ])];
      const pMap = {};
      if (allIds.length > 0) {
        const { data: profiles } = await sb().from("profiles").select("id,nickname,avatar_url").in("id", allIds);
        (profiles || []).forEach(p => pMap[p.id] = { name: p.nickname || "사용자", avatar: p.avatar_url });
      }

      const makeAv = (id) => {
        const info = pMap[id] || { name: "?", avatar: null };
        const initial = (info.name || "?")[0].toUpperCase();
        const color = colors[Math.abs(id.charCodeAt(0)) % colors.length];
        return info.avatar
          ? `<img src="${info.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
          : escapeHtml(initial);
      };
      const getColor = (id) => colors[Math.abs(id.charCodeAt(0)) % colors.length];

      el.innerHTML = accepted.length ? accepted.map(f => {
        const fid = f.user_id === currentUser.id ? f.friend_id : f.user_id;
        const info = pMap[fid] || { name: "사용자" };
        return `<div class="friend-item" style="cursor:pointer" onclick="App.viewFriendCal('${fid}','${escapeHtml(info.name)}')"><div class="friend-av" style="background:${getColor(fid)}">${makeAv(fid)}</div><div class="friend-name">${escapeHtml(info.name)}<div style="font-size:11px;color:var(--sub);font-weight:400;margin-top:2px">📅 캘린더 보기</div></div><span class="friend-status accepted">친구</span></div>`;
      }).join("") : `<div class="empty">아직 친구가 없어요<br>닉네임으로 친구를 찾아보세요!</div>`;

      let reqHtml = "";
      if (pending.length > 0) {
        reqHtml += `<div style="margin-top:16px"><strong style="font-size:13px;color:var(--sub)">받은 친구 요청 (${pending.length})</strong>`;
        reqHtml += pending.map(f => {
          const info = pMap[f.user_id] || { name: "사용자" };
          return `<div class="friend-item"><div class="friend-av" style="background:${getColor(f.user_id)}">${makeAv(f.user_id)}</div><div class="friend-name">${escapeHtml(info.name)}</div><button class="btn-accept" onclick="App.acceptFriend('${f.id}')">수락</button></div>`;
        }).join("") + `</div>`;
      }
      if (sentPending.length > 0) {
        reqHtml += `<div style="margin-top:16px"><strong style="font-size:13px;color:var(--sub)">보낸 요청 (${sentPending.length})</strong>`;
        reqHtml += sentPending.map(f => {
          const info = pMap[f.friend_id] || { name: "사용자" };
          return `<div class="friend-item"><div class="friend-name">${escapeHtml(info.name)}</div><span class="friend-status pending">대기 중</span></div>`;
        }).join("") + `</div>`;
      }
      reqEl.innerHTML = reqHtml;
    } catch (e) { el.innerHTML = `<div class="empty">${errMsg(e)}</div>`; }
  }

  let friendCalMonth = new Date();

  async function viewFriendCal(friendId, friendName) {
    friendCalMonth = new Date();
    openModal(`📅 ${friendName}님의 캘린더`, `
      <div class="modal-body">
        <div class="mc-nav">
          <button class="mc-nav-btn" onclick="App.prevFriendMonth('${friendId}','${escapeHtml(friendName)}')">‹</button>
          <div class="mc-title" id="fc-title"></div>
          <button class="mc-nav-btn" onclick="App.nextFriendMonth('${friendId}','${escapeHtml(friendName)}')">›</button>
        </div>
        <div class="mc-grid" id="fc-grid"></div>
        <div id="fc-events" style="margin-top:16px"></div>
        <button class="modal-close" onclick="App.closeModal()">닫기</button>
      </div>`);
    await renderFriendCal(friendId, friendName);
  }

  async function renderFriendCal(friendId, friendName) {
    const y = friendCalMonth.getFullYear(), m = friendCalMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();
    const prevLast = new Date(y, m, 0).getDate();
    const today = new Date();
    $("#fc-title").textContent = `${y}.${MPAD(m+1)}`;

    const monthStart = `${y}-${MPAD(m+1)}-01`;
    const monthEnd = `${y}-${MPAD(m+1)}-${MPAD(lastDate)}`;
    let events = [];
    try {
      const { data } = await sb().from("personal_events").select("*").eq("user_id", friendId)
        .lte("event_date", monthEnd).gte("event_date", monthStart);
      events = data || [];
    } catch (e) {}

    const evMap = {};
    events.forEach(ev => {
      const start = new Date(ev.event_date);
      const end = new Date(ev.end_date || ev.event_date);
      for (let d = start.getDate(); d <= end.getDate(); d++) {
        if (!evMap[d]) evMap[d] = [];
        evMap[d].push(ev);
      }
    });

    let html = DOWS.map(d => `<div class="mc-wd">${d}</div>`).join("");
    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ d: prevLast - i, cur: false });
    for (let i = 1; i <= lastDate; i++) cells.push({ d: i, cur: true });
    while (cells.length % 7 !== 0) cells.push({ d: cells.length - firstDay - lastDate + 1, cur: false });

    cells.forEach(c => {
      let cls = "mc-day";
      if (!c.cur) cls += " other";
      const isToday = c.cur && y === today.getFullYear() && m === today.getMonth() && c.d === today.getDate();
      if (isToday) cls += " today";
      const evs = c.cur ? (evMap[c.d] || []) : [];
      const badges = evs.slice(0, 2).map(ev => `<div class="mc-ev-badge pink">${escapeHtml(ev.title.length > 8 ? ev.title.slice(0,8)+"…" : ev.title)}</div>`).join("");
      html += `<div class="${cls}"><span class="mc-dn">${c.d}</span>${badges}</div>`;
    });

    $("#fc-grid").innerHTML = html;

    const upcoming = events.filter(ev => new Date(ev.event_date) >= today).slice(0, 5);
    const evEl = $("#fc-events");
    if (!upcoming.length) {
      evEl.innerHTML = `<div class="empty">다가오는 일정이 없어요</div>`;
    } else {
      evEl.innerHTML = `<strong style="font-size:12px;color:var(--sub);display:block;margin-bottom:10px">다가오는 일정</strong><div class="ev-cards">${upcoming.map(ev => {
        const d = new Date(ev.event_date);
        const isMulti = ev.end_date && ev.end_date !== ev.event_date;
        const range = isMulti ? `${ev.event_date.slice(5)} ~ ${ev.end_date.slice(5)}` : ev.event_date.slice(5);
        return `<div class="ecard"><div class="ecard-l"><div class="ecard-day">${d.getDate()}</div><div class="ecard-dow">${DOWS[d.getDay()]}</div></div><div class="ecard-r"><div class="ecard-title">${escapeHtml(ev.title)}</div><div class="ecard-meta">${range}${ev.location ? " · " + escapeHtml(ev.location) : ""}</div></div></div>`;
      }).join("")}</div>`;
    }
  }

  function prevFriendMonth(id, name) { friendCalMonth = new Date(friendCalMonth.getFullYear(), friendCalMonth.getMonth() - 1, 1); renderFriendCal(id, name); }
  function nextFriendMonth(id, name) { friendCalMonth = new Date(friendCalMonth.getFullYear(), friendCalMonth.getMonth() + 1, 1); renderFriendCal(id, name); }

  function openAddFriendModal() {
    openModal("친구 추가", `
      <div class="modal-body">
        <p style="font-size:13px;color:var(--sub)">닉네임으로 검색하세요</p>
        <div class="map-search-row">
          <input type="text" id="af-search" placeholder="닉네임 입력" oninput="App.searchUsers('af')">
          <button class="btn btn-pink btn-sm" onclick="App.searchUsers('af')">검색</button>
        </div>
        <div id="af-results" style="max-height:300px;overflow-y:auto"></div>
        <button class="modal-close" onclick="App.closeModal()">취소</button>
      </div>`);
  }

  async function searchUsers(prefix) {
    const q = $("#" + prefix + "-search").value.trim();
    const el = $("#" + prefix + "-results");
    if (!q) { el.innerHTML = ""; return; }
    try {
      const { data, error } = await sb().from("user_search").select("id,nickname,avatar_url").ilike("nickname", "%" + q + "%").limit(10);
      if (error) throw error;
      if (!data || data.length === 0) { el.innerHTML = `<div class="empty">검색 결과가 없습니다</div>`; return; }
      el.innerHTML = data.filter(u => u.id !== currentUser.id).map(u => `
        <div class="friend-item" style="cursor:pointer" onclick="App.${prefix === "af" ? "addFriendById" : "inviteById"}('${u.id}','${escapeHtml(u.nickname)}')">
          <div class="friend-av" style="background:#FFD1DC">${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : escapeHtml((u.nickname||"?")[0].toUpperCase())}</div>
          <div class="friend-name">${escapeHtml(u.nickname)}</div>
          <span style="font-size:12px;color:var(--pink-d);font-weight:600">${prefix === "af" ? "+ 추가" : "+ 초대"}</span>
        </div>`).join("");
    } catch (e) { el.innerHTML = `<div class="empty">${errMsg(e)}</div>`; }
  }

  async function addFriendById(id, name) {
    try {
      const { error } = await sb().from("friends").insert({ user_id: currentUser.id, friend_id: id, status: "pending" });
      if (error) {
        if (error.message.includes("duplicate")) toast("이미 요청했거나 친구입니다");
        else throw error;
        return;
      }
      toast(`${name}님에게 친구 요청을 보냈습니다`);
      searchUsers("af");
    } catch (e) { toast(errMsg(e)); }
  }

  async function inviteById(id, name) {
    try {
      const { error } = await sb().from("room_members").insert({ room_id: currentRoom, user_id: id, status: "pending" });
      if (error) {
        if (error.message.includes("duplicate")) toast("이미 초대했거나 멤버입니다");
        else throw error;
        return;
      }
      toast(`${name}님에게 초대를 보냈습니다`);
      closeModal();
    } catch (e) { toast(errMsg(e)); }
  }

  async function acceptFriend(id) {
    try {
      const { error } = await sb().from("friends").update({ status: "accepted" }).eq("id", id);
      if (error) throw error;
      toast("친구가 되었습니다!");
      renderFriends();
    } catch (e) { toast(errMsg(e)); }
  }

  // ─── 유틸 ───
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
  }

  // ─── 초기화 ───
  function init() {
    initAuth();
    $("#modal-overlay").addEventListener("click", closeModal);
  }

  return {
    init, go, logoClick, closeModal, togglePw,
    handleLogin, handleSignup, doLogout,
    prevPersonalMonth, nextPersonalMonth,
    openPersonalEventModal, addPersonalEvent, deletePersonalEvent, searchPlace,
    openCreateRoomModal, createRoom, enterRoom,
    prevRoomMonth, nextRoomMonth, switchRoomTab,
    openEventForm, addRoomEvent, searchEventPlace,
    openInviteModal, searchUsers, inviteById, acceptRoomInvite, declineRoomInvite,
    updateProfile, triggerAvatarUpload, openAddFriendModal, addFriendById, acceptFriend,
    viewFriendCal, prevFriendMonth, nextFriendMonth,
    renderFriends
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
