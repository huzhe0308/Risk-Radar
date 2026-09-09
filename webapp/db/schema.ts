import { pgTable, text, integer, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const syncRecords = pgTable("sync_records", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  recordId: text("record_id").notNull(),
  tableId: text("table_id"),
  action: text("action"),
  payloadHash: text("payload_hash"),
  rawPayload: jsonb("raw_payload"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processed: boolean("processed").default(false).notNull(),
  error: text("error"),
}, (t) => ({
  recordIdIdx: uniqueIndex("sync_records_record_id_idx").on(t.recordId),
}));

export const projects = pgTable("projects", {
  uuid: text("uuid").primaryKey(),
  viewId: text("view_id").notNull(),
  name: text("name").notNull(),
  tag: text("tag").default(""),
  detailRemark: text("detail_remark").default(""),
  bgColor: text("bg_color"),
  textColor: text("text_color"),
  rowHeight: integer("row_height"),
  showSeparatorAbove: boolean("show_separator_above"),
  feishuRecordId: text("feishu_record_id").unique(),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const milestones = pgTable("milestones", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.uuid, { onDelete: "cascade" }),
  iteration: text("iteration").default(""),
  releaseDate: text("release_date").default(""),
  remark: text("remark").default(""),
  detailRemark: text("detail_remark").default(""),
  color: text("color"),
  textColor: text("text_color"),
  shape: text("shape").default("diamond"),
  week: integer("week"),
  year: integer("year"),
  feishuRecordId: text("feishu_record_id").unique(),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
