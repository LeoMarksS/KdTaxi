---
name: KD TAXI vehicle matching
description: Durable rules for separating KD CARRO and KD MOTO drivers and rides.
---

KD TAXI treats vehicle category as a server-authoritative dispatch boundary. A KD CARRO ride can only be offered to or accepted by car drivers, and a KD MOTO ride only by motorcycle drivers. Driver accounts created before vehicle categories existed default to KD CARRO for compatibility. Pricing remains shared between both categories unless a later product decision introduces separate rules.

**Why:** Client-side filtering alone could expose the wrong category and would not prevent a forged or stale accept request from crossing categories.

**How to apply:** Preserve the category check in every pending-ride, accept, push-notification, and real-time dispatch path. Keep display labels as KD CARRO and KD MOTO.