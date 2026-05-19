"""
CHASSIS Game — Physics & Engineering Simulation Engine
Real-world formulas for performance, drivetrain, aero, thermal, and reliability.
"""

import math
from typing import Any
from models import PhysicsResult, BuildState
from parts_db import PARTS_BY_ID, CHASSIS_BY_ID


# ─────────────────────────────────────────────────────────────
#  Constants
# ─────────────────────────────────────────────────────────────

G = 9.81            # m/s²
RHO_AIR = 1.225     # kg/m³ (sea level, 15°C)
LB_FT_TO_NM = 1.35582


# ─────────────────────────────────────────────────────────────
#  Drivetrain loss (power at crank → power at wheels)
# ─────────────────────────────────────────────────────────────

DRIVETRAIN_LOSS = {
    "FR":  0.12,   # 12% loss through manual RWD
    "FF":  0.10,
    "AWD": 0.18,
    "MR":  0.11,
    "RR":  0.11,
    "EV":  0.03,   # near-direct electric
}


# ─────────────────────────────────────────────────────────────
#  Torque curve generation
# ─────────────────────────────────────────────────────────────

def engine_torque_at_rpm(
    engine,
    rpm: int,
    boost_psi_override: float | None = None,
) -> float:
    """
    Returns estimated torque (Nm) at the given RPM.
    Uses a bell-curve model anchored at peak torque RPM.
    Turbo engines get a boost plateau in the mid-range.
    """
    from parts_db import Engine as EngineModel
    if not hasattr(engine, "horsepower_stock"):
        return 0.0

    peak_torque = engine.torque_nm_stock
    redline     = engine.redline_rpm
    idle        = engine.idle_rpm

    # Effective boost multiplier
    boost_psi = boost_psi_override if boost_psi_override is not None else (engine.boost_psi_stock or 0)
    boost_mult = 1.0 + (boost_psi / 14.7) * 0.55  # simplified volumetric gain

    # Peak torque band (typically 3000–5000 rpm for turbo, 4000–7000 for NA)
    aspiration = getattr(engine, "aspiration", "Naturally Aspirated")
    is_turbo = "Turbo" in str(aspiration) or "Supercharge" in str(aspiration)

    if is_turbo:
        peak_low  = idle + (redline - idle) * 0.30
        peak_high = idle + (redline - idle) * 0.65
    else:
        peak_low  = idle + (redline - idle) * 0.45
        peak_high = idle + (redline - idle) * 0.75

    # Build torque curve
    if rpm < idle:
        return peak_torque * 0.4

    if idle <= rpm < peak_low:
        t = (rpm - idle) / (peak_low - idle)
        base = peak_torque * (0.60 + 0.40 * t)
    elif peak_low <= rpm <= peak_high:
        base = peak_torque
    elif rpm > peak_high:
        t = (rpm - peak_high) / (redline - peak_high)
        base = peak_torque * (1.0 - 0.65 * t)
    else:
        base = peak_torque * 0.60

    # For NA engines, no boost multiplier
    if not is_turbo:
        return max(0, base)

    # Turbo spool model
    spool_psi_factor = 0.0
    if hasattr(engine, "boost_psi_stock") and engine.boost_psi_stock:
        spool_psi_factor = min(1.0, max(0, (rpm - idle * 1.5) / (peak_low - idle * 1.5)))

    effective_boost = boost_psi * spool_psi_factor
    effective_mult  = 1.0 + (effective_boost / 14.7) * 0.55
    return max(0, base * (effective_mult / boost_mult))  # already baked in peak_torque


def engine_power_at_rpm(engine, rpm: int, boost_psi: float | None = None) -> float:
    """Returns brake horsepower at RPM."""
    torque_nm = engine_torque_at_rpm(engine, rpm, boost_psi)
    return torque_nm * rpm / 9549.3  # kW
    # Convert kW → hp
def engine_hp_at_rpm(engine, rpm: int, boost_psi: float | None = None) -> float:
    return engine_power_at_rpm(engine, rpm, boost_psi) * 1.34102  # kW → hp


