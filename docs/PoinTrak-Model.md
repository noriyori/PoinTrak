# PoinTrak — Trip Planner: Model & Settings


Working outline of the current data model and settings. Edit/expand freely, then send it back.


## Trip (the container)

- name, start date, end date
- collaborators[], items[], suggestions[], checklist[], version, updated
- Settings (⚙ Trip): name · From/To dates · Who's planning + your identity · Share link · Export / Import · Lock
- Global config (not per-trip): password · Firebase sync room · OpenRouteService key (bike/walk) · AeroDataBox key (flights) · Transitous (transit, keyless)

## Activity / Item — the atom


Four types: Hotel stay · Event / activity · Travel / transport · Task / errand.


### Shared fields (all types)

- title, date, time (arrival), departTime, arriveDate (overnight), stay (minutes)
- legMode — how you get to this stop: Car · Transit · Flight · Bike · Walk
- tz (zone label, auto from flight), location {name, lat, lng, label}
- notes, done, by (author), comments[]

### Per-type behavior

- Hotel — Check-out date (endDate); hides Departure time / Arrival date / Stay; shows 'until …'
- Event — date, arrival time, stay duration, departure time, arrival date (no extras)
- Travel — same as event; if legMode = Flight: multi-segment Flights list, route search, reservation code, seat, class, cost, great-circle map arcs
- Task — no special fields yet (generic item with a done checkbox)

### Derived / behavioral

- Departure = departTime or arrival + stay → drives 'leave by / arrive' leg pills
- Map route colored by mode (+ flight arcs); 'Now' anchor dims past & accents Next up; today/free-day markers

## Suggestions

- title, location, notes, by, votes, voters[], accepted, comments[]
- Vote, then promote to an Event on the timeline

## Checklist

- text, section (collapsible groups), parentId (sub-tasks), assignee, done, by

## Travelers

- Fixed trio: Peter / Niszki / JS (each a color); identity stored per device

## Views

- Overview (dashboard; desktop = card rail + large interactive map)
- Timeline (All ↔ Day, week strip, free days, now-anchor)
- Map · Suggestions · Checklist

## Open questions for the redesign

- type vs legMode overlap — should Flight/Transit/Drive be their own types instead of a mode on a generic Travel item?
- task is undifferentiated — add due time / assignee / category, or merge with checklist?
- No status — only 'done'. Add planned / booked / wishlist / done?
- No categories (Museum, Food, Beach…) for filtering / lists / pin colors
- Hotel doesn't compute nights; events have no real end time (only stay/departTime)

## Notes / my edits


(Add your thoughts here…)

