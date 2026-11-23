/* =====================================================================
   ModoParche · pitch.js
   Interactive keyboard, touch & speaker-cue controls for /pitch
===================================================================== */
(function () {
  'use strict';
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var dotsBox = document.getElementById('deckDots');
  var countEl = document.getElementById('slideCount');
  var barEl = document.getElementById('barFill');
  var btnPrev = document.getElementById('btnPrev');
  var btnNext = document.getElementById('btnNext');
  var btnNotes = document.getElementById('btnNotes');
  var btnFull = document.getElementById('btnFull');
  var notesDrawer = document.getElementById('notesDrawer');
  var notesText = document.getElementById('notesText');
  var total = slides.length;
  var index = 0;

  var dots = slides.map(function (_s, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'deck-dot';
    b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    b.addEventListener('click', function () { go(i); });
    dotsBox.appendChild(b);
    return b;
  });

  function go(n) {
    index = Math.max(0, Math.min(total - 1, n));
    slides.forEach(function (s, i) {
      s.classList.toggle('is-active', i === index);
      if (i === index) s.scrollTop = 0;
    });
    dots.forEach(function (d, i) { d.classList.toggle('is-on', i === index); });
    countEl.textContent = (index + 1) + ' / ' + total;
    barEl.style.width = (((index + 1) / total) * 100).toFixed(2) + '%';
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === total - 1;
    notesText.textContent = slides[index].getAttribute('data-note') || '';
    if (history.replaceState) history.replaceState(null, '', '#slide-' + (index + 1));
  }

  function toggleNotes() {
    var on = notesDrawer.hidden;
    notesDrawer.hidden = !on;
    btnNotes.setAttribute('aria-pressed', String(on));
  }

  function toggleFull() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
  }

  btnPrev.addEventListener('click', function () { go(index - 1); });
  btnNext.addEventListener('click', function () { go(index + 1); });
  btnNotes.addEventListener('click', toggleNotes);
  btnFull.addEventListener('click', toggleFull);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(index + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(total - 1); }
    else if (e.key === 'n' || e.key === 'N') { toggleNotes(); }
    else if (e.key === 'f' || e.key === 'F') { toggleFull(); }
  });

  // Touch swipe navigation for mobile/tablet presenting
  var x0 = null, y0 = null;
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    x0 = null; y0 = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      go(dx < 0 ? index + 1 : index - 1);
    }
  }, { passive: true });

  var hashMatch = /^#slide-(\d+)$/.exec(location.hash);
  go(hashMatch ? parseInt(hashMatch[1], 10) - 1 : 0);
})();
