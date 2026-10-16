function toggleMenu() {
  const menu = document.querySelector(".nav-links");
  const button = document.querySelector(".menu-toggle");
  menu.classList.toggle("active");
  if (menu.classList.contains("active")) {
    button.innerHTML = "✕";
    button.setAttribute("aria-label", "Close menu");
  } else {
    button.innerHTML = "☰";
    button.setAttribute("aria-label", "Open menu");
  }
}

const productsBtn = document.querySelector('.products-menu-btn');
const productsMenu = document.querySelector('.products-menu');
productsBtn.addEventListener('click', () => productsMenu.classList.toggle('open'));

// sedd l menu mnin l user kayscrolli (mobile)
const navLinksEl = document.querySelector('.nav-links');
const menuToggleBtn = document.querySelector('.menu-toggle');
function closeMobileMenu() {
  if (!navLinksEl.classList.contains('active')) return;
  navLinksEl.classList.remove('active');
  productsMenu.classList.remove('open');
  menuToggleBtn.innerHTML = '☰';
  menuToggleBtn.setAttribute('aria-label', 'Open menu');
}
window.addEventListener('scroll', closeMobileMenu, { passive: true });
document.addEventListener('touchmove', closeMobileMenu, { passive: true });