def peak_wheel_hp(engine, drivetrain_type: str, boost_psi: float | None = None) -> int:
    """Estimate wheel HP accounting for drivetrain loss."""
    loss = DRIVETRAIN_LOSS.get(str(drivetrain_type), 0.14)
    crank_hp = engine.horsepower_stock

    if boost_psi and engine.boost_psi_stock:
        boost_ratio = boost_psi / max(engine.boost_psi_stock, 1)
        crank_hp = int(crank_hp * (1.0 + (boost_ratio - 1.0) * 0.8))

    return int(crank_hp * (1.0 - loss))


def peak_wheel_torque(engine, drivetrain_type: str, boost_psi: float | None = None) -> int:
    loss = DRIVETRAIN_LOSS.get(str(drivetrain_type), 0.14)
    torque = engine.torque_nm_stock
    if boost_psi and engine.boost_psi_stock:
        boost_ratio = boost_psi / max(engine.boost_psi_stock, 1)
        torque = int(torque * (1.0 + (boost_ratio - 1.0) * 0.75))
    return int(torque * (1.0 - loss))


# ─────────────────────────────────────────────────────────────
#  0–60 MPH estimation
# ─────────────────────────────────────────────────────────────

def estimate_0_to_60(
    weight_kg: float,
    wheel_hp: int,
    drivetrain: str,
    tire_grip: float = 0.85,
    launch_rpm: int = 3000,
) -> float:
    """
    Estimate 0–60 mph time.
    Uses power-limited and traction-limited phase model.
    """
    if wheel_hp <= 0 or weight_kg <= 0:
        return 99.9

    weight_lbs = weight_kg * 2.20462
    hp_per_ton  = (wheel_hp / (weight_kg / 1000))

    # Traction-limited launch phase (0 → ~30 mph)
    traction_g = tire_grip * (1.0 if drivetrain == "AWD" else 0.72 if drivetrain == "FR" else 0.68)
    traction_t = 0.0 if traction_g <= 0 else (30 / 3.6) / (traction_g * G)

    # Power-limited mid phase (30 → 60 mph)
    avg_hp_mid   = wheel_hp * 0.75
    avg_force_n  = avg_hp_mid * 745.7 / ((45 / 3.6) + 0.001)   # F = P/v at ~45 mph avg
    accel_mid_ms2 = avg_force_n / weight_kg
    time_mid      = (30 / 3.6) / max(accel_mid_ms2, 0.01)

    raw_time = traction_t + time_mid

    # AWD bonus
    if drivetrain == "AWD":
        raw_time *= 0.88

    # Realistic clamp
    raw_time = max(2.2, raw_time)
    return round(raw_time, 2)


# ─────────────────────────────────────────────────────────────
#  Quarter mile estimation
# ─────────────────────────────────────────────────────────────

def estimate_quarter_mile(
    weight_kg: float,
    wheel_hp: int,
    drivetrain: str,
    tire_grip: float = 0.85,
) -> tuple[float, float]:
    """Returns (ET in seconds, trap speed in mph)."""
    if wheel_hp <= 0 or weight_kg <= 0:
        return (99.9, 0.0)

    weight_lbs = weight_kg * 2.20462
    hp_per_ton  = wheel_hp / (weight_kg / 1000)

    # ET: Elapsed time  — Hale's formula approximation
    # ET = 6.290 × (weight / power) ^ 0.333
    hp_per_lb = wheel_hp / weight_lbs
    et_raw = 6.290 * (1.0 / max(hp_per_lb, 0.001)) ** 0.333

    # Traction correction
    traction_mult = 1.05 if drivetrain == "FR" else 0.95 if drivetrain == "AWD" else 1.0
    et = et_raw * traction_mult

    # Trap speed — simplified: Ts = 234 × (HP / weight_lbs)^0.333
    trap = 234.0 * (hp_per_lb ** 0.333)
    trap = min(trap, 250.0)  # physical upper bound

    return (round(max(et, 7.5), 2), round(trap, 1))


# ─────────────────────────────────────────────────────────────
#  Top speed estimation
# ─────────────────────────────────────────────────────────────

