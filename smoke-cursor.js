/*
  NOTORIOUS™ — Smoke cursor trail
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

  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(canvas);
  });

  // Fallback in case this script runs after DOMContentLoaded already fired
  if (document.readyState === "interactive" || document.readyState === "complete") {
    document.body.appendChild(canvas);
  }

  var ctx = canvas.getContext("2d");
  var width, height;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  var particles = [];
  var MAX_PARTICLES = 240;
  var lastSpawn = 0;
  var SPAWN_INTERVAL = 22; // ms between particle spawns while the mouse moves

  function spawnParticle(x, y) {
    if (particles.length > MAX_PARTICLES) particles.shift();

    particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      radius: 6 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.3 - Math.random() * 0.6,
      life: 1,
      decay: 0.008 + Math.random() * 0.012
    });
  }

  window.addEventListener("mousemove", function (e) {
    var now = performance.now();
    if (now - lastSpawn > SPAWN_INTERVAL) {
      lastSpawn = now;
      spawnParticle(e.clientX, e.clientY);
    }
  });

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.radius += 0.15;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      var gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      gradient.addColorStop(0, "rgba(212,175,55," + (0.18 * p.life).toFixed(3) + ")");
      gradient.addColorStop(1, "rgba(212,175,55,0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
