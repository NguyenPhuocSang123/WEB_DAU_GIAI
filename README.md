# Website dang ky giai Lien Quan

Du an nay duoc dung bang `Node.js + Express + MongoDB + EJS`, chay duoc tren `localhost` va co the deploy len `Render` voi `MongoDB Atlas`.

## Tinh nang da co

- Trang chu gioi thieu giai dau
- Trang dang ky doi co upload logo
- Validation form va validation he thong
- Luu du lieu `Tournament`, `Team`, `Member` vao MongoDB
- Trang tra cuu theo email hoac so dien thoai
- Admin login
- Dashboard thong ke tong so doi, cho duyet, da duyet, bi tu choi
- Admin xem chi tiet, duyet hoac tu choi doi
- Gui email mo phong bang log console

## Yeu cau cai dat

1. Cai `Node.js` 18+ (may cua ban dang co Node roi).
2. Cai `MongoDB Community Server` va dam bao MongoDB dang chay local.

## Chay local

1. Tao file `.env` tu `.env.example`
2. Cai thu vien:

```bash
npm install
```

3. Chay du an:

```bash
npm run dev
```

Hoac:

```bash
npm start
```

4. Mo trinh duyet tai:

```text
http://localhost:3000
```

## Deploy online voi Render

### 1. Day code len GitHub

Neu may ban chua tao git repo thi chay:

```bash
git init
git add .
git commit -m "Initial tournament registration app"
```

Tao repository tren GitHub, sau do push code len.

### 2. Tao MongoDB Atlas

1. Vao `https://www.mongodb.com/cloud/atlas/register`
2. Tao cluster free
3. Vao `Database Access` tao user/password
4. Vao `Network Access` cho phep `0.0.0.0/0`
5. Lay chuoi ket noi dang:

```text
mongodb+srv://USERNAME:PASSWORD@cluster-url/lien-quan-tournament?retryWrites=true&w=majority&appName=Cluster0
```

### 3. Tao web service tren Render

1. Vao `https://render.com`
2. Chon `New +` -> `Web Service`
3. Ket noi den repository GitHub cua ban
4. Render se tu doc `render.yaml`, hoac ban co the tu nhap:

- Build Command: `npm install`
- Start Command: `npm start`

### 4. Them Environment Variables tren Render

Them cac bien sau trong phan `Environment`:

- `NODE_ENV=production`
- `PORT=10000`
- `MONGODB_URI=<chuoi MongoDB Atlas cua ban>`
- `SESSION_SECRET=<mot chuoi bi mat dai>`
- `ADMIN_EMAIL=admin@lienquan.local`
- `ADMIN_PASSWORD=12345678`
- `TOURNAMENT_NAME=Giai Lien Quan Mua He 2026`
- `REGISTRATION_OPEN_AT=2026-01-01T00:00:00.000Z`
- `REGISTRATION_CLOSE_AT=2026-12-31T23:59:59.000Z`
- `MAX_TEAMS=32`

### 5. Deploy

Sau khi Render build xong, ban se nhan duoc link dang:

```text
https://ten-web.onrender.com
```

Duong dan su dung:

- Trang chu: `/`
- Dang ky doi: `/register`
- Tra cuu: `/status`
- Admin: `/admin/login`

### 6. Health check

Render co the kiem tra service qua:

```text
/health
```

Neu dung, trang nay tra ve JSON:

```json
{"status":"ok"}
```

## Tai khoan admin mac dinh

- Email: gia tri `ADMIN_EMAIL` trong `.env`
- Mat khau: gia tri `ADMIN_PASSWORD` trong `.env`

## Cau truc database

- `tournaments`
- `teams`
- `members`

## Luu y

- Email hien dang la email mo phong va duoc in ra terminal server.
- Session admin hien dung `express-session` memory store, phu hop demo va do an. Neu deploy that cho nhieu nguoi dung, nen doi sang `connect-mongo`.
- Thu muc `uploads/` luu tren file system cua server. Tren Render, file upload co tinh chat tam thoi va co the mat sau redeploy/restart. Neu ban muon giu logo lau dai, nen chuyen sang Cloudinary, S3 hoac Supabase Storage.

## Deploy tren VPS

- Xem file `DEPLOY_VPS.md` de lam theo tung lenh.
- Bien `UPLOAD_DIR` cho phep ban luu file upload ben ngoai source code, tranh mat file sau khi deploy lai.
