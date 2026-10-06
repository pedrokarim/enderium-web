/** Tables des grandes commandes (`orders_*`). Sens des colonnes : `enderium-core/docs/data/orders.md`. */

export interface OrdersServerWeeksTable {
  week: number;
  item: string;
  goal: number;
  pot: number;
  delivered: number;
  /** 0 tant que la semaine n'est pas partagée. */
  settled_at: number;
}

export interface OrdersServerContributionsTable {
  week: number;
  player_uuid: string;
  player_name: string;
  amount: number;
  first_at: number;
  reward: number;
  paid_at: number;
}

export interface OrdersTables {
  orders_server_weeks: OrdersServerWeeksTable;
  orders_server_contributions: OrdersServerContributionsTable;
}
