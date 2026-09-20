#!/usr/bin/env python3
"""ERD for the Operation Service block. Columns/enums/FKs taken verbatim from
the live rcfeild_db schema (information_schema dump), not from the entity files —
a few tables (vehicle_maintenance_logs) have no TypeORM entity at all."""

from xml.sax.saxutils import escape

# ── geometry ────────────────────────────────────────────────────────────────
BW = 224          # box width
HDR = 20          # header band height
RH = 14           # row height
PAD = 5

COL = {1: 60, 2: 380, 3: 700, 4: 1020}

# ── schema ──────────────────────────────────────────────────────────────────
# (key, name, x, y, [(marker, column, type)])
TABLES = [
    ("bookings", "bookings", COL[1], 60, [
        ("PK", "id", "uuid"),
        ("FK", "customer_id", "uuid"),
        ("FK", "cafe_id", "uuid"),
        ("FK", "track_type_id", "uuid"),
        ("FK", "track_config_id", "uuid"),
        ("", "booking_mode", "enum"),
        ("", "play_mode", "enum"),
        ("", "source", "enum"),
        ("", "status", "enum"),
        ("", "slot_start", "timestamp"),
        ("", "slot_end", "timestamp"),
        ("", "slot_count", "integer"),
        ("", "payment_expires_at", "timestamp"),
        ("", "snapshot", "jsonb"),
        ("FK", "promotion_id", "uuid"),
        ("", "discount_amount", "numeric"),
        ("FK", "customer_package_id", "uuid"),
        ("FK", "contest_id", "uuid"),
        ("", "notes", "text"),
        ("FK", "cancelled_by", "uuid"),
        ("", "cancelled_at", "timestamp"),
        ("", "cancellation_reason", "text"),
        ("", "completed_at", "timestamp"),
        ("", "review_dismissed_at", "timestamp"),
        ("", "review_snoozed_until", "timestamp"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
        ("", "deleted_at", "timestamp"),
    ]),
    ("booking_participants", "booking_participants", COL[1], 540, [
        ("PK", "id", "uuid"),
        ("FK", "booking_id", "uuid"),
        ("FK", "user_id", "uuid"),
        ("", "participant_type", "enum"),
        ("", "display_name", "varchar(255)"),
        ("", "phone", "varchar(20)"),
        ("", "guest_name", "varchar(255)"),
        ("", "guest_phone", "varchar(20)"),
        ("", "is_primary_responsible", "boolean"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("booking_vehicles", "booking_vehicles", COL[1], 760, [
        ("PK", "id", "uuid"),
        ("FK", "booking_id", "uuid"),
        ("FK", "vehicle_id", "uuid"),
        ("FK", "assigned_to_participant_id", "uuid"),
        ("", "hourly_rate_snapshot", "numeric"),
        ("", "rental_fee_snapshot", "numeric"),
        ("", "security_deposit_snapshot", "numeric"),
        ("", "catalog_name_snapshot", "varchar(255)"),
        ("", "tier_snapshot", "varchar(50)"),
        ("", "identifier_snapshot", "varchar(255)"),
        ("", "color_snapshot", "varchar(100)"),
        ("", "cover_image_url_snapshot", "text"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("sessions", "sessions", COL[2], 60, [
        ("PK", "id", "uuid"),
        ("FK", "booking_id", "uuid"),
        ("FK", "cafe_id", "uuid"),
        ("", "status", "enum"),
        ("FK", "checked_in_by", "uuid"),
        ("FK", "checked_out_by", "uuid"),
        ("", "actual_start_at", "timestamp"),
        ("", "planned_end_at", "timestamp"),
        ("", "actual_end_at", "timestamp"),
        ("", "actual_total_amount", "numeric"),
        ("", "notes", "text"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("session_participants", "session_participants", COL[2], 540, [
        ("PK", "id", "uuid"),
        ("FK", "session_id", "uuid"),
        ("FK", "booking_participant_id", "uuid"),
        ("FK", "user_id", "uuid"),
        ("", "display_name", "varchar(255)"),
        ("", "phone", "varchar(20)"),
        ("", "role", "enum"),
        ("", "is_primary_responsible", "boolean"),
        ("", "checked_in_at", "timestamp"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("session_vehicles", "session_vehicles", COL[2], 760, [
        ("PK", "id", "uuid"),
        ("FK", "session_id", "uuid"),
        ("FK", "booking_vehicle_id", "uuid"),
        ("FK", "vehicle_id", "uuid"),
        ("FK", "assigned_to_participant_id", "uuid"),
        ("", "vehicle_source", "enum"),
        ("", "status", "enum"),
        ("", "started_at", "timestamp"),
        ("", "returned_at", "timestamp"),
        ("", "notes", "text"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("inspections", "inspections", COL[3], 60, [
        ("PK", "id", "uuid"),
        ("FK", "session_id", "uuid"),
        ("FK", "session_vehicle_id", "uuid"),
        ("FK", "performed_by", "uuid"),
        ("", "type", "enum"),
        ("", "subject_type", "enum"),
        ("", "pre_existing_flag", "boolean"),
        ("", "damage_noted", "boolean"),
        ("", "damage_description", "text"),
        ("", "damage_cost_estimate", "numeric"),
        ("", "ai_analysis_json", "jsonb"),
        ("", "customer_confirmed", "boolean"),
        ("", "customer_confirmed_at", "timestamp"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("extension_proposals", "extension_proposals", COL[3], 340, [
        ("PK", "id", "uuid"),
        ("FK", "session_id", "uuid"),
        ("FK", "proposed_by", "uuid"),
        ("", "duration_minutes", "integer"),
        ("", "fee_amount", "numeric"),
        ("", "status", "enum"),
        ("FK", "responded_by", "uuid"),
        ("", "responded_at", "timestamp"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("fnb_orders", "fnb_orders", COL[3], 550, [
        ("PK", "id", "uuid"),
        ("FK", "booking_id", "uuid"),
        ("FK", "session_id", "uuid"),
        ("", "order_type", "varchar(20)"),
        ("", "status", "enum"),
        ("", "total_amount", "numeric"),
        ("FK", "created_by", "uuid"),
        ("FK", "confirmed_by", "uuid"),
        ("", "confirmed_at", "timestamp"),
        ("", "notes", "text"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("vehicle_maintenance_logs", "vehicle_maintenance_logs", COL[3], 790, [
        ("PK", "id", "uuid"),
        ("FK", "vehicle_id", "uuid"),
        ("FK", "related_session_id", "uuid"),
        ("", "type", "enum"),
        ("", "status", "varchar(50)"),
        ("", "description", "text"),
        ("", "cost", "numeric"),
        ("FK", "performed_by", "uuid"),
        ("", "performed_at", "timestamp"),
        ("", "next_scheduled_at", "timestamp"),
        ("", "created_at", "timestamp"),
    ]),
    ("inspection_checklists", "inspection_checklists", COL[4], 60, [
        ("PK", "id", "uuid"),
        ("FK", "inspection_id", "uuid"),
        ("", "item_key", "varchar(100)"),
        ("", "item_label", "varchar(255)"),
        ("", "status", "enum"),
        ("", "note", "text"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
    ]),
    ("inspection_photos", "inspection_photos", COL[4], 220, [
        ("PK", "id", "uuid"),
        ("FK", "inspection_id", "uuid"),
        ("", "angle", "enum"),
        ("", "url", "text"),
        ("FK", "uploaded_by", "uuid"),
        ("", "metadata", "jsonb"),
        ("", "created_at", "timestamp"),
    ]),
    ("damage_line_items", "damage_line_items", COL[4], 366, [
        ("PK", "id", "uuid"),
        ("FK", "inspection_id", "uuid"),
        ("", "part_type", "enum"),
        ("", "custom_part_name", "varchar(255)"),
        ("", "parts_price", "numeric"),
        ("", "labor_price", "numeric"),
        ("", "created_at", "timestamp"),
        ("", "updated_at", "timestamp"),
        ("", "deleted_at", "timestamp"),
    ]),
    ("fnb_order_items", "fnb_order_items", COL[4], 560, [
        ("PK", "id", "uuid"),
        ("FK", "fnb_order_id", "uuid"),
        ("FK", "menu_item_id", "uuid"),
        ("FK", "menu_item_variant_id", "uuid"),
        ("", "item_name_snapshot", "varchar(255)"),
        ("", "variant_name_snapshot", "varchar(80)"),
        ("", "quantity", "integer"),
        ("", "unit_price", "numeric"),
        ("", "subtotal", "numeric"),
        ("", "notes", "text"),
        ("", "created_at", "timestamp"),
    ]),
]

T = {k: dict(key=k, name=n, x=x, y=y, rows=r,
             h=HDR + len(r) * RH + PAD)
     for (k, n, x, y, r) in TABLES}

# ── edges: (parent, child, waypoints) ───────────────────────────────────────
# Waypoints are absolute; first point sits on the parent edge (the "one" side),
# last point on the child edge (the "many" side, crow's foot).
E = []


def add(parent, child, pts, one_dir, many_dir):
    E.append(dict(parent=parent, child=child, pts=pts, one=one_dir, many=many_dir))


b, bp, bv = T["bookings"], T["booking_participants"], T["booking_vehicles"]
s, sp, sv = T["sessions"], T["session_participants"], T["session_vehicles"]
ins, ext, fo = T["inspections"], T["extension_proposals"], T["fnb_orders"]
vml = T["vehicle_maintenance_logs"]
icl, iph, dli, foi = (T["inspection_checklists"], T["inspection_photos"],
                      T["damage_line_items"], T["fnb_order_items"])

BOT = b["y"] + b["h"]           # 60 + h
R1, R2, R3, R4 = COL[1] + BW, COL[2] + BW, COL[3] + BW, COL[4] + BW

# bookings → booking_participants (straight down)
add("bookings", "booking_participants",
    [(COL[1] + 70, BOT), (COL[1] + 70, bp["y"])], "down", "down")

# bookings → booking_vehicles (left lane)
add("bookings", "booking_vehicles",
    [(COL[1], 430), (40, 430), (40, 830), (COL[1], 830)], "left", "right")

# booking_participants → booking_vehicles
add("booking_participants", "booking_vehicles",
    [(COL[1] + 158, bp["y"] + bp["h"]), (COL[1] + 158, bv["y"])], "down", "down")

# bookings → sessions
add("bookings", "sessions", [(R1, 100), (COL[2], 100)], "right", "left")

# bookings → fnb_orders (bottom bus)
add("bookings", "fnb_orders",
    [(R1, 470), (340, 470), (340, 1010), (684, 1010), (684, 700), (COL[3], 700)],
    "right", "left")

# booking_participants → session_participants
add("booking_participants", "session_participants",
    [(R1, 600), (COL[2], 600)], "right", "left")

# booking_vehicles → session_vehicles
add("booking_vehicles", "session_vehicles",
    [(R1, 820), (COL[2], 820)], "right", "left")

# sessions → session_participants
add("sessions", "session_participants",
    [(COL[2] + 70, s["y"] + s["h"]), (COL[2] + 70, sp["y"])], "down", "down")

# sessions → session_vehicles (right U through gutter 2)
add("sessions", "session_vehicles",
    [(R2, 242), (612, 242), (612, 900), (R2, 900)], "right", "right")

# sessions → inspections
add("sessions", "inspections", [(R2, 96), (COL[3], 96)], "right", "left")

# sessions → extension_proposals
add("sessions", "extension_proposals",
    [(R2, 133), (636, 133), (636, 400), (COL[3], 400)], "right", "left")

# sessions → fnb_orders
add("sessions", "fnb_orders",
    [(R2, 169), (648, 169), (648, 620), (COL[3], 620)], "right", "left")

# sessions → vehicle_maintenance_logs
add("sessions", "vehicle_maintenance_logs",
    [(R2, 205), (660, 205), (660, 860), (COL[3], 860)], "right", "left")

# session_participants → session_vehicles
add("session_participants", "session_vehicles",
    [(COL[2] + 158, sp["y"] + sp["h"]), (COL[2] + 158, sv["y"])], "down", "down")

# session_vehicles → inspections
add("session_vehicles", "inspections",
    [(R2, 800), (672, 800), (672, 270), (COL[3], 270)], "right", "left")

# inspections → children
add("inspections", "inspection_checklists", [(R3, 100), (COL[4], 100)], "right", "left")
add("inspections", "inspection_photos",
    [(R3, 170), (932, 170), (932, 280), (COL[4], 280)], "right", "left")
add("inspections", "damage_line_items",
    [(R3, 240), (944, 240), (944, 440), (COL[4], 440)], "right", "left")

# fnb_orders → fnb_order_items
add("fnb_orders", "fnb_order_items", [(R3, 650), (COL[4], 650)], "right", "left")

# ── rendering ───────────────────────────────────────────────────────────────
INK = "#1b1b1b"
LINE = "#3a3a3a"
HDRFILL = "#e8eef5"
FKC = "#6b7280"

W_SVG, H_SVG = 1320, 1060
out = []


def segs():
    """All axis-aligned segments, split into horizontals and verticals."""
    hs, vs = [], []
    for e in E:
        p = e["pts"]
        for i in range(len(p) - 1):
            (x1, y1), (x2, y2) = p[i], p[i + 1]
            if y1 == y2:
                hs.append((min(x1, x2), max(x1, x2), y1))
            else:
                vs.append((x1, min(y1, y2), max(y1, y2)))
    return hs, vs


HSEG, VSEG = segs()


def vpath(x, y1, y2):
    """Vertical run with 4px hops where it crosses a horizontal run."""
    lo, hi = (y1, y2) if y1 < y2 else (y2, y1)
    cuts = sorted({y for (a, bb, y) in HSEG if a < x < bb and lo + 6 < y < hi - 6})
    d = f"M {x} {y1}"
    step = 1 if y2 > y1 else -1
    for y in (cuts if step == 1 else reversed(cuts)):
        d += f" L {x} {y - 4 * step} A 4 4 0 0 {1 if step == 1 else 0} {x} {y + 4 * step}"
    d += f" L {x} {y2}"
    return d


def edge_path(pts):
    d = ""
    for i in range(len(pts) - 1):
        (x1, y1), (x2, y2) = pts[i], pts[i + 1]
        if y1 == y2:
            d += (f"M {x1} {y1} " if i == 0 else "") + f"L {x2} {y2} "
        else:
            seg = vpath(x1, y1, y2)
            d += seg if i == 0 else seg.replace(f"M {x1} {y1}", f"L {x1} {y1}", 1)
    return d.strip()


def crowfoot(x, y, direction):
    """Three-prong 'many' marker pointing into the box edge."""
    L, S = 11, 6
    if direction == "left":      # attaches on the box's left edge
        return (f'<path d="M {x-L} {y} L {x} {y} M {x-L} {y-S} L {x} {y} '
                f'M {x-L} {y+S} L {x} {y}" fill="none" stroke="{LINE}" stroke-width="1.1"/>')
    if direction == "right":
        return (f'<path d="M {x+L} {y} L {x} {y} M {x+L} {y-S} L {x} {y} '
                f'M {x+L} {y+S} L {x} {y}" fill="none" stroke="{LINE}" stroke-width="1.1"/>')
    if direction == "down":
        return (f'<path d="M {x} {y-L} L {x} {y} M {x-S} {y-L} L {x} {y} '
                f'M {x+S} {y-L} L {x} {y}" fill="none" stroke="{LINE}" stroke-width="1.1"/>')
    return (f'<path d="M {x} {y+L} L {x} {y} M {x-S} {y+L} L {x} {y} '
            f'M {x+S} {y+L} L {x} {y}" fill="none" stroke="{LINE}" stroke-width="1.1"/>')


def onebar(x, y, direction):
    """Single perpendicular tick = the 'one' side."""
    o, S = 7, 5
    if direction in ("left", "right"):
        dx = -o if direction == "left" else o
        return (f'<line x1="{x+dx}" y1="{y-S}" x2="{x+dx}" y2="{y+S}" '
                f'stroke="{LINE}" stroke-width="1.1"/>')
    dy = -o if direction == "up" else o
    return (f'<line x1="{x-S}" y1="{y+dy}" x2="{x+S}" y2="{y+dy}" '
            f'stroke="{LINE}" stroke-width="1.1"/>')


out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W_SVG}" height="{H_SVG}" '
           f'viewBox="0 0 {W_SVG} {H_SVG}" font-family="Arial, Helvetica, sans-serif">')
out.append(f'<rect width="{W_SVG}" height="{H_SVG}" fill="#ffffff"/>')

# edges first so boxes paint over the stubs
out.append('<g id="relationships">')
for e in E:
    out.append(f'<path d="{edge_path(e["pts"])}" fill="none" stroke="{LINE}" stroke-width="1.1"/>')
    px, py = e["pts"][0]
    cx, cy = e["pts"][-1]
    out.append(onebar(px, py, e["one"]))
    out.append(crowfoot(cx, cy, e["many"]))
out.append('</g>')

out.append('<g id="tables">')
for t in T.values():
    x, y, h = t["x"], t["y"], t["h"]
    out.append(f'<rect x="{x}" y="{y}" width="{BW}" height="{h}" fill="#ffffff" '
               f'stroke="{INK}" stroke-width="1.2"/>')
    out.append(f'<rect x="{x}" y="{y}" width="{BW}" height="{HDR}" fill="{HDRFILL}" '
               f'stroke="{INK}" stroke-width="1.2"/>')
    out.append(f'<text x="{x + BW/2}" y="{y + 14}" text-anchor="middle" font-size="10.5" '
               f'font-weight="700" fill="{INK}">{escape(t["name"])}</text>')
    out.append(f'<line x1="{x+27}" y1="{y+HDR}" x2="{x+27}" y2="{y+h}" '
               f'stroke="{INK}" stroke-width="0.9"/>')
    for i, (mark, col, typ) in enumerate(t["rows"]):
        ty = y + HDR + RH * i + 10
        if mark:
            out.append(f'<text x="{x+5}" y="{ty}" font-size="7.5" font-weight="700" '
                       f'fill="{INK if mark=="PK" else FKC}">{mark}</text>')
        deco = ' text-decoration="underline"' if mark == "PK" else ''
        out.append(f'<text x="{x+32}" y="{ty}" font-size="8.6" fill="{INK}"{deco}>'
                   f'{escape(col)}: {escape(typ)}</text>')
    out.append('</g>' if False else '')
out.append('</g>')

# legend
lx, ly = 1060, 790
out.append(f'<rect x="{lx}" y="{ly}" width="222" height="152" fill="#fbfbfb" '
           f'stroke="{FKC}" stroke-width="0.9"/>')
out.append(f'<text x="{lx+10}" y="{ly+18}" font-size="9.5" font-weight="700" fill="{INK}">Legend</text>')
legend = [
    "PK  primary key        FK  foreign key",
    "─│  one side (1)     ─≻  many side (N)",
    "",
    "Foreign keys leaving this block:",
    "users, cafes, vehicles, track_types,",
    "cafe_track_configs, promotions, contests,",
    "customer_packages, menu_items,",
    "menu_item_variants",
]
for i, line in enumerate(legend):
    out.append(f'<text x="{lx+10}" y="{ly+34+i*13}" font-size="8" fill="{FKC}">{escape(line)}</text>')

out.append('</svg>')

path = "/Users/mr.triss/FPT University/SEP490/rcfeild-spec/docs/diagrams/erd/operation-service-erd.svg"
import os
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(l for l in out if l))
print("wrote", path, len(T), "tables,", len(E), "relationships")
