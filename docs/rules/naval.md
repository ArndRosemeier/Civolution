# Ships, transports and ports

**Status:** draft (Phase 3) · **Confidence:** high

Code: `canStandOn`, `boardingTransport` (movement.ts), `moveUnitTo` (move.ts), `units.ts`.

## Rule

- Ships move on water and may enter their owner's coastal cities (ports). Galleys and other
  `sinksInSea` / `sinksInOcean` ships keep to the coast as before.
- A ship with capacity carries land units (helicopters: foot units only), a carrier carries
  aircraft, a missile submarine carries tactical and cruise missiles.
- A land unit **boards** by stepping onto a water tile holding its own transport with room
  (one movement point), or with **Load** while both stand in a port. Carried units move with
  the ship and **land** by stepping onto an adjacent land tile.
- Cargo shares the ship's fate: when a ship at sea is destroyed, everything aboard is lost.
  A ship disbanded in port sets its cargo down.
- Ships fight ships at sea ([combat.md](combat.md)); against land they bombard. Only
  **amphibious** units (Marines, Berserks) attack from a ship.
- Ships in a captured city are lost with it.
