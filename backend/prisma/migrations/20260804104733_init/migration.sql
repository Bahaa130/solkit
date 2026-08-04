/*
  Warnings:

  - You are about to alter the column `status` on the `payment` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(1))`.
  - A unique constraint covering the columns `[txHash]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `payment` ADD COLUMN `txHash` VARCHAR(191) NULL,
    MODIFY `status` ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE `reward` ADD COLUMN `sourceUserId` INTEGER NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `activationStatus` ENUM('inactive', 'pending', 'active') NOT NULL DEFAULT 'inactive',
    ADD COLUMN `balance` DECIMAL(18, 8) NOT NULL DEFAULT 0.00000000,
    ADD COLUMN `currentLevel` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `currentXp` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `name` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `wallet` MODIFY `chain` VARCHAR(191) NOT NULL DEFAULT 'solana';

-- CreateTable
CREATE TABLE `MiningSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `miningRate` DECIMAL(10, 6) NOT NULL DEFAULT 0.500000,
    `startedAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `status` ENUM('active', 'completed') NOT NULL DEFAULT 'active',
    `minedAmount` DECIMAL(18, 8) NOT NULL DEFAULT 0.00000000,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Withdrawal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `walletAddress` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 8) NOT NULL,
    `gasFee` DECIMAL(10, 8) NOT NULL,
    `txHash` VARCHAR(191) NULL,
    `status` ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Withdrawal_txHash_key`(`txHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `taskName` VARCHAR(191) NOT NULL,
    `socialUsername` VARCHAR(191) NULL,
    `isCompleted` BOOLEAN NOT NULL DEFAULT false,
    `rewardClaimed` DECIMAL(18, 8) NOT NULL,
    `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SocialTask_userId_taskName_key`(`userId`, `taskName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyBonus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `streakDay` INTEGER NOT NULL DEFAULT 1,
    `rewardAmount` DECIMAL(18, 8) NOT NULL,
    `claimedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Payment_txHash_key` ON `Payment`(`txHash`);

-- AddForeignKey
ALTER TABLE `MiningSession` ADD CONSTRAINT `MiningSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Withdrawal` ADD CONSTRAINT `Withdrawal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialTask` ADD CONSTRAINT `SocialTask_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyBonus` ADD CONSTRAINT `DailyBonus_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
