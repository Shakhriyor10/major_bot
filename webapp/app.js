const tg = window.Telegram?.WebApp;
document.body.classList.add('app-loading');

if (tg) {
  tg.ready();
  tg.expand();
  document.documentElement.dataset.theme = tg.colorScheme || 'light';
}

const params = new URLSearchParams(window.location.search);
const tgId = Number(params.get('tg_id') || tg?.initDataUnsafe?.user?.id || 0);

const dealershipSection = document.getElementById('dealershipSection');
const submenuSection = document.getElementById('submenuSection');
const pageTitleText = document.getElementById('pageTitleText');
const pageTitleLogo = document.getElementById('pageTitleLogo');
const carsSection = document.getElementById('carsSection');
const supportSection = document.getElementById('supportSection');
const locationSection = document.getElementById('locationSection');
const adminBox = document.getElementById('adminBox');
const adminStatus = document.getElementById('adminStatus');
const cancelEditBtn = document.getElementById('cancelEdit');
const adminForm = document.getElementById('adminForm');
const imageFileInput = document.getElementById('image_file');
const carSearchInput = document.getElementById('carSearch');
const brandFilterSelect = document.getElementById('brandFilter');
const dealershipSelect = document.getElementById('dealership_id');
const dealershipForm = document.getElementById('dealershipForm');
const dealershipStatus = document.getElementById('dealershipStatus');
const socialBar = document.getElementById('dealershipSocialBar');
const instagramLink = document.getElementById('instagramLink');
const telegramLink = document.getElementById('telegramLink');
const dealershipDescriptionBox = document.getElementById('dealershipDescriptionBox');
const dealershipDescriptionText = document.getElementById('dealershipDescriptionText');
let isAdminUser = false;
let allCars = [];
let dealerships = [];
let currentDealership = null;

function playStartupSplash() {
  const splash = document.getElementById('startupSplash');
  if (!splash) {
    document.body.classList.remove('app-loading');
    document.body.classList.add('app-ready');
    return Promise.resolve();
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    splash.classList.add('is-hidden');
    document.body.classList.remove('app-loading');
    document.body.classList.add('app-ready');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.setTimeout(() => {
      splash.classList.add('is-hidden');
      document.body.classList.remove('app-loading');
      document.body.classList.add('app-ready');
      resolve();
    }, 4100);
  });
}

function formatPrice(value, currency = 'UZS') {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return currency === 'USD' ? `${grouped} $` : `${grouped} сум`;
}

function openDealershipList() {
  dealershipSection.classList.remove('hidden');
  submenuSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  supportSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
  currentDealership = null;
  updateHeaderTitle();
  fillDealershipDescription();
  updateSocialBar();
}

function openSubmenu() {
  dealershipSection.classList.add('hidden');
  submenuSection.classList.remove('hidden');
  carsSection.classList.add('hidden');
  supportSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
  fillDealershipDescription();
  updateSocialBar();
}

function openCars() {
  submenuSection.classList.add('hidden');
  carsSection.classList.remove('hidden');
  supportSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  if (isAdminUser) adminBox.classList.remove('hidden');
  updateSocialBar();
}

function openSupport() {
  submenuSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  supportSection.classList.remove('hidden');
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
  updateSocialBar();
}

function openLocation() {
  submenuSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  supportSection.classList.add('hidden');
  locationSection.classList.remove('hidden');
  adminBox.classList.add('hidden');
  updateSocialBar();
}


function normalizeExternalUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function applySocialLink(anchor, url) {
  const normalized = normalizeExternalUrl(url);
  const isActive = Boolean(normalized);
  anchor.href = isActive ? normalized : '#';
  anchor.classList.toggle('disabled', !isActive);
  anchor.classList.toggle('hidden', !isActive);
  anchor.setAttribute('aria-disabled', String(!isActive));
  return isActive;
}

function updateSocialBar() {
  const isDealershipSelectionVisible = !dealershipSection.classList.contains('hidden');
  if (!currentDealership || isDealershipSelectionVisible) {
    socialBar.classList.add('hidden');
    return;
  }

  const hasInstagram = applySocialLink(instagramLink, currentDealership.instagram_url);
  const hasTelegram = applySocialLink(telegramLink, currentDealership.telegram_url);
  socialBar.classList.toggle('hidden', !(hasInstagram || hasTelegram));
}

