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

function getYoutubeEmbedUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  const youtubeMatch = value.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  if (!youtubeMatch) return '';
  return `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&rel=0`;
}

function renderVideoBlock(car) {
  const embedUrl = getYoutubeEmbedUrl(car.video_url);
  if (!embedUrl) return '';

  return `
    <section class="description-box">
      <h2 class="description-title">Видео обзор</h2>
      <button class="video-cover" id="videoCover" style="background-image: url('${car.image_url}');" aria-label="Воспроизвести видео"></button>
      <div id="videoPlayerContainer" class="hidden"></div>
    </section>
  `;
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
  root.innerHTML = `
    <a href="/app?tg_id=${tgId}" class="back">← Назад к каталогу</a>
    <article class="card">
      <img src="${car.image_url}" alt="${car.title}" />
      <div class="card-body">
        <h1 class="car-title">${car.title}</h1>
        <p class="price">${formatPrice(car.price, car.currency)}</p>
        <ul class="feature-list">
          <li><b>Автосалон:</b> ${car.dealership_name || 'Не указан'}</li>
          <li><b>Марка:</b> ${car.brand || 'Без марки'}</li>
          <li><b>Объем двигателя:</b> ${car.engine}</li>
        </ul>
      </div>
    </article>
    <section class="description-box">
      <h2 class="description-title">Подробное описание</h2>
      <p class="description-text">${car.description}</p>
    </section>
    ${renderVideoBlock(car)}
  `;

  const embedUrl = getYoutubeEmbedUrl(car.video_url);
  const videoCover = document.getElementById('videoCover');
  const videoPlayerContainer = document.getElementById('videoPlayerContainer');
  if (embedUrl && videoCover && videoPlayerContainer) {
    videoCover.addEventListener('click', () => {
      videoPlayerContainer.innerHTML = `<iframe src="${embedUrl}" title="Видео автомобиля" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      videoPlayerContainer.classList.remove('hidden');
      videoCover.classList.add('hidden');
    });
  }
}

loadCar();
