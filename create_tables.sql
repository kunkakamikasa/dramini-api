-- 创建用户表
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "avatar" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- 创建分类表
CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- 创建标题表
CREATE TABLE IF NOT EXISTS "Title" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mainTitle" TEXT,
    "subTitle" TEXT,
    "synopsis" TEXT,
    "coverImageId" TEXT,
    "coverUrl" TEXT,
    "posterUrl" TEXT,
    "bannerUrl" TEXT,
    "previewImage" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "releaseAt" TIMESTAMP(3),
    "rating" DOUBLE PRECISION,
    "featuredWeight" INTEGER NOT NULL DEFAULT 0,
    "freeUntilEpisode" INTEGER,
    "bundlePrice" INTEGER,
    "bundlePriceCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "bundlePriceCoins" INTEGER,
    "categoryId" TEXT,
    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- 创建剧集表
CREATE TABLE IF NOT EXISTS "Episode" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "episodeNum" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL,
    "duration" INTEGER,
    "thumbnail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "episodePrice" INTEGER,
    "priceCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "episodePriceCoins" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- 创建用户金币表
CREATE TABLE IF NOT EXISTS "UserCoin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserCoin_pkey" PRIMARY KEY ("id")
);

-- 创建充值套餐表
CREATE TABLE IF NOT EXISTS "PaymentPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceUsd" INTEGER NOT NULL,
    "baseCoins" INTEGER NOT NULL,
    "bonusCoins" INTEGER NOT NULL DEFAULT 0,
    "isFirstTime" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentPackage_pkey" PRIMARY KEY ("id")
);

-- 添加唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Category_slug_key" ON "Category"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Title_slug_key" ON "Title"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "UserCoin_userId_key" ON "UserCoin"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Episode_titleId_episodeNum_key" ON "Episode"("titleId", "episodeNum");

-- 添加外键约束
ALTER TABLE "Title" ADD CONSTRAINT "Title_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Title" ADD CONSTRAINT "Title_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Title" ADD CONSTRAINT "Title_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCoin" ADD CONSTRAINT "UserCoin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
