const slides = [...document.querySelectorAll('.slide')];
  const counter = document.getElementById('counter');
  const progress = document.getElementById('progress');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  let i = Math.min(Math.max(parseInt(location.hash.slice(1), 10) - 1 || 0, 0), slides.length - 1);

  function show(n) {
    i = Math.min(Math.max(n, 0), slides.length - 1);
    slides.forEach((s, k) => s.classList.toggle('active', k === i));
    slides[i].scrollTop = 0;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === slides.length - 1;
    counter.textContent = `${i + 1} / ${slides.length}`;
    progress.style.width = `${((i + 1) / slides.length) * 100}%`;
    history.replaceState(null, '', `#${i + 1}`);
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('button')) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); show(i + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); show(i - 1); }
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(slides.length - 1);
    else if (e.key.toLowerCase() === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
    else if (e.key.toLowerCase() === 'p') window.print();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('a, button')) show(e.clientX > innerWidth / 3 ? i + 1 : i - 1); });
  prevBtn.addEventListener('click', () => show(i - 1));
  nextBtn.addEventListener('click', () => show(i + 1));

  // Swipe left/right between slides. Listeners are passive, so vertical scrolling stays native;
  // gestures that start inside a horizontally scrollable box (wide tables) are left alone.
  let touch = null;
  const scrollsX = (el) => {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  };
  document.addEventListener('touchstart', (e) => {
    touch = e.touches.length === 1 && !scrollsX(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) touch = null; }, { passive: true });
  document.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!touch || (window.visualViewport && visualViewport.scale > 1.05)) { touch = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(dx < 0 ? i + 1 : i - 1);
  }, { passive: true });

  // Falling petals on cover slides
  document.querySelectorAll('.petals').forEach((box) => {
    for (let k = 0; k < 14; k++) {
      const p = document.createElement('span');
      p.textContent = k % 3 ? '❀' : '✿';
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${9 + Math.random() * 10}s`;
      p.style.animationDelay = `${-Math.random() * 18}s`;
      p.style.fontSize = `${0.9 + Math.random() * 1.2}rem`;
      box.appendChild(p);
    }
  });

  setTimeout(() => document.getElementById('hint').style.opacity = 0, 4000);
  show(i);
