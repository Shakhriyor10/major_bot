const tg = window.Telegram?.WebApp;
document.body.classList.add('app-loading');

if (tg) {
  tg.ready();
  tg.expand();
  document.documentElement.dataset.theme = tg.colorScheme || 'light';
}

const params = new URLSearchParams(window.location.search);
const tgId = Number(params.get('tg_id') || tg?.initDataUnsafe?.user?.id || 0);

const promoSection = document.getElementById('promoSection');
const dealershipSection = document.getElementById('dealershipSection');
const submenuSection = document.getElementById('submenuSection');
const pageTitleText = document.getElementById('pageTitleText');
const pageTitleLogo = document.getElementById('pageTitleLogo');
const carsSection = document.getElementById('carsSection');
const carDetailsSection = document.getElementById('carDetailsSection');
const carDetailsContent = document.getElementById('carDetailsContent');
const supportSection = document.getElementById('supportSection');
const locationSection = document.getElementById('locationSection');
const adminBox = document.getElementById('adminBox');
const adminStatus = document.getElementById('adminStatus');
const cancelEditBtn = document.getElementById('cancelEdit');
const deleteCarBtn = document.getElementById('deleteCar');
const adminForm = document.getElementById('adminForm');
const imageFileInputs = [1, 2, 3, 4, 5].map((index) => document.getElementById(`image_file_${index}`));
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
let promoCars = [];
let currentCarSource = 'catalog';

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
    countdownTimerId = null;
  }

  const timers = [...document.querySelectorAll('[data-discount-timer]')];
  if (!timers.length) return;

  const tick = () => {
    let hasExpired = false;
    timers.forEach((node) => {
      const deadline = node.dataset.deadline;
      const untilDate = deadline ? new Date(deadline) : null;
      if (!untilDate || Number.isNaN(untilDate.getTime())) {
        node.textContent = '';
        return;
      }
      const remaining = untilDate.getTime() - Date.now();
      if (remaining <= 0) {
        hasExpired = true;
      }
      node.textContent = formatCountdown(untilDate);
    });

    if (hasExpired) {
      window.clearInterval(countdownTimerId);
      countdownTimerId = null;
      loadCars();
      if (!carDetailsSection.classList.contains('hidden')) {
        const activeId = Number((window.location.hash || '').replace('#car-', ''));
        if (activeId) {
          window.openCar(activeId);
        }
      }
    }
  };

  tick();
  countdownTimerId = window.setInterval(tick, 1000);
}


async function fetchGeneratedDescription(carId, fallbackDescription = '') {
  try {
    const res = await fetch(`/api/cars/${carId}/description?tg_id=${tgId}`);
    if (!res.ok) return String(fallbackDescription || '');
    const data = await res.json();
    return String(data.description || fallbackDescription || '');
  } catch (_) {
    return String(fallbackDescription || '');
  }
}

function closeCarDetails() {
  carDetailsSection.classList.add('hidden');
  carDetailsContent.innerHTML = '';
}

function openDealershipList() {
  dealershipSection.classList.remove('hidden');
  submenuSection.classList.add('hidden');
  promoSection.classList.remove('hidden');
  carsSection.classList.add('hidden');
  closeCarDetails();
  supportSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
  currentDealership = null;
  currentCarSource = 'catalog';
  updateHeaderTitle();
  fillDealershipDescription();
  updateSocialBar();
}

function openSubmenu() {
  dealershipSection.classList.add('hidden');
  submenuSection.classList.remove('hidden');
  promoSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  closeCarDetails();
  supportSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
  fillDealershipDescription();
  updateSocialBar();
}

function openCars() {
  submenuSection.classList.add('hidden');
  carsSection.classList.remove('hidden');
  promoSection.classList.add('hidden');
  closeCarDetails();
  supportSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  if (isAdminUser) adminBox.classList.remove('hidden');
  updateSocialBar();
}

function openSupport() {
  submenuSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  closeCarDetails();
  supportSection.classList.remove('hidden');
  promoSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
  updateSocialBar();
}

async function ensureRegisteredForSupport() {
  const status = document.getElementById('status');
  const supportInput = document.getElementById('supportText');
  const supportSendButton = document.getElementById('sendSupport');
  const registrationLink = 'https://t.me/MajorSamarkandBOT';
  const res = await fetch(`/api/is-registered?tg_id=${tgId}`);

  if (!res.ok) {
    supportInput.classList.add('hidden');
    supportSendButton.classList.add('hidden');
    status.textContent = '❌ Не удалось проверить регистрацию. Попробуйте позже.';
    return false;
  }

  const data = await res.json();
  if (!data.is_registered) {
    openSupport();
    supportInput.classList.add('hidden');
    supportSendButton.classList.add('hidden');
    status.innerHTML = `Вы не зарегистрированы в боте, пожалуйста зарегистрируйтесь: <a href="${registrationLink}" target="_blank" rel="noopener noreferrer">${registrationLink}</a>`;
    return false;
  }

  supportInput.classList.remove('hidden');
  supportSendButton.classList.remove('hidden');
  status.textContent = '';
  return true;
}

