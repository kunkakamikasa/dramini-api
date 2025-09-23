-- 创建用户表
CREATE TABLE IF NOT EXISTS "users" (
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
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- 创建分类表
CREATE TABLE IF NOT EXISTS "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- 创建标题表
CREATE TABLE IF NOT EXISTS "titles" (
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
    CONSTRAINT "titles_pkey" PRIMARY KEY ("id")
);

-- 创建剧集表
CREATE TABLE IF NOT EXISTS "episodes" (
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
    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- 创建用户金币表
CREATE TABLE IF NOT EXISTS "user_coins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_coins_pkey" PRIMARY KEY ("id")
);

-- 创建充值套餐表
CREATE TABLE IF NOT EXISTS "payment_packages" (
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
    CONSTRAINT "payment_packages_pkey" PRIMARY KEY ("id")
);

-- 添加唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_key" ON "categories"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "titles_slug_key" ON "titles"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "user_coins_userId_key" ON "user_coins"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "episodes_titleId_episodeNum_key" ON "episodes"("titleId", "episodeNum");

-- 添加外键约束
ALTER TABLE "titles" ADD CONSTRAINT "titles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "titles" ADD CONSTRAINT "titles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "titles" ADD CONSTRAINT "titles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_coins" ADD CONSTRAINT "user_coins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
