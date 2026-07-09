-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'member');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "user_role" NOT NULL DEFAULT 'member';
