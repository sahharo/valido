import { sql } from 'drizzle-orm'
import {
  boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, serial, text,
  timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { DEFAULT_SETTINGS, ROLES, WITHDRAWAL_REASONS, type CompanySettings } from '../../../shared/domain.ts'

export const roleEnum = pgEnum('role', ROLES)
export const lotStatusEnum = pgEnum('lot_status', ['active', 'withdrawn', 'archived'])
export const movementTypeEnum = pgEnum('movement_type', ['entry', 'withdrawal', 'archive'])
export const withdrawalReasonEnum = pgEnum('withdrawal_reason', WITHDRAWAL_REASONS)
export const dataSourceEnum = pgEnum('data_source', ['manual', 'external_api', 'ocr'])

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' })
const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'number' })

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  settings: jsonb('settings').$type<CompanySettings>().notNull().default(DEFAULT_SETTINGS),
  createdAt: createdAt(),
})

export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  name: text('name').notNull(),
  cnpj: text('cnpj'),
  city: text('city'),
  uf: text('uf'),
  address: text('address'),
  // Street number, kept apart from the street so it is always filled in.
  addressNumber: text('address_number'),
  // Postal code (CEP), optional; used to fill the address automatically.
  cep: text('cep'),
  createdAt: createdAt(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (t) => [index('stores_company_idx').on(t.companyId)])

// Login identifiers are unique across the whole platform, since login does not ask for the company.
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().unique(),
  // Login is by e-mail only, so CPF/CNPJ is optional (kept for older accounts and as team info).
  document: text('document').unique(),
  documentType: text('document_type', { enum: ['cpf', 'cnpj'] }),
  jobTitle: text('job_title').notNull(),
  role: roleEnum('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
}, (t) => [index('users_company_idx').on(t.companyId)])

// Stores a non-admin user may access. Admins implicitly access every store of their company.
export const userStores = pgTable('user_stores', {
  userId: integer('user_id').notNull().references(() => users.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
}, (t) => [primaryKey({ columns: [t.userId, t.storeId] })])

// Only the SHA-256 of the session token is stored, so a database leak does not leak live sessions.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
}, (t) => [index('sessions_user_idx').on(t.userId)])

// One-time "esqueci a senha" links. Only the SHA-256 of the token is stored; links expire and are single use.
export const passwordResets = pgTable('password_resets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('password_resets_user_idx').on(t.userId)])

// Product catalog of a company. A product is shared by all its stores; lots carry store, quantity and expiry.
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  barcode: text('barcode').notNull(),
  name: text('name').notNull(),
  brand: text('brand'),
  category: text('category').notNull(),
  unit: text('unit').notNull().default('un'),
  imageUrl: text('image_url'),
  costPrice: money('cost_price'),
  source: dataSourceEnum('source').notNull().default('manual'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('products_company_barcode_uq').on(t.companyId, t.barcode),
  index('products_company_name_idx').on(t.companyId, t.name),
])

// A goods receipt groups the lots that arrived together ("Nova entrada").
export const goodsReceipts = pgTable('goods_receipts', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
  invoiceNumber: text('invoice_number'),
  supplier: text('supplier'),
  notes: text('notes'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('receipts_company_idx').on(t.companyId, t.createdAt)])

export const lots = pgTable('lots', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  productId: integer('product_id').notNull().references(() => products.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
  receiptId: integer('receipt_id').references(() => goodsReceipts.id),
  lotNumber: text('lot_number'),
  initialQuantity: qty('initial_quantity').notNull(),
  quantity: qty('quantity').notNull(),
  expiryDate: date('expiry_date').notNull(),
  unitCost: money('unit_cost'),
  notes: text('notes'),
  status: lotStatusEnum('status').notNull().default('active'),
  source: dataSourceEnum('source').notNull().default('manual'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  withdrawnBy: integer('withdrawn_by').references(() => users.id),
  withdrawalReason: withdrawalReasonEnum('withdrawal_reason'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedBy: integer('archived_by').references(() => users.id),
  // Set while the lot is marked down to sell before expiring; cleared when the promotion ends.
  promoSince: timestamp('promo_since', { withTimezone: true }),
  promoDiscount: integer('promo_discount'),
}, (t) => [
  index('lots_active_expiry_idx').on(t.companyId, t.status, t.expiryDate),
  index('lots_product_idx').on(t.productId),
  index('lots_store_idx').on(t.storeId),
])

// Append-only history of every quantity change of a lot. Rows are never updated or deleted.
export const lotMovements = pgTable('lot_movements', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  lotId: integer('lot_id').notNull().references(() => lots.id),
  productId: integer('product_id').notNull().references(() => products.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
  type: movementTypeEnum('type').notNull(),
  quantity: qty('quantity').notNull(),
  reason: withdrawalReasonEnum('reason'),
  unitCost: money('unit_cost'),
  totalCost: money('total_cost'),
  notes: text('notes'),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index('movements_company_date_idx').on(t.companyId, t.createdAt),
  index('movements_lot_idx').on(t.lotId),
])

// In-app notifications. storeId null = company-wide. dedupeKey prevents the same alert being created twice.
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  storeId: integer('store_id').references(() => stores.id),
  type: text('type').notNull(),
  severity: text('severity', { enum: ['critical', 'warning', 'info'] }).notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  createdAt: createdAt(),
}, (t) => [index('notifications_company_idx').on(t.companyId, t.createdAt)])

export const notificationReads = pgTable('notification_reads', {
  notificationId: integer('notification_id').notNull().references(() => notifications.id),
  userId: integer('user_id').notNull().references(() => users.id),
  readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.notificationId, t.userId] })])

// Delivery log per channel (in_app today; push, email and whatsapp later).
export const notificationDeliveries = pgTable('notification_deliveries', {
  id: serial('id').primaryKey(),
  notificationId: integer('notification_id').notNull().references(() => notifications.id),
  channel: text('channel', { enum: ['in_app', 'push', 'email', 'whatsapp'] }).notNull(),
  status: text('status', { enum: ['pending', 'sent', 'failed'] }).notNull().default('pending'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
})

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  data: jsonb('data'),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('audit_company_idx').on(t.companyId, t.createdAt)])

// Cache of external product lookups (shared by all companies; contains only public catalog data).
export const externalProductCache = pgTable('external_product_cache', {
  barcode: text('barcode').primaryKey(),
  found: boolean('found').notNull(),
  data: jsonb('data'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().default(sql`now()`),
})
