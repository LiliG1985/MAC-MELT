// Mobile menu
const toggle = document.querySelector('.nav__toggle');
const links = document.getElementById('nav-links');
toggle.addEventListener('click', () => {
  const open = links.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Close' : 'Menu';
});
links.addEventListener('click', (e) => {
  if (e.target.closest('a') && links.classList.contains('is-open')) toggle.click();
});

// Food tabs (keyboard accessible)
const tabs = [...document.querySelectorAll('[role="tab"]')];
function select(tab) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => select(tab));
  tab.addEventListener('keydown', (e) => {
    let next = null;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
    if (e.key === 'Home') next = tabs[0];
    if (e.key === 'End') next = tabs[tabs.length - 1];
    if (next) { e.preventDefault(); select(next); next.focus(); }
  });
});

// Rotating dish banner: auto-advances, swipeable, pauses on hover/focus, no autoplay for reduced motion
(() => {
  const root = document.querySelector('.dishes');
  if (!root) return;
  const track = root.querySelector('.dishes__track');
  const slides = [...track.children];
  const dotsWrap = root.querySelector('.dishes__dots');
  const pauseBtn = root.querySelector('.dishes__pause');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let index = 0, timer = null, paused = reduce, hovering = false;

  const dots = slides.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Show ' + s.querySelector('h3').textContent);
    b.addEventListener('click', () => { go(i); restart(); });
    dotsWrap.appendChild(b);
    return b;
  });

  function mark(i) {
    index = i;
    dots.forEach((d, n) => d.setAttribute('aria-current', String(n === i)));
  }
  function go(i) {
    const n = (i + slides.length) % slides.length;
    track.scrollTo({ left: slides[n].offsetLeft - track.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
    mark(n);
  }
  function restart() {
    clearInterval(timer);
    if (!paused && !hovering) timer = setInterval(() => go(index + 1), 4500);
  }

  root.querySelectorAll('.dishes__btn').forEach((b) =>
    b.addEventListener('click', () => { go(index + Number(b.dataset.dir)); restart(); }));

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? 'Play' : 'Pause';
    restart();
  });
  if (reduce) { pauseBtn.textContent = 'Play'; pauseBtn.setAttribute('aria-pressed', 'true'); }

  // Keep dots in sync when someone swipes
  let t;
  track.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => mark(Math.round(track.scrollLeft / track.clientWidth)), 80);
  });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); restart(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); restart(); }
  });
  ['mouseenter', 'focusin'].forEach((ev) => root.addEventListener(ev, () => { hovering = true; restart(); }));
  ['mouseleave', 'focusout'].forEach((ev) => root.addEventListener(ev, () => { hovering = false; restart(); }));
  document.addEventListener('visibilitychange', () => { hovering = document.hidden; restart(); });

  mark(0);
  restart();
})();

// Opening hours: Friday and Saturday, 2pm to 8pm (UK time)
(() => {
  const OPEN_DAYS = [5, 6], OPEN = 14, CLOSE = 20;
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let day, hour;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    day = names.indexOf(parts.find((p) => p.type === 'weekday').value);
    hour = Number(parts.find((p) => p.type === 'hour').value);
  } catch (e) { const d = new Date(); day = d.getDay(); hour = d.getHours(); }

  const openNow = OPEN_DAYS.includes(day) && hour >= OPEN && hour < CLOSE;
  let text;
  if (openNow) text = 'Open now until 8pm';
  else if (OPEN_DAYS.includes(day) && hour < OPEN) text = 'Opens today at 2pm';
  else {
    let d = day;
    for (let i = 1; i <= 7; i++) { d = (day + i) % 7; if (OPEN_DAYS.includes(d)) break; }
    text = (d === (day + 1) % 7 ? 'Opens tomorrow' : 'Opens ' + names[d]) + ' at 2pm';
  }
  document.querySelectorAll('[data-open-status]').forEach((el) => {
    el.textContent = text;
    el.parentElement.querySelector('.dot')?.classList.toggle('is-open', openNow);
  });
  document.querySelector(`.hours tr[data-day="${day}"]`)?.classList.add('is-today');
})();

// Newsletter: posts to data-endpoint (Formspree, Mailchimp etc.). Until one is set, it opens an email to Mac and Melt.
(() => {
  const EMAIL = 'macandmelt2024@outlook.com';
  document.querySelectorAll('.signup').forEach((form) => {
    const msg = form.querySelector('.signup__msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      if (!input.checkValidity()) { msg.textContent = 'Enter an email address like name@example.com.'; input.focus(); return; }
      const endpoint = form.dataset.endpoint;
      if (!endpoint) {
        location.href = `mailto:${EMAIL}?subject=${encodeURIComponent('Newsletter sign-up')}&body=${encodeURIComponent('Please add ' + input.value + ' to the Mac and Melt newsletter.')}`;
        msg.textContent = 'Your email app will open. Send the message to join the list.';
        return;
      }
      msg.textContent = 'Signing you up…';
      try {
        const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        msg.textContent = "You're on the list. See you on Friday!";
        try { localStorage.setItem('mm-news', 'joined'); } catch (err) {}
      } catch (err) {
        msg.textContent = `That didn't go through. Try again, or email ${EMAIL}.`;
      }
    });
  });

  // Slide-in card: once per visitor, after 12 seconds or once they reach the food
  const popup = document.querySelector('.popup');
  if (!popup) return;
  let seen = null;
  try { seen = localStorage.getItem('mm-news'); } catch (e) {}
  if (seen) return;
  const show = () => {
    if (!popup.hidden || seen) return;
    seen = 'shown'; popup.hidden = false;
    try { localStorage.setItem('mm-news', 'shown'); } catch (e) {}
  };
  const small = window.matchMedia('(max-width: 600px)').matches;
  const t = setTimeout(show, small ? 25000 : 12000);
  const menu = document.getElementById('menu');
  if (!small && menu && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { show(); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(menu);
  }
  popup.querySelector('.popup__close').addEventListener('click', () => { popup.hidden = true; clearTimeout(t); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') popup.hidden = true; });
})();

document.getElementById('year').textContent = new Date().getFullYear();
