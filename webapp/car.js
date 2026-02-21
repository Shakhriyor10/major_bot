const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  document.documentElement.dataset.theme = tg.colorScheme || 'light';
}

const params = new URLSearchParams(window.location.search);
const carId = Number(params.get('id'));
const tgId = Number(params.get('tg_id') || tg?.initDataUnsafe?.user?.id || 0);
const dealershipId = Number(params.get('dealership_id') || 0);

function formatPrice(value, currency = 'UZS') {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return currency === 'USD' ? `${grouped} $` : `${grouped} сум`;
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

function renderCardMedia(car) {
  const videoUrl = normalizeExternalUrl(car.video_url);
  if (!videoUrl) {
    return `<img src="${car.image_url}" alt="${car.title}" />`;
  }

  const embedUrl = getYoutubeEmbedUrl(videoUrl);
  if (embedUrl) {
    return `
      <iframe class="car-media-frame" src="${embedUrl}" title="Видео автомобиля" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>
    `;
  }

  return `<img src="${car.image_url}" alt="${car.title}" />`;
}

async function loadCar() {
  const root = document.getElementById('carPage');
  if (!carId) {
    root.innerHTML = '<p>Некорректный ID автомобиля.</p>';
    return;
  }

  const res = await fetch(`/api/cars/${carId}`);
  if (!res.ok) {
    root.innerHTML = '<p>Автомобиль не найден.</p>';
    return;
  }

  const car = await res.json();
  const backLink = dealershipId
    ? `/app?tg_id=${tgId}&dealership_id=${dealershipId}&view=cars`
    : `/app?tg_id=${tgId}`;
  root.innerHTML = `
    <a href="${backLink}" class="back">← Назад к каталогу</a>
    <article class="card">
      ${renderCardMedia(car)}
      <div class="card-body">
        <h1 class="car-title">${car.title}</h1>
        <p class="price">${formatPrice(car.price, car.currency)}</p>
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
}

loadCar();
