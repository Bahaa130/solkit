-- CreateTable
CREATE TABLE `GameProgress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `gameLevel` INTEGER NOT NULL DEFAULT 1,
    `gameXp` INTEGER NOT NULL DEFAULT 0,
    `xpForNext` INTEGER NOT NULL DEFAULT 100,
    `totalEarned` DECIMAL(18, 8) NOT NULL DEFAULT 0.00000000,
    `playsCount` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GameProgress_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GamePlayRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `game` ENUM('wheel', 'tap', 'catch') NOT NULL,
    `score` INTEGER NOT NULL DEFAULT 0,
    `baseReward` DECIMAL(18, 8) NOT NULL,
    `multiplier` DECIMAL(6, 4) NOT NULL,
    `reward` DECIMAL(18, 8) NOT NULL,
    `xpGained` INTEGER NOT NULL DEFAULT 0,
    `leveledUp` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `gameProgressId` INTEGER NULL,

    INDEX `GamePlayRecord_userId_game_createdAt_idx`(`userId`, `game`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GameProgress` ADD CONSTRAINT `GameProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GamePlayRecord` ADD CONSTRAINT `GamePlayRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GamePlayRecord` ADD CONSTRAINT `GamePlayRecord_gameProgressId_fkey` FOREIGN KEY (`gameProgressId`) REFERENCES `GameProgress`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