def estimate_top_speed(
    wheel_hp: int,
    weight_kg: float,
    drag_coeff: float = 0.33,
    frontal_area_m2: float = 2.2,
) -> float:
    """
    Top speed where drag force = drive force.
    F_drag = 0.5 × ρ × Cd × A × v²
    P = F_drag × v  →  v³ = 2P / (ρ × Cd × A)
    """
    power_w = wheel_hp * 745.7
    v3 = (2 * power_w) / (RHO_AIR * drag_coeff * frontal_area_m2)
    v_ms = v3 ** (1.0 / 3.0)
    return round(v_ms * 2.23694, 1)  # m/s → mph


# ─────────────────────────────────────────────────────────────
#  Lateral G estimation
# ─────────────────────────────────────────────────────────────

def estimate_lateral_g(
    tire_grip: float = 0.85,
    weight_dist_front: float = 0.50,
    downforce_kg: float = 0,
    weight_kg: float = 1300,
) -> float:
    effective_weight = weight_kg + downforce_kg
    balance_factor   = 1.0 - abs(weight_dist_front - 0.5) * 0.8
    return round(tire_grip * balance_factor * (effective_weight / weight_kg), 2)


# ─────────────────────────────────────────────────────────────
#  Aerodynamics
# ─────────────────────────────────────────────────────────────

def calc_downforce(
    speed_mph: float,
    downforce_coeff: float,
    frontal_area_m2: float = 2.2,
) -> float:
    """Returns downforce in kg at a given speed."""
    speed_ms = speed_mph * 0.44704
    force_n  = 0.5 * RHO_AIR * downforce_coeff * frontal_area_m2 * speed_ms ** 2
    return force_n / G


# ─────────────────────────────────────────────────────────────
#  Braking distance  60→0 mph
# ─────────────────────────────────────────────────────────────

def estimate_braking_60_0(
    weight_kg: float,
    brake_quality: float = 0.85,   # 0–1.0
    tire_grip: float = 0.85,
) -> float:
    """Returns stopping distance in feet (60 mph → 0)."""
    decel_g = min(brake_quality, tire_grip) * 1.05
    v_ms    = 60 * 0.44704
    d_m     = (v_ms ** 2) / (2 * decel_g * G)
    return round(d_m * 3.28084, 1)


# ─────────────────────────────────────────────────────────────
#  Thermal simulation
# ─────────────────────────────────────────────────────────────

def estimate_engine_temp(
    engine,
    cooling_kw: float,
    ambient_c: float = 20.0,
    load_factor: float = 0.8,
) -> float:
    """
    Estimate steady-state engine coolant temp.
    More HP = more heat. Bigger cooling = lower temp.
    """
    hp = getattr(engine, "horsepower_stock", 200)
    heat_generated_kw = hp * 0.7457 * load_factor * 0.35   # ~35% of energy is heat
    delta_temp = max(0, heat_generated_kw - cooling_kw) * 2.5
    base_temp  = ambient_c + 75  # thermostat setpoint
    return round(base_temp + delta_temp, 1)


# ─────────────────────────────────────────────────────────────
#  Reliability score
# ─────────────────────────────────────────────────────────────

def calculate_reliability(
    engine,
    boost_psi: float,
    tune: dict,
    fabrication_quality: int = 7,
) -> float:
    """
    Returns a reliability score 0–100.
    Factors:
    - How close boost is to engine's potential
    - Ignition timing safety
    - Cooling headroom
    """
    score = 100.0

    # Boost headroom
    stock_boost = getattr(engine, "boost_psi_stock", 0) or 0
    max_boost   = stock_boost * 3.5 if stock_boost > 0 else 40
    if stock_boost > 0 and boost_psi > stock_boost:
        over_ratio = (boost_psi - stock_boost) / (max_boost - stock_boost + 0.01)
        score -= over_ratio * 45

    # Timing
    timing = tune.get("ignition_timing_deg", 14.0)
    if timing > 20.0:
        score -= (timing - 20.0) * 3

    # Fuel mixture
    fuel_trim = tune.get("fuel_map_pct", 0.0)
    if fuel_trim > 5:
        score -= fuel_trim * 1.5  # lean = bad

    # Fabrication quality
    score -= (10 - fabrication_quality) * 2

    return round(max(0.0, min(100.0, score)), 1)


# ─────────────────────────────────────────────────────────────
#  Weight calculation
# ─────────────────────────────────────────────────────────────

