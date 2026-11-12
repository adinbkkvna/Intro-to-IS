// Frontend logic for all pages. Owner: Adina (Student 4).
// Safe by design: text from the server is put into the page with textContent, never innerHTML.
(function () {
  'use strict';

  // ---------- helpers ----------
  async function api(path, method, body) {
    const res = await fetch('/api' + path, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  function showMsg(id, text, kind) {
    const box = document.getElementById(id);
    if (!box) return;
    box.textContent = text;
    box.className = 'msg ' + (kind || 'error');
  }

  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDay = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtDateTime = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ---------- top bar ----------
  async function renderNav() {
    const nav = document.getElementById('nav');
    if (!nav) return null;
    let me = null;
    try { me = (await api('/me')).member; } catch (e) { /* not logged in */ }
    const page = document.body.dataset.page;
    const link = (href, text, key) => el('a', { href, class: 'link' + (page === key ? ' active' : ''), text });
    const inner = el('div', { class: 'nav-inner' }, [
      el('a', { href: '/', class: 'brand' }, [document.createTextNode('Fit'), el('span', { text: 'Zone' })]),
    ]);
    if (me) {
      inner.appendChild(link('/sessions.html', 'Classes', 'sessions'));
      inner.appendChild(link('/trainers.html', 'Trainers', 'trainers'));
      inner.appendChild(link('/profile.html', 'Profile', 'profile'));
      if (me.role === 'staff' || me.role === 'admin') inner.appendChild(link('/admin.html', 'Manager report', 'admin'));
      const out = el('button', { class: 'link', type: 'button', text: 'Log out' });
      out.addEventListener('click', async () => { await api('/auth/logout', 'POST', {}); location.href = '/'; });
      inner.appendChild(out);
    } else {
      inner.appendChild(link('/', 'Log in', 'login'));
      inner.appendChild(el('a', { href: '/register.html', class: 'btn small', text: 'Sign up' }));
    }
    nav.replaceChildren(inner);
    return me;
  }

  // ---------- pages ----------
  const pages = {
    async register(me) {
      if (me) { location.href = '/sessions.html'; return; }
      const { plans } = await api('/plans');
      const select = document.getElementById('plan_id');
      plans.forEach((p) => select.appendChild(el('option', { value: p.plan_id, text: p.name + ' ($' + Number(p.price).toFixed(0) + ')' })));

      const pw = document.getElementById('password');
      const rules = {
        len: [(v) => v.length >= 8, 'At least 8 characters'],
        letter: [(v) => /[A-Za-z]/.test(v), 'A letter'],
        digit: [(v) => /[0-9]/.test(v), 'A digit'],
      };
      const box = document.getElementById('pw-rules');
      const chips = {};
      Object.entries(rules).forEach(([k, r]) => { chips[k] = el('span', { text: r[1] }); box.appendChild(chips[k]); });
      pw.addEventListener('input', () => Object.entries(rules).forEach(([k, r]) => chips[k].classList.toggle('met', r[0](pw.value))));

      document.getElementById('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          await api('/auth/register', 'POST', {
            full_name: document.getElementById('full_name').value,
            email: document.getElementById('email').value,
            password: pw.value,
            plan_id: Number(select.value),
          });
          location.href = '/sessions.html';
        } catch (e) { showMsg('msg', e.message); }
      });
    },

    async login(me) {
      if (me) { location.href = '/sessions.html'; return; }
      document.getElementById('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          await api('/auth/login', 'POST', {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
          });
          location.href = '/sessions.html';
        } catch (e) { showMsg('msg', e.message); }
      });
    },

    async sessions(me) {
      if (!me) { location.href = '/'; return; }
      const list = document.getElementById('list');
      const filterBox = document.getElementById('filters');
      let filter = 'All';
      let all = [];
      const CANCEL_MS = 2 * 3600 * 1000;
      function drawFilters() {
        filterBox.replaceChildren();
        ['All', ...new Set(all.map((s) => s.class_name))].forEach((name) => {
          const b = el('button', { class: 'chip' + (name === filter ? ' on' : ''), type: 'button', text: name });
          b.addEventListener('click', () => { filter = name; drawFilters(); draw(); });
          filterBox.appendChild(b);
        });
      }
      async function load() {
        all = (await api('/sessions')).sessions;
        drawFilters();
        draw();
      }
      function draw() {
        const sessions = all.filter((s) => filter === 'All' || s.class_name === filter);
        list.replaceChildren();
        let lastDay = '';
        let dayBox = null;
        sessions.forEach((s) => {
          const day = fmtDay(s.start_time);
          if (day !== lastDay) {
            lastDay = day;
            dayBox = el('div', { class: 'day' }, [el('h3', { text: day })]);
            list.appendChild(dayBox);
          }
          const booked = s.my_booking_id !== null;
          const badge = booked ? el('span', { class: 'badge mine', text: 'Booked' })
            : s.free_places <= 0 ? el('span', { class: 'badge full', text: 'Full' })
            : el('span', { class: 'badge ' + (s.free_places <= 3 ? 'low' : 'ok'), text: s.free_places + ' places left' });
          const btn = booked ? el('button', { class: 'btn small danger', type: 'button', text: 'Cancel' })
            : el('button', { class: 'btn small', type: 'button', text: 'Book' });
          if (!booked && s.free_places <= 0) btn.disabled = true;
          if (booked && new Date(s.start_time) - Date.now() < CANCEL_MS) { btn.disabled = true; btn.textContent = 'Locked'; btn.title = 'Cancelling closes 2 hours before the class'; }
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              if (booked) await api('/bookings/' + s.my_booking_id, 'DELETE');
              else await api('/bookings', 'POST', { session_id: s.session_id });
              showMsg('msg', booked ? 'Booking cancelled' : 'Booked. See you there!', 'ok');
              all = (await api('/sessions')).sessions; draw();
            } catch (e) { showMsg('msg', e.message); btn.disabled = false; }
          });
          dayBox.appendChild(el('div', { class: 'session' }, [
            el('div', { class: 'time', text: fmtTime(s.start_time) }),
            el('div', { class: 'info' }, [
              el('b', { text: s.class_name }),
              el('div', { class: 'muted', text: s.trainer + ' · ' + s.room }),
            ]),
            badge, btn,
          ]));
        });
        if (sessions.length === 0) list.appendChild(el('p', { class: 'muted', text: 'No sessions in the next 14 days.' }));
      }
      await load();
    },

    async profile(me) {
      if (!me) { location.href = '/'; return; }
      const { plans } = await api('/plans');
      const select = document.getElementById('plan_id');
      plans.forEach((p) => select.appendChild(el('option', { value: p.plan_id, text: p.name })));

      function fill(m) {
        document.getElementById('hello').textContent = 'Hello, ' + m.full_name.split(' ')[0];
        document.getElementById('full_name').value = m.full_name;
        document.getElementById('email').value = m.email;
        document.getElementById('phone').value = m.phone || '';
        select.value = m.plan_id;
        document.getElementById('status').textContent = m.status === 'active' ? 'Active member' : 'Membership not active';
        document.getElementById('status').className = 'badge ' + (m.status === 'active' ? 'ok' : 'full');
      }
      fill((await api('/me')).member);

      document.getElementById('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const r = await api('/me', 'PATCH', {
            full_name: document.getElementById('full_name').value,
            phone: document.getElementById('phone').value,
            plan_id: Number(select.value),
          });
          fill(r.member);
          showMsg('msg', 'Profile saved', 'ok');
        } catch (e) { showMsg('msg', e.message); }
      });

      document.getElementById('pw-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          await api('/me/password', 'POST', {
            current_password: document.getElementById('current_password').value,
            new_password: document.getElementById('new_password').value,
          });
          ev.target.reset();
          showMsg('pw-msg', 'Password changed', 'ok');
        } catch (e) { showMsg('pw-msg', e.message); }
      });

      async function loadBookings() {
        const { bookings } = await api('/me/bookings');
        const body = document.getElementById('bookings');
        body.replaceChildren();
        bookings.forEach((b) => {
          const upcoming = new Date(b.start_time) - Date.now() > 2 * 3600 * 1000 && b.status === 'booked';
          const act = el('td');
          if (upcoming) {
            const c = el('button', { class: 'btn small danger', type: 'button', text: 'Cancel' });
            c.addEventListener('click', async () => { try { await api('/bookings/' + b.booking_id, 'DELETE'); } catch (e) { showMsg('msg', e.message); } loadBookings(); });
            act.appendChild(c);
          }
          body.appendChild(el('tr', {}, [
            el('td', { text: b.class_name }), el('td', { text: fmtDateTime(b.start_time) }),
            el('td', { text: b.trainer }), el('td', { text: b.status.replace('_', '-') }), act,
          ]));
        });
        if (bookings.length === 0) body.appendChild(el('tr', {}, [el('td', { text: 'No bookings yet', colspan: '5' })]));
      }
      await loadBookings();
    },

    async trainers(me) {
      if (!me) { location.href = '/'; return; }
      const { trainers } = await api('/trainers');
      const box = document.getElementById('list');
      trainers.forEach((t) => box.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'avatar', text: t.full_name.charAt(0) }),
        el('h3', { text: t.full_name }),
        el('p', { class: 'muted', text: t.speciality || '' }),
        el('p', { text: t.bio || '' }),
        el('span', { class: 'badge ok', text: t.upcoming_sessions + ' classes in 14 days' }),
      ])));
    },

    async admin(me) {
      if (!me) { location.href = '/'; return; }
      let r;
      try { r = await api('/admin/report'); } catch (e) {
        document.getElementById('report').replaceChildren(el('p', { class: 'msg error', text: e.message }));
        return;
      }
      const k = r.kpi;
      const kpi = (label, value, sub, cls) => el('div', { class: 'kpi ' + (cls || '') }, [
        el('small', { text: label }), el('b', { text: value }), el('small', { text: sub }),
      ]);
      document.getElementById('kpis').replaceChildren(
        kpi('Fill rate', k.fill_rate_pct + '%', 'target ' + r.target_fill_pct + '%', k.fill_rate_pct < r.target_fill_pct ? 'bad' : ''),
        kpi('No-show rate', k.no_show_pct + '%', 'limit 10%', k.no_show_pct > 10 ? 'bad' : 'warn'),
        kpi('Sessions needing action', String(k.needing_action), 'of ' + k.sessions + ' sessions', 'bad'),
        kpi('Almost full', String(k.almost_full), 'sessions at 90% or more', ''),
      );
      const bars = document.getElementById('bars');
      bars.replaceChildren();
      r.by_time_slot.forEach((s) => {
        const cls = s.fill_rate_pct < 50 ? 'low' : s.fill_rate_pct < r.target_fill_pct ? 'mid' : '';
        bars.appendChild(el('div', { class: 'bar-col' }, [
          el('b', { text: s.fill_rate_pct + '%' }),
          el('div', { class: 'bar ' + cls, style: 'height:' + Math.round(s.fill_rate_pct * 1.9) + 'px' }),
          el('span', { text: s.time_slot }),
        ]));
      });
      const line = el('div', { class: 'target-line', style: 'bottom:' + (Math.round(r.target_fill_pct * 1.9) + 32) + 'px' }, [el('span', { text: 'Target ' + r.target_fill_pct + '%' })]);
      bars.appendChild(line);

      const body = document.getElementById('actions');
      body.replaceChildren();
      r.action_list.forEach((a) => body.appendChild(el('tr', {}, [
        el('td', { text: a.class_name + ' · ' + fmtDateTime(a.start_time) }),
        el('td', { text: a.fill_rate_pct + '%' }),
        el('td', { text: a.no_show_pct === null ? '-' : a.no_show_pct + '%' }),
        el('td', { text: [a.fill_flag, a.no_show_flag].filter((x) => x !== 'OK').join(', ') }),
      ])));
    },
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const me = await renderNav();
    const run = pages[document.body.dataset.page];
    if (run) run(me).catch((e) => console.error(e));
  });
})();
