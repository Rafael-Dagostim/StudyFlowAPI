-- CreateTable
CREATE TABLE "generated_files" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_file_versions" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "editPrompt" TEXT,
    "baseVersion" INTEGER,
    "s3Key" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "contextUsed" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationTime" INTEGER NOT NULL,

    CONSTRAINT "generated_file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_files_projectId_idx" ON "generated_files"("projectId");

-- CreateIndex
CREATE INDEX "generated_files_professorId_idx" ON "generated_files"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_files_projectId_fileName_key" ON "generated_files"("projectId", "fileName");

-- CreateIndex
CREATE INDEX "generated_file_versions_fileId_idx" ON "generated_file_versions"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_file_versions_fileId_version_key" ON "generated_file_versions"("fileId", "version");

-- AddForeignKey
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "professors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_file_versions" ADD CONSTRAINT "generated_file_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "generated_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
