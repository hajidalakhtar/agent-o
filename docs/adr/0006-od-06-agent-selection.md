# ADR 0006 — Pemilihan agent (`OD-06`)

**Status:** Diterima

## Konteks

"Agent agnostik" berarti agent-o tidak terikat pada satu harness, tetapi cakupan implementasi ACP berbeda-beda antar agent. Pemilihan agent bisa hanya di level project (default), atau bisa di-override per card. Model data `card` sudah menyiapkan field `agent_id` (lihat [`../spec/card.md`](../spec/card.md)).

## Keputusan

- **Agent bisa di-override per card.** `card.agent_id` bila diisi menang; kalau `null`, dipakai `project.default_agent_id`.
- Guard transisi `backlog → in_progress` memerlukan: agent ditentukan, berstatus `enabled`, dan tidak `needs_auth` (`SCHED-05`, `BOARD` guard detail).
- Riwayat run menyimpan `agent_id` dan capability version yang dipakai, sehingga hasil lama tetap dapat ditafsirkan setelah agent diperbarui (`AGENT-08`).
- Run `resolve-conflict` memakai **agent yang sama** dengan run task asli, agar capability konsisten.

## Konsekuensi

- User bisa memilih harness per jenis pekerjaan (mis. satu agent untuk refactor besar, satu untuk tugas kecil) tanpa mengubah default project.
- UI card harus menampilkan agent efektif (card override atau project default) dan memvalidasi ketersediaannya sebelum card boleh jalan.
- Mengganti agent antar percobaan pada satu card diperbolehkan; audit mencatat agent per percobaan (`AGENT-08`).

## Kebutuhan terkait

`AGENT-01`, `AGENT-04`, `AGENT-08`, `CARD-*`, `SCHED-05`.