function fillDealershipDescription() {
  if (!currentDealership) {
    dealershipDescriptionBox.classList.add('hidden');
    dealershipDescriptionText.textContent = '';
    return;
  }

  const description = String(currentDealership.description || '').trim();
  if (!description) {
    dealershipDescriptionBox.classList.add('hidden');
    dealershipDescriptionText.textContent = '';
    return;
  }

  dealershipDescriptionText.textContent = description;
  dealershipDescriptionBox.classList.remove('hidden');
}

function renderDealerships() {
  dealershipSection.innerHTML = dealerships.map((dealership) => `
    <button class="menu-card dealership-card" data-id="${dealership.id}">
      <img class="dealership-logo" src="${dealership.logo_url}" alt="${dealership.name}" />
      <span class="menu-card-content">
        <span class="menu-card-title">${dealership.name}</span>
        <span class="menu-card-subtitle">Открыть раздел автосалона</span>
      </span>
    </button>
  `).join('');

  dealershipSection.querySelectorAll('.dealership-card').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const dealershipId = Number(btn.dataset.id);
      currentDealership = dealerships.find((item) => item.id === dealershipId) || null;
      updateHeaderTitle();
      fillLocation();
      fillDealershipDescription();
      await loadCars();
      openSubmenu();
    });
  });
}

function updateHeaderTitle() {
  if (!currentDealership) {
    pageTitleText.textContent = 'Автосалоны';
    pageTitleLogo.src = '';
    pageTitleLogo.classList.add('hidden');
    return;
  }

  pageTitleText.textContent = currentDealership.name || 'Автосалон';
  if (currentDealership.logo_url) {
    pageTitleLogo.src = currentDealership.logo_url;
    pageTitleLogo.alt = `Логотип ${currentDealership.name || 'автосалона'}`;
    pageTitleLogo.classList.remove('hidden');
  } else {
    pageTitleLogo.src = '';
    pageTitleLogo.classList.add('hidden');
  }
}

function fillLocation() {
  if (!currentDealership) return;
  const locationLink = document.getElementById('locationLink');
  locationLink.href = currentDealership.map_url || '#';
  locationLink.classList.toggle('disabled', !currentDealership.map_url);
  document.getElementById('locationAddress').textContent = currentDealership.address;
  document.getElementById('locationPhone').textContent = `📞 ${currentDealership.phone}`;
  document.getElementById('dealershipAddressInput').value = currentDealership.address;
  document.getElementById('dealershipPhoneInput').value = currentDealership.phone;
  document.getElementById('dealershipMapInput').value = currentDealership.map_url;
  document.getElementById('dealershipDescriptionInput').value = currentDealership.description || '';
  document.getElementById('dealershipInstagramInput').value = currentDealership.instagram_url || '';
  document.getElementById('dealershipTelegramInput').value = currentDealership.telegram_url || '';
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
        <p class="price">${formatPrice(car.price, car.currency)}</p>
        <div class="specs">Объем двигателя: ${car.engine}</div>
        <button class="btn" onclick="openCar(${car.id})">Подробнее</button>
        ${isAdminUser ? `<button class="btn btn-secondary" onclick="fillEdit(${car.id})">Редактировать</button>` : ''}
      </div>
    </article>
  `).join('');
}

async function loadDealerships() {
  const res = await fetch('/api/dealerships');
  const data = await res.json();
  dealerships = data.dealerships || [];
  renderDealerships();
  dealershipSelect.innerHTML = dealerships.map((dealership) => `<option value="${dealership.id}">${dealership.name}</option>`).join('');
}

async function loadCars() {
  if (!currentDealership) {
    allCars = [];
    renderBrandFilter(allCars);
    renderCars();
    return;
  }

  const res = await fetch(`/api/cars?dealership_id=${currentDealership.id}`);
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
  dealershipSelect.value = String(car.dealership_id || 1);
  document.getElementById('brand').value = car.brand || '';
  document.getElementById('title').value = car.title;
  document.getElementById('price').value = car.price;
  document.getElementById('currency').value = car.currency || 'UZS';
  document.getElementById('engine').value = car.engine;
  document.getElementById('description').value = car.description;
  document.getElementById('image_url').value = car.image_url || '';
  document.getElementById('video_url').value = car.video_url || '';
  imageFileInput.value = '';
  cancelEditBtn.classList.remove('hidden');
  adminStatus.textContent = `Редактирование #${car.id}`;
};

