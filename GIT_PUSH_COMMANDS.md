# Các Lệnh Git Push Lên Repository

## 1. Kiểm tra và thiết lập Remote Repository

```bash
# Kiểm tra remote hiện tại
git remote -v

# Nếu chưa có remote hoặc muốn thêm remote mới
git remote add origin https://github.com/NguyenPhuocSang123/WEB_DAU_GIAI.git

# Nếu remote đã tồn tại nhưng khác, xóa và thêm lại
git remote remove origin
git remote add origin https://github.com/NguyenPhuocSang123/WEB_DAU_GIAI.git
```

## 2. Kiểm tra trạng thái code

```bash
# Xem trạng thái các file đã thay đổi
git status

# Xem tất cả các commit chưa push
git log origin/main..HEAD
```

## 3. Commit và Push Code

```bash
# Stage tất cả các file đã thay đổi
git add .

# Commit với message
git commit -m "Update tournament management system"

# Push lên branch main
git push -u origin main

# Hoặc nếu branch chưa tồn tại trên remote
git push -u origin HEAD:main
```

## 4. Nếu Repository Trống (First Push)

```bash
# Nếu đây là lần đầu push và repository hoàn toàn trống
git branch -M main
git push -u origin main
```

## 5. Nếu Có Conflict hoặc Push Bị Từ Chối

```bash
# Pull code từ remote trước (nếu có người khác push trước)
git pull origin main

# Sau đó push lại
git push origin main

# Hoặc nếu muốn force push (chỉ dùng khi chắc chắn)
git push -f origin main
```

## 6. Xác Minh Push Thành Công

```bash
# Kiểm tra lại remote
git remote -v

# Xem commit đã push
git log --oneline -n 5
```

## Hướng Dẫn Từng Bước (Thực Hiện Tuần Tự)

```bash
# 1. Di chuyển vào thư mục project
cd D:\A01

# 2. Kiểm tra trạng thái hiện tại
git status

# 3. Thiết lập remote (nếu chưa có)
git remote add origin https://github.com/NguyenPhuocSang123/WEB_DAU_GIAI.git

# 4. Kiểm tra remote đã được thêm
git remote -v

# 5. Thêm tất cả file thay đổi
git add .

# 6. Commit
git commit -m "Initial commit: Tournament management system"

# 7. Đổi tên branch về main (nếu cần)
git branch -M main

# 8. Push lên GitHub
git push -u origin main
```

## Lưu Ý

- **Đảm bảo** repository trên GitHub đã được tạo
- **Kiểm tra** quyền truy cập (SSH key hoặc personal access token)
- Nếu dùng **HTTPS**, GitHub có thể yêu cầu authentication
- Nếu dùng **SSH**, cần thiết lập SSH key trước
