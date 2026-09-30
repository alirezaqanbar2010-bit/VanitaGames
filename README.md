# VANTA GAMES — Online

این نسخه شامل:
- Frontend اختصاصی VANTA GAMES
- Backend Node.js / Express
- Supabase Database
- Supabase Storage برای کاور، لوگو، تصاویر، تریلر و فایل بازی
- پنل سازنده با احراز هویت Basic
- صفحه جزئیات بازی
- گالری، ویدیو، لوگو و دانلود فایل

## راه‌اندازی
1. در Supabase یک Project بساز.
2. محتویات `schema.sql` را در SQL Editor اجرا کن.
3. در Storage یک bucket عمومی با نام `games` بساز.
4. `.env.example` را به `.env` تغییر بده و URL و Service Role Key را وارد کن.
5. `npm install`
6. `npm start`
7. سایت روی پورت 3000 اجرا می‌شود.

برای انتشار عمومی، همین پروژه را روی یک سرویس Node.js مثل Render/Railway/Fly.io قرار بده و Environment Variables را تنظیم کن.

نکته امنیتی: Service Role Key فقط باید روی سرور باشد و هرگز داخل فایل‌های frontend قرار نگیرد.
