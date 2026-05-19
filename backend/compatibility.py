"""
CHASSIS Game — Compatibility & Fitment Checker
Determines if a part can be installed in a given chassis slot,
what fabrication is needed, and how complex the install is.
"""

from models import CompatibilityResult
from parts_db import PARTS_BY_ID, CHASSIS_BY_ID


# ─────────────────────────────────────────────────────────────
#  Engine fitment check
# ─────────────────────────────────────────────────────────────

def check_engine_fitment(chassis, engine) -> CompatibilityResult:
    errors: list[str] = []
    warnings: list[str] = []
    fab_items: list[str] = []
    requires_fab = False
    fitment_score = 100.0

    bay = chassis.engine_bay

    # Dimensional check
    eng_l = engine.dimensions.length_mm
    eng_w = engine.dimensions.width_mm
    eng_h = engine.dimensions.height_mm

    # Length vs bay depth
    if eng_l > bay.length_mm:
        overflow = eng_l - bay.length_mm
        if overflow > 80:
            errors.append(
                f"Engine length {eng_l}mm exceeds bay depth {bay.length_mm}mm by {overflow}mm. "
                "Firewall cut or engine setback required."
            )
            fab_items.append("Firewall modification / setback")
            requires_fab = True
            fitment_score -= 30
        else:
            warnings.append(f"Engine protrudes {overflow}mm — tight fit, custom mount positioning required.")
            fab_items.append("Custom engine mount positioning")
            requires_fab = True
            fitment_score -= 15

    # Width vs subframe gap
    if eng_w > bay.subframe_width_mm:
        overflow = eng_w - bay.subframe_width_mm
        if overflow > 60:
            errors.append(
                f"Engine width {eng_w}mm exceeds subframe gap {bay.subframe_width_mm}mm by {overflow}mm. "
                "Subframe modification or tube-frame conversion required."
            )
            fab_items.append("Subframe modification")
            requires_fab = True
            fitment_score -= 35
        else:
            warnings.append(f"Engine is {overflow}mm wider than stock subframe gap — custom mounts needed.")
            fab_items.append("Custom engine mounts (adapter plate)")
            requires_fab = True
            fitment_score -= 20

    # Height vs hood line
    if eng_h > bay.height_mm:
        overflow = eng_h - bay.height_mm
        if overflow > 100:
            errors.append(
                f"Engine height {eng_h}mm will not fit under stock hood (bay: {bay.height_mm}mm). "
                "Hood bulge, custom hood, or engine repositioning required."
            )
            fab_items.append("Hood clearance modification / custom hood")
            requires_fab = True
            fitment_score -= 25
        else:
            warnings.append(f"Engine height tight — {overflow}mm clearance issue. Custom intake may be needed.")
            fab_items.append("Hood clearance check")
            fitment_score -= 10

    # Weight limit
    if engine.weight_kg > chassis.max_engine_weight_kg:
        over = engine.weight_kg - chassis.max_engine_weight_kg
        errors.append(
            f"Engine weight {engine.weight_kg} kg exceeds chassis structural limit "
            f"{chassis.max_engine_weight_kg} kg by {over:.0f} kg. Chassis reinforcement required."
        )
        fab_items.append("Chassis front subframe reinforcement")
        requires_fab = True
        fitment_score -= 30

    # Mount fabrication (nearly always needed for swaps)
    if engine.id != chassis.stock_engine_id:
        if not any("mount" in f.lower() for f in fab_items):
            fab_items.append("Custom engine mount fabrication")
            requires_fab = True
            fitment_score -= 5
        warnings.append("Non-stock engine swap — engine mounts must be fabricated.")

    # ECU / wiring
    warnings.append("Standalone ECU and custom wiring harness required for this engine.")

    # Transmission tunnel
    fab_items.append("Transmission tunnel clearance check")

    compatible = len(errors) == 0
    return CompatibilityResult(
        compatible=compatible,
        requires_fabrication=requires_fab,
        fabrication_items=fab_items,
        warnings=warnings,
        errors=errors,
        fitment_score=max(0.0, min(100.0, fitment_score)),
    )


