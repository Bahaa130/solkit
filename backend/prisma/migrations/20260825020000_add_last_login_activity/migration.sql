-- 🎯 إضافة عمود تاريخ آخر نشاط تسجيل دخول (لمنح نقاط النشاط مرة واحدة يومياً)
ALTER TABLE `User` ADD COLUMN `lastLoginActivityAt` DATETIME(3) NULL;
