# nfSensei config backups

YAML dumps of **running-config** from hostname `nfsensei` (`192.168.20.1`).

Taken with:

```bash
ssh -i ~/.ssh/id_ed25519 root@192.168.20.1 \
  '/usr/local/bin/nfsensei-cli -c "config save --running /tmp/nfsensei-running.yaml"'
scp -i ~/.ssh/id_ed25519 root@192.168.20.1:/tmp/nfsensei-running.yaml \
  backups/nfsensei-running-YYYY-MM-DD.yaml
```

Restore into candidate (does not apply until `commit` + `write`):

```text
configure terminal
config load /path/to/nfsensei-running-YYYY-MM-DD.yaml
diff
commit "restore from backup"
write
```

These files include the Wi-Fi PSK (`!wpa2-psk`). This GitHub repo is public.

| File | When | Notes |
|------|------|--------|
| [`nfsensei-running-2026-08-21.yaml`](nfsensei-running-2026-08-21.yaml) | 21 Aug 2026 | After `skynetVfall` AP, `dhcp66`, `wifi66-to-any`, `wifi66-masquerade`. Box commit `2236-1407-81402d50`. |
