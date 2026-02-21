import asyncio
import io
import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any
from uuid import uuid4

from aiohttp import web
from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)

# BOT_TOKEN = "8485302210:AAH_cHt86GVugNhNQYaprZNs-d8zN0QH0sU"
BOT_TOKEN = "8359928524:AAFRujabXJp24BY3WMYhzn9_WUqo1ofD4Pg"
WEBAPP_BASE_URL = "https://app.majormotors.uz"
# WEBAPP_BASE_URL = "https://subcommissarial-paris-untensely.ngrok-free.dev"
SUPPORT_GROUP_ID = -1003739992037
ADMIN_IDS = {
    int(user_id.strip())
    for user_id in os.getenv("ADMIN_IDS", "8598163827").split(",")
    if user_id.strip()
}

DB_PATH = "dealership.db"
UPLOADS_DIR = os.path.join("webapp", "uploads")

router = Router()

ADD_CAR_STEPS = [
    ("dealership", "Введите автосалон (ID, slug или название):"),
    ("position", "Введите позицию в списке (число, где 1 — самый верх):"),
    ("brand", "Введите марку автомобиля (например: BMW):"),
    ("title", "Введите название автомобиля (например: BMW X5 2022):"),
    ("price", "Введите цену (только число, например: 59000):"),
    ("currency", "Введите валюту цены (USD или UZS):"),
    ("year", "Введите год выпуска (например: 2022):"),
    ("mileage", "Введите пробег (например: 45 000 км):"),
    ("engine", "Введите двигатель (например: 3.0 л, 340 л.с.):"),
    ("transmission", "Введите коробку передач (например: Автомат):"),
    ("description", "Введите описание автомобиля:"),
    ("image_url", "Отправьте фото автомобиля (или '-' для стандартного изображения):"),
    ("video_url", "Введите ссылку на видео (YouTube, можно '-' если без видео):"),
]
ADMIN_CAR_DRAFTS: dict[int, dict[str, str]] = {}
ADMIN_BROADCAST_STATE: dict[int, bool] = {}

OPEN_APP_BUTTON_TEXT = "🚘 Открыть приложение"
SEND_CONTACT_BUTTON_TEXT = "📱 Отправить номер"
ADMIN_STATS_BUTTON_TEXT = "📊 Статистика"
ADMIN_BROADCAST_BUTTON_TEXT = "📣 Рассылка"
MAX_BROADCAST_FILE_SIZE = 15 * 1024 * 1024

DEFAULT_DEALERSHIPS = [
    {
        "slug": "major-motors",
        "name": "Major motors",
        "logo": "/webapp/image/major_logo.png",
        "address": "г. Самарканд, ул. Ибн Сины, 25",
        "phone": "+998-77-101-00-53",
        "map_url": "https://www.openstreetmap.org/export/embed.html?bbox=66.968155%2C39.667412%2C66.988155%2C39.687412&layer=mapnik&marker=39.677412%2C66.978155",
    },
    {
        "slug": "autocenter-samarkand",
        "name": "Autocenter Samarkand",
        "logo": "/webapp/image/autocenter_logo.png",
        "address": "г. Самарканд, ул. Рудакий, 120",
        "phone": "+998-77-222-22-22",
        "map_url": "https://www.openstreetmap.org/export/embed.html?bbox=66.95%2C39.64%2C67.02%2C39.71&layer=mapnik",
    },
    {
        "slug": "shineray",
        "name": "Shineray",
        "logo": "/webapp/image/shineray.png",
        "address": "г. Самарканд, ул. Буюк Ипак Йули, 18",
        "phone": "+998-77-333-33-33",
        "map_url": "https://www.openstreetmap.org/export/embed.html?bbox=66.96%2C39.65%2C67.00%2C39.70&layer=mapnik",
    },
]


