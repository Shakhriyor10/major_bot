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
const carSearchInput = document.getElementById('carSearch');
const brandFilterSelect = document.getElementById('brandFilter');
const toggleLocationBtn = document.getElementById('toggleLocation');
const locationSection = document.getElementById('locationSection');
const closeLocationBtn = document.getElementById('closeLocation');
let isAdminUser = false;
let allCars = [];

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
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
}

function openCars() {
  menuSection.classList.add('hidden');
  carsSection.classList.remove('hidden');
  supportSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  if (isAdminUser) adminBox.classList.remove('hidden');
}

function openSupport() {
  menuSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  supportSection.classList.remove('hidden');
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
}

function renderBrandFilter(cars) {
  const brands = [...new Set(cars.map((car) => (car.brand || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  brandFilterSelect.innerHTML = '<option value="">Все марки</option>' + brands.map((brand) => `<option value="${brand}">${brand}</option>`).join('');
}

function renderCars() {
  const root = document.getElementById('cars');
  const query = (carSearchInput.value || '').trim().toLowerCase();
  const selectedBrand = brandFilterSelect.value;

  const filteredCars = allCars.filter((car) => {
    const brand = (car.brand || '').trim();
    const title = (car.title || '').trim();
    const matchBrand = selectedBrand ? brand === selectedBrand : true;
    const matchQuery = !query || brand.toLowerCase().includes(query) || title.toLowerCase().includes(query);
    return matchBrand && matchQuery;
  });

  if (!filteredCars.length) {
    root.innerHTML = '<p class="subtitle">Ничего не найдено по заданным фильтрам.</p>';
    return;
  }

  root.innerHTML = filteredCars.map((car) => `
    <article class="card">
      <img src="${car.image_url}" alt="${car.title}" />
      <div class="card-body">
        <h3 class="car-title">${car.title}</h3>
        <p class="specs">Марка: ${car.brand || 'Без марки'}</p>
        <p class="price">${formatPrice(car.price)}</p>
        <div class="specs">Объем двигателя: ${car.engine}</div>
        <button class="btn" onclick="openCar(${car.id})">Подробнее</button>
        ${isAdminUser ? `<button class="btn btn-secondary" onclick="fillEdit(${car.id})">Редактировать</button>` : ''}
      </div>
    </article>
  `).join('');
}

async function loadCars() {
  const res = await fetch('/api/cars');
  const data = await res.json();
  allCars = data.cars || [];
  renderBrandFilter(allCars);
  renderCars();
}

window.openCar = (id) => {
  window.location.href = `/car?id=${id}&tg_id=${tgId}`;
};

window.fillEdit = async (id) => {
  const res = await fetch(`/api/cars/${id}`);
  if (!res.ok) return;
  const car = await res.json();
  document.getElementById('carId').value = car.id;
  document.getElementById('brand').value = car.brand || '';
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
    brand: document.getElementById('brand').value.trim(),
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



toggleLocationBtn.addEventListener('click', () => {
  menuSection.classList.remove('hidden');
  carsSection.classList.add('hidden');
  supportSection.classList.add('hidden');
  adminBox.classList.add('hidden');

  const isOpen = !locationSection.classList.contains('hidden');
  locationSection.classList.toggle('hidden', isOpen);
  toggleLocationBtn.setAttribute('aria-expanded', String(!isOpen));
  toggleLocationBtn.classList.toggle('expanded', !isOpen);
});

closeLocationBtn.addEventListener('click', () => {
  locationSection.classList.add('hidden');
  toggleLocationBtn.setAttribute('aria-expanded', 'false');
  toggleLocationBtn.classList.remove('expanded');
});

document.querySelectorAll('.menu-card[data-target]').forEach((btn) => {
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
carSearchInput.addEventListener('input', renderCars);
brandFilterSelect.addEventListener('change', renderCars);

(async () => {
  const adminCheck = await fetch(`/api/is-admin?tg_id=${tgId}`);
  if (adminCheck.ok) {
    const data = await adminCheck.json();
    isAdminUser = Boolean(data.is_admin);
  }
  showMenu();
  await loadCars();
})();