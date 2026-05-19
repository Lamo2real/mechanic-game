"""
CHASSIS Game — Core Data Models
All Pydantic models for the game engine.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


# ─────────────────────────────────────────────
#  Enums
# ─────────────────────────────────────────────

class DrivetrainType(str, Enum):
    FR  = "FR"    # Front engine / Rear-wheel drive
    FF  = "FF"    # Front engine / Front-wheel drive
    AWD = "AWD"   # All-wheel drive
    MR  = "MR"    # Mid engine / Rear-wheel drive
    RR  = "RR"    # Rear engine / Rear-wheel drive
    EV  = "EV"    # Electric (configurable)


class PartCategory(str, Enum):
    ENGINE        = "Engine"
    TURBO         = "Turbo"
    SUPERCHARGER  = "Supercharger"
    INTERCOOLER   = "Intercooler"
    EXHAUST       = "Exhaust"
    TRANSMISSION  = "Transmission"
    DIFFERENTIAL  = "Differential"
    DRIVESHAFT    = "Driveshaft"
    SUSPENSION    = "Suspension"
    BRAKES        = "Brakes"
    WHEELS        = "Wheels"
    TIRES         = "Tires"
    AERO          = "Aero"
    COOLING       = "Cooling"
    FUEL          = "Fuel"
    ELECTRONICS   = "Electronics"
    ECU           = "ECU"
    INTERIOR      = "Interior"
    BODY          = "Body"
    FABRICATION   = "Fabrication"
    CHASSIS       = "Chassis"


class AspirationMode(str, Enum):
    NA           = "Naturally Aspirated"
    TURBO        = "Single Turbo"
    TWIN_TURBO   = "Twin Turbo"
    SUPER        = "Supercharged"
    TWIN_SUPER   = "Twin Supercharged"
    ELECTRIC     = "Electric"
    HYBRID       = "Hybrid"


class CylinderConfig(str, Enum):
    I3      = "I3"
    I4      = "I4"
    I5      = "I5"
    I6      = "I6"
    V6      = "V6"
    V8      = "V8"
    V10     = "V10"
    V12     = "V12"
    H4      = "H4 Boxer"
    H6      = "H6 Boxer"
    ROTARY  = "Rotary"
    ELECTRIC = "Electric"


# ─────────────────────────────────────────────
#  Shared sub-models
# ─────────────────────────────────────────────

class Dimensions(BaseModel):
    length_mm: float
    width_mm:  float
    height_mm: float


class TorquePoint(BaseModel):
    rpm:      int
    torque_nm: float


# ─────────────────────────────────────────────
#  Part — base class
# ─────────────────────────────────────────────

class Part(BaseModel):
    id:                    str
    name:                  str
    brand:                 str
    category:              PartCategory
    subcategory:           Optional[str] = None
    dimensions:            Dimensions
    weight_kg:             float
    price_usd:             int
    description:           str
    specs:                 Dict[str, Any] = {}
    compatible_chassis:    List[str] = []   # empty = universal
    incompatible_chassis:  List[str] = []
    requires_fabrication:  bool = False
    fabrication_difficulty: int = 0         # 0–10
    image_url:             Optional[str] = None


# ─────────────────────────────────────────────
#  Engine
# ─────────────────────────────────────────────

class Engine(Part):
    displacement_cc:      int
    cylinder_count:       int
    cylinder_config:      CylinderConfig
    aspiration:           AspirationMode
    fuel_type:            str              # Gasoline, Diesel, E85, Methanol, Electric
    horsepower_stock:     int
    torque_nm_stock:      int
    redline_rpm:          int
    idle_rpm:             int
    boost_psi_stock:      Optional[float] = None
    compression_ratio:    float
    firing_order:         str
    horsepower_potential: int              # Max reliable tuned potential
    torque_potential_nm:  int
    cooling_requirement_kw: float          # Min cooling capacity required
    oil_capacity_liters:  float
    notes:                str = ""


# ─────────────────────────────────────────────
#  Chassis
# ─────────────────────────────────────────────

class EngineBay(BaseModel):
    length_mm:        float
    width_mm:         float
    height_mm:        float
    firewall_setback_mm: float   # space from firewall to gearbox tunnel
    subframe_width_mm:   float   # inner frame rail gap
    has_crossmember:  bool = True


class Chassis(BaseModel):
    id:                  str
    name:                str
    manufacturer:        str
    year_range:          str              # e.g. "1999–2002"
    drivetrain_stock:    DrivetrainType
    engine_bay:          EngineBay
    wheelbase_mm:        int
    front_track_mm:      int
    rear_track_mm:       int
    curb_weight_kg:      float
    weight_dist_front:   float           # 0.0–1.0 (fraction of weight on front axle)
    stock_engine_id:     str
    stock_transmission:  str
    max_engine_weight_kg: float          # structural limit
    price_usd:           int
    description:         str
    image_url:           Optional[str] = None


# ─────────────────────────────────────────────
#  Turbo / Forced Induction
# ─────────────────────────────────────────────

class Turbo(Part):
    compressor_map:     str            # e.g. "GTX3071R"
    max_boost_psi:      float
    spool_rpm:          int            # boost onset RPM
    max_flow_cfm:       float
    max_hp_support:     int
    anti_surge:         bool = False
    journal_or_ball:    str = "Journal"  # bearing type


# ─────────────────────────────────────────────
#  Transmission
# ─────────────────────────────────────────────

class Transmission(Part):
    gear_count:          int
    trans_type:          str            # Manual, Sequential, Auto, DCT, CVT
    max_torque_nm:       int
    max_hp:              int
    gear_ratios:         List[float]
    final_drive:         float
    compatible_engines:  List[str] = []


# ─────────────────────────────────────────────
#  Suspension
# ─────────────────────────────────────────────

class SuspensionKit(Part):
    suspension_type:    str            # Coilover, Air, Leaf, Torsion, McPherson
    spring_rate_n_mm:   float
    damping_range:      str            # e.g. "0–40 clicks"
    ride_height_range_mm: str
    camber_range_deg:   str
    caster_adjustable:  bool
    toe_adjustable:     bool


# ─────────────────────────────────────────────
#  Wheels & Tires
# ─────────────────────────────────────────────

class Wheel(Part):
    diameter_in:        float
    width_in:           float
    offset_mm:          int
    bolt_pattern:       str
    material:           str


class Tire(Part):
    width_mm:           int
    aspect_ratio:       int
    rim_diameter_in:    float
    compound:           str            # Street, Sport, Semi-Slick, Slick, Mud, All-Season
    max_load_kg:        int
    speed_rating:       str
    grip_index:         float          # 0.0–1.0 (multiplied into physics)


# ─────────────────────────────────────────────
#  ECU
# ─────────────────────────────────────────────

class ECU(Part):
    ecu_type:           str            # OEM, Standalone, Piggyback
    max_injector_cc:    int
    boost_control:      bool
    launch_control:     bool
    traction_control:   bool
    flex_fuel:          bool
    max_cylinders:      int
    tuning_software:    str


# ─────────────────────────────────────────────
#  Build state
# ─────────────────────────────────────────────

class BuildSlot(str, Enum):
    ENGINE       = "engine"
    TRANSMISSION = "transmission"
    DIFFERENTIAL = "differential"
    TURBO        = "turbo"
    SUPERCHARGER = "supercharger"
    INTERCOOLER  = "intercooler"
    EXHAUST      = "exhaust"
    RADIATOR     = "radiator"
    FUEL_SYSTEM  = "fuel_system"
    ECU          = "ecu"
    SUSPENSION_F = "suspension_front"
    SUSPENSION_R = "suspension_rear"
    BRAKES_F     = "brakes_front"
    BRAKES_R     = "brakes_rear"
    WHEELS_F     = "wheels_front"
    WHEELS_R     = "wheels_rear"
    TIRES_F      = "tires_front"
    TIRES_R      = "tires_rear"
    AERO_FRONT   = "aero_front"
    AERO_REAR    = "aero_rear"
    INTERIOR     = "interior"
    ROLL_CAGE    = "roll_cage"


class FabricationMod(BaseModel):
    id:          str
    name:        str
    description: str
    difficulty:  int   # 0–10
    cost_usd:    int
    time_hours:  float


class BuildState(BaseModel):
    id:               str
    name:             str
    chassis_id:       str
    installed_parts:  Dict[str, str] = {}     # slot -> part_id
    fabrication_mods: List[FabricationMod] = []
    tune:             Dict[str, Any] = {}     # ECU tune parameters
    notes:            str = ""


# ─────────────────────────────────────────────
#  API request / response models
# ─────────────────────────────────────────────

class CompatibilityRequest(BaseModel):
    chassis_id:  str
    part_id:     str
    slot:        str
    installed_parts: Dict[str, str] = {}


class CompatibilityResult(BaseModel):
    compatible:           bool
    requires_fabrication: bool
    fabrication_items:    List[str] = []
    warnings:             List[str] = []
    errors:               List[str] = []
    fitment_score:        float = 0.0     # 0–100 (100 = perfect bolt-on)


class PhysicsRequest(BaseModel):
    chassis_id:      str
    installed_parts: Dict[str, str] = {}
    tune:            Dict[str, Any] = {}


class PhysicsResult(BaseModel):
    zero_to_60_mph_sec:       float
    quarter_mile_sec:         float
    quarter_mile_trap_mph:    float
    top_speed_mph:            float
    lateral_g_max:            float
    braking_60_to_0_ft:       float
    power_to_weight_hp_ton:   float
    wheel_horsepower:         int
    wheel_torque_nm:          int
    total_weight_kg:          float
    weight_dist_front_pct:    float
    downforce_kg_at_100mph:   float
    drag_coefficient:         float
    drivetrain_loss_pct:      float
    boost_psi_actual:         float
    engine_temp_c:            float
    reliability_score:        float   # 0–100
    warnings:                 List[str] = []


class TuneRequest(BaseModel):
    boost_psi:          Optional[float] = None
    ignition_timing_deg: Optional[float] = None
    fuel_map_pct:       Optional[float] = None    # +/- AFR trim
    rev_limit_rpm:      Optional[int] = None
    launch_rpm:         Optional[int] = None
    traction_slip_pct:  Optional[float] = None


class SearchRequest(BaseModel):
    query:      Optional[str] = None
    category:   Optional[PartCategory] = None
    min_hp:     Optional[int] = None
    max_weight_kg: Optional[float] = None
    max_price:  Optional[int] = None
    chassis_id: Optional[str] = None
    limit:      int = 50