# ─────────────────────────────────────────────────────────────
#  Turbo fitment
# ─────────────────────────────────────────────────────────────

def check_turbo_fitment(chassis, turbo, installed_engine) -> CompatibilityResult:
    errors:   list[str] = []
    warnings: list[str] = []
    fab_items: list[str] = []
    requires_fab = False
    fitment_score = 90.0

    if not installed_engine:
        errors.append("No engine installed. Install an engine before adding forced induction.")
        return CompatibilityResult(
            compatible=False, requires_fabrication=False,
            fabrication_items=[], warnings=[], errors=errors, fitment_score=0.0,
        )

    aspiration = str(getattr(installed_engine, "aspiration", "Naturally Aspirated"))

    # NA engines need more work
    if aspiration == "Naturally Aspirated":
        warnings.append(
            "This engine is naturally aspirated. Turbo addition requires: "
            "custom exhaust manifold, oil feed/return lines, intercooler plumbing, and ECU reconfiguration."
        )
        fab_items += [
            "Custom turbo exhaust manifold",
            "Oil feed and return lines",
            "Coolant feed lines",
            "Blow-off valve / recirculation",
            "Intercooler piping",
        ]
        requires_fab = True
        fitment_score -= 20
    elif "Electric" in aspiration:
        errors.append("Cannot install turbo on an electric motor.")
        return CompatibilityResult(
            compatible=False, requires_fabrication=False,
            fabrication_items=[], warnings=[], errors=errors, fitment_score=0.0,
        )

    # HP support check
    engine_potential = getattr(installed_engine, "horsepower_potential", 500)
    turbo_support    = getattr(turbo, "max_hp_support", 600)
    if turbo_support < installed_engine.horsepower_stock:
        warnings.append(
            f"Turbo rated for {turbo_support} hp but engine already makes {installed_engine.horsepower_stock} hp stock. "
            "Risk of overspin and compressor surge."
        )
        fitment_score -= 25

    # Intercooler required at high boost
    if getattr(turbo, "max_boost_psi", 0) > 15:
        warnings.append("High-boost turbo — front-mount or top-mount intercooler strongly recommended.")
        fab_items.append("Intercooler and charge pipes")

    fab_items.append("Custom downpipe and exhaust routing")

    return CompatibilityResult(
        compatible=True,
        requires_fabrication=requires_fab,
        fabrication_items=fab_items,
        warnings=warnings,
        errors=errors,
        fitment_score=max(0, fitment_score),
    )


# ─────────────────────────────────────────────────────────────
#  Transmission fitment
# ─────────────────────────────────────────────────────────────

def check_transmission_fitment(chassis, transmission, installed_engine) -> CompatibilityResult:
    errors: list[str] = []
    warnings: list[str] = []
    fab_items: list[str] = []
    requires_fab = False
    fitment_score = 85.0

    if not installed_engine:
        errors.append("No engine installed. Transmission requires a mated engine.")
        return CompatibilityResult(
            compatible=False, requires_fabrication=False,
            fabrication_items=[], warnings=[], errors=errors, fitment_score=0.0,
        )

    engine_torque = getattr(installed_engine, "torque_nm_stock", 0)
    trans_torque  = getattr(transmission, "max_torque_nm", 9999)

    if engine_torque > trans_torque:
        warnings.append(
            f"Engine produces {engine_torque} Nm, transmission rated for {trans_torque} Nm. "
            "Risk of transmission failure under hard use."
        )
        fitment_score -= 20

    # Adapter plate check (non-native engine/trans combos)
    compat = getattr(transmission, "compatible_engines", [])
    if compat and installed_engine.id not in compat:
        warnings.append(
            f"{transmission.name} is not a direct bolt-on for {installed_engine.name}. "
            "Adapter plate required."
        )
        fab_items.append("Bell housing adapter plate")
        requires_fab = True
        fitment_score -= 15

    # Tunnel clearance
    trans_len = transmission.dimensions.length_mm
    if trans_len > chassis.engine_bay.firewall_setback_mm + 350:
        warnings.append(
            "Transmission length may interfere with tunnel — tunnel modification likely required."
        )
        fab_items.append("Transmission tunnel modification")
        requires_fab = True
        fitment_score -= 10

    # Driveshaft
    fab_items.append("Custom driveshaft (length/yoke to match new trans output)")
    requires_fab = True

    return CompatibilityResult(
        compatible=True,
        requires_fabrication=requires_fab,
        fabrication_items=fab_items,
        warnings=warnings,
        errors=errors,
        fitment_score=max(0, fitment_score),
    )


