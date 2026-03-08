const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  document.documentElement.dataset.theme = tg.colorScheme || 'light';
}

const params = new URLSearchParams(window.location.search);
const carId = Number(params.get('id'));
const tgId = Number(params.get('tg_id') || tg?.initDataUnsafe?.user?.id || 0);

function formatPrice(value, currency = 'UZS') {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return currency === 'USD' ? `${grouped} $` : `${grouped} сум`;
}


function getDiscountState(car) {
  const discountPrice = String(car.discount_price || '').trim();
  if (!discountPrice) return null;

  const untilRaw = String(car.discount_until || '').trim();
  if (!untilRaw) {
    return { discountPrice, untilDate: null };
  }

  const untilDate = new Date(untilRaw);
  if (Number.isNaN(untilDate.getTime()) || untilDate.getTime() <= Date.now()) {
    return null;
  }

  return { discountPrice, untilDate };
}

function formatCountdown(untilDate) {
  const diffMs = untilDate.getTime() - Date.now();
  if (diffMs <= 0) return 'Скидка завершена';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}д ${hours}ч ${minutes}м ${seconds}с`;
}

function renderPriceBlock(car) {
  const discount = getDiscountState(car);
  if (!discount) {
    return `<p class="price">${formatPrice(car.price, car.currency)}</p>`;
  }

  const timerHtml = discount.untilDate
    ? `<p class="discount-timer" data-discount-timer data-deadline="${discount.untilDate.toISOString()}">${formatCountdown(discount.untilDate)}</p>`
    : '';

  return `
    <div class="price-block">
      <p class="price-original">${formatPrice(car.price, car.currency)}</p>
      <div class="price-discount-row">
        <p class="price-discount">${formatPrice(discount.discountPrice, car.currency)}</p>
        ${timerHtml}
      </div>
    </div>
  `;
}

let countdownTimerId = null;
function setupDiscountCountdowns() {
  if (countdownTimerId) {
    window.clearInterval(countdownTimerId);
  }

  const timers = [...document.querySelectorAll('[data-discount-timer]')];
  if (!timers.length) return;

  const tick = () => {
    timers.forEach((node) => {
      const deadline = node.dataset.deadline;
      const untilDate = deadline ? new Date(deadline) : null;
      if (!untilDate || Number.isNaN(untilDate.getTime())) return;
      node.textContent = formatCountdown(untilDate);
    });
  };

  tick();
  countdownTimerId = window.setInterval(tick, 1000);
}

function getYoutubeEmbedUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  let parsedUrl;
  try {
    parsedUrl = new URL(value.includes('://') ? value : `https://${value}`);
  } catch (_) {
    return '';
  }

  const host = parsedUrl.hostname.toLowerCase();
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  let videoId = '';

  if (host === 'youtu.be') {
    videoId = pathParts[0] || '';
  } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    videoId = parsedUrl.searchParams.get('v') || parsedUrl.searchParams.get('vi') || '';
    if (!videoId && pathParts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(pathParts[0])) {
      videoId = pathParts[1];
    }
  }

  videoId = videoId.replace(/[^A-Za-z0-9_-]/g, '');
  if (videoId.length < 6) return '';
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
}

function normalizeExternalUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}


function getCarImages(car) {
  return [car.image_url, car.image_url_2, car.image_url_3, car.image_url_4, car.image_url_5]
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}

function renderImageCarousel(car) {
  const images = getCarImages(car);
  const firstImage = images[0] || 'https://placehold.co/800x500/1f2937/ffffff?text=Auto';
  if (images.length <= 1) {
    return `<img src="${firstImage}" alt="${car.title}" />`;
  }

  return `
    <div class="car-carousel" data-carousel>
      <div class="car-carousel-track" data-carousel-track>
        ${images.map((url, index) => `<img src="${url}" alt="${car.title} (${index + 1})" class="car-carousel-image" />`).join('')}
      </div>
      <div class="car-carousel-dots">
        ${images.map((_, index) => `<span class="car-carousel-dot${index === 0 ? ' is-active' : ''}"></span>`).join('')}
      </div>
    </div>
  `;
}

function initCarousel(root = document) {
  const carousel = root.querySelector('[data-carousel]');
  if (!carousel) return;

  const track = carousel.querySelector('[data-carousel-track]');
  const slides = [...track.querySelectorAll('.car-carousel-image')];
  const dots = [...carousel.querySelectorAll('.car-carousel-dot')];
  if (slides.length < 2) return;

  let currentIndex = 0;
  let touchStartX = 0;

  const update = () => {
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
    dots.forEach((dot, index) => dot.classList.toggle('is-active', index === currentIndex));
  };

  const next = () => {
    currentIndex = (currentIndex + 1) % slides.length;
    update();
  };

  let timer = window.setInterval(next, 3000);
  const resetTimer = () => {
    window.clearInterval(timer);
    timer = window.setInterval(next, 3000);
  };

  carousel.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });

  carousel.addEventListener('touchend', (event) => {
    const delta = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) < 40) return;
    currentIndex = delta < 0
      ? (currentIndex + 1) % slides.length
      : (currentIndex - 1 + slides.length) % slides.length;
    update();
    resetTimer();
  }, { passive: true });
}

function renderCardMedia(car) {
  const videoUrl = normalizeExternalUrl(car.video_url);
  if (!videoUrl) {
    return renderImageCarousel(car);
  }

  const embedUrl = getYoutubeEmbedUrl(videoUrl);
  if (embedUrl) {
    return `
      <iframe class="car-media-frame" src="${embedUrl}" title="Видео автомобиля" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>
    `;
  }

  return renderImageCarousel(car);
}

async function loadCar() {
  const root = document.getElementById('carPage');
  if (!carId) {
    root.innerHTML = '<p>Некорректный ID автомобиля.</p>';
    return;
  }

  const res = await fetch(`/api/cars/${carId}?tg_id=${tgId}`);
  if (!res.ok) {
    root.innerHTML = '<p>Автомобиль не найден.</p>';
    return;
  }

  const car = await res.json();
  root.innerHTML = `
    <a href="/app?tg_id=${tgId}" class="back">← Назад к каталогу</a>
    <article class="card">
      ${renderCardMedia(car)}
      <div class="card-body">
        <h1 class="car-title">${car.title}</h1>
        ${renderPriceBlock(car)}
        <ul class="feature-list">
          <li><b>Марка:</b> ${car.brand || 'Без марки'}</li>
          <li><b>Двигатель:</b> ${car.engine}</li>
        </ul>
      </div>
    </article>
    <section class="description-box">
      <h2 class="description-title">Подробное описание</h2>
      <p id="carDescriptionText" class="description-text"></p>
    </section>
  `;

  const descriptionNode = document.getElementById('carDescriptionText');
  if (descriptionNode) {
    descriptionNode.textContent = String(car.description || '');
  }

  initCarousel(root);
  setupDiscountCountdowns();
}

loadCar();