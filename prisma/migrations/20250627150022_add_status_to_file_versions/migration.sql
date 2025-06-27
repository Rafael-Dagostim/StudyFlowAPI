-- AlterTable
ALTER TABLE "generated_file_versions" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';
