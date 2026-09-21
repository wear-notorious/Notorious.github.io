/*
  NOTORIOUS™ — Gray smoke trail
  Works on both desktop (mouse) and mobile (touch), respects
  prefers-reduced-motion, and never blocks clicks/taps or page scrolling.

  Include this file before </body> on any page you want the effect on:
  <script src="smoke-cursor.js" defer></script>
*/

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;

  var isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

  var canvas = document.createElement("canvas");
  canvas.id = "notoriousSmoke";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "40";
  canvas.style.mixBlendMode = "screen";
  // Melts the individual soft circles into one continuous smoke cloud.
  canvas.style.filter = isTouchDevice ? "blur(5px)" : "blur(6px)";

  function mount() {
    if (!document.body.contains(canvas)) document.body.appendChild(canvas);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  var ctx = canvas.getContext("2d");
  var width, height;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  // Neutral smoke-gray tones.
  var SMOKE_LIGHT = "235,235,235";
  var SMOKE_MID   = "170,170,170";
  var SMOKE_DARK  = "90,90,90";

  // Lighter budget on touch devices — weaker GPUs, smaller screens.
  var MAX_PARTICLES = isTouchDevice ? 80 : 120;
  var BASE_RADIUS   = isTouchDevice ? 5 : 6;
  var RADIUS_RANGE  = isTouchDevice ? 5 : 6;

  var particles = [];

  function spawnParticle(x, y) {
    if (particles.length > MAX_PARTICLES) particles.shift();

    particles.push({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      radius: BASE_RADIUS + Math.random() * RADIUS_RANGE,
      growth: 0.28 + Math.random() * 0.28,  // gentle, elegant expansion
      vx: (Math.random() - 0.5) * 0.25,
      vy: -0.2 - Math.random() * 0.35,      // slow, calm upward drift
      life: 1,
      decay: 0.009 + Math.random() * 0.010
    });
  }

  var lastX = null, lastY = null;

  function trailTo(x, y) {
    if (lastX === null) {
      spawnParticle(x, y);
    } else {
      // Fill the gap between the last and current position so fast
      // movement still reads as one continuous trail, not dots.
      var dx = x - lastX, dy = y - lastY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.floor(dist / 9));

      for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        spawnParticle(lastX + dx * t, lastY + dy * t);
      }
    }

    lastX = x;
    lastY = y;
  }

  function resetTrail() {
    lastX = null;
    lastY = null;
  }

  // Desktop: mouse
  window.addEventListener("mousemove", function (e) {
    trailTo(e.clientX, e.clientY);
  });

  // Mobile: touch. No preventDefault, so normal page scrolling
  // keeps working exactly as before.
  window.addEventListener(
    "touchstart",
    function (e) {
      var t = e.touches[0];
      if (t) trailTo(t.clientX, t.clientY);
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    function (e) {
      var t = e.touches[0];
      if (t) trailTo(t.clientX, t.clientY);
    },
    { passive: true }
  );

  window.addEventListener("touchend", resetTrail, { passive: true });
  window.addEventListener("touchcancel", resetTrail, { passive: true });

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.radius += p.growth; // expands as it ages
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      // Peak alpha kept low on purpose — a discreet glow, not a
      // dominant visual, so it reads as premium rather than gimmicky.
      var alpha = p.life * 0.34;

      var gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      gradient.addColorStop(0,   "rgba(" + SMOKE_LIGHT + "," + alpha.toFixed(3) + ")");
      gradient.addColorStop(0.5, "rgba(" + SMOKE_MID   + "," + (alpha * 0.55).toFixed(3) + ")");
      gradient.addColorStop(1,   "rgba(" + SMOKE_DARK  + ",0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
