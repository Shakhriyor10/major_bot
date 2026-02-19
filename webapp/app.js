const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const params = new URLSearchParams(window.location.search);
const tgId = Number(params.get("tg_id") || tg?.initDataUnsafe?.user?.id || 0);

async function loadCars() {
  const res = await fetch('/api/cars');
  const data = await res.json();
  const root = document.getElementById('cars');

  if (!data.cars?.length) {
    root.innerHTML = '<p class="subtitle">Пока нет добавленных автомобилей.</p>';
    return;
  }

  root.innerHTML = data.cars.map((car) => `
    <article class="card">
      <img src="${car.image_url}" alt="${car.title}" />
      <div class="card-body">
        <h3 class="car-title">${car.title}</h3>
        <p class="price">${car.price}</p>
        <div class="specs">${car.year} • ${car.mileage} • ${car.engine}</div>
        <button class="btn" onclick="openCar(${car.id})">Подробнее</button>
      </div>
    </article>
  `).join('');
}

window.openCar = (id) => {
  window.location.href = `/car?id=${id}&tg_id=${tgId}`;
};

document.getElementById('sendSupport').addEventListener('click', async () => {
  const text = document.getElementById('supportText').value.trim();
  const status = document.getElementById('status');
  if (!text) {
    status.textContent = 'Введите сообщение.';
    return;
  }

  const res = await fetch('/api/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tg_id: tgId, message: text })
  });

  if (res.ok) {
    status.textContent = '✅ Отправлено. Ожидайте ответ в Telegram.';
    document.getElementById('supportText').value = '';
  } else {
    status.textContent = '❌ Не удалось отправить. Попробуйте позже.';
  }
});

loadCars();