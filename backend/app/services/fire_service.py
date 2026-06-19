from __future__ import annotations
"""
Module 7 â€” FIRE Forecasting Engine
Implements the two-phase FI/RE projection:
  Phase 1 â€” Accumulation: FV compounding toward the fire number
  Phase 2 â€” Drawdown: PMT from portfolio over life expectancy horizon

Mirrors the FIRE ðŸ”¥ tab PMT/NPER/FV/PV formulas exactly.
"""
import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional


@dataclass
class FIREInputs:
    current_net_worth: float
    annual_savings: float
    target_annual_spend: float
    investment_return_rate: float  # nominal e.g. 0.07
    inflation_rate: float          # e.g. 0.03
    safe_withdrawal_rate: float    # e.g. 0.04
    current_age: int
    target_retire_age: int
    life_expectancy: int = 90


@dataclass
class YearProjection:
    year: int
    calendar_year: int
    age: int
    phase: str                  # "accumulation" | "drawdown"
    projected_net_worth: float
    annual_contribution: float
    interest_earned: float
    target_fire_number: float
    fire_achieved: bool
    annual_drawdown: Optional[float] = None


@dataclass
class FIREResult:
    fire_number: float
    years_to_fire: Optional[int]
    fire_date_year: Optional[int]
    current_shortfall: float
    trajectory: list[YearProjection]
    already_fire: bool


class FIREEngine:

    @staticmethod
    def _effective_rate(return_rate: float, inflation_rate: float) -> float:
        """Real return rate = nominal - inflation (spreadsheet simplification)."""
        return return_rate - inflation_rate

    @staticmethod
    def calculate_fire_number(
        target_annual_spend: float,
        safe_withdrawal_rate: float,
    ) -> float:
        """
        The 'target nut' = annual_spend / SWR
        Default SWR = 4% â†’ 25Ã— annual spend rule.
        """
        if safe_withdrawal_rate <= 0:
            raise ValueError("Safe withdrawal rate must be > 0")
        return target_annual_spend / safe_withdrawal_rate

    @staticmethod
    def years_to_fire(
        current_nw: float,
        fire_number: float,
        annual_savings: float,
        effective_rate: float,
    ) -> Optional[int]:
        """
        NPER equivalent: how many years to grow current_nw to fire_number
        with annual_savings contributions.
        Returns None if already FIRE.
        """
        if current_nw >= fire_number:
            return 0
        if effective_rate == 0:
            if annual_savings <= 0:
                return None
            return math.ceil((fire_number - current_nw) / annual_savings)
        try:
            # NPER(rate, pmt, pv, fv) â€” solve for n
            # fv = pv*(1+r)^n + pmt*((1+r)^n - 1)/r
            # Rearranging: (1+r)^n = (fv + pmt/r) / (pv + pmt/r)
            r = effective_rate
            ratio = (fire_number + annual_savings / r) / (current_nw + annual_savings / r)
            if ratio <= 0:
                return None
            n = math.log(ratio) / math.log(1 + r)
            return max(0, math.ceil(n))
        except (ValueError, ZeroDivisionError):
            return None

    @staticmethod
    def run_projection(inputs: FIREInputs, years_to_project: int = 50) -> FIREResult:
        """
        Generates year-by-year trajectory combining accumulation and drawdown phases.
        Mirrors the FIRE tab G/H/I/J/K/L/M/N/P/Q/R/S/T column logic.
        """
        from datetime import datetime

        eff_rate = FIREEngine._effective_rate(
            inputs.investment_return_rate, inputs.inflation_rate
        )
        fire_number = FIREEngine.calculate_fire_number(
            inputs.target_annual_spend, inputs.safe_withdrawal_rate
        )
        ytf = FIREEngine.years_to_fire(
            inputs.current_net_worth, fire_number, inputs.annual_savings, eff_rate
        )

        current_year = datetime.utcnow().year
        already_fire = inputs.current_net_worth >= fire_number

        trajectory: list[YearProjection] = []
        nw = inputs.current_net_worth

        for i in range(1, years_to_project + 1):
            cal_year = current_year + i
            age = inputs.current_age + i
            years_in_retirement = cal_year - (current_year + (ytf or 0))
            in_drawdown = ytf is not None and i > ytf

            if not in_drawdown:
                # Accumulation phase: FV(rate, periods, savings, pv)
                interest = nw * eff_rate
                nw = nw + interest + inputs.annual_savings
                annual_drawdown = None
                phase = "accumulation"
            else:
                # Drawdown phase: PMT over remaining life
                years_remaining = (inputs.life_expectancy - age) + 1
                if years_remaining <= 0:
                    break
                interest = nw * eff_rate
                # Withdraw target spend (inflation-adjusted) from portfolio
                annual_drawdown = inputs.target_annual_spend
                nw = nw + interest - annual_drawdown
                phase = "drawdown"

            trajectory.append(YearProjection(
                year=i,
                calendar_year=cal_year,
                age=age,
                phase=phase,
                projected_net_worth=round(nw, 2),
                annual_contribution=inputs.annual_savings if not in_drawdown else 0.0,
                interest_earned=round(nw * eff_rate, 2) if not in_drawdown else 0.0,
                target_fire_number=round(fire_number, 2),
                fire_achieved=nw >= fire_number,
                annual_drawdown=round(annual_drawdown, 2) if annual_drawdown else None,
            ))

        shortfall = max(0.0, fire_number - inputs.current_net_worth)

        return FIREResult(
            fire_number=round(fire_number, 2),
            years_to_fire=ytf,
            fire_date_year=(current_year + ytf) if ytf is not None else None,
            current_shortfall=round(shortfall, 2),
            trajectory=trajectory,
            already_fire=already_fire,
        )

