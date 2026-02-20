const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  document.documentElement.dataset.theme = tg.colorScheme || 'light';
}

const params = new URLSearchParams(window.location.search);
const carId = Number(params.get('id'));

function formatPrice(value) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} сум`;
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
    <a href="/app" class="back">← Назад к каталогу</a>
    <article class="card">
      <img src="${car.image_url}" alt="${car.title}" />
      <div class="card-body">
        <h1 class="car-title">${car.title}</h1>
        <p class="price">${formatPrice(car.price)}</p>
        <ul class="feature-list">
          <li><b>Объем двигателя:</b> ${car.engine}</li>
        </ul>
      </div>
    </article>
    <section class="description-box">
      <h2 class="description-title">Подробное описание</h2>
      <p class="description-text">${car.description}</p>
    </section>
  `;
}

loadCar();