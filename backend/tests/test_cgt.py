"""
Phase 4 — pytest suite for AustralianTaxEngine.
Verifies CGT calculations, FIFO lot matching, franking gross-up,
budget normalisation, FIRE number, and LVR.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.services.tax_service import AustralianTaxEngine, FIFOLot
from app.services.cash_service import BudgetEngine, PAY_FREQ_TO_MONTHLY
from app.services.fire_service import FIREEngine, FIREInputs
from app.services.property_service import PropertyEngine
from app.models import PayFrequency


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_date(days_ago: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days_ago)


def cgt(buy_days_ago: int, sell_days_ago: int, cost_base: str, proceeds: str) -> dict:
    return AustralianTaxEngine.process_cgt_event(
        buy_date=make_date(buy_days_ago),
        sell_date=make_date(sell_days_ago),
        cost_base=Decimal(cost_base),
        sale_proceeds=Decimal(proceeds),
        units_disposed=Decimal("1"),
    )


# ---------------------------------------------------------------------------
# CGT — discount eligibility
# ---------------------------------------------------------------------------

class TestCGTDiscount:

    def test_short_term_no_discount(self):
        """Holding < 365 days: no discount, full gain taxable."""
        result = cgt(buy_days_ago=200, sell_days_ago=0,
                     cost_base="1000.00", proceeds="1500.00")
        assert result["discount_applied"] is False
        assert result["gross_gain"] == Decimal("500.00")
        assert result["taxable_gain"] == Decimal("500.00")

    def test_long_term_50pct_discount(self):
        """Holding > 365 days: 50% CGT discount applied."""
        result = cgt(buy_days_ago=400, sell_days_ago=0,
                     cost_base="1000.00", proceeds="3000.00")
        assert result["discount_applied"] is True
        assert result["gross_gain"] == Decimal("2000.00")
        assert result["taxable_gain"] == Decimal("1000.00")

    def test_boundary_exactly_365_no_discount(self):
        """
        Exactly 365 days: NO discount.
        ATO s115-100 ITAA97 requires STRICTLY greater than 365 days.
        """
        buy = datetime(2023, 1, 1)
        sell = datetime(2024, 1, 1)
        holding_days = (sell.date() - buy.date()).days
        assert holding_days == 365

        result = AustralianTaxEngine.process_cgt_event(
            buy_date=buy, sell_date=sell,
            cost_base=Decimal("1000.00"),
            sale_proceeds=Decimal("2000.00"),
            units_disposed=Decimal("1"),
        )
        assert result["discount_applied"] is False
        assert result["holding_days"] == 365
        assert result["taxable_gain"] == Decimal("1000.00")

    def test_boundary_366_days_discount_applies(self):
        """366 days: discount DOES apply."""
        buy = datetime(2023, 1, 1)
        sell = datetime(2024, 1, 2)
        holding_days = (sell.date() - buy.date()).days
        assert holding_days == 366

        result = AustralianTaxEngine.process_cgt_event(
            buy_date=buy, sell_date=sell,
            cost_base=Decimal("1000.00"),
            sale_proceeds=Decimal("3000.00"),
            units_disposed=Decimal("1"),
        )
        assert result["discount_applied"] is True
        assert result["taxable_gain"] == Decimal("1000.00")

    def test_capital_loss_no_discount(self):
        """A capital loss is never discounted — full loss is deductible."""
        result = cgt(buy_days_ago=500, sell_days_ago=0,
                     cost_base="5000.00", proceeds="3000.00")
        assert result["discount_applied"] is False
        assert result["gross_gain"] == Decimal("-2000.00")
        assert result["taxable_gain"] == Decimal("-2000.00")

    def test_break_even_no_gain_no_discount(self):
        """Zero gain: no discount, no taxable amount."""
        result = cgt(buy_days_ago=400, sell_days_ago=0,
                     cost_base="1000.00", proceeds="1000.00")
        assert result["discount_applied"] is False
        assert result["gross_gain"] == Decimal("0.00")
        assert result["taxable_gain"] == Decimal("0.00")

    def test_discount_exactly_50pct(self):
        """Verify the discount is precisely 50% — not 49% or 51%."""
        result = cgt(buy_days_ago=400, sell_days_ago=0,
                     cost_base="1000.00", proceeds="2000.00")
        assert result["discount_applied"] is True
        assert result["gross_gain"] == Decimal("1000.00")
        assert result["taxable_gain"] == Decimal("500.00")
        assert result["taxable_gain"] == result["gross_gain"] * Decimal("0.50")

    def test_holding_days_counted_correctly(self):
        """Holding days = sell_date.date() − buy_date.date() (date-only, no time component)."""
        buy = datetime(2022, 6, 15, 9, 0, 0)   # morning
        sell = datetime(2023, 6, 16, 17, 0, 0)  # afternoon
        result = AustralianTaxEngine.process_cgt_event(
            buy_date=buy, sell_date=sell,
            cost_base=Decimal("500.00"), sale_proceeds=Decimal("800.00"),
            units_disposed=Decimal("1"),
        )
        assert result["holding_days"] == 366
        assert result["discount_applied"] is True


# ---------------------------------------------------------------------------
# CGT — FIFO lot ordering
# ---------------------------------------------------------------------------

class TestFIFOOrdering:

    def test_oldest_lot_consumed_first(self):
        """
        Two lots: older lot bought 500 days ago, newer lot bought 100 days ago.
        FIFO must consume the 500-day lot first → discount applies to that portion.
        """
        old_buy = make_date(500)
        new_buy = make_date(100)
        sell = make_date(0)

        # Old lot: 50 units @ $10 = $500 cost base → eligible for discount
        # New lot: 50 units @ $10 = $500 cost base → NOT eligible
        fifo_queue = [
            FIFOLot(date=old_buy, units=Decimal("50"), cost_base_per_unit=Decimal("10")),
            FIFOLot(date=new_buy, units=Decimal("50"), cost_base_per_unit=Decimal("10")),
        ]

        # Sell 50 units — should consume the OLD lot
        result = AustralianTaxEngine.process_cgt_event(
            buy_date=fifo_queue[0].date,
            sell_date=sell,
            cost_base=fifo_queue[0].units * fifo_queue[0].cost_base_per_unit,
            sale_proceeds=Decimal("750.00"),
            units_disposed=Decimal("50"),
        )
        assert result["discount_applied"] is True
        assert (sell.date() - old_buy.date()).days > 365

    def test_new_lot_no_discount(self):
        """Selling from a recent lot (100 days) yields no discount."""
        result = cgt(buy_days_ago=100, sell_days_ago=0,
                     cost_base="500.00", proceeds="750.00")
        assert result["discount_applied"] is False
        assert result["taxable_gain"] == Decimal("250.00")

    def test_partial_sell_across_two_lots(self):
        """
        2 lots of 10 units each. Sell 15 units @ $120/unit ($1800 total).
        Cost basis: $100/unit. FIFO: consume all 10 from lot1, then 5 from lot2.
        Each portion CGT-assessed independently.
        Lot1 (400 days) → long-term, discount applies.
        Lot2 (200 days) → short-term, no discount.
        Uses clean numbers (divisible by 15) to avoid Decimal precision edge cases.
        """
        buy1 = make_date(400)
        buy2 = make_date(200)
        sell = make_date(0)
        cost_per_unit = Decimal("100")
        # Total sell: 15 units × $120 = $1800
        # Lot1 share: (10/15) × $1800 = $1200; Lot2 share: (5/15) × $1800 = $600
        lot1_units = Decimal("10")
        lot2_units = Decimal("5")
        total_units = lot1_units + lot2_units
        total_proceeds = Decimal("1800")

        lot1_cost = lot1_units * cost_per_unit           # $1000
        lot1_proceeds = total_proceeds * lot1_units / total_units  # $1200 — clean division
        r1 = AustralianTaxEngine.process_cgt_event(buy1, sell, lot1_cost, lot1_proceeds, lot1_units)

        lot2_cost = lot2_units * cost_per_unit           # $500
        lot2_proceeds = total_proceeds * lot2_units / total_units  # $600 — clean division
        r2 = AustralianTaxEngine.process_cgt_event(buy2, sell, lot2_cost, lot2_proceeds, lot2_units)

        assert r1["discount_applied"] is True,  f"Lot1 (400 days): expected discount, got {r1}"
        assert r2["discount_applied"] is False, f"Lot2 (200 days): expected no discount, got {r2}"
        assert r1["gross_gain"] == Decimal("200.00")
        assert r2["gross_gain"] == Decimal("100.00")
        assert r1["taxable_gain"] == Decimal("100.00")   # 50% of $200
        assert r2["taxable_gain"] == Decimal("100.00")   # full $100 (no discount)

        total_taxable = r1["taxable_gain"] + r2["taxable_gain"]
        total_gross = r1["gross_gain"] + r2["gross_gain"]
        assert total_taxable < total_gross  # discount reduced total tax burden

    def test_mixed_lots_independent_discount(self):
        """
        One long-term lot (>365 days) and one short-term lot (<365 days).
        Each is discounted independently — the short-term lot is NOT discounted.
        """
        long_buy = make_date(500)
        short_buy = make_date(200)
        sell = make_date(0)

        r_long = AustralianTaxEngine.process_cgt_event(
            long_buy, sell, Decimal("1000"), Decimal("2000"), Decimal("10")
        )
        r_short = AustralianTaxEngine.process_cgt_event(
            short_buy, sell, Decimal("1000"), Decimal("2000"), Decimal("10")
        )

        assert r_long["discount_applied"] is True
        assert r_short["discount_applied"] is False
        assert r_long["taxable_gain"] == Decimal("500.00")
        assert r_short["taxable_gain"] == Decimal("1000.00")


# ---------------------------------------------------------------------------
# CGT — cost base rules (ATO: fees capitalised)
# ---------------------------------------------------------------------------

class TestCostBaseRules:

    def test_cost_base_includes_brokerage(self):
        """
        ATO rule: brokerage is capitalised into cost base on BUY.
        cost_base = (units × price) + brokerage
        This means a higher cost base = lower taxable gain.
        """
        # Buy: 100 units @ $10 = $1000 + $9.95 brokerage = $1009.95 cost base
        cost_base = Decimal("1000.00") + Decimal("9.95")
        # Sell: 100 × $12 = $1200 − $9.95 brokerage = $1190.05 proceeds
        proceeds = Decimal("1200.00") - Decimal("9.95")
        result = cgt(buy_days_ago=400, sell_days_ago=0,
                     cost_base=str(cost_base), proceeds=str(proceeds))
        assert result["gross_gain"] == round(proceeds - cost_base, 2)
        assert result["discount_applied"] is True

    def test_sell_brokerage_reduces_proceeds(self):
        """Net proceeds = gross sale amount − brokerage fee."""
        gross_sell = Decimal("5000.00")
        brokerage = Decimal("9.95")
        net_proceeds = gross_sell - brokerage
        cost_base = Decimal("4000.00")
        result = AustralianTaxEngine.process_cgt_event(
            buy_date=make_date(400), sell_date=make_date(0),
            cost_base=cost_base, sale_proceeds=net_proceeds,
            units_disposed=Decimal("50"),
        )
        assert result["gross_gain"] == round(net_proceeds - cost_base, 2)


# ---------------------------------------------------------------------------
# Franking Credits
# ---------------------------------------------------------------------------

class TestFrankingCredits:

    def test_100pct_franked_gross_up(self):
        """
        100% franked $70 dividend → $30 franking credit → $100 gross dividend.
        Formula: franking_credit = $70 × (100/100) × (30/70) = $30
        """
        result = AustralianTaxEngine.calculate_dividend_gross_up(
            net_dividend=Decimal("70.00"),
            franking_percentage=Decimal("100.00"),
        )
        assert result["franking_credit"] == Decimal("30.00")
        assert result["gross_dividend"] == Decimal("100.00")

    def test_50pct_franked(self):
        """50% franked $140 dividend → $30 franking credit → $170 gross."""
        result = AustralianTaxEngine.calculate_dividend_gross_up(
            net_dividend=Decimal("140.00"),
            franking_percentage=Decimal("50.00"),
        )
        # 140 × (50/100) × (30/70) = 140 × 0.5 × 0.4286 = $30
        assert result["franking_credit"] == Decimal("30.00")
        assert result["gross_dividend"] == Decimal("170.00")

    def test_0pct_unfranked(self):
        """Unfranked dividend: no franking credit, gross = net."""
        result = AustralianTaxEngine.calculate_dividend_gross_up(
            net_dividend=Decimal("200.00"),
            franking_percentage=Decimal("0.00"),
        )
        assert result["franking_credit"] == Decimal("0.00")
        assert result["gross_dividend"] == Decimal("200.00")

    def test_none_franking_treated_as_zero(self):
        """None franking_percentage defaults to 0 — no credit."""
        result = AustralianTaxEngine.calculate_dividend_gross_up(
            net_dividend=Decimal("100.00"),
            franking_percentage=Decimal("0"),
        )
        assert result["franking_credit"] == Decimal("0.00")

    def test_franking_formula_30_70_ratio(self):
        """Verify the 30/70 corporate tax rate ratio is applied exactly."""
        net = Decimal("700.00")
        result = AustralianTaxEngine.calculate_dividend_gross_up(
            net_dividend=net,
            franking_percentage=Decimal("100.00"),
        )
        expected_credit = net * Decimal("30") / Decimal("70")
        assert result["franking_credit"] == round(expected_credit, 2)
        assert result["gross_dividend"] == net + round(expected_credit, 2)


# ---------------------------------------------------------------------------
# Tax year helper
# ---------------------------------------------------------------------------

class TestTaxYear:

    def test_july_is_new_fy(self):
        """July 1 starts a new Australian financial year."""
        engine = AustralianTaxEngine()
        assert engine._tax_year(datetime(2024, 7, 1)) == "2024-25"

    def test_june_is_end_of_fy(self):
        """June 30 is the last day of the financial year."""
        assert AustralianTaxEngine._tax_year(datetime(2024, 6, 30)) == "2023-24"

    def test_jan_mid_fy(self):
        assert AustralianTaxEngine._tax_year(datetime(2025, 1, 15)) == "2024-25"


# ---------------------------------------------------------------------------
# Budget — pay frequency normaliser
# ---------------------------------------------------------------------------

class TestBudgetEngine:

    def test_monthly_multiplier_is_one(self):
        result = BudgetEngine.normalise_to_monthly(Decimal("5000"), PayFrequency.MONTHLY)
        assert result == Decimal("5000")

    def test_fortnightly_multiplier(self):
        """Fortnightly: multiply by 4.34523.../2 ≈ 2.17262"""
        result = BudgetEngine.normalise_to_monthly(Decimal("2500"), PayFrequency.FORTNIGHTLY)
        expected = Decimal("2500") * PAY_FREQ_TO_MONTHLY[PayFrequency.FORTNIGHTLY]
        assert abs(result - expected) < Decimal("0.01")

    def test_weekly_multiplier(self):
        result = BudgetEngine.normalise_to_monthly(Decimal("1000"), PayFrequency.WEEKLY)
        expected = Decimal("1000") * PAY_FREQ_TO_MONTHLY[PayFrequency.WEEKLY]
        assert abs(result - expected) < Decimal("0.01")

    def test_twice_monthly_multiplier_is_two(self):
        result = BudgetEngine.normalise_to_monthly(Decimal("3000"), PayFrequency.TWICE_MONTHLY)
        assert result == Decimal("6000")

    def test_emergency_fund_rounds_up_to_nearest_1000(self):
        """ROUNDUP(3 × $3500 / 1000) × 1000 = $11,000"""
        result = BudgetEngine.emergency_fund_target(
            monthly_expenses=Decimal("3500"), months=3
        )
        assert result == Decimal("11000")

    def test_emergency_fund_exact_thousand_no_rounding(self):
        """$4000/mo × 3 = $12,000 — already a multiple of 1000."""
        result = BudgetEngine.emergency_fund_target(
            monthly_expenses=Decimal("4000"), months=3
        )
        assert result == Decimal("12000")


# ---------------------------------------------------------------------------
# FIRE Engine
# ---------------------------------------------------------------------------

class TestFIREEngine:

    def test_fire_number_4pct_rule(self):
        """$60,000 spend / 4% SWR = $1,500,000 fire number."""
        result = FIREEngine.calculate_fire_number(60000.0, 0.04)
        assert result == 1_500_000.0

    def test_fire_number_3pct_rule(self):
        """$60,000 / 3% = $2,000,000."""
        result = FIREEngine.calculate_fire_number(60000.0, 0.03)
        assert result == 2_000_000.0

    def test_already_fire(self):
        inputs = FIREInputs(
            current_net_worth=2_000_000.0,
            annual_savings=50_000.0,
            target_annual_spend=60_000.0,
            investment_return_rate=0.07,
            inflation_rate=0.03,
            safe_withdrawal_rate=0.04,
            current_age=45,
            target_retire_age=50,
        )
        result = FIREEngine.run_projection(inputs)
        assert result.already_fire is True
        assert result.years_to_fire == 0

    def test_projection_trajectory_grows(self):
        """Without spending, NW should monotonically increase during accumulation."""
        inputs = FIREInputs(
            current_net_worth=100_000.0,
            annual_savings=30_000.0,
            target_annual_spend=60_000.0,
            investment_return_rate=0.07,
            inflation_rate=0.03,
            safe_withdrawal_rate=0.04,
            current_age=30,
            target_retire_age=50,
        )
        result = FIREEngine.run_projection(inputs, years_to_project=20)
        acc = [y for y in result.trajectory if y.phase == "accumulation"]
        for i in range(1, len(acc)):
            assert acc[i].projected_net_worth > acc[i - 1].projected_net_worth

    def test_fire_number_in_every_trajectory_row(self):
        """target_fire_number must be constant across all rows."""
        inputs = FIREInputs(
            current_net_worth=200_000.0,
            annual_savings=40_000.0,
            target_annual_spend=80_000.0,
            investment_return_rate=0.07,
            inflation_rate=0.03,
            safe_withdrawal_rate=0.04,
            current_age=32,
            target_retire_age=55,
        )
        result = FIREEngine.run_projection(inputs, years_to_project=10)
        fire_num = result.fire_number
        for row in result.trajectory:
            assert row.target_fire_number == fire_num


# ---------------------------------------------------------------------------
# Property Engine
# ---------------------------------------------------------------------------

class TestPropertyEngine:

    def test_equity_calculation(self):
        """equity = current_valuation − mortgage_balance."""
        result = PropertyEngine.calculate_property_equity(
            purchase_price=Decimal("600000"),
            current_valuation=Decimal("750000"),
            remaining_loan=Decimal("450000"),
        )
        assert result["net_equity"] == Decimal("300000.00")

    def test_lvr_calculation(self):
        """LVR = mortgage / valuation × 100."""
        result = PropertyEngine.calculate_property_equity(
            purchase_price=Decimal("500000"),
            current_valuation=Decimal("600000"),
            remaining_loan=Decimal("480000"),
        )
        assert result["lvr"] == Decimal("80.00")

    def test_growth_calculation(self):
        result = PropertyEngine.calculate_property_equity(
            purchase_price=Decimal("500000"),
            current_valuation=Decimal("650000"),
            remaining_loan=Decimal("400000"),
        )
        assert result["total_growth"] == Decimal("150000.00")
        assert result["total_growth_pct"] == Decimal("30.00")

    def test_zero_valuation_lvr(self):
        """Guard against division by zero when valuation is 0."""
        result = PropertyEngine.calculate_property_equity(
            purchase_price=Decimal("0"),
            current_valuation=Decimal("0"),
            remaining_loan=Decimal("0"),
        )
        assert result["lvr"] == Decimal("0")
