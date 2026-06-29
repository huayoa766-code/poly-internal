-- AlterTable
ALTER TABLE "Bookmark" ADD COLUMN     "eventSlug" TEXT,
ADD COLUMN     "eventTitle" TEXT,
ADD COLUMN     "pmTags" TEXT,
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "seriesRecurrence" TEXT,
ADD COLUMN     "seriesTitle" TEXT;

-- CreateIndex
CREATE INDEX "Bookmark_seriesId_idx" ON "Bookmark"("seriesId");
