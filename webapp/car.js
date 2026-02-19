const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  document.documentElement.dataset.theme = tg.colorScheme || 'light';
}

const params = new URLSearchParams(window.location.search);
const carId = Number(params.get('id'));

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
        <p class="price">${car.price}</p>
        <ul class="feature-list">
          <li><b>Объем двигателя:</b> ${car.engine}</li>
        </ul>
        <p>${car.description}</p>
      </div>
    </article>
  `;
}

loadCar();