def init_db() -> None:
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id INTEGER UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            username TEXT,
            phone TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS dealerships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            logo_url TEXT NOT NULL,
            address TEXT NOT NULL,
            phone TEXT NOT NULL,
            map_url TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            instagram_url TEXT NOT NULL DEFAULT '',
            telegram_url TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
        """
    )
    for item in DEFAULT_DEALERSHIPS:
        cur.execute(
            """
            INSERT OR IGNORE INTO dealerships (slug, name, logo_url, address, phone, map_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["slug"],
                item["name"],
                item["logo"],
                item["address"],
                item["phone"],
                item["map_url"],
                datetime.utcnow().isoformat(),
            ),
        )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS cars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dealership_id INTEGER NOT NULL DEFAULT 1,
            brand TEXT NOT NULL,
            title TEXT NOT NULL,
            price TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'UZS',
            year TEXT NOT NULL,
            mileage TEXT NOT NULL,
            engine TEXT NOT NULL,
            transmission TEXT NOT NULL,
            description TEXT NOT NULL,
            image_url TEXT NOT NULL,
            image_url_2 TEXT NOT NULL DEFAULT '',
            image_url_3 TEXT NOT NULL DEFAULT '',
            image_url_4 TEXT NOT NULL DEFAULT '',
            image_url_5 TEXT NOT NULL DEFAULT '',
            video_url TEXT NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            position INTEGER NOT NULL DEFAULT 1000,
            created_at TEXT NOT NULL
        )
        """
    )
    columns = {row[1] for row in cur.execute("PRAGMA table_info(cars)")}
    if "dealership_id" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN dealership_id INTEGER NOT NULL DEFAULT 1")
    if "brand" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN brand TEXT NOT NULL DEFAULT 'Без марки'")
    if "currency" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN currency TEXT NOT NULL DEFAULT 'UZS'")
    if "video_url" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN video_url TEXT NOT NULL DEFAULT ''")
    if "image_url_2" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN image_url_2 TEXT NOT NULL DEFAULT ''")
    if "image_url_3" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN image_url_3 TEXT NOT NULL DEFAULT ''")
    if "image_url_4" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN image_url_4 TEXT NOT NULL DEFAULT ''")
    if "image_url_5" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN image_url_5 TEXT NOT NULL DEFAULT ''")
    if "is_active" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")
    if "position" not in columns:
        cur.execute("ALTER TABLE cars ADD COLUMN position INTEGER NOT NULL DEFAULT 1000")
    dealership_columns = {row[1] for row in cur.execute("PRAGMA table_info(dealerships)")}
    if "instagram_url" not in dealership_columns:
        cur.execute("ALTER TABLE dealerships ADD COLUMN instagram_url TEXT NOT NULL DEFAULT ''")
    if "telegram_url" not in dealership_columns:
        cur.execute("ALTER TABLE dealerships ADD COLUMN telegram_url TEXT NOT NULL DEFAULT ''")
    if "description" not in dealership_columns:
        cur.execute("ALTER TABLE dealerships ADD COLUMN description TEXT NOT NULL DEFAULT ''")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS support_threads (
            group_message_id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def save_user(message: Message, phone: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    full_name = f"{message.from_user.first_name or ''} {message.from_user.last_name or ''}".strip()
    cur.execute(
        """
        INSERT INTO users (tg_id, full_name, username, phone, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tg_id) DO UPDATE SET
            full_name=excluded.full_name,
            username=excluded.username,
            phone=excluded.phone
        """,
        (
            message.from_user.id,
            full_name,
            message.from_user.username,
            phone,
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()


def get_user_phone(tg_id: int) -> str | None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT phone FROM users WHERE tg_id=?", (tg_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    phone = (row[0] or "").strip()
    return phone or None


def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


def build_main_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    webapp_url = f"{WEBAPP_BASE_URL}/app?tg_id={user_id}"
    rows = [[KeyboardButton(text=OPEN_APP_BUTTON_TEXT, web_app=WebAppInfo(url=webapp_url))]]
    if is_admin(user_id):
        rows.append([KeyboardButton(text=ADMIN_STATS_BUTTON_TEXT), KeyboardButton(text=ADMIN_BROADCAST_BUTTON_TEXT)])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)


def build_contact_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=SEND_CONTACT_BUTTON_TEXT, request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


async def send_welcome_message(message: Message) -> None:
    webapp_url = f"{WEBAPP_BASE_URL}/app?tg_id={message.from_user.id}"
    inline_kb = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=OPEN_APP_BUTTON_TEXT, web_app=WebAppInfo(url=webapp_url))]]
    )
    await message.answer(
        "👋 Добро пожаловать в Major Samarkand!\n\n"
        "Автомобили в наличии, актуальные цены, тест-драйв и консультация — всё доступно прямо здесь. 🚘\n"
        "Выбирайте с комфортом.",
        reply_markup=inline_kb,
    )


def count_users() -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM users")
    total = int(cur.fetchone()[0])
    conn.close()
    return total


def list_user_ids() -> list[int]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT tg_id FROM users ORDER BY id ASC")
    user_ids = [int(row[0]) for row in cur.fetchall()]
    conn.close()
    return user_ids


def list_dealerships() -> list[dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM dealerships ORDER BY id ASC")
    items = [dict(row) for row in cur.fetchall()]
    conn.close()
    return items


def resolve_dealership_id(raw_value: str) -> int | None:
    value = raw_value.strip().lower()
    if not value:
        return None

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    if value.isdigit():
        cur.execute("SELECT id FROM dealerships WHERE id=?", (int(value),))
    else:
        cur.execute("SELECT id FROM dealerships WHERE lower(slug)=? OR lower(name)=?", (value, value))
    row = cur.fetchone()
    conn.close()
    return int(row[0]) if row else None


def normalize_currency(raw_value: str) -> str | None:
    value = raw_value.strip().upper()
    if value in {"USD", "$", "ДОЛЛАР", "ДОЛЛАРЫ", "ДОЛЛАРАХ"}:
        return "USD"
    if value in {"UZS", "СУМ", "СУМЫ", "СУМАХ"}:
        return "UZS"
    return None


def normalize_position(raw_value: str) -> int | None:
    value = str(raw_value).strip()
    if not value or not value.isdigit():
        return None

    position = int(value)
    if position < 1:
        return None
    return position


def list_cars(dealership_id: int | None = None, include_inactive: bool = True) -> list[dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    where_parts: list[str] = []
    params: list[Any] = []
    if dealership_id:
        where_parts.append("cars.dealership_id=?")
        params.append(dealership_id)
    if not include_inactive:
        where_parts.append("cars.is_active=1")

    where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    cur.execute(
        f"""
        SELECT cars.*, dealerships.name AS dealership_name
        FROM cars
        LEFT JOIN dealerships ON dealerships.id = cars.dealership_id
        {where_sql}
        ORDER BY cars.position ASC, cars.id DESC
        """,
        params,
    )
    items = [dict(row) for row in cur.fetchall()]
    conn.close()
    return items


def get_car(car_id: int, include_inactive: bool = True) -> dict[str, Any] | None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    visibility_filter = "" if include_inactive else " AND cars.is_active=1"
    cur.execute(
        f"""
        SELECT cars.*, dealerships.name AS dealership_name
        FROM cars
        LEFT JOIN dealerships ON dealerships.id = cars.dealership_id
        WHERE cars.id=?{visibility_filter}
        """,
        (car_id,),
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def add_car(fields: list[str]) -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO cars (
            dealership_id, position, brand, title, price, currency, year, mileage,
            engine, transmission, description, image_url, image_url_2, image_url_3,
            image_url_4, image_url_5, video_url, is_active, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (*fields, datetime.utcnow().isoformat()),
    )
    conn.commit()
    car_id = cur.lastrowid
    conn.close()
    return int(car_id)


def edit_car(car_id: int, fields: list[str]) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE cars
        SET dealership_id=?, position=?, brand=?, title=?, price=?, currency=?, year=?, mileage=?, engine=?, transmission=?, description=?, image_url=?, image_url_2=?, image_url_3=?, image_url_4=?, image_url_5=?, video_url=?, is_active=?
        WHERE id=?
        """,
        (*fields, car_id),
    )
    conn.commit()
    updated = cur.rowcount > 0
    conn.close()
    return updated


