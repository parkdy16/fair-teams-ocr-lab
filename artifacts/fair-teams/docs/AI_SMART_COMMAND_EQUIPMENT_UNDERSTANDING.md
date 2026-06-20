# AI Smart Command — Equipment Understanding

This patch teaches the Fair Teams Assistant to understand Equipment Board requests as app capabilities instead of treating them as unknown chat.

## Added understanding

The backend now recognizes equipment language such as:

- `move the bibs bag to Sarah`
- `George has the cones now`
- `give the blue ball bag to Tommy`
- `add a pump bag to equipment`
- German/Korean-style bag/equipment wording where possible

## Current behavior

Equipment actions are still **not executed**. They are returned as structured actions with `supportStatus: understood_not_wired` or `needs_confirmation` when the bag or holder is missing.

The goal is to avoid stupid failures while keeping the real Equipment Board data safe until a proper handler is wired.

## Action format

- `equipment_move_item`
  - `targetName`: bag/item name
  - `playerRefs`: destination holder when matched
  - `noteText`: short human-readable move summary

- `equipment_add_item`
  - `targetName`: bag/item name
  - `noteText`: item details if present

## Why this matters

The assistant should be able to understand broad Fair Teams app concepts before every action is wired. Unsupported or unwired actions should feel like:

> I understand, but this is not wired yet.

not:

> I failed to find a solution.
