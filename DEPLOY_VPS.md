# Deploy tren VPS Ubuntu

## 1. Cai phan mem can thiet

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

Neu ban chua co MongoDB, co the dung MongoDB Atlas hoac cai local tren VPS.

## 2. Lay code ve server

```bash
git clone https://github.com/NguyenPhuocSang123/WEB_DAU_GIAI.git
cd WEB_DAU_GIAI
npm install
```

## 3. Tao file `.env`

```bash
cp .env.example .env
```

Sua `.env`:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/lien-quan-tournament
UPLOAD_DIR=/var/www/lienquan-uploads
SESSION_SECRET=thay-bang-mot-chuoi-bao-mat-dai
ADMIN_EMAIL=admin@lienquan.local
ADMIN_PASSWORD=12345678
TOURNAMENT_NAME=Giai Lien Quan Mua He 2026
REGISTRATION_OPEN_AT=2026-01-01T00:00:00.000Z
REGISTRATION_CLOSE_AT=2026-12-31T23:59:59.000Z
MAX_TEAMS=32
NODE_ENV=production
```

## 4. Tao thu muc luu file upload ben ngoai source code

```bash
sudo mkdir -p /var/www/lienquan-uploads
sudo chown -R $USER:$USER /var/www/lienquan-uploads
```

Neu ban van muon luu ngay trong project thi dung:

```bash
mkdir -p uploads
```

va de `UPLOAD_DIR=./uploads` trong `.env`.

## 5. Chay ung dung bang PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Kiem tra:

```bash
pm2 status
curl http://127.0.0.1:3000/health
```

## 6. Cau hinh Nginx

Tao file:

```bash
sudo nano /etc/nginx/sites-available/lienquan
```

Noi dung:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Bat site:

```bash
sudo ln -s /etc/nginx/sites-available/lienquan /etc/nginx/sites-enabled/lienquan
sudo nginx -t
sudo systemctl restart nginx
```

## 7. Cai SSL voi Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 8. Cap nhat khi deploy lai

```bash
git pull origin main
npm install
pm2 restart lienquan
```

Neu `UPLOAD_DIR` tro ra thu muc ngoai source code, file upload se duoc giu lai sau moi lan deploy.