def delete_car(car_id: int) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("DELETE FROM cars WHERE id=?", (car_id,))
    conn.commit()
    deleted = cur.rowcount > 0
    conn.close()
    return deleted


def save_support_map(group_message_id: int, user_id: int) -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "INSERT OR REPLACE INTO support_threads (group_message_id, user_id, created_at) VALUES (?, ?, ?)",
        (group_message_id, user_id, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()


def get_support_user(group_message_id: int) -> int | None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT user_id FROM support_threads WHERE group_message_id=?", (group_message_id,))
    row = cur.fetchone()
    conn.close()
    return int(row[0]) if row else None


def extract_user_id_from_support_message(message: Message) -> int | None:
    content = (message.html_text or message.text or message.caption or "").strip()
    if not content:
        return None

    content = re.sub(r"<[^>]+>", "", content)

    match = re.search(r"\bID\s*:\s*(\d+)\b", content, flags=re.IGNORECASE)
    if not match:
        return None
    return int(match.group(1))


def resolve_support_user(message: Message) -> int | None:
    current = message.reply_to_message
    while current:
        user_id = get_support_user(current.message_id)
        if user_id:
            return user_id

        parsed_user_id = extract_user_id_from_support_message(current)
        if parsed_user_id:
            return parsed_user_id

        current = current.reply_to_message
    return None


def get_user_display(user_id: int) -> str:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT full_name, username FROM users WHERE tg_id=?", (user_id,))
    row = cur.fetchone()
    conn.close()

    if not row:
        return f"ID {user_id}"

    full_name = (row[0] or "").strip()
    username = (row[1] or "").strip()
    if full_name and username:
        return f"{full_name} (@{username})"
    if full_name:
        return full_name
    if username:
        return f"@{username}"
    return f"ID {user_id}"


def _required_text(payload: dict[str, Any], key: str) -> str:
    return str(payload.get(key, "")).strip()


def parse_active_flag(raw_value: Any) -> int:
    value = str(raw_value).strip().lower()
    if value in {"", "1", "true", "yes", "on", "active", "активный"}:
        return 1
    if value in {"0", "false", "no", "off", "inactive", "неактивный"}:
        return 0
    return 1


def build_car_fields(payload: dict[str, Any]) -> list[str] | None:
    dealership_id_raw = _required_text(payload, "dealership_id")
    position_raw = _required_text(payload, "position")
    currency_raw = _required_text(payload, "currency")
    dealership_id = resolve_dealership_id(dealership_id_raw)
    position = normalize_position(position_raw)
    currency = normalize_currency(currency_raw)
    brand = _required_text(payload, "brand")
    title = _required_text(payload, "title")
    price = _required_text(payload, "price")
    engine = _required_text(payload, "engine")
    description = _required_text(payload, "description")
    if not all([brand, title, price, engine, description, dealership_id, currency, position]):
        return None

    image_urls = [
        _required_text(payload, "image_url"),
        _required_text(payload, "image_url_2"),
        _required_text(payload, "image_url_3"),
        _required_text(payload, "image_url_4"),
        _required_text(payload, "image_url_5"),
    ]
    image_urls[0] = image_urls[0] or "https://placehold.co/800x500/1f2937/ffffff?text=Auto"

    video_url = _required_text(payload, "video_url")
    is_active = parse_active_flag(payload.get("is_active", 1))
    return [
        str(dealership_id),
        str(position),
        brand,
        title,
        price,
        currency,
        "—",
        "—",
        engine,
        "—",
        description,
        image_urls[0],
        image_urls[1],
        image_urls[2],
        image_urls[3],
        image_urls[4],
        video_url,
        str(is_active),
    ]


def save_uploaded_image(raw_data: bytes, original_name: str = "") -> str:
    extension = os.path.splitext(original_name)[1].lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        extension = ".jpg"
    file_name = f"{uuid4().hex}{extension}"
    output_path = os.path.join(UPLOADS_DIR, file_name)
    with open(output_path, "wb") as file:
        file.write(raw_data)
    return f"/webapp/uploads/{file_name}"


@router.message(Command("start"))
async def start_cmd(message: Message) -> None:
    if get_user_phone(message.from_user.id):
        await send_welcome_message(message)
        return

    await message.answer(
        "Для продолжения отправьте ваш номер телефона кнопкой ниже.",
        reply_markup=build_contact_keyboard(),
    )


@router.message(F.contact)
async def handle_contact(message: Message) -> None:
    if not message.contact or message.contact.user_id != message.from_user.id:
        await message.answer("Пожалуйста, отправьте ваш собственный номер кнопкой ниже.")
        return

    save_user(message, message.contact.phone_number)
    await send_welcome_message(message)


@router.message(F.chat.type == "private", F.text == ADMIN_STATS_BUTTON_TEXT)
async def admin_stats_handler(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return
    total_users = count_users()
    await message.answer(f"👥 Всего пользователей: {total_users}")


@router.message(F.chat.type == "private", F.text == ADMIN_BROADCAST_BUTTON_TEXT)
async def admin_broadcast_start_handler(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return
    ADMIN_BROADCAST_STATE[message.from_user.id] = True
    await message.answer(
        "Отправьте сообщение для рассылки. Поддерживаются:\n"
        "• текст\n"
        "• фото (до 15 МБ)\n"
        "• видео (до 15 МБ)\n\n"
        "Для отмены отправьте /cancelbroadcast"
    )


@router.message(Command("cancelbroadcast"))
async def cancel_broadcast_cmd(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return
    if ADMIN_BROADCAST_STATE.pop(message.from_user.id, None):
        await message.answer("Рассылка отменена.")
        return
    await message.answer("Активной рассылки нет.")


async def send_broadcast_message(bot: Bot, source_message: Message, user_id: int) -> bool:
    try:
        if source_message.text and not source_message.photo and not source_message.video:
            await bot.send_message(user_id, source_message.text)
        else:
            await bot.copy_message(
                chat_id=user_id,
                from_chat_id=source_message.chat.id,
                message_id=source_message.message_id,
                reply_markup=None,
            )
        return True
    except (TelegramForbiddenError, TelegramBadRequest):
        return False


@router.message(F.chat.type == "private")
async def admin_broadcast_message_handler(message: Message, bot: Bot) -> None:
    if not is_admin(message.from_user.id):
        return
    if not ADMIN_BROADCAST_STATE.get(message.from_user.id):
        return
    if message.text and message.text.startswith("/"):
        return

    if not (message.text or message.photo or message.video):
        await message.answer("Поддерживаются только текст, фото или видео.")
        return

    if message.photo:
        file_size = message.photo[-1].file_size or 0
        if file_size > MAX_BROADCAST_FILE_SIZE:
            await message.answer("Фото больше 15 МБ. Отправьте файл меньшего размера.")
            return
    if message.video:
        file_size = message.video.file_size or 0
        if file_size > MAX_BROADCAST_FILE_SIZE:
            await message.answer("Видео больше 15 МБ. Отправьте файл меньшего размера.")
            return

    ADMIN_BROADCAST_STATE.pop(message.from_user.id, None)
    user_ids = list_user_ids()
    if not user_ids:
        await message.answer("В базе нет пользователей для рассылки.")
        return

    success_ids: list[int] = []
    failed_ids: list[int] = []
    for user_id in user_ids:
        ok = await send_broadcast_message(bot, message, user_id)
        if ok:
            success_ids.append(user_id)
        else:
            failed_ids.append(user_id)

    failed_preview = ", ".join(str(user_id) for user_id in failed_ids[:30])
    failed_suffix = "" if len(failed_ids) <= 30 else ", ..."
    details = (
        f"\n❌ Ошибки ({len(failed_ids)}): {failed_preview}{failed_suffix}" if failed_ids else "\n✅ Ошибок нет"
    )
    await message.answer(
        "📣 Рассылка завершена.\n"
        f"✅ Успешно: {len(success_ids)}\n"
        f"❌ Ошибка: {len(failed_ids)}"
        f"{details}"
    )


@router.message(Command("addcar"))
async def addcar_cmd(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return

    payload = (message.text or "").replace("/addcar", "", 1).strip()
    if payload:
        parts = [p.strip() for p in payload.split("|")]
        if len(parts) != 13:
            await message.answer(
                "Формат:\n/addcar dealership_id | position | brand | title | price | currency(USD/UZS) | year | mileage | engine | transmission | description | image_url | video_url"
            )
            return
        parts[0] = str(resolve_dealership_id(parts[0]) or "")
        parts[1] = str(normalize_position(parts[1]) or "")
        parts[5] = normalize_currency(parts[5]) or ""
        if not parts[0] or not parts[1] or not parts[5]:
            await message.answer("❌ Неверный автосалон, позиция или валюта. Используйте ID автосалона, позицию > 0 и USD/UZS.")
            return
        car_id = add_car(parts + ["", "", "", "", "1"])
        await message.answer(f"✅ Машина добавлена. ID: {car_id}")
        return

    ADMIN_CAR_DRAFTS[message.from_user.id] = {}
    _, first_prompt = ADD_CAR_STEPS[0]
    await message.answer(
        "🛠 Режим добавления автомобиля запущен.\n"
        "Отправляйте данные по шагам. Для отмены: /cancelcar\n\n"
        f"{first_prompt}"
    )


def _get_next_addcar_step(draft: dict[str, str]) -> tuple[str, str] | None:
    for key, prompt in ADD_CAR_STEPS:
        if key not in draft:
            return key, prompt
    return None


@router.message(Command("cancelcar"))
async def cancelcar_cmd(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return

    if ADMIN_CAR_DRAFTS.pop(message.from_user.id, None) is None:
        await message.answer("Нет активного добавления автомобиля.")
        return

    await message.answer("Добавление автомобиля отменено.")


@router.message(F.text, F.chat.type == "private")
async def addcar_step_handler(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return
    if message.chat.type != "private":
        return

    draft = ADMIN_CAR_DRAFTS.get(message.from_user.id)
    if draft is None:
        return

    text_value = (message.text or "").strip()
    if not text_value:
        await message.answer("Пустое значение. Отправьте текст для текущего шага.")
        return
    if text_value.startswith("/"):
        return

    next_step = _get_next_addcar_step(draft)
    if not next_step:
        ADMIN_CAR_DRAFTS.pop(message.from_user.id, None)
        return

    key, _ = next_step
    if key == "image_url" and text_value != "-":
        await message.answer("На этом шаге отправьте фото автомобиля или '-' для стандартного изображения.")
        return
    draft[key] = text_value

    if key == "dealership":
        resolved = resolve_dealership_id(draft[key])
        if not resolved:
            draft.pop(key, None)
            await message.answer("❌ Автосалон не найден. Введите ID, slug или название автосалона.")
            return
        draft[key] = str(resolved)

    if key == "currency":
        normalized = normalize_currency(draft[key])
        if not normalized:
            draft.pop(key, None)
            await message.answer("❌ Валюта должна быть USD или UZS.")
            return
        draft[key] = normalized

    if key == "position":
        normalized = normalize_position(draft[key])
        if not normalized:
            draft.pop(key, None)
            await message.answer("❌ Позиция должна быть целым числом больше 0.")
            return
        draft[key] = str(normalized)

    if key == "image_url" and draft[key] == "-":
        draft[key] = "https://placehold.co/800x500/1f2937/ffffff?text=Auto"

    if key == "video_url" and draft[key] == "-":
        draft[key] = ""

    upcoming_step = _get_next_addcar_step(draft)
    if upcoming_step:
        _, next_prompt = upcoming_step
        await message.answer(next_prompt)
        return

    fields = [
        draft["dealership"],
        draft["position"],
        draft["brand"],
        draft["title"],
        draft["price"],
        draft["currency"],
        draft["year"],
        draft["mileage"],
        draft["engine"],
        draft["transmission"],
        draft["description"],
        draft["image_url"],
        "",
        "",
        "",
        "",
        draft["video_url"],
        "1",
    ]
    car_id = add_car(fields)
    ADMIN_CAR_DRAFTS.pop(message.from_user.id, None)
    await message.answer(f"✅ Машина добавлена. ID: {car_id}")


@router.message(Command("editcar"))
async def editcar_cmd(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return
    payload = message.text.replace("/editcar", "", 1).strip()
    parts = [p.strip() for p in payload.split("|")]
    if len(parts) != 14 or not parts[0].isdigit():
        await message.answer(
            "Формат:\n/editcar id | dealership_id | position | brand | title | price | currency(USD/UZS) | year | mileage | engine | transmission | description | image_url | video_url"
        )
        return
    parts[1] = str(resolve_dealership_id(parts[1]) or "")
    parts[2] = str(normalize_position(parts[2]) or "")
    parts[6] = normalize_currency(parts[6]) or ""
    if not parts[1] or not parts[2] or not parts[6]:
        await message.answer("❌ Неверный автосалон, позиция или валюта. Используйте ID автосалона, позицию > 0 и USD/UZS.")
        return
    ok = edit_car(int(parts[0]), parts[1:] + ["", "", "", "", "1"])
    await message.answer("✅ Машина обновлена" if ok else "❌ Машина не найдена")


@router.message(F.photo, F.chat.type == "private")
async def addcar_photo_step_handler(message: Message, bot: Bot) -> None:
    if not is_admin(message.from_user.id):
        return

    draft = ADMIN_CAR_DRAFTS.get(message.from_user.id)
    if draft is None:
        return

    next_step = _get_next_addcar_step(draft)
    if not next_step:
        return

    key, _ = next_step
    if key != "image_url":
        await message.answer("Сейчас ожидается текстовое поле. Для отмены используйте /cancelcar")
        return

    photo = message.photo[-1]
    file = await bot.get_file(photo.file_id)
    output = io.BytesIO()
    await bot.download(file, destination=output)
    draft[key] = save_uploaded_image(output.getvalue(), f"{photo.file_unique_id}.jpg")

    upcoming_step = _get_next_addcar_step(draft)
    if upcoming_step:
        _, next_prompt = upcoming_step
        await message.answer(next_prompt)
        return


@router.message(Command("delcar"))
async def delcar_cmd(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return
    payload = message.text.replace("/delcar", "", 1).strip()
    if not payload.isdigit():
        await message.answer("Формат: /delcar id")
        return
    ok = delete_car(int(payload))
    await message.answer("🗑 Удалено" if ok else "❌ Машина не найдена")


@router.message(Command("cars"))
async def cars_cmd(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return
    cars = list_cars()
    if not cars:
        await message.answer("Список машин пуст")
        return
    text = "\n".join([f"#{item['id']} {item['title']} — {item['price']}" for item in cars[:20]])
    await message.answer(text)


def is_support_responder(message: Message, member_status: str | None) -> bool:
    if member_status in {"administrator", "creator"}:
        return True
    if message.sender_chat and message.sender_chat.id == message.chat.id:
        return True
    return bool(message.from_user and is_admin(message.from_user.id))


def extract_support_reply_text(message: Message) -> str:
    text = (message.html_text or message.text or message.caption or "").strip()
    if text:
        return text
    return "📩 Поддержка отправила вам сообщение (не текстовый формат)."


@router.message(F.chat.id == SUPPORT_GROUP_ID, F.reply_to_message)
async def group_reply_handler(message: Message, bot: Bot) -> None:
    if not message.reply_to_message:
        return

    member_status: str | None = None
    if message.from_user:
        try:
            member = await bot.get_chat_member(message.chat.id, message.from_user.id)
            member_status = member.status
        except TelegramBadRequest:
            member_status = None

    if not is_support_responder(message, member_status):
        return

    user_id = resolve_support_user(message)
    if not user_id:
        return
    is_text_only = bool(message.text) and not any(
        [
            message.photo,
            message.video,
            message.document,
            message.audio,
            message.voice,
            message.video_note,
            message.animation,
            message.sticker,
            message.location,
            message.contact,
            message.poll,
            message.venue,
            message.dice,
        ]
    )

    if is_text_only:
        support_text = extract_support_reply_text(message)
        try:
            await bot.send_message(user_id, f"Сообщение от поддержки: {support_text}")
        except TelegramForbiddenError:
            logging.warning("Не удалось отправить текстовый ответ поддержки пользователю %s: бот заблокирован", user_id)
            return
        except TelegramBadRequest:
            logging.warning("Не удалось отправить текстовый ответ поддержки пользователю %s", user_id)
            return
        save_support_map(message.message_id, user_id)
        return

    try:
        await bot.send_message(user_id, "Сообщение от поддержки:")
    except TelegramForbiddenError:
        logging.warning("Не удалось отправить ответ поддержки пользователю %s: бот заблокирован", user_id)
        return
    except TelegramBadRequest:
        logging.warning("Не удалось отправить ответ поддержки пользователю %s: не удалось отправить префикс", user_id)
        return

    try:
        await bot.copy_message(
            chat_id=user_id,
            from_chat_id=message.chat.id,
            message_id=message.message_id,
            reply_markup=None,
        )
    except TelegramForbiddenError:
        logging.warning("Не удалось отправить ответ поддержки пользователю %s: бот заблокирован", user_id)
        return
    except TelegramBadRequest:
        support_text = extract_support_reply_text(message)
        try:
            await bot.send_message(user_id, support_text)
        except (TelegramForbiddenError, TelegramBadRequest):
            logging.warning("Не удалось доставить fallback ответ поддержки пользователю %s", user_id)
            return

    save_support_map(message.message_id, user_id)


async def app_page(_: web.Request) -> web.Response:
    return web.FileResponse("webapp/index.html")


async def car_page(_: web.Request) -> web.Response:
    return web.FileResponse("webapp/car.html")


async def api_cars(request: web.Request) -> web.Response:
    dealership_id = int(request.query.get("dealership_id", "0"))
    tg_id = int(request.query.get("tg_id", "0"))
    include_inactive = is_admin(tg_id)
    return web.json_response({"cars": list_cars(dealership_id if dealership_id else None, include_inactive=include_inactive)})


async def api_dealerships(_: web.Request) -> web.Response:
    return web.json_response({"dealerships": list_dealerships()})


async def api_manage_dealership(request: web.Request) -> web.Response:
    data = await request.json()
    tg_id = int(data.get("tg_id", 0))
    if not is_admin(tg_id):
        return web.json_response({"ok": False, "error": "forbidden"}, status=403)

    dealership_id = int(request.match_info.get("dealership_id", "0"))
    address = _required_text(data, "address")
    phone = _required_text(data, "phone")
    map_url = _required_text(data, "map_url")
    description = _required_text(data, "description")
    instagram_url = _required_text(data, "instagram_url")
    telegram_url = _required_text(data, "telegram_url")
    if not dealership_id or not address or not phone or not map_url:
        return web.json_response({"ok": False, "error": "bad_request"}, status=400)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "UPDATE dealerships SET address=?, phone=?, map_url=?, description=?, instagram_url=?, telegram_url=? WHERE id=?",
        (address, phone, map_url, description, instagram_url, telegram_url, dealership_id),
    )
    conn.commit()
    ok = cur.rowcount > 0
    conn.close()
    if not ok:
        return web.json_response({"ok": False, "error": "not_found"}, status=404)
    return web.json_response({"ok": True, "id": dealership_id})


async def api_car(request: web.Request) -> web.Response:
    car_id = int(request.match_info["car_id"])
    tg_id = int(request.query.get("tg_id", "0"))
    car = get_car(car_id, include_inactive=is_admin(tg_id))
    if not car:
        return web.json_response({"error": "not_found"}, status=404)
    return web.json_response(car)


async def api_manage_car(request: web.Request) -> web.Response:
    data = await request.json()
    tg_id = int(data.get("tg_id", 0))
    if not is_admin(tg_id):
        return web.json_response({"ok": False, "error": "forbidden"}, status=403)

    fields = build_car_fields(data)
    if fields is None:
        return web.json_response({"ok": False, "error": "bad_request"}, status=400)

    if request.method == "POST":
        car_id = add_car(fields)
        return web.json_response({"ok": True, "id": car_id})

    car_id = int(request.match_info["car_id"])
    ok = edit_car(car_id, fields)
    if not ok:
        return web.json_response({"ok": False, "error": "not_found"}, status=404)
    return web.json_response({"ok": True, "id": car_id})


async def api_upload_image(request: web.Request) -> web.Response:
    reader = await request.multipart()
    tg_id = 0
    image_bytes = b""
    filename = ""

    while True:
        part = await reader.next()
        if part is None:
            break
        if part.name == "tg_id":
            tg_id = int((await part.text()).strip() or 0)
        if part.name == "image":
            filename = part.filename or ""
            image_bytes = await part.read(decode=False)

    if not is_admin(tg_id):
        return web.json_response({"ok": False, "error": "forbidden"}, status=403)
    if not image_bytes:
        return web.json_response({"ok": False, "error": "no_image"}, status=400)

    image_url = save_uploaded_image(image_bytes, filename)
    return web.json_response({"ok": True, "image_url": image_url})




async def api_admin_check(request: web.Request) -> web.Response:
    tg_id = int(request.query.get("tg_id", "0"))
    return web.json_response({"is_admin": is_admin(tg_id)})

async def api_support(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("tg_id", 0))
    message = str(data.get("message", "")).strip()
    dealership_name = str(data.get("dealership_name", "")).strip()
    if not user_id or not message:
        return web.json_response({"ok": False, "error": "bad_request"}, status=400)

    bot: Bot = request.app["bot"]
    if not SUPPORT_GROUP_ID:
        return web.json_response({"ok": False, "error": "group_not_set"}, status=500)

    user_display = get_user_display(user_id)
    user_phone = get_user_phone(user_id) or "Не указан"
    sent = await bot.send_message(
        SUPPORT_GROUP_ID,
        f"🆘 Новое обращение\nПользователь: {user_display}\nID: <code>{user_id}</code>\nТелефон: <code>{user_phone}</code>\nАвтосалон: {dealership_name or 'Не выбран'}\nСообщение: {message}",
    )
    save_support_map(sent.message_id, user_id)
    return web.json_response({"ok": True})


async def run_web(bot: Bot) -> None:
    app = web.Application()
    app["bot"] = bot
    app.router.add_get("/app", app_page)
    app.router.add_get("/car", car_page)
    app.router.add_get("/api/cars", api_cars)
    app.router.add_get("/api/dealerships", api_dealerships)
    app.router.add_get("/api/cars/{car_id}", api_car)
    app.router.add_post("/api/cars", api_manage_car)
    app.router.add_put("/api/cars/{car_id}", api_manage_car)
    app.router.add_post("/api/upload-image", api_upload_image)
    app.router.add_put("/api/dealerships/{dealership_id}", api_manage_dealership)
    app.router.add_get("/api/is-admin", api_admin_check)
    app.router.add_post("/api/support", api_support)
    app.router.add_static("/webapp", path="webapp", show_index=False)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8090)
    await site.start()
    logging.info("WebApp started at http://0.0.0.0:8090")


async def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError("Set BOT_TOKEN env variable")

    logging.basicConfig(level=logging.INFO)
    init_db()

    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(router)

    await run_web(bot)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())