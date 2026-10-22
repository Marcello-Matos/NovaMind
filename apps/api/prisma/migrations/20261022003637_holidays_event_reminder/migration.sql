-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "is_holiday" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "event_reminder_minutes" INTEGER;
