# Nuclear weapons

**Status:** draft (Phase 3) · **Confidence:** medium; low for missile defence

Code: `nukeCommand`, `nukesEnabled` in `packages/engine/src/war.ts`.

## Rule

- Nuclear weapons exist once anyone has built the Manhattan Project; then any civilization
  with the techs may build Tactical Nukes (range 6 from where they stand) and ICBMs (any
  range).
- A strike needs a target belonging to a civilization at war with the attacker. The weapon
  is spent.
- **Missile defence:** if a city within 3 tiles of the target belongs to a civilization with
  Strategic Missile Defense, the missile is destroyed with 75 % chance.
- **Effect** on the target and the 8 tiles around it: every unit is destroyed, whoever owns
  it; every city loses half its citizens (at least one remains); land tiles get fallout
  (pollution), and the target tile, unless a city stands there, a crater. Each victim
  collects 10 war weariness points.

## Not yet

Global consequences (nuclear winter, the UN's response) belong to Phase 6.