function openLocation() {
  submenuSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  closeCarDetails();
  supportSection.classList.add('hidden');
  locationSection.classList.remove('hidden');
  promoSection.classList.add('hidden');
  adminBox.classList.add('hidden');
  updateSocialBar();
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


function renderPromoCars() {
  if (!promoCars.length) {
    promoSection.classList.add('hidden');
    promoSection.innerHTML = '';
    return;
  }

  promoSection.classList.remove('hidden');
  promoSection.innerHTML = `
    <div class="promo-carousel" data-carousel>
      <div class="promo-carousel-track" data-carousel-track>
        ${promoCars.map((car) => `
          <article class="promo-slide">
            <button class="promo-media-btn" onclick="openCar(${car.id}, 'promo')">
              <img src="${getCarImages(car)[0] || 'https://placehold.co/800x500/1f2937/ffffff?text=Auto'}" alt="${car.title}" class="promo-image" />
              <span class="promo-overlay"></span>
              <span class="promo-caption">
                <span class="promo-kicker">Реклама</span>
                <span class="promo-title">${car.title}</span>
                <span class="promo-price-wrap">${renderPriceBlock(car)}</span>
              </span>
            </button>
          </article>
        `).join('')}
      </div>
      <div class="promo-dots car-carousel-dots">
        ${promoCars.map((_, index) => `<span class="car-carousel-dot${index === 0 ? ' is-active' : ''}"></span>`).join('')}
      </div>
    </div>
  `;

  initCarousels(promoSection);
  setupDiscountCountdowns();
}

async function loadPromoCars() {
  const res = await fetch(`/api/cars?tg_id=${tgId}`);
  if (!res.ok) return;

  const data = await res.json();
  promoCars = (data.cars || []).filter((car) => Number(car.is_advertised || 0) === 1 && Number(car.is_active || 0) === 1);
  renderPromoCars();
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


function getCarImages(car) {
  return [car.image_url, car.image_url_2, car.image_url_3, car.image_url_4, car.image_url_5]
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}

function renderCardCarousel(car) {
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

function renderCarMedia(car) {
  const videoUrl = normalizeExternalUrl(car.video_url);
  if (!videoUrl) {
    return renderCardCarousel(car);
  }

  const embedUrl = getYoutubeEmbedUrl(videoUrl);
  if (embedUrl) {
    return `<iframe class="car-media-frame" src="${embedUrl}" title="Видео автомобиля" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
  }

  return renderCardCarousel(car);
}

function initCarousels(root = document) {
  root.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('[data-carousel-track]');
    if (!track) return;

    const slides = [...track.children];
    const dots = [...carousel.querySelectorAll('.car-carousel-dot')];
    const prevBtn = carousel.querySelector('[data-carousel-prev]');
    const nextBtn = carousel.querySelector('[data-carousel-next]');
    if (slides.length < 2) return;

    let currentIndex = 0;
    let touchStartX = 0;

    const update = () => {
      track.style.transform = `translateX(-${currentIndex * 100}%)`;
      dots.forEach((dot, index) => dot.classList.toggle('is-active', index === currentIndex));
    };

    const goNext = () => {
      currentIndex = (currentIndex + 1) % slides.length;
      update();
    };

    const goPrev = () => {
      currentIndex = (currentIndex - 1 + slides.length) % slides.length;
      update();
    };

    let timer = window.setInterval(goNext, 3000);
    const resetTimer = () => {
      window.clearInterval(timer);
      timer = window.setInterval(goNext, 3000);
    };

    prevBtn?.addEventListener('click', () => {
      goPrev();
      resetTimer();
    });

    nextBtn?.addEventListener('click', () => {
      goNext();
      resetTimer();
    });

    carousel.addEventListener('touchstart', (event) => {
      touchStartX = event.changedTouches[0].clientX;
    }, { passive: true });

    carousel.addEventListener('touchend', (event) => {
      const delta = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) < 40) return;
      if (delta < 0) goNext();
      else goPrev();
      resetTimer();
    }, { passive: true });
  });
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
      ${renderCardCarousel(car)}
      <div class="card-body">
        <h3 class="car-title">${car.title}</h3>
        ${renderPriceBlock(car)}
        <div class="specs">Двигатель: ${car.engine}</div>
        <button class="btn ${isAdminUser ? '' : 'btn-full'}" onclick="openCar(${car.id})">Открыть</button>
        ${isAdminUser ? `<button class="btn btn-secondary" onclick="fillEdit(${car.id})">Редактировать</button>` : ''}
      </div>
    </article>
  `).join('');
  initCarousels(root);
  setupDiscountCountdowns();
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

  const res = await fetch(`/api/cars?dealership_id=${currentDealership.id}&tg_id=${tgId}`);
  const data = await res.json();
  allCars = data.cars || [];
  renderBrandFilter(allCars);
  renderCars();
}

async function setCurrentDealershipById(dealershipId) {
  const normalizedId = Number(dealershipId);
  if (!normalizedId) return;

  const nextDealership = dealerships.find((item) => item.id === normalizedId);
  if (!nextDealership) return;

  currentDealership = nextDealership;
  updateHeaderTitle();
  fillLocation();
  fillDealershipDescription();
  await loadCars();
}

window.openCar = async (id, source = 'catalog') => {
  const res = await fetch(`/api/cars/${id}?tg_id=${tgId}`);
  if (!res.ok) return;

  const car = await res.json();
  currentCarSource = source;
  if (source === 'promo') {
    await setCurrentDealershipById(car.dealership_id);
  }
  closeCarDetails();
  carDetailsContent.innerHTML = `
    <article class="card car-details-card">
      ${renderCarMedia(car)}
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
      <p id="carDetailsDescriptionText" class="description-text"></p>
    </section>
  `;

  const descriptionNode = document.getElementById('carDetailsDescriptionText');
  if (descriptionNode) {
    descriptionNode.textContent = 'Генерируем описание...';
    const generated = await fetchGeneratedDescription(id, car.description);
    descriptionNode.textContent = generated || 'Описание временно недоступно.';
  }

  dealershipSection.classList.add('hidden');
  submenuSection.classList.add('hidden');
  carsSection.classList.add('hidden');
  promoSection.classList.add('hidden');
  supportSection.classList.add('hidden');
  locationSection.classList.add('hidden');
  adminBox.classList.add('hidden');
  carDetailsSection.classList.remove('hidden');
  initCarousels(carDetailsSection);
  setupDiscountCountdowns();
  updateSocialBar();
  window.history.pushState({ screen: 'carDetails', carId: id }, '', `#car-${id}`);
};

function openCarsFromDetails({ fromPopState = false } = {}) {
  closeCarDetails();
  carsSection.classList.remove('hidden');
  if (isAdminUser) {
    adminBox.classList.remove('hidden');
  }
  if (!fromPopState && window.location.hash.startsWith('#car-')) {
    window.history.back();
  }
}

window.fillEdit = async (id) => {
  const res = await fetch(`/api/cars/${id}?tg_id=${tgId}`);
  if (!res.ok) return;
  const car = await res.json();
  document.getElementById('carId').value = car.id;
  dealershipSelect.value = String(car.dealership_id || 1);
  document.getElementById('position').value = car.position || 1000;
  document.getElementById('brand').value = car.brand || '';
  document.getElementById('title').value = car.title;
  document.getElementById('price').value = car.price;
  document.getElementById('discount_price').value = car.discount_price || '';
  document.getElementById('discount_until').value = car.discount_until ? String(car.discount_until).slice(0, 16) : '';
  document.getElementById('is_hot').checked = Number(car.is_hot || 0) === 1;
  document.getElementById('is_advertised').checked = Number(car.is_advertised || 0) === 1;
  document.getElementById('currency').value = car.currency || 'UZS';
  document.getElementById('engine').value = car.engine;
  document.getElementById('description').value = car.description;
  document.getElementById('image_url').value = car.image_url || '';
  document.getElementById('image_url_2').value = car.image_url_2 || '';
  document.getElementById('image_url_3').value = car.image_url_3 || '';
  document.getElementById('image_url_4').value = car.image_url_4 || '';
  document.getElementById('image_url_5').value = car.image_url_5 || '';
  document.getElementById('is_active').value = String(car.is_active ?? 1);
  document.getElementById('video_url').value = car.video_url || '';
  imageFileInputs.forEach((input) => { if (input) input.value = ''; });
  cancelEditBtn.classList.remove('hidden');
  deleteCarBtn.classList.remove('hidden');
  adminStatus.textContent = `Редактирование #${car.id}`;
};

cancelEditBtn.addEventListener('click', () => {
  adminForm.reset();
  document.getElementById('carId').value = '';
  imageFileInputs.forEach((input) => { if (input) input.value = ''; });
  document.getElementById('is_hot').checked = false;
  document.getElementById('is_advertised').checked = false;
  cancelEditBtn.classList.add('hidden');
  deleteCarBtn.classList.add('hidden');
  adminStatus.textContent = '';
});

async function uploadSingleImage(file) {
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
  return String(uploadData.image_url || '').trim();
}

async function uploadImagesIfNeeded() {
  const urlInputs = [
    document.getElementById('image_url'),
    document.getElementById('image_url_2'),
    document.getElementById('image_url_3'),
    document.getElementById('image_url_4'),
    document.getElementById('image_url_5'),
  ];

  const imageUrls = [];
  for (let index = 0; index < 5; index += 1) {
    const file = imageFileInputs[index]?.files?.[0];
    if (file) {
      const uploadedUrl = await uploadSingleImage(file);
      urlInputs[index].value = uploadedUrl;
      imageUrls.push(uploadedUrl);
    } else {
      imageUrls.push(urlInputs[index].value.trim());
    }
  }
  return imageUrls;
}



deleteCarBtn.addEventListener('click', async () => {
  const carId = document.getElementById('carId').value;
  if (!carId) {
    adminStatus.textContent = 'Сначала выберите машину для удаления (нажмите «Редактировать»).';
    return;
  }

  const isConfirmed = window.confirm('Вы точно хотите удалить эту машину? После подтверждения запись будет удалена из базы данных без возможности восстановления.');
  if (!isConfirmed) {
    return;
  }

  const res = await fetch(`/api/cars/${carId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tg_id: tgId }),
  });

  if (res.ok) {
    adminStatus.textContent = '✅ Машина удалена';
    adminForm.reset();
    document.getElementById('carId').value = '';
    imageFileInputs.forEach((input) => { if (input) input.value = ''; });
    cancelEditBtn.classList.add('hidden');
    deleteCarBtn.classList.add('hidden');
    await loadCars();
    await loadPromoCars();
  } else {
    adminStatus.textContent = '❌ Не удалось удалить машину';
  }
});

adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const carId = document.getElementById('carId').value;
    const imageUrls = await uploadImagesIfNeeded();
    const payload = {
      tg_id: tgId,
      dealership_id: Number(dealershipSelect.value),
      position: Number(document.getElementById('position').value),
      brand: document.getElementById('brand').value.trim(),
      title: document.getElementById('title').value.trim(),
      price: document.getElementById('price').value.trim(),
      discount_price: document.getElementById('discount_price').value.trim(),
      discount_until: document.getElementById('discount_until').value,
      is_hot: document.getElementById('is_hot').checked ? 1 : 0,
      is_advertised: document.getElementById('is_advertised').checked ? 1 : 0,
      currency: document.getElementById('currency').value,
      engine: document.getElementById('engine').value.trim(),
      description: document.getElementById('description').value.trim(),
      image_url: imageUrls[0],
      image_url_2: imageUrls[1],
      image_url_3: imageUrls[2],
      image_url_4: imageUrls[3],
      image_url_5: imageUrls[4],
      is_active: Number(document.getElementById('is_active').value),
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
      imageFileInputs.forEach((input) => { if (input) input.value = ''; });
      cancelEditBtn.classList.add('hidden');
      deleteCarBtn.classList.add('hidden');
      await loadCars();
      await loadPromoCars();
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
    await loadPromoCars();
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
  btn.addEventListener('click', async () => {
    if (btn.dataset.target === 'carsSection') {
      openCars();
    } else if (btn.dataset.target === 'locationSection') {
      openLocation();
    } else {
      if (!(await ensureRegisteredForSupport())) {
        return;
      }
      openSupport();
    }
  });
});

document.getElementById('backToDealerships').addEventListener('click', openDealershipList);
document.getElementById('backToSubmenuFromCars').addEventListener('click', openSubmenu);
document.getElementById('backToCarsFromDetails').addEventListener('click', () => {
  openCarsFromDetails();
});
document.getElementById('backToSubmenuFromSupport').addEventListener('click', openSubmenu);
document.getElementById('backToSubmenuFromLocation').addEventListener('click', openSubmenu);
carSearchInput.addEventListener('input', renderCars);
brandFilterSelect.addEventListener('change', renderCars);

window.addEventListener('popstate', () => {
  if (window.location.hash.startsWith('#car-')) {
    return;
  }

  if (!carDetailsSection.classList.contains('hidden')) {
    openCarsFromDetails({ fromPopState: true });
  }
});

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
  await loadPromoCars();
  openDealershipList();
  updateSocialBar();
  await splashPromise;
})();