# ─────────────────────────────────────────────────────────────
#  General slot check dispatcher
# ─────────────────────────────────────────────────────────────

def check_compatibility(
    chassis_id: str,
    part_id: str,
    slot: str,
    installed_parts: dict[str, str],
) -> CompatibilityResult:

    chassis = CHASSIS_BY_ID.get(chassis_id)
    part    = PARTS_BY_ID.get(part_id)

    if not chassis:
        return CompatibilityResult(
            compatible=False, requires_fabrication=False,
            errors=[f"Unknown chassis: {chassis_id}"], fitment_score=0,
        )
    if not part:
        return CompatibilityResult(
            compatible=False, requires_fabrication=False,
            errors=[f"Unknown part: {part_id}"], fitment_score=0,
        )

    installed_engine = PARTS_BY_ID.get(installed_parts.get("engine", ""))

    if slot == "engine":
        return check_engine_fitment(chassis, part)

    elif slot == "turbo":
        return check_turbo_fitment(chassis, part, installed_engine)

    elif slot == "transmission":
        return check_transmission_fitment(chassis, part, installed_engine)

    elif slot in ("suspension_front", "suspension_rear"):
        return CompatibilityResult(
            compatible=True,
            requires_fabrication=part.requires_fabrication,
            fabrication_items=["Alignment required after install"],
            warnings=["Full 4-wheel alignment mandatory after suspension change."],
            fitment_score=92.0,
        )

    elif slot in ("tires_front", "tires_rear"):
        # Check rim compatibility
        wheel_slot = "wheels_front" if "front" in slot else "wheels_rear"
        wheel_id   = installed_parts.get(wheel_slot)
        wheel      = PARTS_BY_ID.get(wheel_id)
        if wheel and hasattr(part, "rim_diameter_in") and hasattr(wheel, "diameter_in"):
            if part.rim_diameter_in != wheel.diameter_in:
                return CompatibilityResult(
                    compatible=False,
                    requires_fabrication=False,
                    errors=[
                        f"Tire rim diameter {part.rim_diameter_in}\" does not match "
                        f"wheel diameter {wheel.diameter_in}\""
                    ],
                    fitment_score=0.0,
                )
        return CompatibilityResult(
            compatible=True, requires_fabrication=False,
            fitment_score=98.0,
        )

    elif slot == "ecu":
        if installed_engine:
            max_cyl = getattr(part, "max_cylinders", 12)
            eng_cyl = getattr(installed_engine, "cylinder_count", 4)
            if eng_cyl > max_cyl:
                return CompatibilityResult(
                    compatible=False,
                    requires_fabrication=False,
                    errors=[f"ECU supports max {max_cyl} cylinders, engine has {eng_cyl}."],
                    fitment_score=0.0,
                )
        return CompatibilityResult(
            compatible=True, requires_fabrication=False,
            warnings=["Custom wiring harness required for standalone ECU."],
            fabrication_items=["Custom wiring harness"],
            fitment_score=85.0,
        )

    # Default: generic check
    return CompatibilityResult(
        compatible=True,
        requires_fabrication=part.requires_fabrication,
        fabrication_items=[],
        warnings=[],
        fitment_score=90.0,
    )
