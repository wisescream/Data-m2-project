"""PyArrow schema definitions and temporal conversions for PaySim transactions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Tuple
import pyarrow as pa

# Base timestamp anchor for simulated time (step 1 = 2023-01-01 00:00:00 UTC)
SIMULATED_BASE_TIME = datetime(2023, 1, 1, 0, 0, 0, tzinfo=timezone.utc)


def step_to_simulated_time(step: int) -> Tuple[datetime, str]:
    """
    Converts simulated PaySim 1-based step hour to:
    1. event_time_simulated (UTC datetime)
    2. event_date (YYYY-MM-DD partition string)
    """
    # Step 1 starts at 2023-01-01 00:00:00
    simulated_dt = SIMULATED_BASE_TIME + timedelta(hours=int(step - 1))
    event_date = simulated_dt.strftime("%Y-%m-%d")
    return simulated_dt, event_date


# Canonical PyArrow Schema for PaySim curated lakehouse
TRANSACTIONS_ARROW_SCHEMA = pa.schema([
    pa.field("ingest_row_id", pa.int64(), nullable=False),
    pa.field("step", pa.int32(), nullable=False),
    pa.field("type", pa.string(), nullable=False),
    pa.field("amount", pa.float64(), nullable=False),
    pa.field("name_orig", pa.string(), nullable=False),
    pa.field("oldbalance_org", pa.float64(), nullable=False),
    pa.field("newbalance_orig", pa.float64(), nullable=False),
    pa.field("name_dest", pa.string(), nullable=False),
    pa.field("oldbalance_dest", pa.float64(), nullable=False),
    pa.field("newbalance_dest", pa.float64(), nullable=False),
    pa.field("is_fraud", pa.int8(), nullable=False),
    pa.field("is_flagged_fraud", pa.int8(), nullable=False),
    pa.field("event_time_simulated", pa.timestamp("us", tz="UTC"), nullable=False),
    pa.field("event_date", pa.string(), nullable=False),
])
