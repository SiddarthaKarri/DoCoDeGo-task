# Video Walkthrough Script & Submission Guide

This document contains the complete script, structure, and instructions for the **3-minute walkthrough video** required by the assignment.

A pre-recorded, fully-rendered 1080p MP4 presentation with slide visuals and voiceover has been generated at:
`walkthrough.mp4` (Duration: 2 minutes 55 seconds, Size: ~4.4 MB).

You can:
1. **Option A:** Upload `walkthrough.mp4` directly to Loom or as an Unlisted video on YouTube.
2. **Option B:** Record your own webcam / screen via Loom or OBS by following the slide-by-slide script below.

---

## Slide-by-Slide Script & Breakdown

### Slide 1: Introduction & Overview (0:00 - 0:22)

- **Visual:** Title card with tech stack badges (Hono, Cloudflare Workers, Cloudflare D1 SQLite, React 19, TanStack Router).
- **Spoken Script:**
  > "Welcome to the walkthrough of the Shared Bill Splitter. In this assignment, we built an edge-native bill splitting application designed for shared homes. It is powered by Hono on Cloudflare Workers, Cloudflare D1 SQLite, React 19, and TanStack Router, with strict end-to-end TypeScript and zero any types."
### Slide 2: System Architecture & Database Invariants (0:22 - 0:50)

- **Visual:** Client-API-Database topology diagram + Table of the 10 database named constraints.
- **Spoken Script:**
  > "Here is our system architecture. On the backend, Hono routes incoming requests on Cloudflare Workers at the edge. Data persistence is handled by Cloudflare D1 with ten named constraints. These include foreign keys with cascade deletions, check constraints enforcing strictly positive bill cents and non-negative shares, and a unique constraint preventing duplicate shares per member. On the frontend, a responsive React application is wrapped in an Error Boundary with loading, empty, and error recovery states."
### Slide 3: End-to-End Data Flow & Splitting Algorithm (0:50 - 1:20)

- **Visual:** Step-by-step splitting remainder algorithm (1000 cents / 3 members -> 334, 333, 333) and payment flow chart.
- **Spoken Script:**
  > "Let's trace the data flow. First, a home is created and members are added. Each member is assigned a deterministic sort order. When a bill is created, the total cents are split evenly among all members. If the amount does not divide evenly, the remainder cents are assigned to members one by one in the exact order they joined. Payments require a mandatory Idempotency-Key header, and member balances are dynamically aggregated as the sum of all unpaid shares."
### Slide 4: Safety & The 7 Critical Cases Handled (1:20 - 2:05)

- **Visual:** 7 numbered cards displaying each required case and its exact solution.
- **Spoken Script:**
  > "Seven critical edge cases are rigorously handled.
  > 1. A home with no members returns a 422 error.
  > 2. Non-positive or fractional cents are rejected with 422 and blocked by database checks.
  > 3. Uneven splits are distributed deterministically.
  > 4. Duplicate payment requests with the same key return the original 200 response with the exact same timestamp without re-billing.
  > 5. Concurrent payments use atomic SQL updates so only one succeeds while the other receives a 409 conflict.
  > 6. Non-existent entities return 404 JSON errors.
  > 7. And slow responses or 500 errors are caught gracefully by the UI without crashing."
### Slide 5: Key Architectural Trade-off (2:05 - 2:38)

- **Visual:** Comparison side-by-side: Distributed Locks (Redis/KV) vs. Atomic Conditional SQL Invariants.
- **Spoken Script:**
  > "Now, let's discuss our core engineering trade-off: atomic conditional SQL updates versus distributed locks. Instead of introducing external distributed locking or complex two-phase transactions, we utilized SQLite's write serialization combined with a conditional update where paid at is null. This guarantees zero external latency overhead, complete deadlock immunity, and atomic safety under high concurrency."
### Slide 6: Summary & Verification (2:38 - 2:55)

- **Visual:** Verification scorecard (24/24 Vitest passing, Biome clean, 0 TypeScript errors).
- **Spoken Script:**
  > "In summary, our implementation passes all 24 Vitest integration tests, passes all Biome linting and formatting checks, and compiles cleanly with zero TypeScript errors. Thank you for watching!"

---

## How to Submit

1. **Upload the video:**
   - Go to [loom.com](https://www.loom.com) or [youtube.com](https://www.youtube.com).
   - Upload `walkthrough.mp4` (or your personal recording).
   - Set visibility to **Public** or **Unlisted** (so anyone with the link can view it).
2. **Submit form:**
   - GitHub Repository Link: `https://github.com/SiddarthaKarri/DoCoDeGo-task`
   - Video Link: Paste the link to your uploaded video.
