import { pgTable, text, timestamp, uuid, numeric, integer, boolean } from "drizzle-orm/pg-core";

export const contas = pgTable("contas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senha: text("senha").notNull(),
  tipo: text("tipo").notNull(), // motorista, passageiro, admin
  createdAt: timestamp("created_at").defaultNow(),
});

export const corridas = pgTable("corridas", {
  id: uuid("id").primaryKey().defaultRandom(),
  passageiroId: uuid("passageiro_id").references(() => contas.id),
  motoristaId: uuid("motorista_id").references(() => contas.id),
  origem: text("origem").notNull(),
  destino: text("destino").notNull(),
  status: text("status").notNull().default("pendente"),
  valor: numeric("valor"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tarifas = pgTable("tarifas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  valorKm: numeric("valor_km").notNull(),
  valorBase: numeric("valor_base").notNull(),
  ativa: boolean("ativa").default(true),
});

export const sessoes = pgTable("sessoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  contaId: uuid("conta_id").references(() => contas.id),
  token: text("token").notNull(),
  expiraEm: timestamp("expira_em").notNull(),
});

export const mensagens = pgTable("mensagens", {
  id: uuid("id").primaryKey().defaultRandom(),
  corridaId: uuid("corrida_id").references(() => corridas.id),
  remetenteId: uuid("remetente_id").references(() => contas.id),
  texto: text("texto").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
