# ZOUUU DROP GATE v8 — FULL BUILD

Semua fitur utama sudah digabung dalam satu build dan persistence memakai JSON (tanpa better-sqlite3).

## Fitur
- Admin login dengan input password normal + tombol/Enter.
- Countdown berjalan real-time.
- Logo upload + ukuran 40–800 px.
- Upload banyak background sekaligus.
- Interactive slide gallery: swipe/drag, tombol kiri/kanan, dots.
- Jumlah slide otomatis mengikuti jumlah background.
- Tidak ada auto-slide.
- Email duplicate tidak mengurangi slot.
- Sebelum slot penuh, refresh halaman membuat form tersedia lagi.
- Setelah slot penuh, form ditutup oleh server sehingga refresh tidak membuka kembali.
- Semua setting admin tersimpan di `data/data.json`.
- Customer list + statistik slot.
- Responsive HP/tablet/desktop.
- Notifikasi email ke owner via SMTP/Nodemailer.

## Install
1. Buka CMD/Terminal di folder project.
2. Jalankan `npm install`.
3. Copy `.env.example` menjadi `.env`.
4. Isi minimal:

```env
PORT=3000
ADMIN_PASSWORD=password-rahasia
OWNER_EMAIL=emailowner@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=emailowner@gmail.com
SMTP_PASS=APP_PASSWORD_GMAIL
MAIL_FROM=ZOUUU <emailowner@gmail.com>
```

Untuk Gmail, `SMTP_PASS` menggunakan Google App Password, bukan password Gmail biasa.

## Jalankan
```bash
npm start
```

Public: `http://localhost:3000`
Admin: `http://localhost:3000/admin`

## Catatan penting
Domain internet asli seperti `zouuu...` tetap perlu domain + hosting/deployment. Project lokal tidak bisa membuat domain publik hanya dari kode.

Untuk production, jangan pakai password sederhana dan jangan expose server tanpa HTTPS/reverse proxy/rate limiting. Versi ini fokus pada fitur Drop Gate dan persistence JSON yang mudah dijalankan di Node 24.

## Akses dari HP saat development

`localhost` di HP menunjuk ke HP itu sendiri, bukan laptop/PC yang menjalankan server. Jalankan server di PC lalu pastikan HP dan PC berada di Wi-Fi yang sama. Server sekarang listen pada `0.0.0.0`, jadi bisa diakses dari perangkat lain melalui IP lokal PC, misalnya `http://192.168.1.10:3000` dan admin `http://192.168.1.10:3000/admin`.

Jika tetap tidak bisa, izinkan Node.js/port 3000 pada Windows Firewall untuk jaringan Private.
