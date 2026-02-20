const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  document.documentElement.dataset.theme = tg.colorScheme || 'light';
}

const params = new URLSearchParams(window.location.search);
const tgId = Number(params.get('tg_id') || tg?.initDataUnsafe?.user?.id || 0);
const adminBox = document.getElementById('adminBox');
const menuSection = document.getElementById('menuSection');
const carsSection = document.getElementById('carsSection');
const supportSection = document.getElementById('supportSection');
const adminStatus = document.getElementById('adminStatus');
const cancelEditBtn = document.getElementById('cancelEdit');
const adminForm = document.getElementById('adminForm');
let isAdminUser = false;

function formatPrice(value) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} сум`;
}

function showMenu() {
  menuSection.classList.remove('hidden');
  carsSection.classList.add('hidden');
  supportSection.classList.add('hidden');
  adminBox.classList.add('hidden');
}

function openCars() {
  menuSection.classList.add('hidden');
  carsSection.classList.remove('hidden');
  supportSection.classList.add('hidden');
  if (isAdminUser) adminBox.classList.remove('hidden');
}

function openSupport() {
  menuSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  supportSection.classList.remove('hidden');
  adminBox.classList.add('hidden');
}

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
        <p class="price">${formatPrice(car.price)}</p>
        <div class="specs">Объем двигателя: ${car.engine}</div>
        <button class="btn" onclick="openCar(${car.id})">Подробнее</button>
        ${isAdminUser ? `<button class="btn btn-secondary" onclick="fillEdit(${car.id})">Редактировать</button>` : ''}
      </div>
    </article>
  `).join('');
}

window.openCar = (id) => {
  window.location.href = `/car?id=${id}&tg_id=${tgId}`;
};

window.fillEdit = async (id) => {
  const res = await fetch(`/api/cars/${id}`);
  if (!res.ok) return;
  const car = await res.json();
  document.getElementById('carId').value = car.id;
  document.getElementById('title').value = car.title;
  document.getElementById('price').value = car.price;
  document.getElementById('engine').value = car.engine;
  document.getElementById('description').value = car.description;
  document.getElementById('image_url').value = car.image_url || '';
  cancelEditBtn.classList.remove('hidden');
  adminStatus.textContent = `Редактирование #${car.id}`;
};

cancelEditBtn.addEventListener('click', () => {
  adminForm.reset();
  document.getElementById('carId').value = '';
  cancelEditBtn.classList.add('hidden');
  adminStatus.textContent = '';
});

adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const carId = document.getElementById('carId').value;
  const payload = {
    tg_id: tgId,
    title: document.getElementById('title').value.trim(),
    price: formatPrice(document.getElementById('price').value),
    engine: document.getElementById('engine').value.trim(),
    description: document.getElementById('description').value.trim(),
    image_url: document.getElementById('image_url').value.trim(),
  };

  const url = carId ? `/api/cars/${carId}` : '/api/cars';
  const method = carId ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    adminStatus.textContent = carId ? '✅ Машина обновлена' : '✅ Машина добавлена';
    adminForm.reset();
    document.getElementById('carId').value = '';
    cancelEditBtn.classList.add('hidden');
    await loadCars();
  } else {
    adminStatus.textContent = '❌ Ошибка сохранения. Проверьте права и заполнение полей.';
  }
});

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

document.querySelectorAll('.menu-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.target === 'carsSection') {
      openCars();
    } else {
      openSupport();
    }
  });
});

document.getElementById('backToMenuFromCars').addEventListener('click', showMenu);
document.getElementById('backToMenuFromSupport').addEventListener('click', showMenu);

(async () => {
  const adminCheck = await fetch(`/api/is-admin?tg_id=${tgId}`);
  if (adminCheck.ok) {
    const data = await adminCheck.json();
    isAdminUser = Boolean(data.is_admin);
  }
  showMenu();
  await loadCars();
})();