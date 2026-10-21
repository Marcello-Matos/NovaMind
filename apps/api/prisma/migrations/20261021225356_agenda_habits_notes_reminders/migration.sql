-- CreateEnum
CREATE TYPE "CalendarEventSource" AS ENUM ('APP', 'AGENT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "ReminderRepeat" AS ENUM ('NONE', 'DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "source" "CalendarEventSource" NOT NULL DEFAULT 'APP',
    "google_event_id" TEXT,
    "google_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "days_of_week" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_logs" (
    "id" TEXT NOT NULL,
    "habit_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "repeat_rule" "ReminderRepeat" NOT NULL DEFAULT 'NONE',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "task_id" TEXT,
    "event_id" TEXT,
    "local_notified" BOOLEAN NOT NULL DEFAULT false,
    "fired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_email" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "sync_token" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_direction" TEXT,

    CONSTRAINT "google_calendar_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_events_owner_id_starts_at_idx" ON "calendar_events"("owner_id", "starts_at");

-- CreateIndex
CREATE INDEX "calendar_events_organization_id_starts_at_idx" ON "calendar_events"("organization_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_owner_id_google_event_id_key" ON "calendar_events"("owner_id", "google_event_id");

-- CreateIndex
CREATE INDEX "habits_owner_id_active_idx" ON "habits"("owner_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "habit_logs_habit_id_date_key" ON "habit_logs"("habit_id", "date");

-- CreateIndex
CREATE INDEX "notes_owner_id_updated_at_idx" ON "notes"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "notes_organization_id_updated_at_idx" ON "notes"("organization_id", "updated_at");

-- CreateIndex
CREATE INDEX "reminders_owner_id_remind_at_idx" ON "reminders"("owner_id", "remind_at");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_accounts_user_id_key" ON "google_calendar_accounts"("user_id");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_accounts" ADD CONSTRAINT "google_calendar_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
