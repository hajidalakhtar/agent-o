# ADR 0007 — Batas percobaan otomatis (`OD-07`)

**Status:** Diterima

## Konteks

Penyelesaian konflik otomatis dapat berjalan sebagai loop tanpa batas dan menghabiskan kuota provider. Di sisi lain, membatasi semua jenis run secara seragam akan menghentikan pekerjaan yang sah hanya karena mencoba beberapa pendekatan. `CONFLICT-05` sudah mengunci batas satu percobaan untuk konflik; sisanya belum diputuskan.

## Keputusan

- Hanya run **`resolve-conflict`** yang dibatasi: maksimal **satu** percobaan otomatis per peristiwa rebase. Percobaan berikutnya selalu melibatkan manusia (`CONFLICT-05`).
- Run **`task`** dan **`answer`** **tidak** diberi batas percobaan otomatis di versi awal. Karena stop bersifat manual (tanpa budget/timeout), user yang mengendalikan berapa kali menjalankan ulang.
- Kegagalan resolusi memindahkan card ke `blocked` dengan status `conflict_unresolved`, disertai diff konflik (`CONFLICT-08`).

## Konsekuensi

- Konflik tidak akan pernah membuat loop otomatis — aman terhadap kuota.
- Card task yang gagal berulang tetap bisa dijalankan ulang tanpa batas selama user menghendaki; risiko konsumsi kuota ada di tangan user (risiko yang sudah diterima di [`../overview.md`](../overview.md)).
- Setiap percobaan tercatat di tabel `run` (`attempt_no`) sehingga dapat diaudit meski tanpa batas keras.

## Kebutuhan terkait

`CONFLICT-05`, `CONFLICT-08`, `CONFLICT-09`, `DONE-*`, `NFR-12`.