def calculate_total_weight(chassis, installed_parts: dict) -> tuple[float, float]:
    """
    Returns (total_weight_kg, weight_dist_front).
    Simple lumped-mass model with engine position bias.
    """
    base_weight = chassis.curb_weight_kg
    added_weight = 0.0
    front_weight_added = 0.0

    FRONT_BIASED_SLOTS = {
        "engine", "transmission", "radiator", "intercooler",
        "brakes_front", "wheels_front", "tires_front",
        "suspension_front", "aero_front",
    }
    REAR_BIASED_SLOTS = {
        "differential", "suspension_rear", "brakes_rear",
        "wheels_rear", "tires_rear", "aero_rear",
    }

    for slot, part_id in installed_parts.items():
        part = PARTS_BY_ID.get(part_id)
        if not part:
            continue
        w = part.weight_kg
        added_weight += w

        if slot in FRONT_BIASED_SLOTS:
            front_weight_added += w * 0.80
        elif slot in REAR_BIASED_SLOTS:
            front_weight_added += w * 0.20
        else:
            front_weight_added += w * 0.50

    total = base_weight + added_weight
    stock_front = chassis.weight_dist_front * base_weight
    total_front  = stock_front + front_weight_added

    dist_front = total_front / total if total > 0 else 0.5
    dist_front  = round(max(0.20, min(0.80, dist_front)), 3)
    return (round(total, 1), dist_front)


# ─────────────────────────────────────────────────────────────
#  Full physics calculation
# ─────────────────────────────────────────────────────────────

