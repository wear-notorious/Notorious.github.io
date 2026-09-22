/*
  NOTORIOUS™ — Wispy gray smoke trail
  Works on desktop (mouse) only. Respects prefers-reduced-motion,
  never blocks clicks/taps or page scrolling.

  Include this file before </body> on any page you want the effect on:
  <script src="smoke-cursor.js" defer></script>
*/

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;

  var isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  if (isTouchDevice) return;

  var canvas = document.createElement("canvas");
  canvas.id = "notoriousSmoke";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "40";
  canvas.style.mixBlendMode = "screen";
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

  var SMOKE_LIGHT = "240,240,240";
  var SMOKE_MID   = "180,180,180";
  var SMOKE_DARK  = "100,100,100";

  var MAX_PARTICLES = 160;
  var BASE_RADIUS   = 4;
  var RADIUS_RANGE  = 5;

  var particles = [];

  function spawnParticle(x, y) {
    if (particles.length > MAX_PARTICLES) particles.shift();

    // Slight random offset per wisp so the trail isn't a single clean line
    var angle = Math.random() * Math.PI * 2;
    var spread = Math.random() * 10;

    particles.push({
      x: x + Math.cos(angle) * spread,
      y: y + Math.sin(angle) * spread,
      radius: BASE_RADIUS + Math.random() * RADIUS_RANGE,
      growth: 0.22 + Math.random() * 0.3,
      // Gentle sideways drift, like smoke curling as it rises
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.3 - Math.random() * 0.5,
      // Wobble makes each particle curl instead of moving in a straight line
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
      wobbleAmount: 0.15 + Math.random() * 0.25,
      // Stretch gives an elongated, wispy shape instead of a round blob
      stretch: 1.4 + Math.random() * 1.3,
      rotation: angle,
      life: 1,
      decay: 0.006 + Math.random() * 0.008
    });
  }

  var lastX = null, lastY = null;

  function trailTo(x, y) {
    if (lastX === null) {
      spawnParticle(x, y);
    } else {
      var dx = x - lastX, dy = y - lastY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.floor(dist / 7));

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

  window.addEventListener("mousemove", function (e) {
    trailTo(e.clientX, e.clientY);
  });

  window.addEventListener("mouseleave", resetTrail);

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];

      p.wobble += p.wobbleSpeed;
      p.x += p.vx + Math.sin(p.wobble) * p.wobbleAmount;
      p.y += p.vy;
      p.vx *= 0.985;
      p.vy *= 0.995;
      p.radius += p.growth;
      p.rotation += 0.01;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      var alpha = p.life * 0.3;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      // Elongate the shape on one axis so it reads as a wisp, not a dot
      ctx.scale(p.stretch, 1);

      var gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.radius);
      gradient.addColorStop(0,   "rgba(" + SMOKE_LIGHT + "," + alpha.toFixed(3) + ")");
      gradient.addColorStop(0.5, "rgba(" + SMOKE_MID   + "," + (alpha * 0.5).toFixed(3) + ")");
      gradient.addColorStop(1,   "rgba(" + SMOKE_DARK  + ",0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
