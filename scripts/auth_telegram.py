"""Telegram authentication script — two-step flow.

Usage:
  Step 1 — send code:
    python scripts/auth_telegram.py send +79001234567

  Step 2 — verify code (phone_code_hash printed in step 1):
    python scripts/auth_telegram.py verify +79001234567 12345 <phone_code_hash>

  With 2FA password:
    python scripts/auth_telegram.py verify +79001234567 12345 <hash> MyPassword

  Check current session:
    python scripts/auth_telegram.py check
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from app.config import get_settings  # noqa: E402

settings = get_settings()
SESSIONS_DIR = ROOT / "sessions"
SESSION_PATH = str(SESSIONS_DIR / settings.tg_session_name)


def make_client():
    from telethon import TelegramClient

    return TelegramClient(
        SESSION_PATH,
        int(settings.tg_api_id),
        settings.tg_api_hash,
        device_model="Desktop",
        system_version="Linux",
        app_version="1.0",
        lang_code="ru",
        system_lang_code="ru-RU",
    )


async def cmd_check():
    client = make_client()
    await client.connect()
    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"✅  Авторизован как {me.first_name} (@{me.username}, {me.phone})")
    else:
        print("❌  Сессия не найдена. Запусти: python scripts/auth_telegram.py send <phone>")
    await client.disconnect()


async def cmd_send(phone: str):
    SESSIONS_DIR.mkdir(exist_ok=True)
    client = make_client()
    await client.connect()
    result = await client.send_code_request(phone)
    print(f"✅  Код отправлен на {phone}")
    print(f"    phone_code_hash: {result.phone_code_hash}")
    print()
    print("  Теперь запусти:")
    print(f"    python scripts/auth_telegram.py verify {phone} <КОД> {result.phone_code_hash}")
    await client.disconnect()


async def cmd_verify(phone: str, code: str, phone_code_hash: str, password: str | None = None):
    client = make_client()
    await client.connect()
    try:
        await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
    except Exception as e:
        if "Two-steps" in str(e) or "PASSWORD" in str(e).upper():
            if password:
                await client.sign_in(password=password)
            else:
                print("⚠️   Требуется пароль 2FA. Добавь его в конец команды:")
                print(f"    python scripts/auth_telegram.py verify {phone} {code} {phone_code_hash} <2FA>")
                await client.disconnect()
                return
        else:
            print(f"❌  Ошибка: {e}")
            await client.disconnect()
            return

    me = await client.get_me()
    print(f"✅  Авторизован как {me.first_name} (@{me.username})")
    print(f"    Сессия сохранена: {SESSION_PATH}.session")
    print()
    print("  Перезапусти бэкенд — telegram_connected станет true.")
    await client.disconnect()


def main():
    if not settings.tg_api_id or not settings.tg_api_hash:
        print("❌  TG_API_ID и TG_API_HASH должны быть заданы в .env")
        sys.exit(1)

    args = sys.argv[1:]

    if not args or args[0] == "check":
        asyncio.run(cmd_check())

    elif args[0] == "send":
        if len(args) < 2:
            print("Использование: python scripts/auth_telegram.py send +79001234567")
            sys.exit(1)
        asyncio.run(cmd_send(args[1]))

    elif args[0] == "verify":
        if len(args) < 4:
            print("Использование: python scripts/auth_telegram.py verify <phone> <code> <hash> [2fa]")
            sys.exit(1)
        pwd = args[4] if len(args) > 4 else None
        asyncio.run(cmd_verify(args[1], args[2], args[3], pwd))

    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