def run_physics(
    chassis_id: str,
    installed_parts: dict[str, str],
    tune: dict[str, Any],
) -> PhysicsResult:
    chassis = CHASSIS_BY_ID.get(chassis_id)
    if not chassis:
        return PhysicsResult(
            zero_to_60_mph_sec=99.9, quarter_mile_sec=99.9,
            quarter_mile_trap_mph=0, top_speed_mph=0, lateral_g_max=0,
            braking_60_to_0_ft=999, power_to_weight_hp_ton=0,
            wheel_horsepower=0, wheel_torque_nm=0, total_weight_kg=0,
            weight_dist_front_pct=50, downforce_kg_at_100mph=0,
            drag_coefficient=0.35, drivetrain_loss_pct=0,
            boost_psi_actual=0, engine_temp_c=90, reliability_score=0,
            warnings=["Invalid chassis ID"],
        )

    warnings: list[str] = []

    # ── Engine
    engine_id = installed_parts.get("engine") or chassis.stock_engine_id
    engine = PARTS_BY_ID.get(engine_id)

    if not engine or not hasattr(engine, "horsepower_stock"):
        return PhysicsResult(
            zero_to_60_mph_sec=99.9, quarter_mile_sec=99.9,
            quarter_mile_trap_mph=0, top_speed_mph=0, lateral_g_max=0,
            braking_60_to_0_ft=999, power_to_weight_hp_ton=0,
            wheel_horsepower=0, wheel_torque_nm=0, total_weight_kg=0,
            weight_dist_front_pct=50, downforce_kg_at_100mph=0,
            drag_coefficient=0.35, drivetrain_loss_pct=0,
            boost_psi_actual=0, engine_temp_c=90, reliability_score=50,
            warnings=["No engine installed"],
        )

    # ── Drivetrain type
    drivetrain = str(chassis.drivetrain_stock)
    loss_pct   = DRIVETRAIN_LOSS.get(drivetrain, 0.14)

    # ── Boost
    tune_boost = tune.get("boost_psi")
    stock_boost = getattr(engine, "boost_psi_stock", 0) or 0
    boost_psi  = float(tune_boost) if tune_boost is not None else stock_boost
    if boost_psi > stock_boost * 2.5 and stock_boost > 0:
        warnings.append(f"Boost {boost_psi:.1f} psi is extremely high — engine reliability severely impacted.")

    # ── Turbo support check
    turbo_id = installed_parts.get("turbo")
    turbo    = PARTS_BY_ID.get(turbo_id) if turbo_id else None
    if turbo and hasattr(turbo, "max_boost_psi"):
        if boost_psi > turbo.max_boost_psi:
            boost_psi = turbo.max_boost_psi
            warnings.append(f"Boost clamped to turbo max: {turbo.max_boost_psi} psi")

    # ── Wheel HP / torque
    whp = peak_wheel_hp(engine, drivetrain, boost_psi)
    wtq = peak_wheel_torque(engine, drivetrain, boost_psi)

    # ── Intercooler efficiency bonus
    intercooler_id = installed_parts.get("intercooler")
    if intercooler_id and boost_psi > 10:
        whp = int(whp * 1.04)   # 4% charge density improvement
        warnings.append("Intercooler installed — +4% thermal efficiency bonus applied.")

    # ── Weight
    total_weight, weight_dist = calculate_total_weight(chassis, installed_parts)

    # ── Tire grip
    tire_f_id = installed_parts.get("tires_front")
    tire_r_id = installed_parts.get("tires_rear")
    tire_f    = PARTS_BY_ID.get(tire_f_id) if tire_f_id else None
    tire_r    = PARTS_BY_ID.get(tire_r_id) if tire_r_id else None
    grip = min(
        getattr(tire_f, "grip_index", 0.85) if tire_f else 0.82,
        getattr(tire_r, "grip_index", 0.85) if tire_r else 0.82,
    )

    # ── Drag / downforce
    aero_front_id = installed_parts.get("aero_front")
    aero_rear_id  = installed_parts.get("aero_rear")
    downforce_coeff = 0.0
    drag_coeff      = 0.32

    if aero_front_id:
        downforce_coeff += 0.15
        drag_coeff      += 0.025
    if aero_rear_id:
        downforce_coeff += 0.25
        drag_coeff      += 0.03

    downforce_100 = calc_downforce(100, downforce_coeff)

    # ── Performance
    zero60  = estimate_0_to_60(total_weight, whp, drivetrain, grip,
                               launch_rpm=tune.get("launch_rpm", 3000))
    et, trap = estimate_quarter_mile(total_weight, whp, drivetrain, grip)
    top_spd  = estimate_top_speed(whp, total_weight, drag_coeff)

    lat_g    = estimate_lateral_g(grip, weight_dist, downforce_100, total_weight)
    brk_dist = estimate_braking_60_0(total_weight, brake_quality=0.85, tire_grip=grip)

    pw_ratio = round((whp / (total_weight / 1000)), 1)

    # ── Cooling
    radiator_id   = installed_parts.get("radiator")
    cooling_kw    = 30.0
    if radiator_id:
        rad = PARTS_BY_ID.get(radiator_id)
        cooling_kw = getattr(rad, "cooling_kw", 40.0)

    req_cooling = getattr(engine, "cooling_requirement_kw", 30)
    engine_temp = estimate_engine_temp(engine, cooling_kw)

    if cooling_kw < req_cooling:
        warnings.append(
            f"Cooling is insufficient: engine requires {req_cooling} kW, installed cooling provides {cooling_kw} kW. Overheating risk!"
        )
    if engine_temp > 115:
        warnings.append(f"Engine temp {engine_temp}°C — risk of head gasket failure.")

    # ── Reliability
    reliability = calculate_reliability(engine, boost_psi, tune)
    if reliability < 50:
        warnings.append(f"Reliability score {reliability}/100 — this tune is dangerous.")

    # ── Final assembly
    return PhysicsResult(
        zero_to_60_mph_sec=zero60,
        quarter_mile_sec=et,
        quarter_mile_trap_mph=trap,
        top_speed_mph=top_spd,
        lateral_g_max=lat_g,
        braking_60_to_0_ft=brk_dist,
        power_to_weight_hp_ton=pw_ratio,
        wheel_horsepower=whp,
        wheel_torque_nm=wtq,
        total_weight_kg=total_weight,
        weight_dist_front_pct=round(weight_dist * 100, 1),
        downforce_kg_at_100mph=round(downforce_100, 1),
        drag_coefficient=drag_coeff,
        drivetrain_loss_pct=round(loss_pct * 100, 1),
        boost_psi_actual=round(boost_psi, 1),
        engine_temp_c=engine_temp,
        reliability_score=reliability,
        warnings=warnings,
    )
