/**
 * Tables de l'économie (`economy_*`, `market_*`, `exchange_*`), écrites par le plugin
 * EnderiumEconomy. Sens des colonnes : `enderium-core/docs/data/economy.md`.
 */
import type { Generated } from 'kysely';

export interface EconomyAccountsTable {
  uuid: string;
  name: string;
  balance: number;
  updated_at: number;
}

/**
 * Journal en ajout seul. `source` absent : l'argent est créé ; `target` absent : il est détruit ;
 * les deux présents : transfert (`AccountStore.log` écrit de vrais `NULL`, pas des chaînes vides).
 */
export interface EconomyLedgerTable {
  id: Generated<number>;
  at: number;
  kind: string;
  source: string | null;
  target: string | null;
  amount: number;
  reason: string | null;
}

export interface MarketListingsTable {
  id: Generated<number>;
  seller: string;
  seller_name: string;
  item: Uint8Array;
  item_id: string | null;
  category: string;
  amount: number;
  price: number;
  fee: number;
  created_at: number;
  expires_at: number;
  /** `active`, `sold`, `cancelled`, `expired`. */
  status: string;
  buyer: string | null;
  closed_at: number | null;
  net: number;
  /** Booléen : 0 ou 1. */
  seller_notified: number;
}

export interface MarketDeliveriesTable {
  id: Generated<number>;
  owner: string;
  item: Uint8Array;
  origin: string;
  listing_id: number | null;
  created_at: number;
  quantity: number;
}

export interface ExchangeOrdersTable {
  id: Generated<number>;
  owner: string;
  owner_name: string;
  kind: string;
  side: string;
  item_id: string;
  template: Uint8Array;
  max_stack: number;
  price: number;
  quantity: number;
  filled: number;
  escrow: number;
  fee: number;
  created_at: number;
  expires_at: number;
  status: string;
}

export interface ExchangeTradesTable {
  id: Generated<number>;
  item_id: string;
  buy_order: number;
  sell_order: number;
  buyer: string;
  seller: string;
  quantity: number;
  price: number;
  at: number;
}

export interface EconomyTables {
  economy_accounts: EconomyAccountsTable;
  economy_ledger: EconomyLedgerTable;
  market_listings: MarketListingsTable;
  market_deliveries: MarketDeliveriesTable;
  exchange_orders: ExchangeOrdersTable;
  exchange_trades: ExchangeTradesTable;
}
