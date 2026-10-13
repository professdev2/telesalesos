-- Treat null Collected / Our cost as 0 for profit & margin (Jake: profit = collected - our_cost).

ALTER TABLE public.orders
  DROP COLUMN gross_profit,
  DROP COLUMN gross_margin_pct;

ALTER TABLE public.orders
  ADD COLUMN gross_profit numeric(14, 2)
    GENERATED ALWAYS AS (coalesce(collected, 0) - coalesce(our_cost, 0)) STORED,
  ADD COLUMN gross_margin_pct numeric(8, 2)
    GENERATED ALWAYS AS (
      CASE
        WHEN coalesce(collected, 0) = 0 THEN NULL
        ELSE round(
          ((coalesce(collected, 0) - coalesce(our_cost, 0))
            / coalesce(collected, 0)) * 100,
          2
        )
      END
    ) STORED;

COMMENT ON COLUMN public.orders.gross_profit IS
  'Collected − Our cost; null money fields treated as 0.';