cancelEditBtn.addEventListener('click', () => {
  adminForm.reset();
  document.getElementById('carId').value = '';
  imageFileInput.value = '';
  cancelEditBtn.classList.add('hidden');
  adminStatus.textContent = '';
});

async function uploadImageIfNeeded() {
  const file = imageFileInput.files?.[0];
  if (!file) {
    return document.getElementById('image_url').value.trim();
  }

  const formData = new FormData();
  formData.append('tg_id', String(tgId));
  formData.append('image', file);

  const uploadRes = await fetch('/api/upload-image', {
    method: 'POST',
    body: formData,
  });
  if (!uploadRes.ok) {
    throw new Error('upload_failed');
  }
  const uploadData = await uploadRes.json();
  const imageUrl = String(uploadData.image_url || '').trim();
  document.getElementById('image_url').value = imageUrl;
  return imageUrl;
}

adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const carId = document.getElementById('carId').value;
    const imageUrl = await uploadImageIfNeeded();
    const payload = {
      tg_id: tgId,
      dealership_id: Number(dealershipSelect.value),
      brand: document.getElementById('brand').value.trim(),
      title: document.getElementById('title').value.trim(),
      price: document.getElementById('price').value.trim(),
      currency: document.getElementById('currency').value,
      engine: document.getElementById('engine').value.trim(),
      description: document.getElementById('description').value.trim(),
      image_url: imageUrl,
      video_url: document.getElementById('video_url').value.trim(),
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
      imageFileInput.value = '';
      cancelEditBtn.classList.add('hidden');
      await loadCars();
    } else {
      adminStatus.textContent = '❌ Ошибка сохранения. Проверьте права и заполнение полей.';
    }
  } catch (_) {
    adminStatus.textContent = '❌ Не удалось загрузить фото. Попробуйте другой файл.';
  }
});

dealershipForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentDealership) return;

  const payload = {
    tg_id: tgId,
    id: currentDealership.id,
    address: document.getElementById('dealershipAddressInput').value.trim(),
    phone: document.getElementById('dealershipPhoneInput').value.trim(),
    map_url: document.getElementById('dealershipMapInput').value.trim(),
    description: document.getElementById('dealershipDescriptionInput').value.trim(),
    instagram_url: normalizeExternalUrl(document.getElementById('dealershipInstagramInput').value),
    telegram_url: normalizeExternalUrl(document.getElementById('dealershipTelegramInput').value),
  };

  const res = await fetch(`/api/dealerships/${currentDealership.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    dealershipStatus.textContent = '✅ Контакты автосалона обновлены';
    await loadDealerships();
    currentDealership = dealerships.find((item) => item.id === payload.id) || currentDealership;
    fillLocation();
    fillDealershipDescription();
    updateSocialBar();
  } else {
    dealershipStatus.textContent = '❌ Не удалось обновить контакты';
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
    body: JSON.stringify({ tg_id: tgId, message: text, dealership_name: currentDealership?.name || '' }),
  });

  if (res.ok) {
    status.textContent = '✅ Отправлено. Ожидайте ответ в Telegram.';
    document.getElementById('supportText').value = '';
  } else {
    status.textContent = '❌ Не удалось отправить. Попробуйте позже.';
  }
});

document.querySelectorAll('.menu-card[data-target]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.target === 'carsSection') {
      openCars();
    } else if (btn.dataset.target === 'locationSection') {
      openLocation();
    } else {
      openSupport();
    }
  });
});

document.getElementById('backToDealerships').addEventListener('click', openDealershipList);
document.getElementById('backToSubmenuFromCars').addEventListener('click', openSubmenu);
document.getElementById('backToSubmenuFromSupport').addEventListener('click', openSubmenu);
document.getElementById('backToSubmenuFromLocation').addEventListener('click', openSubmenu);
carSearchInput.addEventListener('input', renderCars);
brandFilterSelect.addEventListener('change', renderCars);

(async () => {
  const splashPromise = playStartupSplash();
  const adminCheck = await fetch(`/api/is-admin?tg_id=${tgId}`);
  if (adminCheck.ok) {
    const data = await adminCheck.json();
    isAdminUser = Boolean(data.is_admin);
  }

  if (isAdminUser) {
    dealershipForm.classList.remove('hidden');
  }

  await loadDealerships();
  openDealershipList();
  updateSocialBar();
  await splashPromise;
})();