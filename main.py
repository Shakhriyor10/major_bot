import asyncio
import logging
import os
import sqlite3
from datetime import datetime
from typing import Any

from aiohttp import web
from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import (
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)

BOT_TOKEN = "8485302210:AAH_cHt86GVugNhNQYaprZNs-d8zN0QH0sU"
WEBAPP_BASE_URL = "https://subcommissarial-paris-untensely.ngrok-free.dev"
SUPPORT_GROUP_ID = int(os.getenv("SUPPORT_GROUP_ID", "0"))
ADMIN_IDS = {
    int(user_id.strip())
    for user_id in os.getenv("ADMIN_IDS", "8598163827").split(",")
    if user_id.strip()
}

DB_PATH = "dealership.db"

router = Router()

ADD_CAR_STEPS = [
    ("title", "Введите название автомобиля (например: BMW X5 2022):"),
    ("price", "Введите цену (например: 5 900 000 ₽):"),
    ("year", "Введите год выпуска (например: 2022):"),
    ("mileage", "Введите пробег (например: 45 000 км):"),
    ("engine", "Введите двигатель (например: 3.0 л, 340 л.с.):"),
    ("transmission", "Введите коробку передач (например: Автомат):"),
    ("description", "Введите описание автомобиля:"),
    ("image_url", "Введите ссылку на фото (или отправьте '-' чтобы использовать стандартное изображение):"),
]
ADMIN_CAR_DRAFTS: dict[int, dict[str, str]] = {}


def init_db() -> None:
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
        CREATE TABLE IF NOT EXISTS cars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            price TEXT NOT NULL,
            year TEXT NOT NULL,
            mileage TEXT NOT NULL,
            engine TEXT NOT NULL,
            transmission TEXT NOT NULL,
            description TEXT NOT NULL,
            image_url TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
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


def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


def list_cars() -> list[dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM cars ORDER BY id DESC")
    items = [dict(row) for row in cur.fetchall()]
    conn.close()
    return items


def get_car(car_id: int) -> dict[str, Any] | None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM cars WHERE id=?", (car_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def add_car(fields: list[str]) -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO cars (title, price, year, mileage, engine, transmission, description, image_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        SET title=?, price=?, year=?, mileage=?, engine=?, transmission=?, description=?, image_url=?
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


def _required_text(payload: dict[str, Any], key: str) -> str:
    return str(payload.get(key, "")).strip()


def build_car_fields(payload: dict[str, Any]) -> list[str] | None:
    title = _required_text(payload, "title")
    price = _required_text(payload, "price")
    engine = _required_text(payload, "engine")
    description = _required_text(payload, "description")
    if not all([title, price, engine, description]):
        return None

    image_url = _required_text(payload, "image_url") or "https://placehold.co/800x500/1f2937/ffffff?text=Auto"
    return [
        title,
        price,
        "—",
        "—",
        engine,
        "—",
        description,
        image_url,
    ]


@router.message(Command("start"))
async def start_cmd(message: Message) -> None:
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📱 Отправить номер", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await message.answer(
        "Добро пожаловать в автосалон 🚗\nЧтобы начать, отправьте номер телефона.",
        reply_markup=kb,
    )


@router.message(F.contact)
async def handle_contact(message: Message) -> None:
    if not message.contact or message.contact.user_id != message.from_user.id:
        await message.answer("Пожалуйста, отправьте ваш собственный номер кнопкой ниже.")
        return

    save_user(message, message.contact.phone_number)
    webapp_url = f"{WEBAPP_BASE_URL}/app?tg_id={message.from_user.id}"
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="🚘 Открыть приложение", web_app=WebAppInfo(url=webapp_url))]],
        resize_keyboard=True,
    )
    await message.answer(
        "Спасибо! Данные сохранены. Теперь можно открыть приложение.",
        reply_markup=kb,
    )


@router.message(Command("addcar"))
async def addcar_cmd(message: Message) -> None:
    if not is_admin(message.from_user.id):
        return

    payload = (message.text or "").replace("/addcar", "", 1).strip()
    if payload:
        parts = [p.strip() for p in payload.split("|")]
        if len(parts) != 8:
            await message.answer(
                "Формат:\n/addcar title | price | year | mileage | engine | transmission | description | image_url"
            )
            return
        car_id = add_car(parts)
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


@router.message(F.text)
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
    draft[key] = text_value

    if key == "image_url" and draft[key] == "-":
        draft[key] = "https://placehold.co/800x500/1f2937/ffffff?text=Auto"

    upcoming_step = _get_next_addcar_step(draft)
    if upcoming_step:
        _, next_prompt = upcoming_step
        await message.answer(next_prompt)
        return

    fields = [
        draft["title"],
        draft["price"],
        draft["year"],
        draft["mileage"],
        draft["engine"],
        draft["transmission"],
        draft["description"],
        draft["image_url"],
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
    if len(parts) != 9 or not parts[0].isdigit():
        await message.answer(
            "Формат:\n/editcar id | title | price | year | mileage | engine | transmission | description | image_url"
        )
        return
    ok = edit_car(int(parts[0]), parts[1:])
    await message.answer("✅ Машина обновлена" if ok else "❌ Машина не найдена")


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


@router.message(F.chat.id == SUPPORT_GROUP_ID, F.reply_to_message)
async def group_reply_handler(message: Message, bot: Bot) -> None:
    if not message.reply_to_message:
        return

    try:
        member = await bot.get_chat_member(message.chat.id, message.from_user.id)
    except TelegramBadRequest:
        return

    if member.status not in {"administrator", "creator"}:
        return

    user_id = get_support_user(message.reply_to_message.message_id)
    if not user_id:
        return

    reply_text = (message.text or message.caption or "").strip() or "[без текста]"
    await bot.send_message(user_id, f"💬 Ответ поддержки:\n{reply_text}")


async def app_page(_: web.Request) -> web.Response:
    return web.FileResponse("webapp/index.html")


async def car_page(_: web.Request) -> web.Response:
    return web.FileResponse("webapp/car.html")


async def api_cars(_: web.Request) -> web.Response:
    return web.json_response({"cars": list_cars()})


async def api_car(request: web.Request) -> web.Response:
    car_id = int(request.match_info["car_id"])
    car = get_car(car_id)
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




async def api_admin_check(request: web.Request) -> web.Response:
    tg_id = int(request.query.get("tg_id", "0"))
    return web.json_response({"is_admin": is_admin(tg_id)})

async def api_support(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("tg_id", 0))
    message = str(data.get("message", "")).strip()
    if not user_id or not message:
        return web.json_response({"ok": False, "error": "bad_request"}, status=400)

    bot: Bot = request.app["bot"]
    if not SUPPORT_GROUP_ID:
        return web.json_response({"ok": False, "error": "group_not_set"}, status=500)

    sent = await bot.send_message(
        SUPPORT_GROUP_ID,
        f"🆘 Новое обращение\nПользователь: <code>{user_id}</code>\nСообщение: {message}",
    )
    save_support_map(sent.message_id, user_id)
    return web.json_response({"ok": True})


async def run_web(bot: Bot) -> None:
    app = web.Application()
    app["bot"] = bot
    app.router.add_get("/app", app_page)
    app.router.add_get("/car", car_page)
    app.router.add_get("/api/cars", api_cars)
    app.router.add_get("/api/cars/{car_id}", api_car)
    app.router.add_post("/api/cars", api_manage_car)
    app.router.add_put("/api/cars/{car_id}", api_manage_car)
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
