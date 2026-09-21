/*
  NOTORIOUS™ — Gold smoke cursor trail
  Desktop only, respects prefers-reduced-motion, never blocks clicks.
  Include this file before </body> on any page you want the effect on:
  <script src="smoke-cursor.js" defer></script>
*/

(function () {
  "use strict";

  var isTouch = window.matchMedia("(pointer: coarse)").matches;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (isTouch || reducedMotion) return;

  var canvas = document.createElement("canvas");
  canvas.id = "notoriousSmoke";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "40";
  canvas.style.mixBlendMode = "screen";
  // Melts the individual soft circles into one continuous smoke cloud
  // instead of looking like separate balls.
  canvas.style.filter = "blur(7px)";

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

  // Same gold tones as the .best-seller-badge gradient, for brand consistency.
  var GOLD_LIGHT = "247,226,125"; // #f7e27d
  var GOLD_MID   = "212,175,55";  // #d4af37
  var GOLD_DARK  = "143,107,0";   // #8f6b00

  var particles = [];
  var MAX_PARTICLES = 160;

  function spawnParticle(x, y) {
    if (particles.length > MAX_PARTICLES) particles.shift();

    particles.push({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      radius: 8 + Math.random() * 8,
      growth: 0.35 + Math.random() * 0.35, // how fast it balloons out
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.25 - Math.random() * 0.45,    // gentle upward drift
      life: 1,
      decay: 0.010 + Math.random() * 0.010
    });
  }

  var lastX = null, lastY = null;

  window.addEventListener("mousemove", function (e) {
    var x = e.clientX, y = e.clientY;

    if (lastX === null) {
      spawnParticle(x, y);
    } else {
      // Fill the gap between the last and current position so fast
      // mouse movement still reads as one continuous trail, not dots.
      var dx = x - lastX, dy = y - lastY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.floor(dist / 8));

      for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        spawnParticle(lastX + dx * t, lastY + dy * t);
      }
    }

    lastX = x;
    lastY = y;
  });

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98; // smooth, gently decaying drift
      p.radius += p.growth; // expands as it ages
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      var alpha = p.life * 0.5;

      var gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      gradient.addColorStop(0,   "rgba(" + GOLD_LIGHT + "," + alpha.toFixed(3) + ")");
      gradient.addColorStop(0.5, "rgba(" + GOLD_MID   + "," + (alpha * 0.6).toFixed(3) + ")");
      gradient.addColorStop(1,   "rgba(" + GOLD_DARK  + ",0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
