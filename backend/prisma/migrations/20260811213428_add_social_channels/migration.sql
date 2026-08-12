-- AlterTable
ALTER TABLE `socialtask` ADD COLUMN `channelId` INTEGER NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE `SocialChannel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL DEFAULT 'telegram',
    `link` VARCHAR(191) NOT NULL,
    `reward` DECIMAL(18, 8) NOT NULL DEFAULT 10.00000000,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SocialTask` ADD CONSTRAINT `SocialTask_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `SocialChannel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
