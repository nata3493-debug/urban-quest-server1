# Urban Quest API

Простой сервер для городского квеста: регистрация, лобби, очки, результаты всех команд.

## Локальный запуск

```bash
cd urban-quest-server
npm install
npm start
```

Открой: http://localhost:3000

## Загрузка на Render (бесплатно)

1. Зарегистрируйся на [https://render.com](https://render.com)
2. **New → Web Service**
3. Подключи GitHub-репозиторий с этой папкой  
   (или загрузи через «Deploy from Git»)
4. Настройки:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Environment:
   - `ADMIN_KEY` = свой секретный пароль (например `ltk-secret-123`)
6. Create Web Service → дождись деплоя
7. Скопируй URL вида: `https://urban-quest-xxxx.onrender.com`

## Проверка

```bash
curl https://ВАШ-URL.onrender.com/
```

Должен вернуться JSON с `"ok": true`.

## API (кратко)

| Метод | Путь | Описание |
|--------|------|----------|
| POST | `/api/register` | `{ username, password }` |
| POST | `/api/login` | `{ username, password }` |
| GET | `/api/lobbies` | список открытых лобби |
| POST | `/api/lobbies` | создать лобби |
| POST | `/api/lobbies/join` | `{ code, userId, username }` |
| PATCH | `/api/lobbies/:id` | ready / start |
| POST | `/api/lobbies/:id/progress` | очки и задания |
| POST | `/api/lobbies/:id/finish` | завершить |
| GET | `/api/results` | результаты всех команд |
| GET | `/api/admin/results?key=ADMIN_KEY` | полные данные |

## Важно

- На бесплатном Render файлы ** quantируются** при «засыпании» сервиса.  
  Для серьёзного мероприятия лучше подключить PostgreSQL на Render или использовать Supabase/Firebase.
- В приложении (HTML) укажи адрес сервера в константе `API_URL`.
